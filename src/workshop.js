// The participant-facing CSV contract. Detailed evidence stays in the full result.
export const WORKSHOP_COLUMNS = [
  'Test_ID', 'User_Input', 'Model_Output',
  'Jev_Factual_Correctness', 'Jev_Clarity', 'Jev_Value', 'Jev_Engagement', 'Jev_Tone',
  'Jev_Total_Score', 'Jev_Status',
];

export function workshopResult(row) {
  return Object.fromEntries(WORKSHOP_COLUMNS.map(key => [key, row[key] ?? '']));
}
