import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRequest, normalizeResponse, applyThresholds, METRICS, summarize, blankResult } from '../src/judge.js';
import { responseFor } from './fixtures.js';

const row = { Test_ID: 'a', User_Input: 'Write a post', Model_Output: 'A useful post', Reference_Facts: 'Verified reference' };
const scores = values => Object.fromEntries(METRICS.map((m, i) => [m, values[i]]));

test('rubric boundaries and factual veto override a high total', () => {
  assert.deepEqual(applyThresholds(scores([4, 4, 4, 4, 4])), { total: 20, status: 'PASS' });
  assert.deepEqual(applyThresholds(scores([4, 4, 4, 4, 3])), { total: 19, status: 'FAIL' });
  assert.deepEqual(applyThresholds(scores([3, 5, 5, 5, 5])), { total: 23, status: 'FAIL' });
});

test('request excludes human labels, feedback, prior judgments and arbitrary fields', () => {
  const request = buildRequest({ ...row, Status: 'FAIL', Human_Feedback: 'SECRET_LABEL',
    Factual_Correctness: 1, Jev_Status: 'PASS', private_field: 'SECRET_LABEL' });
  assert.equal(Object.keys(request.questions).length, 6);
  assert(!JSON.stringify(request).includes('SECRET_LABEL'));
  assert.deepEqual(Object.keys(request.state), ['user_input', 'candidate_post', 'reference_facts', 'constraints', 'persona']);
  assert.throws(() => buildRequest({ Model_Output: '  ' }), /empty/);
});

test('converts zero-based levels and preserves raw expected score', () => {
  const response = responseFor();
  response.answers.Value.probabilities = { 0: 0, 1: 0, 2: 0.4, 3: 0.6, 4: 0 };
  response.answers.Value.score = 2.6;
  const result = normalizeResponse(response, row);
  assert.equal(result.Jev_Value, 4);
  assert.equal(result.Jev_Value_Expected, 3.6);
  assert.equal(result.Jev_Total_Score, 20);
  assert.equal(result.Jev_Status, 'PASS');
  assert.equal(result.Jev_Review_Required, false);
  assert.deepEqual(JSON.parse(result.Jev_Raw_Response), response);
});

test('ties select the lower level, low confidence routes to review without rewriting status', () => {
  const response = responseFor();
  response.answers.Value.probabilities = { 0: 0, 1: 0, 2: 0.5, 3: 0.5, 4: 0 };
  response.answers.Value.score = 2.5;
  response.answers.Value.confidence = 0.1;
  const result = normalizeResponse(response, row);
  assert.equal(result.Jev_Value, 3);
  assert.equal(result.Jev_Status, 'FAIL');
  assert.equal(result.Jev_Failure_Category, 'Low Informational Value');
  assert.equal(result.Jev_Category_Source, 'lowest_dimension_fallback');
  assert.match(result.Jev_Review_Reasons, /low_confidence:Value/);
});

test('factual cutoff takes category precedence and missing sources trigger review', () => {
  const result = normalizeResponse(responseFor([3, 5, 5, 5, 5], 'poor_framing'), { ...row, Reference_Facts: '' });
  assert.equal(result.Jev_Status, 'FAIL');
  assert.equal(result.Jev_Failure_Category, 'Incorrect or Hallucinated Content');
  assert.match(result.Jev_Review_Reasons, /category_disagrees/);
  assert.match(result.Jev_Review_Reasons, /reference_facts_missing/);
});

test('a PASS with an independent failure signal remains PASS but needs review', () => {
  const result = normalizeResponse(responseFor([4, 4, 4, 4, 4], 'non_compliance'), row);
  assert.equal(result.Jev_Status, 'PASS');
  assert.equal(result.Jev_Failure_Category, '');
  assert.equal(result.Jev_Review_Required, true);
});

test('rejects malformed provider responses rather than manufacturing scores', () => {
  const mutations = [
    r => delete r.answers.Tone,
    r => r.answers.Clarity.score = NaN,
    r => r.answers.Value.score = '3',
    r => r.answers.Engagement.confidence = 1.2,
    r => r.answers.Tone.probabilities['5'] = 0,
    r => r.answers.Tone.probabilities['3'] = 0.2,
    r => delete r.answers.Tone.legend,
    r => r.answers.Factual_Correctness.score = 4,
    r => r.answers.Failure_Category.choice = 'unknown',
    r => r.answers.Failure_Category.choice = 'hallucination',
    r => r.model = '',
  ];
  for (const mutate of mutations) {
    const response = responseFor(); mutate(response);
    assert.throws(() => normalizeResponse(response, row));
  }
});

test('agreement excludes blanks, invalid labels and provider errors; reports false passes/fails', () => {
  const summary = summarize([
    { Status: 'Pass', Jev_Status: 'PASS' },
    { Status: 'Fail', Jev_Status: 'PASS', Test_ID: 'false-pass' },
    { Status: 'PASS', Jev_Status: 'FAIL' },
    { Status: '', Jev_Status: 'PASS' },
    { Status: 'PASS', ...blankResult('ERROR', 'network failure') },
    { Status: 'unknown', ...blankResult('SKIPPED') },
  ]);
  assert.equal(summary.agreement, 1 / 3);
  assert.equal(summary.compared, 3);
  assert.equal(summary.labeled, 4);
  assert.equal(summary.false_passes, 1);
  assert.equal(summary.false_fails, 1);
  assert.equal(summary.invalid_human_labels, 1);
  assert.equal(summarize([]).agreement, null);
});
