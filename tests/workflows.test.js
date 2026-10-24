import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {row,responseFor,reviewFor} from './fixtures.js';
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
  if(names.has('Prepare Generation')){
    const p=exec('Prepare Generation',{...row,Model_Output:''});assert.equal(p.json.ready.status,'READY');
    const generated=exec('Keep Generated Post',{choices:[{finish_reason:'stop',message:{content:'New post'}}]});assert.equal(generated.json.Human_Decision,'');assert.equal(generated.json.Jev_Decision,'');
  }
  if(names.has('Prepare Jev Request')){
    const p=exec('Prepare Jev Request',row);assert.equal(p.json.ready.status,'OK');assert.equal(p.json.request.questions.Publication_Decision.type,'choice');
    const jev=exec('Normalize Jev Result',responseFor('FAIL'));assert.equal(jev.json.row.Jev_Decision,'FAIL');assert(!JSON.stringify(jev.json.request).includes('Human_Critique'));
    const llm=exec('Normalize Independent Review',reviewFor());assert.equal(llm.json.Jev_Decision,'FAIL');assert.equal(llm.json.LLM_Decision,'PASS');assert.equal(llm.json.Review_Required,true);
    const blocked=exec('Prepare Jev Request',{...row,Context_Status:''});const kept=exec('Keep Unevaluated Row',blocked.json);assert.equal(kept.json.Jev_Decision,'');assert.equal(kept.json.Jev_Run_Status,'NEEDS_CONTEXT');
  }
  const exported=exec('Workbook Results',row,[{...row,Model_Output:'=formula()'}]);assert.equal(Object.keys(exported[0].json).length,35);assert.equal(exported[0].json.Model_Output,"'=formula()");
});
