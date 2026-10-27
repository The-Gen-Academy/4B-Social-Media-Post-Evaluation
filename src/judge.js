// Pure functions shared by the CLI and generated n8n Code nodes.
import {DIMENSIONS, POLICY, RUBRIC_VERSION, overallDecision} from './rubric.js';
export {RUBRIC_VERSION, POLICY} from './rubric.js';
export const JUDGE_VERSION = 'jev-dimensions-v4.0';
export const DEFAULT_MODEL = 'jev-1.13.0';
export const REVIEW_MODEL = 'openai/gpt-4.1-mini';
export function clean(value) { return String(value ?? '').trim(); }
export function eligibility(row) {
  if (row.Generation_Status === 'ERROR') return { status: 'ERROR', reason: row.Error || 'Generation failed.' };
  if (row.__identity_error) return { status: 'ERROR', reason: row.__identity_error };
  if (!clean(row.Test_ID) || !clean(row.Run_ID)) return { status: 'ERROR', reason: 'Test_ID and Run_ID are required.' };
  if (!clean(row.Model_Output)) return { status: 'SKIPPED', reason: 'Model_Output is empty.' };
  if (!clean(row.User_Input) || row.Context_Status !== 'READY' || !clean(row.Reference_Facts)) return { status: 'NEEDS_CONTEXT', reason: 'Add an Approved facts: section with source text (or an explicit no-external-facts note) inside User_Input before judging.' };
  return { status: 'OK', reason: '' };
}
export function prepareRows(rows) {
  const counts = new Map();
  for (const row of rows) { const k = JSON.stringify([clean(row.Test_ID), clean(row.Run_ID)]); counts.set(k, (counts.get(k) || 0) + 1); }
  return rows.map(row => ({ ...row, __identity_error: counts.get(JSON.stringify([clean(row.Test_ID), clean(row.Run_ID)])) > 1 ? 'Duplicate Test_ID. Keep one row per case and a separate workbook copy for each experiment.' : '' }));
}
export function judgeState(row) {
  const ready = eligibility(row);
  if (ready.status !== 'OK') throw new Error(ready.reason);
  return {user_input:clean(row.User_Input), candidate_post:clean(row.Model_Output),
    reference_facts:clean(row.Reference_Facts), constraints:clean(row.Constraints),
    persona:clean(row.Persona)||'Professional, clear and accessible for AI engineers and technical leaders.'};
}
export function buildRequest(row, model = DEFAULT_MODEL) {
  if (!clean(model)) throw new Error('Jev model is empty');
  return {model, state:judgeState(row), questions:Object.fromEntries(DIMENSIONS.map(d => [d.key, {
    type:'choice', instructions:POLICY+'\nEvaluate '+d.name+' for candidate_post.',
    criteria:{PASS:d.pass, FAIL:d.fail},
  }]))};
}
export function buildReviewRequest(row, model = REVIEW_MODEL) {
  const decisionSchema = {type:'object',properties:{decision:{type:'string',enum:['PASS','FAIL']},reason:{type:'string'}},required:['decision','reason'],additionalProperties:false};
  return {model, temperature:0, messages:[
    {role:'system',content:POLICY+'\n\nRUBRIC\n'+DIMENSIONS.map(d=>d.name+'\nPASS: '+d.pass+'\nFAIL: '+d.fail).join('\n\n')+'\n\nReturn the five dimension reviews in the required JSON schema. You do not see the human labels or Jev decisions. Your reasons describe your own evaluation.'},
    {role:'user',content:JSON.stringify(judgeState(row))},
  ],response_format:{type:'json_schema',json_schema:{name:'dimension_review',strict:true,schema:{
    type:'object',properties:Object.fromEntries(DIMENSIONS.map(d=>[d.key,decisionSchema])),
    required:DIMENSIONS.map(d=>d.key),additionalProperties:false,
  }}}};
}
export function blankResult(status, message = '') {
  return { Judge_Version: JUDGE_VERSION, Jev_Decision: '', Jev_Run_Status: status, Jev_Model: '', Jev_Dimensions: {}, LLM_Dimensions: {}, Jev_PASS_Probability: '', Jev_Confidence: '', Jev_Raw_Response: '', LLM_Decision: '', LLM_Critique: '', LLM_Run_Status: 'NOT_RUN', LLM_Model: '', LLM_Raw_Response: '', Review_Required: true, Review_Reasons: message, Evaluated_At: '', Error: status === 'ERROR' ? message : '' };
}
export function normalizeResponse(response) {
  if (!clean(response?.model)) throw new Error('Invalid Jev model.');
  const dimensions = {};
  const validNumber = n => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 1;
  for (const d of DIMENSIONS) {
    const a = response?.answers?.[d.key], p = a?.probabilities;
    if (a?.type !== 'choice' || !['PASS','FAIL'].includes(a.choice) || !p || Object.keys(p).sort().join('|') !== 'FAIL|PASS' || !validNumber(p.PASS) || !validNumber(p.FAIL) || Math.abs(p.PASS+p.FAIL-1)>0.01+1e-12 || !validNumber(a.confidence) || p[a.choice]<Math.max(p.PASS,p.FAIL)) throw new Error('Invalid Jev response for '+d.name+'.');
    dimensions[d.key] = p.PASS === p.FAIL ? '' : a.choice;
  }
  const ambiguous = Object.values(dimensions).includes('');
  return {...blankResult('OK'), Jev_Decision:overallDecision(dimensions), Jev_Dimensions:dimensions,
    Jev_Run_Status:ambiguous?'AMBIGUOUS':'OK', Jev_Model:response.model,
    Jev_Raw_Response:JSON.stringify(response), Evaluated_At:new Date().toISOString(),
    Review_Reasons:ambiguous?'A dimension has tied probabilities; human review required.':'Independent review pending.'};
}
export function normalizeReview(response, row) {
  const choice = response?.choices?.[0];
  if (choice?.finish_reason !== 'stop' || choice.message?.refusal) throw new Error('Independent reviewer did not complete.');
  let review;
  try {review = JSON.parse(choice.message.content);} catch {throw new Error('Independent reviewer returned invalid JSON.');}
  if (!clean(response.model)) throw new Error('Invalid independent reviewer model.');
  for (const d of DIMENSIONS) {
    if (!['PASS','FAIL'].includes(review?.[d.key]?.decision) || !clean(review[d.key].reason)) throw new Error('Invalid independent review for '+d.name+'.');
  }
  const decisions = Object.fromEntries(DIMENSIONS.map(d=>[d.key,review[d.key].decision]));
  const disagreement = DIMENSIONS.some(d=>row.Jev_Dimensions?.[d.key] !== decisions[d.key]);
  return {LLM_Decision:overallDecision(decisions), LLM_Dimensions:review,
    LLM_Critique:DIMENSIONS.map(d=>d.name+': '+review[d.key].reason).join('\n'),
    LLM_Run_Status:'OK', LLM_Model:response.model, LLM_Raw_Response:JSON.stringify(response),
    Review_Required:disagreement || row.Jev_Run_Status !== 'OK',
    Review_Reasons:disagreement?'Independent LLM and Jev disagree on a dimension; inspect evidence and human labels.':''};
}
export function summarize(rows) {
  const groups = new Map();
  for (const row of rows) {
    const key = JSON.stringify([row.Run_ID || '', row.Judge_Version || '', row.Judge_Split || 'UNASSIGNED']);
    if (!groups.has(key)) groups.set(key, { run: row.Run_ID || '', judge_version: row.Judge_Version || '', models: [], split: row.Judge_Split || 'UNASSIGNED', rows: 0, judged: 0, errors: 0, needs_context: 0, skipped: 0, ambiguous: 0, labeled: 0, compared: 0, human_pass_judge_pass: 0, human_pass_judge_fail: 0, human_fail_judge_pass: 0, human_fail_judge_fail: 0, critique_errors: 0 });
    const g = groups.get(key); g.rows++;
    if (clean(row.Jev_Model) && !g.models.includes(row.Jev_Model)) g.models.push(row.Jev_Model);
    if (row.Jev_Run_Status === 'ERROR') g.errors++;
    if (row.Jev_Run_Status === 'NEEDS_CONTEXT') g.needs_context++;
    if (row.Jev_Run_Status === 'SKIPPED') g.skipped++;
    if (row.Jev_Run_Status === 'AMBIGUOUS') g.ambiguous++;
    if (row.LLM_Run_Status === 'ERROR') g.critique_errors++;
    const valid = eligibility(row).status === 'OK' && row.Jev_Run_Status === 'OK' && ['PASS', 'FAIL'].includes(row.Jev_Decision);
    if (valid) g.judged++;
    const humanValid = eligibility(row).status === 'OK' && ['PASS', 'FAIL'].includes(row.Human_Decision) && clean(row.Human_Critique) && row.Human_Policy_Version === RUBRIC_VERSION;
    if (!humanValid) continue;
    g.labeled++;
    if (valid) { g.compared++; g[`human_${row.Human_Decision.toLowerCase()}_judge_${row.Jev_Decision.toLowerCase()}`]++; }
  }
  return [...groups.values()].map(g => {
    const hp = g.human_pass_judge_pass + g.human_pass_judge_fail, hf = g.human_fail_judge_pass + g.human_fail_judge_fail;
    return { ...g, agreement: g.compared ? (g.human_pass_judge_pass + g.human_fail_judge_fail) / g.compared : null, fail_detection_rate: hf ? g.human_fail_judge_fail / hf : null, false_pass_rate: hf ? g.human_fail_judge_pass / hf : null, pass_acceptance_rate: hp ? g.human_pass_judge_pass / hp : null, false_fail_rate: hp ? g.human_pass_judge_fail / hp : null, label_coverage: g.rows ? g.labeled / g.rows : null, judge_coverage: g.rows ? g.judged / g.rows : null, warning: (g.models.length>1?'Multiple model IDs occurred in one judge version; separate or investigate before interpreting rates. ':'')+'Classroom sample only. Null rates have zero denominators. Review class counts, missing labels and errors; this is not deployment validation.' };
  });
}
