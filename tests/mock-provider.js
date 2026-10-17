// Only preloaded by cli.test.js. Prevents ANY external HTTP request in CLI tests.
import { responseFor } from './fixtures.js';
globalThis.fetch = async (url, options) => {
  const openrouter = process.env.MOCK_PROVIDER === 'openrouter';
  const expectedUrl = openrouter ? 'https://openrouter.ai/api/v1/systemone' : 'https://api.typesafe.ai/v1/systemone';
  if (url !== expectedUrl) throw new Error('Unexpected URL');
  const body = JSON.parse(options.body);
  if (openrouter && (body.model !== 'typesafe/jev-1.13' || options.headers.Authorization !== 'Bearer mock-openrouter-key')) {
    throw new Error('Wrong OpenRouter model or credential');
  }
  const post = body.state.candidate_post;
  if ('Status' in body.state) throw new Error('Human label leaked');
  if (post === 'API_ERROR') return new Response('', { status: 401 });
  const response = post.startsWith('BAD') ? responseFor([3, 5, 5, 5, 5], 'hallucination') : responseFor();
  if (openrouter) response.model = body.model;
  return Response.json(response);
};
