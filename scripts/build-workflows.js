import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { createHash } from 'node:crypto';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const strip = source => source.replace(/^import .*\n/gm,'').replace(/^export \{.*\} from .*\n/gm,'').replace(/^export /gm,'');
const rubric = strip(await readFile(resolve(root,'src/rubric.js'),'utf8'));
const contract = rubric+'\n'+strip(await readFile(resolve(root,'src/workshop.js'),'utf8'));
const core = contract+'\n'+strip(await readFile(resolve(root,'src/judge.js'),'utf8'));
const generator = strip(await readFile(resolve(root,'src/generation.js'),'utf8'));
const categoryCore = strip(await readFile(resolve(root,'src/category-judge.js'),'utf8'));
// UUID v5 in the URL namespace: stable across rebuilds, distinct per workflow.
function formWebhookId(workflowName) {
  const bytes = createHash('sha1').update(Buffer.from('6ba7b8119dad11d180b400c04fd430c8','hex')).update('https://github.com/The-Gen-Academy/4B-Social-Media-Post-Evaluation/'+workflowName).digest().subarray(0,16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return [hex.slice(0,8),hex.slice(8,12),hex.slice(12,16),hex.slice(16,20),hex.slice(20)].join('-');
}
const edge = name => [{node:name,type:'main',index:0}];
const node = (name,type,parameters,version=2) => ({id:name.toLowerCase().replace(/[^a-z0-9]+/g,'-'),name,type:'n8n-nodes-base.'+type,typeVersion:version,position:[0,0],parameters});
const code = (name,source,all=false) => node(name,'code',{mode:all?'runOnceForAllItems':'runOnceForEachItem',jsCode:source});
const condition = (name,expression) => node(name,'if',{conditions:{options:{caseSensitive:true,leftValue:'',typeValidation:'strict',version:2},conditions:[{id:name,leftValue:expression,rightValue:'',operator:{type:'boolean',operation:'true',singleValue:true}}],combinator:'and'},options:{}},2.2);
const http = (name,url) => ({...node(name,'httpRequest',{method:'POST',url,authentication:'genericCredentialType',genericAuthType:'httpHeaderAuth',sendBody:true,contentType:'json',specifyBody:'json',jsonBody:'={{ JSON.stringify($json.request) }}',options:{timeout:60000,response:{response:{responseFormat:'json'}}}},4.2),retryOnFail:true,maxTries:3,waitBetweenTries:5000,onError:'continueRegularOutput'});
function build(name,{generate=false,judge=false}) {
  const nodes = [
    node('Upload Posts CSV','formTrigger',{formTitle:name,formDescription:'Upload the provided 10-request CSV to generate posts, or a reviewed Evaluation Log CSV to judge saved posts. Each request must include an Approved facts: section. Generation keeps existing posts; use blank Model_Output cells for a new run.',formFields:{values:[{fieldLabel:'CSV File',fieldType:'file',fieldName:'csv_file',multipleFiles:false,acceptFileTypes:'.csv',requiredField:true}]},options:{appendAttribution:false}},2.5),
    node('Read Posts CSV','extractFromFile',{operation:'csv',binaryPropertyName:'csv_file',options:{includeEmptyCells:true}},1.1),
    code('Validate Row Identity',`${core}\nreturn prepareRows($input.all().map(i=>workshopInput(i.json))).map(row=>({json:row}));`,true),
    node('Loop Over Posts','splitInBatches',{batchSize:1,options:{}},3),
    code('Workbook Results',`${contract}\nreturn $input.all().flatMap(i=>${judge ? 'judgeResult(i.json)' : '[postResult(i.json)]'}.map(row=>({json:Object.fromEntries(Object.entries(row).map(([k,v])=>[k,typeof v==='string' && /^[=+@\\t\\r-]/.test(v) ? "'"+v : v]))})));`,true),
    node('Download Results CSV','convertToFile',{operation:'csv',options:{fileName:judge?'judge_results.csv':'linkedin_posts_output.csv',headerRow:true}},1.1),
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
      code('Prepare Jev Request',`${core}\nconst row=$json; let ready=eligibility(row),request=null,reviewRequest=null; try {if(ready.status==='OK'){request=buildRequest(row);reviewRequest=buildReviewRequest(row);}} catch(e){ready={status:'ERROR',reason:e.message};} return {json:{row,ready,request,reviewRequest}};`),
      condition('Ready to Judge',"={{ $json.ready.status === 'OK' }}"),
      http('Call Jev','https://api.typesafe.ai/v1/systemone'),
      code('Normalize Jev Result',`${core}\nconst p=$('Prepare Jev Request').item.json; let result; try {if($json.error) throw new Error('Jev HTTP request failed.'); result=normalizeResponse($json);} catch(e){result=blankResult('ERROR',e.message);} return {json:{row:{...p.row,...result},request:p.reviewRequest}};`),
      http('Independent LLM Review','https://openrouter.ai/api/v1/chat/completions'),
      code('Normalize Independent Review',`${core}\nconst row=$('Normalize Jev Result').item.json.row; let review; try {if($json.error) throw new Error('Independent review HTTP request failed.'); review=normalizeReview($json,row);} catch(e){review={LLM_Run_Status:'ERROR',LLM_Decision:'',LLM_Critique:'',Review_Required:true,Review_Reasons:'Independent critique unavailable.',Error:[row.Error,e.message].filter(Boolean).join('; ')};} return {json:{...row,...review}};`),
      code('Keep Unevaluated Row',`${core}\nconst p=$json; return {json:{...p.row,...blankResult(p.ready.status,p.ready.reason),Error:[p.row.Error,p.ready.status==='ERROR'?p.ready.reason:''].filter(Boolean).join('; ')}};`),
    );
    Object.assign(connections,{'Prepare Jev Request':{main:[edge('Ready to Judge')]},'Ready to Judge':{main:[edge('Call Jev'),edge('Keep Unevaluated Row')]},'Call Jev':{main:[edge('Normalize Jev Result')]},'Normalize Jev Result':{main:[edge('Independent LLM Review')]},'Independent LLM Review':{main:[edge('Normalize Independent Review')]},'Normalize Independent Review':{main:[edge('Loop Over Posts')]},'Keep Unevaluated Row':{main:[edge('Loop Over Posts')]}});
  }
  if (generate && judge) {
    nodes.push(code('Human Review Results',`${contract}\nreturn $input.all().map(i=>({json:Object.fromEntries(Object.entries(postResult(i.json)).map(([k,v])=>[k,typeof v==='string' && /^[=+@\\t\\r-]/.test(v) ? "'"+v : v]))}));`,true),
      node('Download Posts CSV','convertToFile',{operation:'csv',options:{fileName:'posts_for_human_review.csv',headerRow:true}},1.1));
    connections['Loop Over Posts'].main[0].push(...edge('Human Review Results'));
    connections['Human Review Results']={main:[edge('Download Posts CSV')]};
  }
  nodes.forEach((n,i)=>{n.position=[240+(i%5)*300,320+Math.floor(i/5)*260];if(n.type==='n8n-nodes-base.formTrigger')n.webhookId=formWebhookId(name);});
  nodes.push(node('Start Here','stickyNote',{width:1150,height:220,content:'## Social media evaluation\nGenerate 10 posts, then mark PASS or FAIL for Factual Correctness, Clarity, Value / Insight, Engagement and Tone Fit. The workbook calculates Overall: all five PASS = PASS; any FAIL = FAIL.\n\nAttach OpenRouter Header Auth (Authorization: Bearer <OpenRouter API key>) to Generate Post and Independent LLM Review. Call Jev uses its own TypeSafe Header Auth (Authorization: Bearer <TypeSafe API key>). Never put keys in Code nodes.\n\nGeneration exports request ID, brief and post for Evaluation Log. Keep original posts and reviews; add reruns as new labelled rows in Evaluation Log. Save failed posts in Failure Traces and update Failure Analysis. Legacy dimension-judge results contain one row per dimension plus Overall; keep the downloaded CSV beside the workbook. The current optional category judge is Social Media LLM Category Judge.json. Judges never receive human labels or each other\'s answers. Failed calls are not quality FAILs. See docs/walkthrough.md.'},1));
  nodes.at(-1).position=[240,20];
  return {name,nodes,connections,active:false,pinData:{},settings:{executionOrder:'v1'}};
}
for(const [file,options] of [
  ['Social Media Post Generation Workflow.json',{generate:true}],
  ['Social Media Jev Judge Only.json',{judge:true}],
  ['Social Media Post Generation with Jev Judge.json',{generate:true,judge:true}],
]) { await writeFile(resolve(root,file),JSON.stringify(build(file.replace('.json',''),options),null,2)+'\n'); console.log('Built '+file); }

