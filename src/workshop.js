// Same columns/order as Evaluation Log in the shared Sheet and XLSX.
export const WORKSHOP_COLUMNS = [
  'Test_ID', 'Run_ID', 'Generator_Version', 'Generator_Split', 'Judge_Split',
  'User_Input', 'Reference_Facts', 'Constraints', 'Persona', 'Context_Status',
  'Model_Output', 'Human_Decision', 'Human_Critique', 'Failure_Tag', 'Human_Reviewer',
  'Human_Policy_Version', 'Judge_Version', 'Jev_Decision', 'Jev_Run_Status', 'Jev_Model',
  'Jev_PASS_Probability', 'Jev_Confidence', 'LLM_Decision', 'LLM_Critique', 'LLM_Run_Status',
  'LLM_Model', 'Review_Required', 'Review_Reasons', 'Evaluated_At', 'Error',
  'Prior_Review_Notes', 'Generation_Status', 'Source_Provenance', 'Scenario', 'Trace_Link',
];
export function workshopResult(row) { return Object.fromEntries(WORKSHOP_COLUMNS.map(key => [key, row[key] ?? ''])); }
