import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, realpathSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beginMeasurement, loadMeasurementDirectory, redactMeasurement, resumeMeasurement } from '../dist/measurement.mjs';
import { validateMeasurementDataset } from '../dist/measurement-analysis.mjs';

const MAX = 256 * 1024;
function fixture(t) {
  const parent = mkdtempSync(join(realpathSync(tmpdir()), 'agk-terminal-bounds-'));
  t.after(() => rmSync(parent, { recursive: true, force: true }));
  const directory = join(parent, 'records'); mkdirSync(directory, { mode: 0o700 });
  return { directory };
}
function check(directory, gap) {
  const loaded = loadMeasurementDirectory(directory);
  assert.equal(loaded.gaps, 0);
  const terminal = loaded.records.find(r => r.phase === 'terminal');
  assert.ok(terminal, 'a terminal must survive every unbounded finish field');
  assert.equal(terminal.state, 'incomplete');
  assert.equal(terminal.decision, null); assert.equal(terminal.execution, null);
  assert.deepEqual(terminal.feedback, { publication: 'unknown', delivery: 'unknown', response: 'unknown' });
  assert.deepEqual(terminal.observation, { gap });
  assert.deepEqual(terminal.request, loaded.records.find(r => r.phase === 'prepared').request);
  for (const name of readdirSync(directory)) assert.ok(readFileSync(join(directory, name)).length <= MAX);
  for (const records of [loaded.records, loaded.records.map(redactMeasurement)]) {
    assert.doesNotThrow(() => validateMeasurementDataset({ version: 1, records, population: [], cases: [], audits: [] }));
  }
  return terminal;
}
for (const [field, payload] of [
  ['execution', { detail: 'x'.repeat(MAX) }],
  ['decision', { decision: 'BLOCK', summary: 'x'.repeat(MAX) }],
  ['observation', { detail: 'x'.repeat(MAX) }],
  ['publication', 'x'.repeat(MAX)],
]) test(`oversized ${field} retains bounded incomplete terminal and immutable request`, t => {
  const { directory } = fixture(t);
  const attempt = beginMeasurement({ route: 'manual', directory, context: { captured: 'identity' } });
  attempt.request({ requestId: 'a'.repeat(64), prompt: '' }, { kind: 'proposed-task' });
  assert.doesNotThrow(() => attempt.finish({ decision: { decision: 'BLOCK' }, [field]: payload }));
  const terminal = check(directory, 'record-too-large');
  assert.deepEqual(terminal.context, { captured: 'identity' });
});

for (const kind of ['cyclic', 'bigint', 'deep', 'throwing-toJSON']) test(`invalid ${kind} execution retains explicit terminal gap`, t => {
  const { directory } = fixture(t);
  const attempt = beginMeasurement({ route: 'manual', directory });
  attempt.request({ requestId: 'a'.repeat(64) });
  let execution = {};
  if (kind === 'cyclic') execution.self = execution;
  if (kind === 'bigint') execution.value = 1n;
  if (kind === 'deep') for (let i = 0; i < 33; i++) execution = { nested: execution };
  if (kind === 'throwing-toJSON') execution.toJSON = () => { throw new Error('invalid caller serialization'); };
  assert.doesNotThrow(() => attempt.finish({ execution }));
  check(directory, 'invalid-record-payload');
});

test('execution is snapshotted once before persistence', t => {
  const { directory } = fixture(t); let calls = 0;
  const attempt = beginMeasurement({ route: 'manual', directory });
  attempt.finish({ execution: { toJSON() { calls++; return calls === 1 ? { observed: true } : { detail: 'x'.repeat(MAX) }; } } });
  assert.equal(calls, 1);
  assert.deepEqual(loadMeasurementDirectory(directory).records.find(r => r.phase === 'terminal').execution, { observed: true });
});

test('combined near-limit context and request leave space for a bounded fallback', t => {
  const { directory } = fixture(t);
  const attempt = beginMeasurement({ route: 'manual', directory, context: { payload: 'x'.repeat(130000) } });
  assert.ok(attempt.id);
  attempt.request({ requestId: 'a'.repeat(64), reviewer: { payload: 'y'.repeat(130000) } });
  assert.equal(loadMeasurementDirectory(directory).records.filter(r => r.phase === 'prepared').length, 1);
  attempt.finish({ execution: { detail: 'z'.repeat(MAX) } });
  check(directory, 'record-too-large');
});

test('start and preparation reserve terminal bytes and enforce whole-record nesting', t => {
  const { directory } = fixture(t);
  assert.equal(beginMeasurement({ route: 'manual', directory, context: { payload: 'x'.repeat(MAX - 800) } }).id, null);
  const attempt = beginMeasurement({ route: 'manual', directory });
  attempt.request({ reviewer: { payload: 'x'.repeat(MAX - 800) } });
  assert.equal(loadMeasurementDirectory(directory).records.filter(r => r.phase === 'prepared').length, 0);
  let scope = {}; for (let i = 0; i < 31; i++) scope = { nested: scope };
  attempt.request({}, scope);
  assert.equal(loadMeasurementDirectory(directory).records.filter(r => r.phase === 'prepared').length, 0, 'request alone fits depth but prepared wrapper must also fit');
  attempt.finish();
  assert.equal(loadMeasurementDirectory(directory).gaps, 0);
});

