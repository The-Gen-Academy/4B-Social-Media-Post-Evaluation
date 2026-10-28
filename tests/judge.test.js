import test from 'node:test';
import {DIMENSIONS,overallDecision} from '../src/rubric.js';
import assert from 'node:assert/strict';
import {buildRequest,buildReviewRequest,normalizeResponse,normalizeReview,blankResult,prepareRows,eligibility,summarize} from '../src/judge.js';
import {normalizeGeneration,buildGenerationRequest} from '../src/generation.js';
import {callReview} from '../src/review-client.js';
import {row,responseFor,reviewFor} from './fixtures.js';
import {workshopInput,workshopResult} from '../src/workshop.js';
test('five binary questions, source context and no current human-label leakage',()=>{
  const candidate={...row,Human_Critique:'SECRET_LABEL',Jev_Decision:'SECRET_PREDICTION',Prior_Review_Notes:'SECRET_NOTE'};
  const req=buildRequest(candidate);
  assert.equal(Object.keys(req.questions).length,5);
  assert.equal(req.questions.Factual_Correctness.type,'choice');
  assert.deepEqual(Object.keys(req.questions.Factual_Correctness.criteria),['PASS','FAIL']);
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
test('strict choice validation and ties never manufacture a publication decision',()=>{
  assert.equal(normalizeResponse(responseFor()).Jev_Decision,'PASS');
  assert.equal(normalizeResponse(responseFor('FAIL')).Jev_Decision,'FAIL');
  for(const mutate of [r=>r.answers.Factual_Correctness.probabilities.PASS=0.3,r=>r.answers.Factual_Correctness.choice='FAIL',r=>r.answers.Factual_Correctness.confidence=NaN,r=>delete r.answers.Factual_Correctness]) {const r=responseFor();mutate(r);assert.throws(()=>normalizeResponse(r));}
  const tie=responseFor();tie.answers.Factual_Correctness.probabilities={PASS:0.5,FAIL:0.5};
  assert.equal(normalizeResponse(tie).Jev_Decision,'');assert.equal(normalizeResponse(tie).Jev_Run_Status,'AMBIGUOUS');
});
test('overall rule requires all five PASS, and any single FAIL is decisive',()=>{
  const pass=Object.fromEntries(DIMENSIONS.map(d=>[d.key,'PASS']));
  assert.equal(overallDecision(pass),'PASS');
  for(const d of DIMENSIONS) {
    assert.equal(overallDecision({...pass,[d.key]:'FAIL'}),'FAIL');
    assert.equal(overallDecision({...pass,[d.key]:''}),'');
    assert.equal(overallDecision({...pass,[d.key]:'invalid'}),'');
    const response=responseFor();response.answers[d.key]={type:'choice',choice:'FAIL',probabilities:{PASS:0.1,FAIL:0.9},confidence:0.8};
    assert.equal(normalizeResponse(response).Jev_Decision,'FAIL');
  }
  assert.equal(workshopInput({...workshopResult(row),Clarity:'FAIL',Status:'PASS'}).Human_Decision,'FAIL');
  assert.equal(workshopInput({...workshopResult(row),Clarity:'',Status:'PASS'}).Human_Decision,'');
});
test('dimension reviews require all decisions and evidence',()=>{
  const missing=reviewFor();const obj=JSON.parse(missing.choices[0].message.content);delete obj.Clarity;
  missing.choices[0].message.content=JSON.stringify(obj);assert.throws(()=>normalizeReview(missing,row));
  const changed=reviewFor('FAIL');assert.equal(normalizeReview(changed,row).LLM_Decision,'FAIL');
});
test('independent critique preserves Jev disagreement and rejects incomplete prose',()=>{
  const r={...row,...normalizeResponse(responseFor('FAIL')),...normalizeReview(reviewFor(),{Jev_Decision:'FAIL',Jev_Run_Status:'OK'})};
  assert.equal(r.Jev_Decision,'FAIL');assert.equal(r.LLM_Decision,'PASS');assert.equal(r.Review_Required,true);
  const invalid=reviewFor();invalid.choices[0].finish_reason='length';assert.throws(()=>normalizeReview(invalid,r));
});
test('new generated posts clear old human labels and preserve prior critique as history',()=>{
  const r=normalizeGeneration({choices:[{finish_reason:'stop',message:{content:'New post'}}]},row);
  for(const k of ['Human_Decision','Human_Critique','Human_Reviewer','Human_Policy_Version',...DIMENSIONS.map(d=>d.key)]) assert.equal(r[k],'');
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
  await assert.rejects(callReview({}, {apiKey:''}),/OPENAI_API_KEY/);
});
test('independent review sends the unprefixed model directly to OpenAI',async()=>{
  const request=buildReviewRequest(row);
  assert.equal(request.model,'gpt-4.1-mini');
  assert.equal(buildGenerationRequest(row).model,'gpt-4.1-mini');
  const response=await callReview(request,{apiKey:'openai-test-key',fetchImpl:async(url,options)=>{
    assert.equal(url,'https://api.openai.com/v1/chat/completions');
    assert.equal(options.headers.Authorization,'Bearer openai-test-key');
    assert.equal(options.redirect,'error');
    assert.deepEqual(JSON.parse(options.body),request);
    return Response.json(reviewFor());
  }});
  assert.equal(normalizeReview(response,row).LLM_Run_Status,'OK');
});
