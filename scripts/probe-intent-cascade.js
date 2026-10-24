// Live integration probes use real confidence values. No scores are forced or mocked.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {callJev} from '../src/client.js';
import {evaluateRow,callLlm} from '../src/intent-eval-cli.js';
import {buildIntentRequest,normalizeChoice,INTENTS} from '../src/intent-eval.js';
const source=process.argv[2],output=process.argv[3];
if(!source||!output)throw new Error('Usage: node --env-file=.env scripts/probe-intent-cascade.js <run directory> <new output directory>');
const rows=JSON.parse(await readFile(`${source}/intent-results.json`,'utf8'));
await mkdir(output,{recursive:true});
await writeFile(`${output}/manifest.json`,JSON.stringify({source,threshold:0.7,created_at:new Date().toISOString(),selection:'First six low-confidence and first six high-confidence rows; boundary probes, not a representative accuracy sample.'}),{flag:'wx'});
let llmCalls=0,jevCalls=0,cost=0;
const selected=[...rows.filter(r=>r.jev?.confidence<0.7).slice(0,6),...rows.filter(r=>r.jev?.confidence>=0.7).slice(0,6)];
const results=[];
for(const row of selected){
  const result=await evaluateRow(row,{mode:'cascade',threshold:0.7,
    jevCall:async q=>{jevCalls++;const r=await callJev(q,{provider:'openrouter'});cost+=r.usage?.cost||0;return r;},
    judgeCall:async q=>{llmCalls++;const r=await callLlm(q);cost+=r.usage?.cost||0;return r;}});
  results.push(result);console.log(`${row.id}: confidence=${result.jev?.confidence}, route=${result.decision.route}, LLM attempts=${result.judge_attempts}`);
  await writeFile(`${output}/cascade-results.json`,JSON.stringify(results,null,2));
}
// Reverse option order on the same 12 inputs; keep their model and policy fixed.
const reversed=[];
for(const row of selected){const raw=await callJev(buildIntentRequest(row,'typesafe/jev-1.13',true),{provider:'openrouter'});jevCalls++;cost+=raw.usage?.cost||0;
  const result=normalizeChoice(raw,'intent',INTENTS),repeat=results.find(r=>r.id===row.id).jev;
  reversed.push({id:row.id,original:row.jev,same_order_repeat:repeat,reversed:result,
    same_order_choice_changed:row.jev.choice!==repeat.choice,reverse_vs_repeat_changed:result.choice!==repeat.choice,
    choice_changed:row.jev.choice!==result.choice,threshold_crossed:(row.jev.confidence<0.7)!==(result.confidence<0.7)});
}
await writeFile(`${output}/option-order-results.json`,JSON.stringify(reversed,null,2));
const summary={n:results.length,low_confidence:results.filter(r=>r.jev?.confidence<0.7).length,high_confidence:results.filter(r=>r.jev?.confidence>=0.7).length,
  high_confidence_llm_calls:results.filter(r=>r.jev?.confidence>=0.7).reduce((s,r)=>s+r.judge_attempts,0),llm_calls:llmCalls,jev_calls:jevCalls,
  unresolved:results.filter(r=>!r.decision.intent).length,final_judge_errors:results.filter(r=>r.judge_error).length,
  option_order_label_changes:reversed.filter(r=>r.choice_changed).length,option_order_threshold_crossings:reversed.filter(r=>r.threshold_crossed).length,reported_cost_usd:cost};
summary.same_order_label_changes=reversed.filter(r=>r.same_order_choice_changed).length;
summary.reversed_vs_repeat_label_changes=reversed.filter(r=>r.reverse_vs_repeat_changed).length;
await writeFile(`${output}/summary.json`,JSON.stringify(summary,null,2));console.log(JSON.stringify(summary,null,2));
