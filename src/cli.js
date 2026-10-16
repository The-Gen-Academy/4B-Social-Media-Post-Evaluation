import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { parseArgs } from 'node:util';
import { parse } from 'csv-parse/sync';
import { stringify } from 'csv-stringify/sync';
import { callJev, resolveConnection } from './client.js';
import { buildRequest, normalizeResponse, blankResult, summarize, clean,
  DEFAULT_MODEL, DEFAULT_MIN_CONFIDENCE } from './judge.js';

const usage = `Usage: npm run judge -- --input posts.csv [--output results/jev.csv]
  --dry-run                  Write request JSONL without calling Jev
  --model jev-1.13.0          Pin the model (or set JEV_MODEL)
  --min-confidence 0.7        Advisory review threshold, 0..1
  --report-only              Analyze an existing judged CSV without an API call
  --help                     Show usage

Input columns: Model_Output (required), User_Input, Test_ID, Reference_Facts,
Constraints, Persona. Status is the human label, used only for comparison.
Output paths must be new: existing files are never overwritten.`;

async function main() {
  const { values } = parseArgs({ options: {
    input: { type: 'string' }, output: { type: 'string', default: 'results/jev.csv' },
    model: { type: 'string' }, 'min-confidence': { type: 'string' },
    'dry-run': { type: 'boolean' }, 'report-only': { type: 'boolean' }, help: { type: 'boolean' },
  } });
  if (values.help) { console.log(usage); return; }
  if (!values.input) throw new Error(usage);
  if (values['dry-run'] && values['report-only']) throw new Error('Choose either --dry-run or --report-only.');
  const input = resolve(values.input), output = resolve(values.output);
  if (input === output) throw new Error('Output must differ from input.');
  const model = values.model ?? process.env.JEV_MODEL ?? DEFAULT_MODEL;
  const confidenceText = values['min-confidence'] ?? process.env.JEV_MIN_CONFIDENCE ?? String(DEFAULT_MIN_CONFIDENCE);
  const confidence = Number(confidenceText);
  if (!confidenceText.trim() || !Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
    throw new Error('--min-confidence must be between 0 and 1.');
  }
  let headers;
  const rows = parse(await readFile(input, 'utf8'), {
    bom: true, skip_empty_lines: true,
    columns: columns => {
      headers = columns;
      if (new Set(columns).size !== columns.length) throw new Error('CSV contains duplicate headers.');
      if (!columns.includes('Model_Output')) throw new Error('CSV requires a Model_Output column.');
      return columns;
    },
  });
  if (!headers) throw new Error('CSV is empty.');
  if (values['report-only']) {
    if (!headers.includes('Jev_Status')) throw new Error('--report-only requires a judged CSV with Jev_Status.');
    console.log(JSON.stringify(summarize(rows), null, 2)); return;
  }
  await mkdir(dirname(output), { recursive: true });
  if (values['dry-run']) {
    const requests = rows.flatMap((row, index) => clean(row.Model_Output)
      ? [{ row: index + 2, Test_ID: row.Test_ID ?? '', request: buildRequest(row, model) }] : []);
    await writeFile(`${output}.requests.jsonl`, requests.map(r => JSON.stringify(r)).join('\n') + '\n', { flag: 'wx' });
    console.log(`Dry run: ${requests.length} requests written to ${output}.requests.jsonl; no API calls.`);
    return;
  }
  resolveConnection();
  // Reserve output names before making billable calls; each run retains its own evidence.
  await writeFile(output, '', { flag: 'wx' });
  await writeFile(`${output}.summary.json`, '', { flag: 'wx' });
  const results = [];
  for (const [index, row] of rows.entries()) {
    let evaluation;
    if (!clean(row.Model_Output)) evaluation = blankResult('SKIPPED', 'Model_Output is empty', confidence);
    else {
      try {
        const response = await callJev(buildRequest(row, model));
        evaluation = normalizeResponse(response, row, confidence);
      } catch (error) {
        evaluation = blankResult('ERROR', error.message, confidence);
      }
    }
    results.push({ ...row, ...evaluation });
    // Persist partial progress so an interrupted batch does not lose completed judgments.
    const columns = [...new Set([...headers, ...Object.keys(blankResult(''))])];
    await writeFile(output, stringify(results, { header: true, columns, escape_formulas: true }));
    console.error(`Row ${index + 2}: ${evaluation.Jev_Status}`);
  }
  if (!rows.length) await writeFile(output, stringify([], { header: true, columns: [...new Set([...headers, ...Object.keys(blankResult(''))])] }));
  const summary = summarize(results);
  await writeFile(`${output}.summary.json`, JSON.stringify(summary, null, 2) + '\n');
  console.log(JSON.stringify(summary, null, 2));
  if (summary.errors) process.exitCode = 1;
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
