import test from 'node:test';
import assert from 'node:assert/strict';
import {buildRequest,buildReviewRequest,normalizeResponse,normalizeReview,blankResult,prepareRows,eligibility,summarize,TRAIN_EXAMPLES} from '../src/judge.js';
import {normalizeGeneration,buildGenerationRequest} from '../src/generation.js';
import {callReview} from '../src/review-client.js';
import {row,responseFor,reviewFor} from './fixtures.js';
test('single binary question, source context and no current human-label leakage',()=>{
  const candidate={...row,Human_Critique:'SECRET_LABEL',Jev_Decision:'SECRET_PREDICTION',Prior_Review_Notes:'SECRET_NOTE'};
  const req=buildRequest(candidate);
  assert.equal(Object.keys(req.questions).length,1);
  assert.equal(req.questions.Publication_Decision.type,'choice');
  assert.deepEqual(Object.keys(req.questions.Publication_Decision.criteria),['PASS','FAIL']);
  for(const r of [req,buildReviewRequest(candidate),buildGenerationRequest(candidate)]) assert.doesNotMatch(JSON.stringify(r),/SECRET_/);
});
test('missing source context, blank posts, duplicates and failed generation are not FAIL labels',()=>{
  assert.equal(eligibility({...row,Reference_Facts:''}).status,'NEEDS_CONTEXT');
  assert.equal(eligibility({...row,Context_Status:''}).status,'NEEDS_CONTEXT');
  assert.equal(eligibility({...row,Model_Output:''}).status,'SKIPPED');
  assert.equal(eligibility({...row,Generation_Status:'ERROR'}).status,'ERROR');
  assert(prepareRows([row,row]).every(r=>eligibility(r).status==='ERROR'));
  assert.equal(blankResult('ERROR').Jev_Decision,'');
});
test('human TRAIN examples need no reviewer name, overlap with DEV or TEST rejected',()=>{
  TRAIN_EXAMPLES.push({...row,Human_Reviewer:'',Judge_Split:'TRAIN'});
  try {assert.throws(()=>buildRequest(row),/overlaps/); assert.equal(buildRequest({...row,Judge_Split:'TRAIN'}).state.train_examples.length,1);}
  finally {TRAIN_EXAMPLES.length=0;}
});
test('strict choice validation and ties never manufacture a publication decision',()=>{
  assert.equal(normalizeResponse(responseFor()).Jev_Decision,'PASS');
  assert.equal(normalizeResponse(responseFor('FAIL')).Jev_Decision,'FAIL');
  for(const mutate of [r=>r.answers.Publication_Decision.probabilities.PASS=0.3,r=>r.answers.Publication_Decision.choice='FAIL',r=>r.answers.Publication_Decision.confidence=NaN,r=>delete r.answers.Publication_Decision]) {const r=responseFor();mutate(r);assert.throws(()=>normalizeResponse(r));}
  const tie=responseFor();tie.answers.Publication_Decision.probabilities={PASS:0.5,FAIL:0.5};
  assert.equal(normalizeResponse(tie).Jev_Decision,'');assert.equal(normalizeResponse(tie).Jev_Run_Status,'AMBIGUOUS');
});
test('independent critique preserves Jev disagreement and rejects incomplete prose',()=>{
  const r={...row,...normalizeResponse(responseFor('FAIL')),...normalizeReview(reviewFor(),{Jev_Decision:'FAIL',Jev_Run_Status:'OK'})};
  assert.equal(r.Jev_Decision,'FAIL');assert.equal(r.LLM_Decision,'PASS');assert.equal(r.Review_Required,true);
  const invalid=reviewFor();invalid.choices[0].finish_reason='length';assert.throws(()=>normalizeReview(invalid,r));
});
test('new generated posts clear old human labels and preserve prior critique as history',()=>{
  const r=normalizeGeneration({choices:[{finish_reason:'stop',message:{content:'New post'}}]},row);
  for(const k of ['Human_Decision','Human_Critique','Human_Reviewer','Human_Policy_Version']) assert.equal(r[k],'');
  assert.match(r.Prior_Review_Notes,/Date matches/);assert.equal(r.Model_Output,'New post');
});
test('confusion matrix denominators, coverage and split separation',()=>{
  const make=(human,judge)=>({...row,Human_Reviewer:'',Human_Decision:human,...normalizeResponse(responseFor(judge))});
  const rows=[make('PASS','PASS'),make('PASS','FAIL'),make('FAIL','PASS'),make('FAIL','FAIL'),{...row,...blankResult('ERROR')},{...make('PASS','PASS'),Human_Critique:''},{...make('PASS','PASS'),Judge_Split:'TRAIN'}];
  const s=summarize(rows);const g=s.find(x=>x.split==='TEST');
  assert.equal(g.compared,4);assert.equal(g.agreement,0.5);assert.equal(g.false_pass_rate,0.5);assert.equal(g.false_fail_rate,0.5);assert.equal(g.label_coverage,5/6);assert.equal(g.judge_coverage,5/6);assert.equal(g.errors,1);
  assert.equal(s.find(x=>x.split==='TRAIN').false_pass_rate,null);
});
test('review transport rejects errors without exposing provider content',async()=>{
  await assert.rejects(callReview({}, {apiKey:'test',fetchImpl:async()=>new Response('secret',{status:401})}),/^Error: Independent LLM HTTP 401$/);
  await assert.rejects(callReview({}, {apiKey:''}),/OPENROUTER_API_KEY/);
});
