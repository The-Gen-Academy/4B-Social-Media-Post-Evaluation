import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = name => readFile(resolve(root, name), 'utf8');
const original = JSON.parse(await read('Social Media Post Generation Workflow.json'));
// No external modules are required by n8n's sandbox. Both entrypoints use the same implementation.
const core = (await read('src/judge.js')).replace(/^export /gm, '');
const node = (name, type, parameters, position, extra = {}) => ({
  id: name.toLowerCase().replaceAll(/[^a-z0-9]+/g, '-'), name,
  type: `n8n-nodes-base.${type}`, typeVersion: 2, position, parameters, ...extra,
});
const connect = target => [{ node: target, type: 'main', index: 0 }];

function judgeNodes() {
  return [
    node('Loop Over Posts for Jev', 'splitInBatches', { batchSize: 1, options: {} }, [2800, 600], { typeVersion: 3 }),
    node('Prepare Jev Request', 'code', {
      mode: 'runOnceForEachItem',
      jsCode: `${core}\n// Gateway model ID. For direct TypeSafe, use DEFAULT_MODEL and change the Call Jev URL and credential.\nconst model = 'typesafe-ai/' + DEFAULT_MODEL;\nconst minConfidence = DEFAULT_MIN_CONFIDENCE;\nconst row = $json;\nreturn {json: {row, minConfidence, hasPost: Boolean(clean(row.Model_Output)), request: clean(row.Model_Output) ? buildRequest(row, model) : null}};`,
    }, [3000, 720]),
    node('Has Post to Judge', 'if', {
      conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 },
        conditions: [{ id: 'has-post', leftValue: '={{ $json.hasPost }}', rightValue: '', operator: { type: 'boolean', operation: 'true', singleValue: true } }], combinator: 'and' }, options: {},
    }, [3200, 720], { typeVersion: 2.2 }),
    node('Call Jev', 'httpRequest', {
      method: 'POST', url: 'https://ai-gateway.vercel.sh/typesafe/v1/systemone',
      authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
      sendBody: true, contentType: 'json', specifyBody: 'json', jsonBody: '={{ JSON.stringify($json.request) }}',
      options: { timeout: 30000, response: { response: { responseFormat: 'json' } } },
    }, [3400, 640], { typeVersion: 4.2, retryOnFail: true, maxTries: 3, waitBetweenTries: 5000,
      onError: 'continueRegularOutput' }),
    node('Normalize Jev Result', 'code', {
      mode: 'runOnceForEachItem',
      jsCode: `${core}\nconst prepared = $('Prepare Jev Request').item.json;\nlet result;\ntry {\n  if ($json.error) throw new Error('Jev HTTP request failed; inspect Call Jev execution and credentials.');\n  result = normalizeResponse($json, prepared.row, prepared.minConfidence);\n} catch (error) { result = blankResult('ERROR', error.message, prepared.minConfidence); }\nreturn {json: {...prepared.row, ...result}};`,
    }, [3600, 640]),
    node('Skip Empty Post', 'code', {
      mode: 'runOnceForEachItem',
      jsCode: `${core}\nreturn {json: {...$json.row, ...blankResult('SKIPPED', 'Model_Output is empty', $json.minConfidence)}};`,
    }, [3400, 880]),
    node('Jev Setup', 'stickyNote', {
      width: 660, height: 260,
      content: '## Jev judge setup\nUses Vercel AI Gateway. Select Header Auth in **Call Jev**: name `Authorization`, value `Bearer <AI Gateway API key>`. Gateway must have an enabled billing account.\n\nDirect TypeSafe: set URL to https://api.typesafe.ai/v1/systemone, use a TypeSafe key, and set model to DEFAULT_MODEL in **Prepare Jev Request**.\n\nAdd `Reference_Facts` for factual checks. Human labels stay separate. `Jev_Review_Required` flags missing references, uncertainty or conflicts. ERROR never becomes PASS. No publishing actions are included.',
    }, [2800, 240], { typeVersion: 1 }),
  ];
}
function judgeConnections(finalNode) {
  return {
    'Loop Over Posts for Jev': { main: [connect(finalNode), connect('Prepare Jev Request')] },
    'Prepare Jev Request': { main: [connect('Has Post to Judge')] },
    'Has Post to Judge': { main: [connect('Call Jev'), connect('Skip Empty Post')] },
    'Call Jev': { main: [connect('Normalize Jev Result')] },
    'Normalize Jev Result': { main: [connect('Loop Over Posts for Jev')] },
    'Skip Empty Post': { main: [connect('Loop Over Posts for Jev')] },
  };
}
function cleanWorkflow(w) {
  delete w.id; delete w.versionId; delete w.meta; delete w.tags;
  w.active = false; w.pinData = {};
  for (const n of w.nodes) { delete n.credentials; delete n.webhookId; }
  return w;
}

