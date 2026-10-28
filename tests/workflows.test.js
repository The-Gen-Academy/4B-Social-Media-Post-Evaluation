import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {row,responseFor,reviewFor} from './fixtures.js';
import {POST_COLUMNS,JUDGE_COLUMNS,workshopResult} from '../src/workshop.js';
const files=['Social Media Post Generation Workflow.json','Social Media Jev Judge Only.json','Social Media Post Generation with Jev Judge.json'];
test('every importable form has a distinct stable webhook UUID before the editor opens it',async()=>{
  const ids=[];
  for(const file of [...files,'Social Media LLM Category Judge.json']) {
    const workflow=JSON.parse(await readFile(file,'utf8'));
    const forms=workflow.nodes.filter(node=>node.type==='n8n-nodes-base.formTrigger');
    assert.equal(forms.length,1);
    const version=file===files[0]?'4':'5';
    assert.match(forms[0].webhookId,new RegExp('^[0-9a-f]{8}-[0-9a-f]{4}-'+version+'[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'));
    ids.push(forms[0].webhookId);
  }
  assert.equal(new Set(ids).size,4);
});
for(const file of files) test(file+' has valid graph, no shipped secrets, and executable embedded code',async()=>{
  const w=JSON.parse(await readFile(file,'utf8')),names=new Set(w.nodes.map(n=>n.name));
  assert.equal(w.active,false);assert.deepEqual(w.pinData,{});
  for(const n of w.nodes){assert(!n.credentials);if(n.type.endsWith('.code'))new vm.Script('(function(){'+n.parameters.jsCode+'})()');}
  for(const n of w.nodes.filter(n=>['Generate Post','Independent LLM Review'].includes(n.name))){
    assert.equal(n.parameters.url,'https://api.openai.com/v1/chat/completions');
    assert.equal(n.parameters.authentication,'predefinedCredentialType');
    assert.equal(n.parameters.nodeCredentialType,'openAiApi');
    assert.equal(n.parameters.genericAuthType,undefined);
  }
  for(const [from,edges] of Object.entries(w.connections)){assert(names.has(from));for(const outputs of Object.values(edges))for(const group of outputs)for(const edge of group)assert(names.has(edge.node));}
  // The restored creator/critic workflow has its own CSV loop, exercised below.
  if(file===files[0])return;
  const stored={};
  const exec=(name,json,rows=[json])=>{
    const n=w.nodes.find(n=>n.name===name);
    const result=vm.runInNewContext('(function(){'+n.parameters.jsCode+'})()',{ $json:json,$input:{all:()=>rows.map(json=>({json}))},$:name=>({item:{json:stored[name]}}) });
    if(!Array.isArray(result))stored[name]=result.json;return JSON.parse(JSON.stringify(result));
  };
  const validated=exec('Validate Row Identity',row,[row,{...row,Test_ID:'T2'}]);assert.equal(validated.length,2);
  const simple=exec('Validate Row Identity',null,[workshopResult(row)])[0].json;
  assert.equal(simple.Human_Decision,'PASS');assert.equal(simple.Human_Critique,row.Human_Critique);assert.equal(simple.Context_Status,'READY');
  const duplicate=exec('Validate Row Identity',null,[workshopResult(row),workshopResult(row)]);assert(duplicate.every(r=>r.json.__identity_error));
  if(names.has('Prepare Generation')){
    const p=exec('Prepare Generation',{...row,Model_Output:''});assert.equal(p.json.ready.status,'READY');
    assert.equal(p.json.request.model,'gpt-4.1-mini');
    const generated=exec('Keep Generated Post',{choices:[{finish_reason:'stop',message:{content:'New post'}}]});assert.equal(generated.json.Human_Decision,'');assert.equal(generated.json.Jev_Decision,'');
  }
  if(names.has('Prepare Jev Request')){
    const p=exec('Prepare Jev Request',row);assert.equal(p.json.ready.status,'OK');assert.equal(p.json.request.questions.Factual_Correctness.type,'choice');
    assert.equal(p.json.reviewRequest.model,'gpt-4.1-mini');
    assert.equal(p.json.request.model,'jev-1.13.0');assert.equal(w.nodes.find(n=>n.name==='Call Jev').parameters.url,'https://api.typesafe.ai/v1/systemone');
    const jev=exec('Normalize Jev Result',responseFor('FAIL'));assert.equal(jev.json.row.Jev_Decision,'FAIL');assert(!JSON.stringify(jev.json.request).includes('Human_Critique'));
    const llm=exec('Normalize Independent Review',reviewFor());assert.equal(llm.json.Jev_Decision,'FAIL');assert.equal(llm.json.LLM_Decision,'PASS');assert.equal(llm.json.Review_Required,true);
    const blocked=exec('Prepare Jev Request',{...row,Context_Status:''});const kept=exec('Keep Unevaluated Row',blocked.json);assert.equal(kept.json.Jev_Decision,'');assert.equal(kept.json.Jev_Run_Status,'NEEDS_CONTEXT');
  }
  const exported=exec('Workbook Results',row,[{...row,Test_ID:'=formula()',Model_Output:'=formula()'}]);
  assert.deepEqual(Object.keys(exported[0].json),names.has('Prepare Jev Request')?JUDGE_COLUMNS:POST_COLUMNS);
  assert.equal(exported[0].json.Test_ID,"'=formula()");
  if(names.has('Human Review Results')){
    const human=exec('Human Review Results',row,[row]);assert.deepEqual(Object.keys(human[0].json),POST_COLUMNS);
    assert.equal(human[0].json.Model_Output,row.Model_Output);
  }
});

