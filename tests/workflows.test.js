import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { responseFor } from './fixtures.js';

const load = name => JSON.parse(readFileSync(new URL(`../${name}`, import.meta.url), 'utf8'));
const run = (node, globals) => vm.runInNewContext(`(function(){${node.parameters.jsCode}\n})()`, globals, { timeout: 1000 });

for (const filename of ['Social Media Jev Judge Only.json', 'Social Media Post Generation with Jev Judge.json']) {
  test(`${filename}: connected graph, credential placeholders, isolated loop`, () => {
    const w = load(filename), names = new Set(w.nodes.map(n => n.name));
    assert.equal(names.size, w.nodes.length);
    assert.equal(w.active, false);
    for (const [source, connections] of Object.entries(w.connections)) {
      assert(names.has(source));
      for (const outputs of Object.values(connections)) for (const targets of outputs) for (const target of targets) {
        assert(names.has(target.node), target.node);
      }
    }
    assert(w.nodes.every(n => !n.credentials));
    const http = w.nodes.find(n => n.name === 'Call Jev');
    assert.equal(http.parameters.genericAuthType, 'httpHeaderAuth');
    assert.equal(http.parameters.url, 'https://ai-gateway.vercel.sh/typesafe/v1/systemone');
    assert.equal(http.onError, 'continueRegularOutput');
    assert.equal(w.connections['Loop Over Posts for Jev'].main[0][0].node, 'Convert to Excel');
    assert.equal(w.connections['Normalize Jev Result'].main[0][0].node, 'Loop Over Posts for Jev');
  });

  test(`${filename}: execute embedded request and result nodes on multiple rows`, () => {
    const w = load(filename), get = name => w.nodes.find(n => n.name === name);
    const inputs = [
      { Test_ID: 'duplicate', Model_Output: 'one', Status: 'Fail', Reference_Facts: 'facts' },
      { Test_ID: 'duplicate', Model_Output: 'two', Status: 'Pass', Reference_Facts: 'facts' },
      { Test_ID: '', Model_Output: '  ', Status: '', Jev_Status: 'PASS', Jev_Total_Score: 25 },
    ];
    const results = inputs.map((row, index) => {
      const prepared = run(get('Prepare Jev Request'), { $json: row }).json;
      if (!prepared.hasPost) return run(get('Skip Empty Post'), { $json: prepared }).json;
      assert.equal(prepared.request.state.candidate_post, row.Model_Output);
      assert.equal(prepared.request.model, 'typesafe-ai/jev-1.13.0');
      assert.equal(prepared.request.state.Status, undefined);
      return run(get('Normalize Jev Result'), {
        $json: index === 0 ? responseFor([3, 5, 5, 5, 5], 'hallucination') : responseFor(),
        $: name => { assert.equal(name, 'Prepare Jev Request'); return { item: { json: prepared } }; },
      }).json;
    });
    assert.deepEqual(results.map(r => r.Jev_Status), ['FAIL', 'PASS', 'SKIPPED']);
    assert.deepEqual(results.map(r => r.Status), ['Fail', 'Pass', '']);
    assert.equal(results[2].Jev_Total_Score, '');
    const failed = run(get('Normalize Jev Result'), { $json: { error: 'bad request' },
      $: () => ({ item: { json: { row: inputs[0], minConfidence: 0.7 } } }) }).json;
    assert.equal(failed.Jev_Status, 'ERROR'); assert.equal(failed.Jev_Total_Score, '');
  });
}

test('generation variant preserves row identity with duplicate IDs and keeps prefilled posts', () => {
  const w = load('Social Media Post Generation with Jev Judge.json');
  const get = name => w.nodes.find(n => n.name === name);
  const originals = [
    { json: { Test_ID: 'duplicate', User_Input: 'same', Model_Output: '', Status: 'Fail' } },
    { json: { Test_ID: 'duplicate', User_Input: 'same', Model_Output: 'existing', Status: 'Pass' } },
    { json: { Test_ID: '', User_Input: '', Model_Output: '' } },
  ];
  const tagged = run(get('Join Ideas1'), { $input: { all: () => originals } });
  assert.equal(tagged.length, 3);
  const processed = [{ ...tagged[1].json }, { ...tagged[0].json, Model_Output: 'new post' }, tagged[2].json];
  const merged = run(get('Prepare Excel Output Data'), {
    $input: { all: () => [{ json: { data: processed } }] }, $: () => ({ all: () => originals }),
  });
  assert.deepEqual(Array.from(merged, r => r.json.Model_Output), ['new post', 'existing', '']);
  assert.equal(merged[0].json.Status, 'Fail');
  assert.equal(w.connections['Needs Generated Post'].main[1][0].node, 'Loop Over All Rows');
});
