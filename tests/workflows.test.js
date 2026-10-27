import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {row,responseFor,reviewFor} from './fixtures.js';
import {POST_COLUMNS,JUDGE_COLUMNS,workshopResult} from '../src/workshop.js';
const files=['Social Media Post Generation Workflow.json','Social Media Jev Judge Only.json','Social Media Post Generation with Jev Judge.json'];
for(const file of files) test(file+' has valid graph, no shipped secrets, and executable embedded code',async()=>{
  const w=JSON.parse(await readFile(file,'utf8')),names=new Set(w.nodes.map(n=>n.name));
  assert.equal(w.active,false);assert.deepEqual(w.pinData,{});
  for(const n of w.nodes){assert(!n.credentials);if(n.type.endsWith('.code'))new vm.Script('(function(){'+n.parameters.jsCode+'})()');}
  for(const [from,edges] of Object.entries(w.connections)){assert(names.has(from));for(const outputs of Object.values(edges))for(const group of outputs)for(const edge of group)assert(names.has(edge.node));}
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
    const generated=exec('Keep Generated Post',{choices:[{finish_reason:'stop',message:{content:'New post'}}]});assert.equal(generated.json.Human_Decision,'');assert.equal(generated.json.Jev_Decision,'');
  }
  if(names.has('Prepare Jev Request')){
    const p=exec('Prepare Jev Request',row);assert.equal(p.json.ready.status,'OK');assert.equal(p.json.request.questions.Factual_Correctness.type,'choice');
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
