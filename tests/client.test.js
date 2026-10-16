import test from 'node:test';
import assert from 'node:assert/strict';
import { callJev, resolveConnection, ENDPOINT, GATEWAY_ENDPOINT } from '../src/client.js';

test('gateway uses its own credential and endpoint with the unchanged TypeSafe contract', async () => {
  const request = { model: 'typesafe-ai/jev-1.13.0', state: 'post', questions: {} };
  await callJev(request, { provider: 'gateway', apiKey: 'gateway-test-key', fetchImpl: async (url, options) => {
    assert.equal(url, GATEWAY_ENDPOINT);
    assert.equal(options.headers.Authorization, 'Bearer gateway-test-key');
    assert.deepEqual(JSON.parse(options.body), request);
    return Response.json({ model: request.model });
  } });
  assert.throws(() => resolveConnection({ provider: 'gateway', apiKey: '' }), /AI_GATEWAY_API_KEY/);
  assert.throws(() => resolveConnection({ provider: 'unknown', apiKey: 'test' }), /JEV_PROVIDER/);
});

test('sends official contract and retries throttling with server delay', async () => {
  let calls = 0;
  const waits = [];
  const request = { state: 'hello', model: 'jev-1.13.0', questions: {} };
  const result = await callJev(request, { apiKey: 'test-key', sleep: async ms => waits.push(ms),
    fetchImpl: async (url, options) => {
      calls++;
      assert.equal(url, ENDPOINT);
      assert.equal(options.headers.Authorization, 'Bearer test-key');
      assert.equal(options.redirect, 'error');
      assert.deepEqual(JSON.parse(options.body), request);
      return calls === 1 ? new Response('', { status: 429, headers: { 'retry-after': '2' } })
        : Response.json({ model: 'jev-1.13.0' });
    },
  });
  assert.equal(calls, 2); assert.deepEqual(waits, [2000]); assert.equal(result.model, 'jev-1.13.0');
});

test('authentication failures do not retry or disclose response text', async () => {
  let calls = 0;
  await assert.rejects(callJev({}, { apiKey: 'test-key', fetchImpl: async () => {
    calls++; return new Response('secret echoed by provider', { status: 401 });
  } }), /^Error: Jev HTTP 401$/);
  assert.equal(calls, 1);
});

test('gateway verification failure is actionable without echoing provider content or retrying', async () => {
  let calls = 0;
  await assert.rejects(callJev({}, { provider: 'gateway', apiKey: 'secret', fetchImpl: async () => {
    calls++;
    return Response.json({ error: { type: 'customer_verification_required', message: 'secret echoed here' } }, { status: 403 });
  } }), /^Error: Jev HTTP 403: AI Gateway requires a valid payment method on the Vercel account \(customer_verification_required\)\.$/);
  assert.equal(calls, 1);
});

test('missing credentials, network exhaustion and invalid JSON fail explicitly', async () => {
  await assert.rejects(callJev({}, { apiKey: '' }), /TYPESAFE_API_KEY/);
  let calls = 0;
  await assert.rejects(callJev({}, { apiKey: 'test', sleep: async () => {}, fetchImpl: async () => {
    calls++; throw new Error('sensitive network information');
  } }), /network request failed/);
  assert.equal(calls, 3);
  await assert.rejects(callJev({}, { apiKey: 'test', fetchImpl: async () => new Response('not-json') }), /invalid JSON/);
});

test('long Retry-After does not cause premature retry', async () => {
  await assert.rejects(callJev({}, { apiKey: 'test', fetchImpl: async () => new Response('', {
    status: 529, headers: { 'retry-after': '120' },
  }) }), /retry later/);
});
