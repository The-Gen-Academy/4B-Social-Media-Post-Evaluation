import {readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {dirname,resolve} from 'node:path';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const core=(await readFile(resolve(root,'src/intent-eval.js'),'utf8')).replace(/^export /gm,'');
const prior=JSON.parse(await readFile(resolve(root,'Social Media Jev Judge Only.json'),'utf8'));
const node=(name,type,parameters,position,extra={})=>({name,id:name.toLowerCase().replace(/[^a-z0-9]+/g,'-'),type:`n8n-nodes-base.${type}`,typeVersion:2,parameters,position,...extra});
const form=structuredClone(prior.nodes.find(n=>n.type.endsWith('.formTrigger')));
form.name='Upload Intent CSV';form.id='upload-intent-csv';form.position=[0,200];
form.parameters.formTitle='Clinic Intent Classification with Jev';
form.parameters.formDescription='Upload a CSV exported from Golden Dataset Full. No score columns to fill. Jev classifies USER_INPUT; low-confidence decisions go to an LLM judge. This is an evaluation and performs no calendar actions.';
const extract=structuredClone(prior.nodes.find(n=>n.type.endsWith('.extractFromFile')));extract.name='Read Intent CSV';extract.id='read-intent-csv';extract.position=[220,200];
const download=structuredClone(prior.nodes.find(n=>n.type.endsWith('.convertToFile')));download.name='Download Intent Results';download.id='download-intent-results';download.parameters.options.fileName='clinic_intent_results.csv';download.position=[680,0];
const http=(name,url,position)=>node(name,'httpRequest',{method:'POST',url,authentication:'genericCredentialType',genericAuthType:'httpHeaderAuth',sendBody:true,contentType:'json',specifyBody:'json',jsonBody:'={{ JSON.stringify($json.request) }}',options:{timeout:45000,response:{response:{responseFormat:'json'}}}},position,{typeVersion:4.2,retryOnFail:true,maxTries:3,waitBetweenTries:5000,onError:'continueRegularOutput'});
const nodes=[form,extract,
  node('Loop Over Inputs','splitInBatches',{batchSize:1,options:{}},[440,200],{typeVersion:3}),
  node('Prepare Intent Request','code',{mode:'runOnceForEachItem',jsCode:`${core}\nconst row={id:String($json.TEST_ID??$json.id??''),user_input:String($json.USER_INPUT??$json.user_input??'')};\nconst referenceIntent=String($json.TARGET_INTENT??$json.target_intent??'');\n// Configure threshold here. 0.70 is experimental, not calibrated production accuracy.\nconst threshold=0.7;\nreturn {json:{row,referenceIntent,threshold,request:buildIntentRequest(row),judgeModel:'openai/gpt-4.1-mini'}};`},[660,320]),
  http('Call Jev Intent','https://openrouter.ai/api/v1/systemone',[880,320]),
  node('Route by Confidence','code',{mode:'runOnceForEachItem',jsCode:`${core}\nconst p=$('Prepare Intent Request').item.json;\nlet jev=null,jev_error=null;\ntry{jev=normalizeChoice($json,'intent',INTENTS);}catch(e){jev_error=e.message;}\nreturn {json:{...p,jev,jev_error,escalate:needsEscalation(jev,p.threshold),request:buildJudgeRequest(p.row,jev,p.judgeModel)}};`},[1100,320]),
  node('Needs LLM Judge','if',{conditions:{options:{caseSensitive:true,leftValue:'',typeValidation:'strict',version:2},conditions:[{id:'low-confidence',leftValue:'={{ $json.escalate }}',rightValue:'',operator:{type:'boolean',operation:'true',singleValue:true}}],combinator:'and'},options:{}},[1320,320],{typeVersion:2.2}),
  http('Call LLM Judge','https://openrouter.ai/api/v1/chat/completions',[1540,220]),
  node('Read LLM Judgment','code',{mode:'runOnceForEachItem',jsCode:`${core}\nconst p=$('Route by Confidence').item.json;\nlet judge=null,judge_error=null;\ntry{judge=normalizeJudge($json,p.jev);}catch(e){judge_error=e.message;}\nreturn {json:{...p,judge,judge_error}};`},[1760,220]),
  node('Finalize Decision','code',{mode:'runOnceForEachItem',jsCode:`${core}\nconst p=$json;const d=finalDecision(p.jev,p.judge,p.threshold);\nconst match=intent=>!p.referenceIntent?'NO_LABEL':!intent?'UNRESOLVED':intent===p.referenceIntent?'MATCH':'MISMATCH';\nreturn {json:{TEST_ID:p.row.id,USER_INPUT:p.row.user_input,TARGET_INTENT:p.referenceIntent,JEV_INTENT:p.jev?.choice??'',JEV_CONFIDENCE:p.jev?.confidence??'',JEV_MATCH:match(p.jev?.choice),ESCALATED:p.escalate,LLM_VERDICT:p.judge?.verdict??'',FINAL_INTENT:d.intent??'',FINAL_MATCH:match(d.intent),ROUTE:d.route,REASON:p.judge?.reason??'',ERROR:[p.jev_error,p.judge_error].filter(Boolean).join('; ')}};`},[1980,420]),
  download,node('Setup','stickyNote',{width:680,height:240,content:'## Jev confidence escalation\nConnect the same OpenRouter Header Auth credential to **Call Jev Intent** and **Call LLM Judge** (`Authorization: Bearer <key>`).\n\nExport Golden Dataset Full as CSV, execute and upload. Only USER_INPUT goes to Jev; the LLM sees the input and candidate intent. No human labels or Jev confidence are sent to the LLM.\n\nConfidence < 0.70 or a Jev error triggers review. CLARIFY / HUMAN_REVIEW remain unresolved. High confidence can still be wrong: audit a sample and verify actions separately. No calendar actions are performed.'},[0,-140],{typeVersion:1})];
const link=n=>[{node:n,type:'main',index:0}];
const connections={
  'Upload Intent CSV':{main:[link('Read Intent CSV')]},'Read Intent CSV':{main:[link('Loop Over Inputs')]},
  'Loop Over Inputs':{main:[link('Download Intent Results'),link('Prepare Intent Request')]},
  'Prepare Intent Request':{main:[link('Call Jev Intent')]},'Call Jev Intent':{main:[link('Route by Confidence')]},
  'Route by Confidence':{main:[link('Needs LLM Judge')]},'Needs LLM Judge':{main:[link('Call LLM Judge'),link('Finalize Decision')]},
  'Call LLM Judge':{main:[link('Read LLM Judgment')]},'Read LLM Judgment':{main:[link('Finalize Decision')]},
  'Finalize Decision':{main:[link('Loop Over Inputs')]},
};
const workflow={name:'Clinic Intent Jev with LLM Escalation',nodes,connections,settings:{executionOrder:'v1'},active:false,pinData:{}};
await writeFile(resolve(root,'Clinic Intent Jev with LLM Escalation.json'),JSON.stringify(workflow,null,2)+'\n');
console.log('Built Clinic Intent Jev with LLM Escalation.json');
