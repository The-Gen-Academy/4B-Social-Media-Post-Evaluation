import test from 'node:test';
import assert from 'node:assert/strict';
import {INTENTS,FAILURE_CATEGORIES,buildIntentRequest,buildFailureRequest,normalizeChoice,
  needsEscalation,buildJudgeRequest,normalizeJudge,finalDecision,exactMetrics,routingMetrics} from '../src/intent-eval.js';
import {evaluateRow,prepareDataset} from '../src/intent-eval-cli.js';

const row={id:'example',user_input:'Show my appointments tomorrow.',target_intent:'LIST_APPOINTMENTS',human_comment:'secret human reasoning',reference_category:'secret category',original_prediction:'IRRELEVANT_QUERY',original_reasoning:'A bad classifier explanation'};
function jevResponse(label='LIST_APPOINTMENTS',confidence=0.8){const p=Object.fromEntries(Object.keys(INTENTS).map(k=>[k,0]));p[label]=1;return {model:'jev-test',answers:{intent:{type:'choice',choice:label,confidence,probabilities:p}}};}
function judgeResponse(verdict='ACCEPT',intent='LIST_APPOINTMENTS'){return {model:'judge-test',choices:[{finish_reason:'stop',message:{content:JSON.stringify({verdict,intent,reason:'The request asks to view appointments.'})}}]};}

