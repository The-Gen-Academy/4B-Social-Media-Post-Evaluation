import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {parseArgs} from 'node:util';
import {parse} from 'csv-parse/sync';
import {stringify} from 'csv-stringify/sync';
import {CATEGORY_COLUMNS,CATEGORY_MODEL,prepareCategoryRows,buildCategoryRequest,normalizeCategoryResponse,categoryResult,categorySummary} from './category-judge.js';
import {callCategoryJudge} from './category-client.js';

async function main() {
  const {values} = parseArgs({options:{input:{type:'string'},output:{type:'string',default:'results/category_judge.csv'},category:{type:'string',default:'Missing Practical Detail'},definition:{type:'string'},contrast:{type:'string'},model:{type:'string',default:CATEGORY_MODEL},'dry-run':{type:'boolean'},help:{type:'boolean'}}});
  if (values.help || !values.input) {
    console.log('npm run judge:category -- --input failure-traces.csv --category "Missing Practical Detail" --output results/category-v1.csv\nOptional: --definition "Your rule" --contrast "Boundary with other categories" --model MODEL --dry-run\nSet OPENAI_API_KEY in .env. The input must contain reviewed FAIL rows with a main Failure_Category.');
    if (!values.help) process.exitCode = 1;
    return;
  }
  const input = resolve(values.input), output = resolve(values.output);
  if (input === output) throw new Error('Output must differ from input.');
  const parsed = parse(await readFile(input,'utf8'),{bom:true,skip_empty_lines:true,columns:headers=>{
    const names = headers.map(header=>header.trim());
    if (new Set(names).size !== names.length) throw new Error('Duplicate CSV headers.');
    return names;
  }});
  const rows = prepareCategoryRows(parsed,{category:values.category,definition:values.definition,contrast_rule:values.contrast});
  await mkdir(dirname(output),{recursive:true});
  if (values['dry-run']) {
    await writeFile(output+'.requests.json',JSON.stringify(rows.map(row=>({Test_ID:row.Test_ID,request:buildCategoryRequest(row,row.category_config,values.model)})),null,2)+'\n',{flag:'wx'});
    console.log('Prepared '+rows.length+' category requests. No API calls made.');
    return;
  }
  if (!process.env.OPENAI_API_KEY?.trim()) throw new Error('Set OPENAI_API_KEY for the category judge.');
  await writeFile(output,'',{flag:'wx'});
  await writeFile(output+'.summary.json','',{flag:'wx'});
  const results = [];
  for (const row of rows) {
    try {results.push(normalizeCategoryResponse(await callCategoryJudge(buildCategoryRequest(row,row.category_config,values.model)),row));}
    catch (error) {results.push(categoryResult(row,'',error.message,'ERROR'));}
    await writeFile(output,stringify(results,{header:true,columns:CATEGORY_COLUMNS,escape_formulas:true}));
    console.error(row.Test_ID+': '+results.at(-1).Run_Status);
  }
  const summary = categorySummary(results);
  await writeFile(output+'.summary.json',JSON.stringify(summary,null,2)+'\n');
  console.log(JSON.stringify(summary,null,2));
  if (summary.errors) process.exitCode = 1;
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