// A separate, small workshop path. It does not generate posts or call Jev.
function buildCategoryWorkflow() {
  const configure = `// Choose ONE main failure category. Edit these three fields before running.
// The five existing definitions are in FAILURE_CATEGORIES below.
const config = {
  category: 'Missing Practical Detail',
  definition: 'The main problem is that the post promises useful resources, examples or guidance but does not supply concrete details the reader can use.',
  contrast_rule: 'A missing closing action alone belongs elsewhere. When the entire output advertises a resource instead of producing the requested resource, the main problem is Wrong Content Type.',
};
${categoryCore}
const input = $input.all();
return prepareCategoryRows(input.map(item=>item.json),config).map(row=>({json:row,pairedItem:{item:input.findIndex(item=>String(item.json.Test_ID).trim()===row.Test_ID)}}));`;
  const api = http('Ask OpenAI','https://api.openai.com/v1/chat/completions');
  api.parameters.authentication = 'predefinedCredentialType';
  api.parameters.nodeCredentialType = 'openAiApi';
  api.parameters.options.timeout = 120000;
  delete api.parameters.genericAuthType;
  const nodes = [
    node('Upload Failure Traces CSV','formTrigger',{formTitle:'Judge one main failure category',formDescription:'Upload the saved Failure Traces CSV after human review. Choose your target in Choose Failure Category first. The workflow compares the judge with the existing main category, without showing that label to OpenAI.',formFields:{values:[{fieldLabel:'CSV File',fieldType:'file',fieldName:'csv_file',multipleFiles:false,acceptFileTypes:'.csv',requiredField:true}]},options:{appendAttribution:false}},2.5),
    node('Read Failure Traces CSV','extractFromFile',{operation:'csv',binaryPropertyName:'csv_file',options:{includeEmptyCells:true}},1.1),
    code('Choose Failure Category',configure,true),
    node('Loop Over Failed Traces','splitInBatches',{batchSize:1,options:{}},3),
    code('Prepare Category Request',`${categoryCore}\nreturn {json:{row:$json,request:buildCategoryRequest($json)}};`),
    api,
    code('Compare With Human Category',`${categoryCore}\nconst row=$('Prepare Category Request').item.json.row; let result; try {if($json.error) throw new Error('OpenAI request failed. Check the Ask OpenAI execution and credential.'); result=normalizeCategoryResponse($json,row);} catch(error) {result=categoryResult(row,'',error.message,'ERROR');} return {json:result};`),
    code('Results CSV Rows',`return $input.all().map(item=>({json:Object.fromEntries(Object.entries(item.json).map(([key,value])=>[key,typeof value==='string' && /^[=+@\\t\\r-]/.test(value) ? "'"+value : value]))}));`,true),
    node('Download Category Results CSV','convertToFile',{operation:'csv',options:{fileName:'category_judge_results.csv',headerRow:true}},1.1),
    code('Calibration Summary',`${categoryCore}\nreturn [{json:categorySummary($input.all().map(item=>item.json))}];`,true),
  ];
  const connections = {
    'Upload Failure Traces CSV':{main:[edge('Read Failure Traces CSV')]},
    'Read Failure Traces CSV':{main:[edge('Choose Failure Category')]},
    'Choose Failure Category':{main:[edge('Loop Over Failed Traces')]},
    'Loop Over Failed Traces':{main:[[...edge('Results CSV Rows'),...edge('Calibration Summary')],edge('Prepare Category Request')]},
    'Prepare Category Request':{main:[edge('Ask OpenAI')]},
    'Ask OpenAI':{main:[edge('Compare With Human Category')]},
    'Compare With Human Category':{main:[edge('Loop Over Failed Traces')]},
    'Results CSV Rows':{main:[edge('Download Category Results CSV')]},
  };
  nodes.forEach((n,i)=>{n.position=[240+(i%5)*300,320+Math.floor(i/5)*260];if(n.type==='n8n-nodes-base.formTrigger')n.webhookId=formWebhookId('Social Media LLM Category Judge');});
  nodes.push(node('Start Here','stickyNote',{width:1350,height:240,content:'## Judge one main failure category with OpenAI\n1. Complete human review and assign ONE main category to each failed trace.\n2. Edit category, definition and contrast_rule in Choose Failure Category. Use the exact category name from the workbook.\n3. Attach your OpenAI credential to Ask OpenAI. Model: gpt-5.4-mini.\n4. Execute and upload Failure Traces as CSV. Include failed traces from the selected category AND other categories.\n5. Download the results and inspect Calibration Summary. TRUE means the selected category is the MAIN problem; FALSE means it is not. Neither means the post passes. Errors and insufficient evidence stay unresolved.\n\nOnly the request, saved post and source facts reach OpenAI. Human labels and feedback are used for comparison afterward. Clarify the definition after inspecting disagreements, then rerun the same saved traces. Keep previous results. No new workbook tab is required.'},1));
  nodes.at(-1).position=[240,20];
  return {name:'Social Media LLM Category Judge',nodes,connections,active:false,pinData:{},settings:{executionOrder:'v1'}};
}
await writeFile(resolve(root,'Social Media LLM Category Judge.json'),JSON.stringify(buildCategoryWorkflow(),null,2)+'\n');
console.log('Built Social Media LLM Category Judge.json');
