// Only preloaded by cli.test.js. Prevents ANY external HTTP request in CLI tests.
import { responseFor } from './fixtures.js';
globalThis.fetch = async (url, options) => {
  if (url !== 'https://api.typesafe.ai/v1/systemone') throw new Error('Unexpected URL');
  const body = JSON.parse(options.body);
  const post = body.state.candidate_post;
  if ('Status' in body.state) throw new Error('Human label leaked');
  if (post === 'API_ERROR') return new Response('', { status: 401 });
  return Response.json(post.startsWith('BAD') ? responseFor([3, 5, 5, 5, 5], 'hallucination') : responseFor());
};
