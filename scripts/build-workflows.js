import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = name => readFile(resolve(root, name), 'utf8');
const original = JSON.parse(await read('Social Media Post Generation Workflow.json'));
// No external modules are required by n8n's sandbox. Both entrypoints use the same implementation.
const core = (await read('src/judge.js')).replace(/^export /gm, '');
const workshopCore = (await read('src/workshop.js')).replace(/^export /gm, '');
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
      jsCode: `${core}\n// OpenRouter System One. Change the URL, model and credential together when switching providers.\nconst model = 'typesafe/jev-1.13';\nconst minConfidence = DEFAULT_MIN_CONFIDENCE;\nconst row = $json;\nreturn {json: {row, minConfidence, hasPost: Boolean(clean(row.Model_Output)), request: clean(row.Model_Output) ? buildRequest(row, model) : null}};`,
    }, [3000, 720]),
    node('Has Post to Judge', 'if', {
      conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 },
        conditions: [{ id: 'has-post', leftValue: '={{ $json.hasPost }}', rightValue: '', operator: { type: 'boolean', operation: 'true', singleValue: true } }], combinator: 'and' }, options: {},
    }, [3200, 720], { typeVersion: 2.2 }),
    node('Call Jev', 'httpRequest', {
      method: 'POST', url: 'https://openrouter.ai/api/v1/systemone',
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
    node('Workshop Results', 'code', {
      mode: 'runOnceForAllItems',
      jsCode: `${workshopCore}\nreturn $input.all().map(item => ({json: workshopResult(item.json)}));`,
    }, [3000, 440]),
    node('Jev Setup', 'stickyNote', {
      width: 660, height: 260,
      content: '## Generate → Jev scores → PASS / FAIL\nIn **Call Jev**, select Header Auth: name `Authorization`, value `Bearer <OpenRouter API key>`.\n\nJev fills five 1–5 scores. PASS requires factual correctness ≥ 4 and total ≥ 20/25. Participants do not score manually. Include approved facts in User_Input.\n\n**Workshop Results** exports only 10 columns, matching the workbook. Full confidence, review flags and API evidence remain available in **Normalize Jev Result**. ERROR means no judgment; fix the API call and rerun.\n\nDirect TypeSafe and Gateway setup are documented in docs/jev-integration.md.',
    }, [2800, 240], { typeVersion: 1 }),
  ];
}
function judgeConnections(finalNode) {
  return {
    'Loop Over Posts for Jev': { main: [connect('Workshop Results'), connect('Prepare Jev Request')] },
    'Workshop Results': { main: [connect(finalNode)] },
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
const outputNode = generation.nodes.find(n => n.name === 'Convert to Excel');
outputNode.name = 'Download Results CSV';
Object.assign(generation.connections, judgeConnections(outputNode.name));
outputNode.parameters.operation = 'csv';
generation.nodes.find(n => n.name === 'Extract First Sheet Data').parameters.operation = 'csv';
outputNode.parameters.options.fileName = 'linkedin_posts_with_jev_scores.csv';
outputNode.position = [3220, 440];
const generationForm = generation.nodes.find(n => n.type === 'n8n-nodes-base.formTrigger');
generationForm.parameters.formTitle = 'Generate and Judge Social Media Posts';
generationForm.parameters.formDescription = 'Upload your workshop CSV. n8n generates missing posts, then Jev scores each finished post and returns PASS/FAIL. Clear Model_Output to regenerate a post.';

const form = structuredClone(original.nodes.find(n => n.type === 'n8n-nodes-base.formTrigger'));
form.name = 'Upload Posts CSV';
form.parameters.formTitle = 'Evaluate Social Media Posts with Jev';
form.parameters.formDescription = 'Upload the workshop CSV with Test_ID, User_Input and Model_Output. Jev fills the five scores, total and PASS/FAIL. Include approved facts in User_Input.';
form.position = [2300, 600];
const extract = structuredClone(original.nodes.find(n => n.type === 'n8n-nodes-base.extractFromFile'));
extract.parameters.operation = 'csv';
extract.name = 'Read Posts CSV'; extract.position = [2500, 600];
const standalone = cleanWorkflow({ name: 'Social Media Jev Judge Only',
  nodes: [form, extract, ...judgeNodes(), structuredClone(outputNode)],
  connections: {
    'Upload Posts CSV': { main: [connect('Read Posts CSV')] },
    'Read Posts CSV': { main: [connect('Loop Over Posts for Jev')] },
    ...judgeConnections(outputNode.name),
  }, settings: { executionOrder: 'v1' },
});
for (const [name, workflow] of [
  ['Social Media Post Generation with Jev Judge.json', generation],
  ['Social Media Jev Judge Only.json', standalone],
]) {
  await writeFile(resolve(root, name), JSON.stringify(workflow, null, 2) + '\n');
  console.log(`Built ${name}`);
}
