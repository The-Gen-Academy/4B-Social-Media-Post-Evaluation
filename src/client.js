import { DEFAULT_MODEL } from './judge.js';

export const ENDPOINT = 'https://api.typesafe.ai/v1/systemone';
export const GATEWAY_ENDPOINT = 'https://ai-gateway.vercel.sh/typesafe/v1/systemone';
export const OPENROUTER_ENDPOINT = 'https://openrouter.ai/api/v1/systemone';
const CONNECTIONS = {
  typesafe: { endpoint: ENDPOINT, keyName: 'TYPESAFE_API_KEY', model: DEFAULT_MODEL },
  gateway: { endpoint: GATEWAY_ENDPOINT, keyName: 'AI_GATEWAY_API_KEY', model: `typesafe-ai/${DEFAULT_MODEL}` },
  openrouter: { endpoint: OPENROUTER_ENDPOINT, keyName: 'OPENROUTER_API_KEY', model: 'typesafe/jev-1.13' },
};

export function providerConfig(provider = process.env.JEV_PROVIDER || 'typesafe') {
  if (!Object.hasOwn(CONNECTIONS, provider)) throw new Error('JEV_PROVIDER must be typesafe, gateway or openrouter.');
  return CONNECTIONS[provider];
}

export function resolveConnection({ provider = process.env.JEV_PROVIDER || 'typesafe', apiKey } = {}) {
  const { endpoint, keyName } = providerConfig(provider);
  const key = apiKey ?? process.env[keyName];
  if (!key?.trim()) throw new Error(`Set ${keyName} in .env or your environment before running Jev.`);
  return { endpoint, apiKey: key.trim() };
}

export async function callJev(request, {
  apiKey,
  provider,
  fetchImpl = fetch,
  sleep = ms => new Promise(resolve => setTimeout(resolve, ms)),
  timeoutMs = 30000,
  maxAttempts = 3,
} = {}) {
  const connection = resolveConnection({ provider, apiKey });
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    let response;
    try {
      response = await fetchImpl(connection.endpoint, {
        method: 'POST', redirect: 'error',
        headers: { Authorization: `Bearer ${connection.apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(request), signal: AbortSignal.timeout(timeoutMs),
      });
    } catch {
      if (attempt + 1 === maxAttempts) throw new Error('Jev network request failed or timed out.');
      await sleep(1000 * 2 ** attempt);
      continue;
    }
    if (response.ok) {
      try { return await response.json(); }
      catch { throw new Error('Jev returned invalid JSON.'); }
    }
    // Do not include response bodies or request headers in error logs.
    if (response.status === 403 && connection.endpoint === GATEWAY_ENDPOINT) {
      const body = await response.json().catch(() => ({}));
      if (body.error?.type === 'customer_verification_required') {
        throw new Error('Jev HTTP 403: AI Gateway requires a valid payment method on the Vercel account (customer_verification_required).');
      }
    }
    const retryable = response.status === 429 || response.status >= 500;
    if (!retryable || attempt + 1 === maxAttempts) throw new Error(`Jev HTTP ${response.status}`);
    const retryAfter = response.headers.get('retry-after');
    let waitMs = Number(retryAfter) * 1000;
    if (retryAfter && !Number.isFinite(waitMs)) waitMs = Date.parse(retryAfter) - Date.now();
    // Never retry earlier than the server requested; long waits require a later rerun.
    if (waitMs > 30000) throw new Error(`Jev HTTP ${response.status}; retry later (Retry-After exceeds 30 seconds).`);
    await sleep(Math.max(1000 * 2 ** attempt, Number.isFinite(waitMs) ? waitMs : 0));
  }
  throw new Error('Jev request exhausted its attempts.');
}