test('legacy near-limit immutable envelope refuses resumption without rewriting prior evidence', t => {
  const { directory } = fixture(t);
  const attempt = beginMeasurement({ route: 'manual', directory });
  const path = join(directory, `${attempt.id}.start.json`);
  const start = JSON.parse(readFileSync(path)); start.context = { payload: '' };
  start.context.payload = 'x'.repeat(MAX - Buffer.byteLength(JSON.stringify(start)) - 2);
  const bytes = JSON.stringify(start); writeFileSync(path, bytes);
  assert.ok(Buffer.byteLength(bytes) < MAX);
  assert.equal(resumeMeasurement(attempt.id, directory).id, null);
  assert.equal(readFileSync(path, 'utf8'), bytes);
});


test('legacy resumption budgets the larger serialization gap and maximum timing widths', t => {
  const { directory } = fixture(t);
  const OriginalDate = globalThis.Date;
  const instant = OriginalDate.parse('2026-01-01T00:00:00.000Z');
  globalThis.Date = class extends OriginalDate {
    constructor(...args) { super(...(args.length ? args : [instant])); }
  };
  try {
    const attempt = beginMeasurement({ route: 'manual', directory });
    const path = join(directory, `${attempt.id}.start.json`);
    const start = JSON.parse(readFileSync(path)); start.context = { payload: '' };
    const smallerGap = { ...start, phase: 'terminal', completedAt: start.startedAt, elapsedMs: 0, state: 'incomplete', request: null,
      decision: null, execution: null, feedback: { publication: 'unknown', delivery: 'unknown', response: 'unknown' }, observation: { gap: 'record-too-large' } };
    start.context.payload = 'x'.repeat(MAX - Buffer.byteLength(JSON.stringify(smallerGap)) - 1);
    const bytes = JSON.stringify(start); writeFileSync(path, bytes);
    assert.equal(Buffer.byteLength(JSON.stringify(smallerGap)) + 1, MAX, 'the smaller fallback fits exactly');
    const resumed = resumeMeasurement(attempt.id, directory);
    // The previous recorder accepted this start, then lost the terminal on cyclic
    // execution because invalid-record-payload is longer than record-too-large.
    assert.equal(resumed.id, null);
    assert.equal(readFileSync(path, 'utf8'), bytes);
    assert.deepEqual(loadMeasurementDirectory(directory).records.map(r => r.phase), ['start']);
  } finally { globalThis.Date = OriginalDate; }
});


function fillEntries(directory, target) {
  for (let i = readdirSync(directory).length; i < target; i++) writeFileSync(join(directory, `unrelated-${i}`), '');
}
for (const count of [4094, 4095]) test(`admission at ${count} entries refuses before writing an unfinishable start`, t => {
  const { directory } = fixture(t); fillEntries(directory, count);
  assert.equal(beginMeasurement({ route: 'manual', directory }).id, null);
  assert.equal(readdirSync(directory).length, count);
  assert.deepEqual(loadMeasurementDirectory(directory).records, []);
});

test('admission with three free entries persists every phase and remains exportable at the cap', t => {
  const { directory } = fixture(t); fillEntries(directory, 4093);
  const attempt = beginMeasurement({ route: 'manual', directory }); assert.ok(attempt.id);
  attempt.request({ requestId: 'a'.repeat(64) }); attempt.finish({ decision: { decision: 'BLOCK' } });
  assert.equal(readdirSync(directory).length, 4096);
  const records = loadMeasurementDirectory(directory).records;
  assert.deepEqual(records.map(r => r.phase).sort(), ['prepared', 'start', 'terminal']);
  assert.equal(records.find(r => r.phase === 'terminal').decision.decision, 'BLOCK');
});

test('preparation refuses when it would consume terminal space and direct finish can still fit', t => {
  const { directory } = fixture(t); const attempt = beginMeasurement({ route: 'manual', directory });
  fillEntries(directory, 4095); attempt.request({ requestId: 'a'.repeat(64) });
  assert.equal(loadMeasurementDirectory(directory).records.some(r => r.phase === 'prepared'), false);
  attempt.finish({ state: 'incomplete' });
  assert.equal(loadMeasurementDirectory(directory).records.find(r => r.phase === 'terminal').state, 'incomplete');
  assert.equal(readdirSync(directory).length, 4096);
});

test('resumption checks remaining phase capacity before returning a recorder', t => {
  for (const prepared of [false, true]) {
    const { directory } = fixture(t); const attempt = beginMeasurement({ route: 'manual', directory });
    if (prepared) attempt.request({ requestId: 'a'.repeat(64) });
    fillEntries(directory, 4095);
    const resumed = resumeMeasurement(attempt.id, directory);
    if (!prepared) assert.equal(resumed.id, null);
    else {
      assert.equal(resumed.id, attempt.id); resumed.finish();
      assert.equal(loadMeasurementDirectory(directory).records.find(r => r.phase === 'terminal').state, 'completed');
    }
  }
});
