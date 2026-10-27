import {DIMENSIONS, RUBRIC_VERSION, overallDecision} from './rubric.js';
export const POST_COLUMNS = ['Test_ID','User_Input','Model_Output'];
export const WORKSHOP_COLUMNS = [...POST_COLUMNS,...DIMENSIONS.map(d=>d.key),'Status','Human_Feedback','Failure_Category'];
export const JUDGE_COLUMNS = ['Test_ID','Dimension','Human_Status','Jev_Status','LLM_Status','LLM_Reason','Run_Status','Review_Notes'];
const textValue = value => String(value ?? '').trim();
const decisionValue = value => ['PASS','FAIL'].includes(textValue(value).toUpperCase()) ? textValue(value).toUpperCase() : '';

// Accept exported workbook rows as well as older CSV inputs.
export function workshopInput(row) {
  const simple = Object.hasOwn(row, 'Human_Feedback') || Object.hasOwn(row, 'Status');
  const brief = textValue(row.User_Input);
  const match = brief.match(/(?:^|\n)Approved facts:\s*([\s\S]+)/i);
  const facts = textValue(row.Reference_Facts) || (match ? match[1].trim() : '');
  const aliases = {Value_Insight:'Value',Tone_Fit:'Tone'};
  const dimensions = Object.fromEntries(DIMENSIONS.map(d=>[d.key,decisionValue(row[d.key] ?? row[aliases[d.key]])]));
  const hasDimensions = DIMENSIONS.some(d=>Object.hasOwn(row,d.key) || (aliases[d.key] && Object.hasOwn(row,aliases[d.key])));
  return {...row, ...dimensions,
    Run_ID: textValue(row.Run_ID) || 'workbook',
    Reference_Facts: facts,
    Context_Status: Object.hasOwn(row, 'Context_Status') ? row.Context_Status : facts ? 'READY' : 'NEEDS_CONTEXT',
    Human_Decision: hasDimensions ? overallDecision(dimensions) : decisionValue(simple ? row.Status : row.Human_Decision),
    Human_Critique: textValue(simple ? row.Human_Feedback : row.Human_Critique),
    Failure_Tag: textValue(simple ? row.Failure_Category : row.Failure_Tag),
    Human_Policy_Version: textValue(row.Human_Policy_Version) || RUBRIC_VERSION,
  };
}
export function workshopResult(row) {
  let brief = textValue(row.User_Input);
  for (const [key,label] of [['Persona','Audience'],['Constraints','Constraints']]) {
    if (textValue(row[key]) && !brief.includes(textValue(row[key]))) brief += '\n\n'+label+': '+textValue(row[key]);
  }
  if (textValue(row.Reference_Facts) && !brief.includes(textValue(row.Reference_Facts))) brief += '\n\nApproved facts: '+textValue(row.Reference_Facts);
  const issue = ['ERROR','NEEDS_CONTEXT','SKIPPED'].includes(row.Generation_Status) ? 'Generation issue: '+(row.Error || row.Generation_Status) : '';
  const dimensions = Object.fromEntries(DIMENSIONS.map(d=>[d.key,issue?'':decisionValue(row[d.key])]));
  return {Test_ID:row.Test_ID || '',User_Input:brief,Model_Output:row.Model_Output || '',...dimensions,
    Status:issue?'':overallDecision(dimensions),Human_Feedback:issue || row.Human_Critique || row.Human_Feedback || '',Failure_Category:issue?'':row.Failure_Tag || row.Failure_Category || ''};
}
export function postResult(row) {
  const result = workshopResult(row);
  // Keep the workbook's human-review cells and overall formula out of generation exports.
  if (!result.Model_Output && ['ERROR','NEEDS_CONTEXT','SKIPPED'].includes(row.Generation_Status)) {
    throw new Error('Generation incomplete for '+row.Test_ID+': '+(row.Error || row.Generation_Status)+'. Fix the input or credential and rerun before downloading.');
  }
  return Object.fromEntries(POST_COLUMNS.map(key=>[key,result[key]]));
}
export function judgeResult(row) {
  const status = 'Jev: '+(row.Jev_Run_Status || 'NOT_RUN')+'; LLM: '+(row.LLM_Run_Status || 'NOT_RUN');
  const notes = [row.Error,row.Review_Reasons].filter(Boolean).join(' ');
  const rows = DIMENSIONS.map(d=>({Test_ID:row.Test_ID || '',Dimension:d.name,
    Human_Status:decisionValue(row[d.key]),Jev_Status:row.Jev_Dimensions?.[d.key] || '',
    LLM_Status:row.LLM_Dimensions?.[d.key]?.decision || '',LLM_Reason:row.LLM_Dimensions?.[d.key]?.reason || '',
    Run_Status:status,Review_Notes:notes}));
  rows.push({Test_ID:row.Test_ID || '',Dimension:'Overall',Human_Status:decisionValue(row.Human_Decision),
    Jev_Status:decisionValue(row.Jev_Decision),LLM_Status:decisionValue(row.LLM_Decision),
    LLM_Reason:'All five dimensions must PASS; any FAIL makes the post FAIL.',Run_Status:status,Review_Notes:notes});
  return rows;
}
