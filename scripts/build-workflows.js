import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const core = (await readFile(resolve(root,'src/judge.js'),'utf8')).replace(/^export /gm,'');
const contract = (await readFile(resolve(root,'src/workshop.js'),'utf8')).replace(/^export /gm,'');
const generator = (await readFile(resolve(root,'src/generation.js'),'utf8')).replace(/^export /gm,'');
const edge = name => [{node:name,type:'main',index:0}];
const node = (name,type,parameters,version=2) => ({id:name.toLowerCase().replace(/[^a-z0-9]+/g,'-'),name,type:'n8n-nodes-base.'+type,typeVersion:version,position:[0,0],parameters});
const code = (name,source,all=false) => node(name,'code',{mode:all?'runOnceForAllItems':'runOnceForEachItem',jsCode:source});
const condition = (name,expression) => node(name,'if',{conditions:{options:{caseSensitive:true,leftValue:'',typeValidation:'strict',version:2},conditions:[{id:name,leftValue:expression,rightValue:'',operator:{type:'boolean',operation:'true',singleValue:true}}],combinator:'and'},options:{}},2.2);
const http = (name,url) => ({...node(name,'httpRequest',{method:'POST',url,authentication:'genericCredentialType',genericAuthType:'httpHeaderAuth',sendBody:true,contentType:'json',specifyBody:'json',jsonBody:'={{ JSON.stringify($json.request) }}',options:{timeout:60000,response:{response:{responseFormat:'json'}}}},4.2),retryOnFail:true,maxTries:3,waitBetweenTries:5000,onError:'continueRegularOutput'});
function build(name,{generate=false,judge=false}) {
  const nodes = [
    node('Upload Posts CSV','formTrigger',{formTitle:name,formDescription:'Upload a CSV exported from Evaluation Log. Include stable Test_ID, a new Run_ID for new posts, brief, approved source text, and Context_Status READY. Human reviews are preserved for unchanged posts only.',formFields:{values:[{fieldLabel:'CSV File',fieldType:'file',fieldName:'csv_file',multipleFiles:false,acceptFileTypes:'.csv',requiredField:true}]},options:{appendAttribution:false}},2.5),
    node('Read Posts CSV','extractFromFile',{operation:'csv',binaryPropertyName:'csv_file',options:{includeEmptyCells:true}},1.1),
    code('Validate Row Identity',`${core}\nreturn prepareRows($input.all().map(i=>i.json)).map(row=>({json:row}));`,true),
    node('Loop Over Posts','splitInBatches',{batchSize:1,options:{}},3),
    code('Workbook Results',`${contract}\nreturn $input.all().map(i=>({json:Object.fromEntries(Object.entries(workshopResult(i.json)).map(([k,v])=>[k,typeof v==='string' && /^[=+@\\t\\r-]/.test(v) ? "'"+v : v]))}));`,true),
    node('Download Results CSV','convertToFile',{operation:'csv',options:{fileName:judge?'publication_evaluation.csv':'linkedin_posts_output.csv',headerRow:true}},1.1),
  ];
  const connections = {
    'Upload Posts CSV':{main:[edge('Read Posts CSV')]}, 'Read Posts CSV':{main:[edge('Validate Row Identity')]},
    'Validate Row Identity':{main:[edge('Loop Over Posts')]},
    'Loop Over Posts':{main:[edge('Workbook Results'),edge(generate?'Prepare Generation':'Prepare Jev Request')]},
    'Workbook Results':{main:[edge('Download Results CSV')]},
  };
  const afterGeneration = judge ? 'Prepare Jev Request' : 'Loop Over Posts';
  if(generate) {
    nodes.push(
      code('Prepare Generation',`${core}\n${generator}\nconst row=$json; const ready=generationEligibility(row); return {json:{row,ready,request:ready.status==='READY'?buildGenerationRequest(row):null}};`),
      condition('Needs Generation',"={{ $json.ready.status === 'READY' }}"),
      http('Generate Post','https://openrouter.ai/api/v1/chat/completions'),
      code('Keep Generated Post',`${core}\n${generator}\nconst row=$('Prepare Generation').item.json.row; let result; try {if($json.error) throw new Error('Generation HTTP request failed.'); result={...normalizeGeneration($json,row),...blankResult('NOT_RUN')};} catch(e) {result={...row,...blankResult('ERROR',e.message),Generation_Status:'ERROR',Model_Output:''};} return {json:result};`),
      code('Keep Existing or Blocked Row',`const p=$json; return {json:{...p.row,Generation_Status:p.ready.status,Error:p.ready.reason||p.row.Error||''}};`),
    );
    Object.assign(connections,{'Prepare Generation':{main:[edge('Needs Generation')]},'Needs Generation':{main:[edge('Generate Post'),edge('Keep Existing or Blocked Row')]},'Generate Post':{main:[edge('Keep Generated Post')]},'Keep Generated Post':{main:[edge(afterGeneration)]},'Keep Existing or Blocked Row':{main:[edge(afterGeneration)]}});
  }
  if(judge) {
    nodes.push(
      code('Prepare Jev Request',`${core}\nconst row=$json; let ready=eligibility(row),request=null,reviewRequest=null; try {if(ready.status==='OK'){request=buildRequest(row,'typesafe/jev-1.13');reviewRequest=buildReviewRequest(row);}} catch(e){ready={status:'ERROR',reason:e.message};} return {json:{row,ready,request,reviewRequest}};`),
      condition('Ready to Judge',"={{ $json.ready.status === 'OK' }}"),
      http('Call Jev','https://openrouter.ai/api/v1/systemone'),
      code('Normalize Jev Result',`${core}\nconst p=$('Prepare Jev Request').item.json; let result; try {if($json.error) throw new Error('Jev HTTP request failed.'); result=normalizeResponse($json);} catch(e){result=blankResult('ERROR',e.message);} return {json:{row:{...p.row,...result},request:p.reviewRequest}};`),
      http('Independent LLM Review','https://openrouter.ai/api/v1/chat/completions'),
      code('Normalize Independent Review',`${core}\nconst row=$('Normalize Jev Result').item.json.row; let review; try {if($json.error) throw new Error('Independent review HTTP request failed.'); review=normalizeReview($json,row);} catch(e){review={LLM_Run_Status:'ERROR',LLM_Decision:'',LLM_Critique:'',Review_Required:true,Review_Reasons:'Independent critique unavailable.',Error:[row.Error,e.message].filter(Boolean).join('; ')};} return {json:{...row,...review}};`),
      code('Keep Unevaluated Row',`${core}\nconst p=$json; return {json:{...p.row,...blankResult(p.ready.status,p.ready.reason),Error:[p.row.Error,p.ready.status==='ERROR'?p.ready.reason:''].filter(Boolean).join('; ')}};`),
    );
    Object.assign(connections,{'Prepare Jev Request':{main:[edge('Ready to Judge')]},'Ready to Judge':{main:[edge('Call Jev'),edge('Keep Unevaluated Row')]},'Call Jev':{main:[edge('Normalize Jev Result')]},'Normalize Jev Result':{main:[edge('Independent LLM Review')]},'Independent LLM Review':{main:[edge('Normalize Independent Review')]},'Normalize Independent Review':{main:[edge('Loop Over Posts')]},'Keep Unevaluated Row':{main:[edge('Loop Over Posts')]}});
  }
  nodes.forEach((n,i)=>{n.position=[240+(i%5)*300,320+Math.floor(i/5)*260];});
  nodes.push(node('Start Here','stickyNote',{width:1150,height:220,content:'## Human-led publication evaluation\nFill the approved context, independently critique and label exact outputs, then calibrate the judge. Jev returns one PASS/FAIL choice. The separate LLM critique is an independent opinion, never Jev reasoning.\n\nAttach Header Auth (Authorization: Bearer <OpenRouter API key>) to each HTTP node. No credentials are shipped. Use a new Run_ID for new posts; keep the same Test_ID and brief. Generation is one pass so baseline and revisions remain inspectable. ERROR, SKIPPED, AMBIGUOUS and NEEDS_CONTEXT are execution states, never quality labels.\n\nDownload the CSV from Download Results CSV. Match its 35 columns to Evaluation Log. See docs/walkthrough.md for the complete current demo.'},1));
  nodes.at(-1).position=[240,20];
  return {name,nodes,connections,active:false,pinData:{},settings:{executionOrder:'v1'}};
}
for(const [file,options] of [
  ['Social Media Post Generation Workflow.json',{generate:true}],
  ['Social Media Jev Judge Only.json',{judge:true}],
  ['Social Media Post Generation with Jev Judge.json',{generate:true,judge:true}],
]) { await writeFile(resolve(root,file),JSON.stringify(build(file.replace('.json',''),options),null,2)+'\n'); console.log('Built '+file); }
