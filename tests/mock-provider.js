import {responseFor,reviewFor} from './fixtures.js';
globalThis.fetch = async (url,options) => {
  const body=JSON.parse(options.body);
  const state=url.endsWith('/systemone')?body.state:JSON.parse(body.messages[1].content);
  if (Object.keys(state).some(k=>/human|decision|feedback/i.test(k))) throw new Error('Label leakage');
  if(state.candidate_post==='API_ERROR') return new Response('',{status:401});
  if(url==='https://api.typesafe.ai/v1/systemone') return Response.json(responseFor(state.candidate_post.startsWith('BAD')?'FAIL':'PASS'));
  if(url==='https://api.openai.com/v1/chat/completions') return Response.json(reviewFor());
  throw new Error('Unexpected network call');
};
