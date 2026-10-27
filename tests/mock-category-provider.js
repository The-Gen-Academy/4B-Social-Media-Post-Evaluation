// Fabricated provider responses used only by the CLI tests.
globalThis.fetch = async (url,options) => {
  if (url !== 'https://api.openai.com/v1/chat/completions') throw new Error('Unexpected test endpoint');
  const request = JSON.parse(options.body),post = JSON.parse(request.messages[1].content).post;
  if (post.includes('FIXTURE_ERROR')) return new Response('SECRET_PROVIDER_BODY',{status:429});
  const verdict = post.includes('FIXTURE_FALSE') ? 'FALSE' : 'TRUE';
  return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify({verdict,reason:'Fabricated fixture reason.'})}}]});
};
