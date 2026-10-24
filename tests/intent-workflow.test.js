import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {INTENTS} from '../src/intent-eval.js';
const workflow=JSON.parse(readFileSync(new URL('../Clinic Intent Jev with LLM Escalation.json',import.meta.url)));
const run=(name,json,previous={})=>{
  const n=workflow.nodes.find(n=>n.name===name);
  return vm.runInNewContext(`(function(){${n.parameters.jsCode}})()`,{$json:json,$:name=>({item:{json:previous[name]}})}).json;
};
const response=confidence=>({model:'jev-test',answers:{intent:{type:'choice',choice:'LIST_APPOINTMENTS',confidence,probabilities:Object.fromEntries(Object.keys(INTENTS).map(k=>[k,k==='LIST_APPOINTMENTS'?1:0]))}}});
test('clinic workflow has credential placeholders, connected branches and no calendar operations',()=>{
  assert.equal(workflow.active,false);
  for(const n of workflow.nodes)assert.equal(n.credentials,undefined);
  const names=new Set(workflow.nodes.map(n=>n.name));
  for(const outputs of Object.values(workflow.connections))for(const branch of outputs.main)for(const edge of branch)assert.ok(names.has(edge.node));
  assert.equal(workflow.connections['Needs LLM Judge'].main[0][0].node,'Call LLM Judge');
  assert.equal(workflow.connections['Needs LLM Judge'].main[1][0].node,'Finalize Decision');
  assert.ok(workflow.nodes.every(n=>!n.type.toLowerCase().includes('calendar')));
});
test('embedded clinic nodes preserve the confidence gate and omit labels from both API requests',()=>{
  const p=run('Prepare Intent Request',{TEST_ID:'T1',USER_INPUT:'Show tomorrow',TARGET_INTENT:'BLOCK_SLOTS',human_feedback:'secret'});
  assert.equal(JSON.stringify(p.request).includes('secret'),false);
  assert.deepEqual(Object.keys(p.request.state),['user_input']);
  const high=run('Route by Confidence',response(0.9),{'Prepare Intent Request':p});
  assert.equal(high.escalate,false);assert.equal(run('Finalize Decision',high).ROUTE,'JEV');
  const low=run('Route by Confidence',response(0.3),{'Prepare Intent Request':p});
  assert.equal(low.escalate,true);assert.equal(JSON.stringify(low.request.messages).includes('confidence'),false);
  const judge={model:'judge-test',choices:[{finish_reason:'stop',message:{content:JSON.stringify({verdict:'CLARIFY',intent:'NEEDS_CLARIFICATION',reason:'Ambiguous request'})}}]};
  const reviewed=run('Read LLM Judgment',judge,{'Route by Confidence':low});
  const final=run('Finalize Decision',reviewed);assert.equal(final.ROUTE,'CLARIFY');assert.equal(final.FINAL_INTENT,'');
  const error=run('Read LLM Judgment',{error:'failed'},{'Route by Confidence':low});
  assert.equal(run('Finalize Decision',error).ROUTE,'HUMAN_REVIEW');
});