const generation = cleanWorkflow(structuredClone(original));
generation.name = 'Social Media Post Generation with Jev Judge';
generation.nodes.push(...judgeNodes());
// Send existing posts through the loop too: an all-populated upload must still
// reach the judge. Empty topic/output rows bypass generation and are SKIPPED.
generation.nodes.find(n => n.name === 'Join Ideas1').parameters.jsCode = `return $input.all().map((item, index) => ({json: {...item.json, __row_index: index, __merge_key: String(index)}}));`;
generation.nodes.push(node('Needs Generated Post', 'if', {
  conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 },
    conditions: [{ id: 'needs-post', leftValue: "={{ !String($json.Model_Output ?? '').trim() && Boolean(String($json.User_Input ?? '').trim()) }}", rightValue: '', operator: { type: 'boolean', operation: 'true', singleValue: true } }], combinator: 'and' }, options: {},
}, [1120, 820], { typeVersion: 2.2 }));
generation.connections['Loop Over All Rows'].main[1] = connect('Needs Generated Post');
generation.connections['Needs Generated Post'] = { main: [connect('LinkedIn Creator Agent1'), connect('Loop Over All Rows')] };
// Merge by row index, not Test_ID: duplicate or missing IDs are valid inputs.
generation.nodes.find(n => n.name === 'Prepare Excel Output Data').parameters.jsCode = `
const byIndex = new Map();
for (const item of $input.all()) {
  for (const row of (Array.isArray(item.json.data) ? item.json.data : [item.json])) {
    if (row.__row_index !== undefined) byIndex.set(Number(row.__row_index), row.Model_Output);
  }
}
return $('Extract First Sheet Data').all().map((item, index) => ({json: {
  ...item.json, Model_Output: byIndex.get(index) ?? item.json.Model_Output ?? ''
}}));`;
generation.connections['Prepare Excel Output Data'] = { main: [connect('Loop Over Posts for Jev')] };
Object.assign(generation.connections, judgeConnections('Convert to Excel'));
const outputNode = generation.nodes.find(n => n.name === 'Convert to Excel');
outputNode.parameters.operation = 'csv';
generation.nodes.find(n => n.name === 'Extract First Sheet Data').parameters.operation = 'csv';
outputNode.parameters.options.fileName = 'linkedin_posts_with_jev_scores.csv';
outputNode.position = [3000, 500];

const form = structuredClone(original.nodes.find(n => n.type === 'n8n-nodes-base.formTrigger'));
form.name = 'Upload Posts CSV';
form.parameters.formTitle = 'Evaluate Social Media Posts with Jev';
form.parameters.formDescription = 'Upload CSV with Model_Output and optional human scores, Reference_Facts, Constraints and Persona.';
form.position = [2300, 600];
const extract = structuredClone(original.nodes.find(n => n.type === 'n8n-nodes-base.extractFromFile'));
extract.parameters.operation = 'csv';
extract.name = 'Read Posts CSV'; extract.position = [2500, 600];
const standalone = cleanWorkflow({ name: 'Social Media Jev Judge Only',
  nodes: [form, extract, ...judgeNodes(), structuredClone(outputNode)],
  connections: {
    'Upload Posts CSV': { main: [connect('Read Posts CSV')] },
    'Read Posts CSV': { main: [connect('Loop Over Posts for Jev')] },
    ...judgeConnections('Convert to Excel'),
  }, settings: { executionOrder: 'v1' },
});
for (const [name, workflow] of [
  ['Social Media Post Generation with Jev Judge.json', generation],
  ['Social Media Jev Judge Only.json', standalone],
]) {
  await writeFile(resolve(root, name), JSON.stringify(workflow, null, 2) + '\n');
  console.log(`Built ${name}`);
}
