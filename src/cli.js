import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { parseArgs } from 'node:util';
import { parse } from 'csv-parse/sync';
import { stringify } from 'csv-stringify/sync';
import { callJev, resolveConnection, providerConfig } from './client.js';
import { callReview } from './review-client.js';
import { JUDGE_COLUMNS, workshopInput, judgeResult } from './workshop.js';
import { buildRequest, buildReviewRequest, normalizeResponse, normalizeReview, blankResult, summarize, prepareRows, eligibility, REVIEW_MODEL } from './judge.js';
const usage = `Usage: npm run judge -- --input posts.csv --output results/baseline.csv
  --provider openrouter     Jev provider: openrouter (default), typesafe, gateway
  --model MODEL             Jev model override
  --review-model MODEL      Independent LLM reviewer on OpenRouter
  --dry-run                 Export requests without API calls
  --workshop                Export the seven Judge-tab columns; save details separately
  --report-only             Report by run, judge version, model and split
  --help                    Show usage
Use the six Evaluation Log columns, with an Approved facts: section in User_Input.
Advanced CSV inputs with separate source fields also work. Use a new output filename.`;
async function main() {
  const { values } = parseArgs({ options: { input: {type:'string'}, output: {type:'string',default:'results/jev.csv'}, provider:{type:'string'}, model:{type:'string'}, 'review-model':{type:'string'}, 'dry-run':{type:'boolean'}, workshop:{type:'boolean'}, 'report-only':{type:'boolean'}, help:{type:'boolean'} } });
  if (values.help) return console.log(usage);
  if (!values.input) throw new Error(usage);
  if (values['dry-run'] && values['report-only']) throw new Error('Choose dry-run or report-only.');
  const input = resolve(values.input), output = resolve(values.output);
  if (input === output) throw new Error('Output must differ from input.');
  let headers;
  const rows = prepareRows(parse(await readFile(input,'utf8'), { bom:true, skip_empty_lines:true, columns: cols => {
    headers = cols;
    if (new Set(cols).size !== cols.length) throw new Error('Duplicate CSV headers.');
    if (!values['report-only'] && !cols.includes('Model_Output')) throw new Error('Model_Output column is required.');
    return cols;
  } }).map(workshopInput));
  if (!headers) throw new Error('CSV is empty.');
  if (values['report-only']) {
    if (headers.includes('Jev_Run_Status')) return console.log(JSON.stringify(summarize(rows),null,2));
    if (!headers.includes('Jev_Status')) throw new Error('Report requires a judged CSV.');
    const details = (await readFile(`${input}.details.jsonl`,'utf8')).trim();
    return console.log(JSON.stringify(summarize(details ? details.split('\n').map(line=>JSON.parse(line)) : []),null,2));
  }
  const provider = values.provider || process.env.JEV_PROVIDER || 'openrouter';
  const model = values.model || process.env.JEV_MODEL || providerConfig(provider).model;
  const reviewModel = values['review-model'] || process.env.REVIEW_MODEL || REVIEW_MODEL;
  await mkdir(dirname(output),{recursive:true});
  if (values['dry-run']) {
    const requests = rows.map(row => ({ Test_ID:row.Test_ID, Run_ID:row.Run_ID, eligibility:eligibility(row), ...(eligibility(row).status === 'OK' ? { jev:buildRequest(row,model), independent_review:buildReviewRequest(row,reviewModel) } : {}) }));
    await writeFile(`${output}.requests.jsonl`,requests.map(r=>JSON.stringify(r)).join('\n')+'\n',{flag:'wx'});
    return console.log(`Dry run: ${requests.length} rows; no API calls.`);
  }
  if (rows.some(row => eligibility(row).status === 'OK')) { resolveConnection({provider}); if (!process.env.OPENROUTER_API_KEY?.trim()) throw new Error('Set OPENROUTER_API_KEY for the independent LLM critique.'); }
  await writeFile(output,'',{flag:'wx'});
  await writeFile(`${output}.summary.json`,'',{flag:'wx'});
  await writeFile(`${output}.details.jsonl`,'',{flag:'wx'});
  const results = [], columns = values.workshop ? JUDGE_COLUMNS : [...new Set([...headers,...Object.keys(rows[0] || {}),...Object.keys(blankResult(''))])];
  const persist = async () => {
    await writeFile(output,stringify(values.workshop ? results.map(judgeResult) : results,{header:true,columns,escape_formulas:true}));
    await writeFile(`${output}.details.jsonl`,results.map(r=>JSON.stringify(r)).join('\n')+'\n');
  };
  for (const row of rows) {
    const ready = eligibility(row);
    let evaluated = { ...row, ...blankResult(ready.status,ready.reason) };
    if (ready.status === 'OK') {
      try { evaluated = { ...evaluated, ...normalizeResponse(await callJev(buildRequest(row,model),{provider})) }; }
      catch (e) { evaluated = { ...evaluated, ...blankResult('ERROR',e.message) }; }
      // Current human feedback and Jev's decision never enter the review request.
      try { evaluated = { ...evaluated, ...normalizeReview(await callReview(buildReviewRequest(row,reviewModel)),evaluated) }; }
      catch (e) { evaluated = { ...evaluated, LLM_Run_Status:'ERROR', Review_Required:true, Review_Reasons:'Independent critique unavailable.', Error:[evaluated.Error,e.message].filter(Boolean).join('; ') }; }
    }
    results.push(evaluated); await persist();
    console.error(`${row.Test_ID}: Jev ${evaluated.Jev_Run_Status}; independent review ${evaluated.LLM_Run_Status}`);
  }
  if (!rows.length) await persist();
  const summary = summarize(results);
  await writeFile(`${output}.summary.json`,JSON.stringify(summary,null,2)+'\n');
  console.log(JSON.stringify(summary,null,2));
  if (results.some(r=>r.Jev_Run_Status==='ERROR'||r.LLM_Run_Status==='ERROR')) process.exitCode=1;
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