test('original generator uses the original OpenAI creator and critic prompts and revision graph',async()=>{
  const w=JSON.parse(await readFile(files[0],'utf8'));
  const byName=name=>w.nodes.find(node=>node.name===name);
  const links=(name,type='main')=>w.connections[name][type].map(group=>group.map(edge=>edge.node));
  assert.equal(w.nodes.length,16);
  for(const [modelNode,model,agent] of [
    ['OpenAI Chat Model','gpt-5.5-pro','LinkedIn Creator Agent1'],
    ['OpenAI Chat Model1','gpt-5-mini','LinkedIn Critic Agent1'],
  ]){
    const n=byName(modelNode);
    assert.equal(n.type,'@n8n/n8n-nodes-langchain.lmChatOpenAi');
    assert.equal(n.parameters.model.value,model);
    assert.deepEqual(links(modelNode,'ai_languageModel'),[[agent]]);
  }
  // Digests capture both original instructions and their input templates at 5ce7666.
  const originals=[
    ['LinkedIn Creator Agent1','16851cca255a81a2be7f76970ba606a819c61183b7b0bd3c5a6622b57ed644e4','ec466ba9256357b2f4950d1bca13cf7d6e95f02933c2c139cf3f4c837e992dae'],
    ['LinkedIn Critic Agent1','1c0bef238422b7011f4b845112a3c3d6a7ceb0f1e61b2f45f3dfb712ecde7173','c3a2e093414eb60c7c55c16d1252477346a32ee3bfe1f8f5858c7f5db9fa631d'],
  ];
  for(const [name,textHash,systemHash] of originals){
    const p=byName(name).parameters;
    assert.equal(createHash('sha256').update(p.text).digest('hex'),textHash,name+' input template');
    assert.equal(createHash('sha256').update(p.options.systemMessage).digest('hex'),systemHash,name+' system prompt');
  }
  assert.deepEqual(links('LinkedIn Creator Agent1'),[['LinkedIn Critic Agent1']]);
  assert.deepEqual(links('LinkedIn Critic Agent1'),[['Check Critic Feedback1']]);
  assert.deepEqual(links('Check Critic Feedback1'),[['Prepare Revision Context'],['Prepare Final Row Data']]);
  assert.deepEqual(links('Prepare Revision Context'),[['LinkedIn Creator Agent1']]);
  assert.deepEqual(links('Prepare Final Row Data'),[['Loop Over All Rows']]);
  assert.equal(byName('Convert to Excel').parameters.options.fileName,'linkedin_posts_output.csv');
});

