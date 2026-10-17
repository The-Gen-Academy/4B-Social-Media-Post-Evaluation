import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { responseFor } from './fixtures.js';
import { WORKSHOP_COLUMNS } from '../src/workshop.js';
import { parse } from 'csv-parse/sync';
import { stringify } from 'csv-stringify/sync';

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
    assert.equal(http.parameters.url, 'https://openrouter.ai/api/v1/systemone');
    assert.equal(http.onError, 'continueRegularOutput');
    assert.equal(w.connections['Loop Over Posts for Jev'].main[0][0].node, 'Workshop Results');
    assert.equal(w.connections['Workshop Results'].main[0][0].node, 'Download Results CSV');
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
      assert.equal(prepared.request.model, 'typesafe/jev-1.13');
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
    const exported = run(get('Workshop Results'), { $input: { all: () => [...results, failed].map(json => ({json})) } });
    for (const item of exported) assert.deepEqual(Object.keys(item.json), WORKSHOP_COLUMNS);
    assert.deepEqual(Array.from(exported, item => item.json.Jev_Status), ['FAIL', 'PASS', 'SKIPPED', 'ERROR']);
    assert.equal(exported[0].json.Jev_Total_Score, 23);
    assert.equal(exported[3].json.Jev_Total_Score, '');
    assert.equal(results[0].Jev_Raw_Response.length > 0, true, 'full evidence remains upstream');
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

test('judge accepts the original generation export unchanged, with no Jev columns or IDs added', () => {
  const original = load('Social Media Post Generation Workflow.json');
  const judge = load('Social Media Jev Judge Only.json');
  const get = name => judge.nodes.find(n => n.name === name);
  const originalInputs = [
    { json: { User_Input: 'Explain retrieval, with an example.\nUse plain language.', Status: 'FAIL' } },
    { json: { User_Input: 'Give a practical evaluation tip.', Status: 'PASS' } },
  ];
  const posts = ['A post with a comma, and a "quote".\nA second paragraph.', 'Another finished post.'];
  const generated = run(original.nodes.find(n => n.name === 'Prepare Excel Output Data'), {
    $input: { all: () => [{ json: { data: posts.map((Model_Output, __row_index) => ({ Model_Output, __row_index })) } }] },
    $: () => ({ all: () => originalInputs }),
  });
  // The exact generator export is serialized/read as CSV, without adding fields.
  const csv = stringify(Array.from(generated, item => item.json), { header: true });
  const rows = parse(csv, { columns: true });
  assert.equal(rows[0].Test_ID, undefined);
  assert.equal(rows[0].Jev_Status, undefined);
  const results = rows.map((row, i) => {
    const prepared = run(get('Prepare Jev Request'), { $json: row }).json;
    assert.equal(prepared.hasPost, true);
    assert.equal(prepared.request.state.candidate_post, posts[i]);
    assert.equal(prepared.request.state.user_input, originalInputs[i].json.User_Input);
    assert.equal(prepared.request.state.Status, undefined);
    return run(get('Normalize Jev Result'), {
      $json: i === 0 ? responseFor() : responseFor([3, 5, 5, 5, 5], 'hallucination'),
      $: () => ({ item: { json: prepared } }),
    });
  });
  const output = run(get('Workshop Results'), { $input: { all: () => results } });
  assert.deepEqual(Array.from(output, item => item.json.Model_Output), posts);
  assert.deepEqual(Array.from(output, item => item.json.Jev_Status), ['PASS', 'FAIL']);
  assert(output.every(item => Object.keys(item.json).join() === WORKSHOP_COLUMNS.join()));
});
