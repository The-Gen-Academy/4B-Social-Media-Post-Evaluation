export const REVIEW_ENDPOINT = 'https://api.openai.com/v1/chat/completions';
export async function callReview(request, { apiKey = process.env.OPENAI_API_KEY, fetchImpl = fetch } = {}) {
  if (!apiKey?.trim()) throw new Error('Set OPENAI_API_KEY for the independent LLM critique.');
  let response;
  try { response = await fetchImpl(REVIEW_ENDPOINT, { method: 'POST', redirect: 'error', headers: { Authorization: `Bearer ${apiKey.trim()}`, 'Content-Type': 'application/json' }, body: JSON.stringify(request), signal: AbortSignal.timeout(60000) }); }
  catch { throw new Error('Independent LLM request failed or timed out.'); }
  if (!response.ok) throw new Error(`Independent LLM HTTP ${response.status}`);
  try { return await response.json(); } catch { throw new Error('Independent LLM returned invalid JSON.'); }
}