test('original generator selects blank outputs and merges generated CSV rows while preserving existing posts',async()=>{
  const w=JSON.parse(await readFile(files[0],'utf8'));
  const originals=[
    {Test_ID:'',User_Input:'Explain retrieval recall',Model_Output:'',Notes:'Keep A'},
    {Test_ID:'T2',User_Input:'Explain precision',Model_Output:'Saved post',Notes:'Keep B'},
    {Test_ID:null,User_Input:'Explain grounding',Model_Output:null,Notes:'Keep C'},
    {Test_ID:'T4',User_Input:'Explain evaluation',Model_Output:'   ',Notes:'Keep D'},
  ];
  const exec=(name,rows)=>{
    const n=w.nodes.find(node=>node.name===name);
    const result=vm.runInNewContext('(function(){'+n.parameters.jsCode+'})()',{
      $input:{all:()=>rows.map(json=>({json}))},
      $:source=>{
        assert.equal(source,'Extract First Sheet Data');
        return {all:()=>originals.map(json=>({json}))};
      },
    });
    return JSON.parse(JSON.stringify(result));
  };
  const selected=exec('Join Ideas1',originals);
  assert.deepEqual(selected.map(item=>item.json.__row_index),[0,2,3]);
  assert.deepEqual(selected.map(item=>item.json.__merge_key),['Explain retrieval recall','Explain grounding','T4']);
  const processed=selected.map((item,index)=>({...item.json,Model_Output:'Generated post '+(index+1)}));
  // n8n's aggregate node nests processed rows under data; row order is restored by merge key.
  const expected=originals.map((row,index)=>({...row,Model_Output:['Generated post 1','Saved post','Generated post 2','Generated post 3'][index]}));
  assert.deepEqual(exec('Prepare Excel Output Data',[{data:processed.reverse()}]).map(item=>item.json),expected);
  // The merge also accepts direct rows, without relying on the aggregate wrapper.
  assert.deepEqual(exec('Prepare Excel Output Data',processed).map(item=>item.json),expected);
});

test('provided ten-request batch exports ten posts and sixty independent review rows',async()=>{
  const requests=JSON.parse(await readFile('examples/10-post-requests.json','utf8'));
  assert.equal(requests.length,10);assert.equal(new Set(requests.map(r=>r.Test_ID)).size,10);
  const w=JSON.parse(await readFile(files[2],'utf8')),stored={};
  const exec=(name,json,rows=[json])=>{
    const n=w.nodes.find(n=>n.name===name);
    const result=vm.runInNewContext('(function(){'+n.parameters.jsCode+'})()',{$json:json,$input:{all:()=>rows.map(json=>({json}))},$:name=>({item:{json:stored[name]}})});
    if(!Array.isArray(result))stored[name]=result.json;return JSON.parse(JSON.stringify(result));
  };
  const validated=exec('Validate Row Identity',null,requests.map(r=>({...r,Model_Output:''})));
  const results=[];
  for(const item of validated){
    const generation=exec('Prepare Generation',item.json);assert.equal(generation.json.ready.status,'READY');
    assert.match(generation.json.request.messages[1].content,/Fictional|fictional|Practice method|Checklist|In this exercise/);
    const generated=exec('Keep Generated Post',{choices:[{finish_reason:'stop',message:{content:'Fabricated test post for '+item.json.Test_ID}}]});
    exec('Prepare Jev Request',generated.json);
    exec('Normalize Jev Result',responseFor());
    results.push(exec('Normalize Independent Review',reviewFor()).json);
  }
  const posts=exec('Human Review Results',null,results);
  const judged=exec('Workbook Results',null,results);
  assert.equal(posts.length,10);assert.equal(judged.length,60);
  assert.equal(judged.filter(r=>r.json.Dimension==='Overall').length,10);
  assert(judged.every(r=>r.json.Human_Status===''&&r.json.Jev_Status==='PASS'&&r.json.LLM_Status==='PASS'));
  assert.throws(()=>exec('Human Review Results',null,[{...results[0],Model_Output:'',Generation_Status:'ERROR',Error:'Fixture failure'}]),/Generation incomplete/);
});
