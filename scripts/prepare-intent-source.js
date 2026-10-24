import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {dirname} from 'node:path';
import {parseArgs} from 'node:util';
import {parse} from 'csv-parse/sync';
import {prepareDataset} from '../src/intent-eval-cli.js';
const {values:v}=parseArgs({options:{golden:{type:'string'},predictions:{type:'string'},judge:{type:'string'},failed:{type:'string'},output:{type:'string'},url:{type:'string'}}});
if(!v.golden||!v.predictions||!v.judge||!v.failed||!v.output)throw new Error('Provide --golden, --predictions, --judge, --failed CSV paths and --output results/source.json');
const sheets={};
for(const [key,name]of [['golden','Golden Dataset Full'],['predictions','Golden Dataset with predictions'],['judge','LLM as a Judge Dataset'],['failed','Failed Traces']]){
  sheets[name]=parse(await readFile(v[key],'utf8'),{bom:true,skip_empty_lines:true,relax_column_count:true});
}
const source={source_url:v.url??'Local CSV exports',retrieved_date:new Date().toISOString(),sheets};
const result=prepareDataset(source);
await mkdir(dirname(v.output),{recursive:true});
await writeFile(v.output,JSON.stringify(source,null,2),{flag:'wx'});
console.log(JSON.stringify({rows:result.rows.length,issues:result.issues},null,2));
