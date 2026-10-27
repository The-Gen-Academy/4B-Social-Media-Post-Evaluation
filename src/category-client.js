export const OPENAI_ENDPOINT = 'https://api.openai.com/v1/chat/completions';
export async function callCategoryJudge(request, {apiKey = process.env.OPENAI_API_KEY, fetchImpl = fetch} = {}) {
  if (!apiKey?.trim()) throw new Error('Set OPENAI_API_KEY for the category judge.');
  let response;
  try {response = await fetchImpl(OPENAI_ENDPOINT,{method:'POST',redirect:'error',headers:{Authorization:`Bearer ${apiKey.trim()}`,'Content-Type':'application/json'},body:JSON.stringify(request),signal:AbortSignal.timeout(120000)});}
  catch {throw new Error('OpenAI category request failed or timed out.');}
  if (!response.ok) throw new Error(`OpenAI HTTP ${response.status}`);
  try {return await response.json();} catch {throw new Error('OpenAI returned invalid JSON.');}
}
