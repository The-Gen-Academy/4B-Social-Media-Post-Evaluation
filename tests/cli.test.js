import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { stringify } from 'csv-stringify/sync';
import { parse } from 'csv-parse/sync';
import { WORKSHOP_COLUMNS } from '../src/workshop.js';

const cli = fileURLToPath(new URL('../src/cli.js', import.meta.url));
const mock = fileURLToPath(new URL('./mock-provider.js', import.meta.url));
const inputRows = [
  { Test_ID: 'DUP', User_Input: 'Question', Model_Output: 'GOOD, with "quotes"\nand a newline', Status: 'Pass', Reference_Facts: 'facts' },
  { Test_ID: 'DUP', User_Input: 'Question', Model_Output: 'BAD claim', Status: 'Fail', Reference_Facts: 'facts' },
  { Test_ID: '', User_Input: '', Model_Output: '', Status: '', Reference_Facts: '' },
  { Test_ID: 'error', User_Input: 'Question', Model_Output: 'API_ERROR', Status: 'Pass', Reference_Facts: 'facts' },
];
function setup(t) {
  const dir = mkdtempSync(join(tmpdir(), 'jev-test-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const input = join(dir, 'input.csv'), output = join(dir, 'output.csv');
  writeFileSync(input, '\uFEFF' + stringify(inputRows, { header: true }));
  return { dir, input, output };
}
function invoke(args, live = false, env = {}) {
  return spawnSync(process.execPath, [...(live ? ['--import', mock] : []), cli, ...args], {
    encoding: 'utf8', env: { ...process.env, JEV_PROVIDER: 'typesafe', TYPESAFE_API_KEY: live ? 'mock-only-key' : '', JEV_MODEL: '', JEV_MIN_CONFIDENCE: '0.7', ...env },
  });
}

test('CLI end-to-end with mocked HTTP: CSV roundtrip, human comparison, errors and rerun protection', t => {
  const { input, output } = setup(t), before = readFileSync(input, 'utf8');
  const result = invoke(['--input', input, '--output', output], true);
  assert.equal(result.status, 1, 'partial API failure must set a nonzero exit code');
  const rows = parse(readFileSync(output, 'utf8'), { columns: true });
  assert.deepEqual(rows.map(r => r.Jev_Status), ['PASS', 'FAIL', 'SKIPPED', 'ERROR']);
  assert.equal(rows[0].Model_Output, inputRows[0].Model_Output);
  assert.deepEqual(rows.map(r => r.Status), inputRows.map(r => r.Status));
  assert.equal(readFileSync(input, 'utf8'), before);
  const summary = JSON.parse(readFileSync(`${output}.summary.json`, 'utf8'));
  assert.equal(summary.agreement, 1); assert.equal(summary.compared, 2); assert.equal(summary.errors, 1);
  const saved = readFileSync(output, 'utf8');
  assert.equal(invoke(['--input', input, '--output', output], true).status, 1);
  assert.equal(readFileSync(output, 'utf8'), saved);
  const report = invoke(['--input', output, '--report-only']);
  assert.equal(report.status, 0); assert.equal(JSON.parse(report.stdout).compared, 2);
});

test('CLI runs the OpenRouter route and selects its default model', t => {
  const { input, output } = setup(t);
  const result = invoke(['--provider', 'openrouter', '--input', input, '--output', output], true,
    { OPENROUTER_API_KEY: 'mock-openrouter-key', MOCK_PROVIDER: 'openrouter' });
  assert.equal(result.status, 1, result.stderr);
  const rows = parse(readFileSync(output, 'utf8'), {columns: true});
  assert.deepEqual(rows.map(r => r.Jev_Status), ['PASS', 'FAIL', 'SKIPPED', 'ERROR']);
  assert.equal(rows[0].Jev_Model, 'typesafe/jev-1.13');
});

test('workshop export contains only the participant columns and preserves failure and error semantics', t => {
  const {input, output} = setup(t);
  const result = invoke(['--input', input, '--output', output, '--workshop'], true);
  assert.equal(result.status, 1);
  const rows = parse(readFileSync(output, 'utf8'), {columns:true});
  assert.deepEqual(Object.keys(rows[0]), WORKSHOP_COLUMNS);
  assert.deepEqual(rows.map(r => r.Jev_Status), ['PASS', 'FAIL', 'SKIPPED', 'ERROR']);
  assert.equal(rows[3].Jev_Total_Score, '');
  assert.equal(rows[0].Model_Output, inputRows[0].Model_Output);
  assert.equal(rows[0].Human_Feedback, undefined);
  assert.equal(rows[0].Jev_Raw_Response, undefined);
  assert.equal(JSON.parse(readFileSync(`${output}.summary.json`, 'utf8')).compared, 2);
});

test('dry run does not need credentials and excludes blank posts and human labels', t => {
  const { input, output } = setup(t);
  const result = invoke(['--input', input, '--output', output, '--dry-run']);
  assert.equal(result.status, 0, result.stderr);
  const requests = readFileSync(`${output}.requests.jsonl`, 'utf8').trim().split('\n').map(JSON.parse);
  assert.equal(requests.length, 3);
  assert.equal(requests[0].request.state.candidate_post, inputRows[0].Model_Output);
  assert.equal(requests[0].request.state.Status, undefined);
});

test('CLI rejects missing keys, input overwrite and duplicate headers', t => {
  const { input, output } = setup(t);
  assert.match(invoke(['--input', input, '--output', output]).stderr, /TYPESAFE_API_KEY/);
  assert.match(invoke(['--input', input, '--output', input]).stderr, /differ from input/);
  writeFileSync(input, 'Model_Output,Model_Output\none,two\n');
  assert.match(invoke(['--input', input, '--dry-run']).stderr, /duplicate headers/);
});
