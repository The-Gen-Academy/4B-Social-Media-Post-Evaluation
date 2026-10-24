// Learner-facing CSVs match two separate workbook tabs.
export const WORKSHOP_COLUMNS = ['Test_ID', 'User_Input', 'Model_Output', 'Human_Feedback', 'Status', 'Failure_Category'];
export const JUDGE_COLUMNS = ['Test_ID', 'Human_Status', 'Jev_Status', 'LLM_Critique', 'LLM_Status', 'Run_Status', 'Review_Notes'];
const textValue = value => String(value ?? '').trim();
const decisionValue = value => ['PASS','FAIL'].includes(textValue(value).toUpperCase()) ? textValue(value).toUpperCase() : '';

// Advanced CSV inputs remain supported; learners need only the six columns.
export function workshopInput(row) {
  const simple = Object.hasOwn(row, 'Human_Feedback') || Object.hasOwn(row, 'Status');
  const brief = textValue(row.User_Input);
  const match = brief.match(/(?:^|\n)Approved facts:\s*([\s\S]+)/i);
  const facts = textValue(row.Reference_Facts) || (match ? match[1].trim() : '');
  return {...row,
    Run_ID: textValue(row.Run_ID) || 'workbook',
    Reference_Facts: facts,
    Context_Status: Object.hasOwn(row, 'Context_Status') ? row.Context_Status : facts ? 'READY' : 'NEEDS_CONTEXT',
    Human_Decision: decisionValue(simple ? row.Status : row.Human_Decision),
    Human_Critique: textValue(simple ? row.Human_Feedback : row.Human_Critique),
    Failure_Tag: textValue(simple ? row.Failure_Category : row.Failure_Tag),
    Human_Policy_Version: textValue(row.Human_Policy_Version) || 'social-publication-v2',
  };
}
export function workshopResult(row) {
  let brief = textValue(row.User_Input);
  for (const [key,label] of [['Persona','Audience'],['Constraints','Constraints']]) {
    if (textValue(row[key]) && !brief.includes(textValue(row[key]))) brief += '\n\n'+label+': '+textValue(row[key]);
  }
  if (textValue(row.Reference_Facts) && !brief.includes(textValue(row.Reference_Facts))) brief += '\n\nApproved facts: '+textValue(row.Reference_Facts);
  const issue = ['ERROR','NEEDS_CONTEXT','SKIPPED'].includes(row.Generation_Status) ? 'Generation issue: '+(row.Error || row.Generation_Status) : '';
  return {Test_ID:row.Test_ID || '',User_Input:brief,Model_Output:row.Model_Output || '',
    Human_Feedback:issue || row.Human_Critique || '',Status:issue ? '' : decisionValue(row.Human_Decision),Failure_Category:issue ? '' : row.Failure_Tag || ''};
}
export function judgeResult(row) {
  const jev = row.Jev_Run_Status === 'OK' ? decisionValue(row.Jev_Decision) : '';
  const llm = row.LLM_Run_Status === 'OK' ? decisionValue(row.LLM_Decision) : '';
  return {Test_ID:row.Test_ID || '',Human_Status:decisionValue(row.Human_Decision),Jev_Status:jev,
    LLM_Critique:row.LLM_Critique || '',LLM_Status:llm,
    Run_Status:'Jev: '+(row.Jev_Run_Status || 'NOT_RUN')+'; LLM: '+(row.LLM_Run_Status || 'NOT_RUN'),
    Review_Notes:[row.Error,row.Review_Reasons].filter(Boolean).join(' ')};
}