test('gold labels, human feedback, and prior predictions never enter intent or judge requests',()=>{
  const q=buildIntentRequest(row); assert.deepEqual(q.state,{user_input:row.user_input});
  const j=buildJudgeRequest(row,{choice:'LIST_APPOINTMENTS',confidence:0.01});
  assert.deepEqual(JSON.parse(j.messages[1].content),{user_input:row.user_input,candidate_intent:'LIST_APPOINTMENTS'});
  const f=buildFailureRequest(row);assert.deepEqual(Object.keys(f.state).sort(),['classifier_reasoning','intent_policy','predicted_intent','user_input']);
  for(const q of [buildIntentRequest(row),j,f]){assert.ok(!JSON.stringify(q).includes('secret human'));assert.ok(!JSON.stringify(q).includes('secret category'));}
});
test('choice validation rejects unknown labels, malformed probabilities and confidence',()=>{
  assert.equal(normalizeChoice(jevResponse(),'intent',INTENTS).choice,'LIST_APPOINTMENTS');
  for(const mutate of [r=>r.answers.intent.choice='other',r=>r.answers.intent.confidence=NaN,r=>r.answers.intent.confidence=1.1,
    r=>delete r.answers.intent.probabilities.BLOCK_SLOTS,r=>r.answers.intent.probabilities.BLOCK_SLOTS=0.2,r=>r.answers.intent.choice='BLOCK_SLOTS']){
    const r=jevResponse();mutate(r);assert.throws(()=>normalizeChoice(r,'intent',INTENTS));
  }
});
test('confidence gate respects equality, zero, one and missing responses',()=>{
  assert.equal(needsEscalation({confidence:0.699},0.7),true);
  assert.equal(needsEscalation({confidence:0.7},0.7),false);
  assert.equal(needsEscalation({confidence:0},0),false);
  assert.equal(needsEscalation({confidence:1},1),false);
  assert.equal(needsEscalation(null,0),true);
  assert.equal(needsEscalation({confidence:NaN},0.7),true);
  assert.throws(()=>needsEscalation(null,-1));
});
test('cascade calls the judge only for low confidence or Jev errors, audit calls on every row',async()=>{
  let calls=0;const judgeCall=async()=>{calls++;return judgeResponse();};
  await evaluateRow(row,{jevCall:async()=>jevResponse(),judgeCall});assert.equal(calls,0);
  const low=await evaluateRow(row,{jevCall:async()=>jevResponse('LIST_APPOINTMENTS',0.2),judgeCall});assert.equal(calls,1);assert.equal(low.decision.route,'LLM_JUDGE');
  await evaluateRow(row,{jevCall:async()=>jevResponse(),judgeCall,mode:'audit'});assert.equal(calls,2);
  const error=await evaluateRow(row,{jevCall:async()=>{throw new Error('HTTP 503');},judgeCall:async()=>judgeResponse('CORRECT')});
  assert.equal(error.decision.route,'LLM_JUDGE');assert.equal(error.jev_error,'HTTP 503');
});
test('judge errors and clarification cannot silently become an accepted intent',async()=>{
  const r=await evaluateRow(row,{jevCall:async()=>jevResponse('LIST_APPOINTMENTS',0.2),judgeCall:async()=>{throw new Error('timeout');}});
  assert.deepEqual(r.decision,{route:'HUMAN_REVIEW',intent:null});
  assert.deepEqual(finalDecision({choice:'BLOCK_SLOTS',confidence:0.1},{verdict:'CLARIFY',intent:'NEEDS_CLARIFICATION'}),{route:'CLARIFY',intent:null});
  assert.throws(()=>normalizeJudge(judgeResponse('ACCEPT','BLOCK_SLOTS'),{choice:'LIST_APPOINTMENTS'}));
  assert.throws(()=>normalizeJudge(judgeResponse('CLARIFY','BLOCK_SLOTS'),{choice:'LIST_APPOINTMENTS'}));
  const truncated=judgeResponse();truncated.choices[0].finish_reason='length';assert.throws(()=>normalizeJudge(truncated,{choice:'LIST_APPOINTMENTS'}));
});
test('metrics retain abstentions in the denominator and expose high-confidence errors',()=>{
  const rows=[{target_intent:'A',jev:{choice:'B',confidence:0.99},judge:{verdict:'CORRECT',intent:'A'}},
    {target_intent:'A',jev:{choice:'B',confidence:0.1},judge:{verdict:'CLARIFY',intent:'NEEDS_CLARIFICATION'}},
    {target_intent:'B',jev:{choice:'B',confidence:0.9}}];
  const r=routingMetrics(rows,0.7);assert.equal(r.accuracy,1/3);assert.equal(r.coverage,2/3);assert.equal(r.escalated,1);assert.equal(r.errors_caught,1);assert.equal(r.jev_errors,2);assert.equal(r.abstained,1);
  assert.equal(exactMetrics([],()=>null).accuracy,null);
});
test('one bounded format repair keeps labels hidden and fails closed after a second invalid response',async()=>{
  let n=0;
  const r=await evaluateRow(row,{jevCall:async()=>jevResponse('LIST_APPOINTMENTS',0.2),judgeCall:async q=>{
    n++;assert.ok(!JSON.stringify(q).includes('secret human'));
    return n===1?judgeResponse('CLARIFY','LIST_APPOINTMENTS'):judgeResponse('CLARIFY','NEEDS_CLARIFICATION');
  }});
  assert.equal(n,2);assert.equal(r.decision.route,'CLARIFY');assert.equal(r.judge_validation_errors.length,1);
  n=0;
  const bad=await evaluateRow(row,{jevCall:async()=>jevResponse('LIST_APPOINTMENTS',0.2),judgeCall:async()=>{n++;return judgeResponse('CLARIFY','LIST_APPOINTMENTS');}});
  assert.equal(n,2);assert.equal(bad.decision.route,'HUMAN_REVIEW');
});
test('source parsing preserves conflicting targets and aliases without exposing either to models',()=>{
  const s={sheets:{'Golden Dataset Full':[['TEST_ID','USER_INPUT','TARGET_INTENT'],['T1','Clear Monday','BLOCK_SLOTS']],
    'LLM as a Judge Dataset':[['header'],['T1','Clear Monday','CANCEL_APPOINTMENTS','UNBLOCK_SLOTS','why','fail','comment','Appointment_Management_vs_Solt_Availability',false]],
    'Failed Traces':[['header'],['T1','Clear Monday','CANCEL_APPOINTMENTS','UNBLOCK_SLOTS','high','why','fail','comment','Vague_Utterances']]}};
  const p=prepareDataset(s);assert.equal(p.rows[0].label_conflict,true);assert.equal(p.issues.intent_label_conflicts.length,1);
  assert.equal(p.rows[0].reference_category,'Appointment_Management_vs_Slot_Availability');
  s.sheets['Golden Dataset Full'].push(s.sheets['Golden Dataset Full'][1]);assert.throws(()=>prepareDataset(s),/Duplicate/);
});
