import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beginMeasurement, loadMeasurementDirectory, resumeMeasurement } from '../dist/measurement.mjs';

function fixture(t) {
  const parent = mkdtempSync(join(realpathSync(tmpdir()), 'agk-measurement-request-state-'));
  t.after(() => rmSync(parent, { recursive: true, force: true }));
  const root = join(parent, 'repo'); mkdirSync(root);
  const directory = join(parent, 'records'); mkdirSync(directory, { mode: 0o700 });
  return { root, directory };
}
function request(id, suffix) {
  return { requestId: id.repeat(64), reviewedRevision: 'b'.repeat(40), prompt: `prompt-${suffix}`,
    schema: { schema: suffix }, authoritySet: { members: [{ id: suffix }] }, reviewer: { model: suffix, settings: { effort: suffix } } };
}
function terminalFor(directory, attempt) {
  return loadMeasurementDirectory(directory).records.find(record => record.attemptId === attempt.id && record.phase === 'terminal');
}

test('request snapshots caller-owned nested values and accepts only the first durable request', t => {
  const { root, directory } = fixture(t);
  const attempt = beginMeasurement({ route: 'manual', cwd: root, directory, changeId: 'change-1' });
  const selected = request('a', 'selected');
  const scope = { kind: 'proposed-task', nested: { label: 'selected' } };
  attempt.request(selected, scope);
  selected.authoritySet.members[0].id = 'mutated';
  selected.reviewer.settings.effort = 'mutated';
  scope.nested.label = 'mutated';
  const ignored = request('c', 'ignored');
  Object.defineProperty(ignored, 'prompt', { get() { throw new Error('second request must not be read'); } });
  assert.doesNotThrow(() => attempt.request(ignored, { kind: 'tracked-working-tree' }));
  attempt.finish({ decision: { decision: 'BLOCK' } });

  const records = loadMeasurementDirectory(directory).records.filter(record => record.attemptId === attempt.id);
  const prepared = records.find(record => record.phase === 'prepared');
  const terminal = records.find(record => record.phase === 'terminal');
  assert.deepEqual(prepared.request, terminal.request);
  assert.equal(terminal.request.requestId, 'a'.repeat(64));
  assert.deepEqual(terminal.request.authoritySet, { members: [{ id: 'selected' }] });
  assert.deepEqual(terminal.request.requestedReviewer, { model: 'selected', settings: { effort: 'selected' } });
  assert.deepEqual(terminal.request.scope, { kind: 'proposed-task', nested: { label: 'selected' } });
  assert.equal(terminal.decision.decision, 'BLOCK');
});

test('resumed prepared recorder keeps its captured request and rejects another request', t => {
  const { root, directory } = fixture(t);
  const attempt = beginMeasurement({ route: 'native', cwd: root, directory, changeId: 'change-1' });
  attempt.request(request('a', 'prepared'), { kind: 'proposed-task' });
  const resumed = resumeMeasurement(attempt.id, directory);
  assert.ok(resumed.id);
  resumed.request(request('c', 'replacement'), { kind: 'tracked-working-tree' });
  resumed.finish({ decision: { decision: 'PASS' } });

  const records = loadMeasurementDirectory(directory).records.filter(record => record.attemptId === attempt.id);
  const prepared = records.find(record => record.phase === 'prepared');
  const terminal = records.find(record => record.phase === 'terminal');
  assert.deepEqual(terminal.request, prepared.request);
  assert.equal(terminal.request.requestId, 'a'.repeat(64));
});

test('request after finish is ignored and cannot add a prepared phase', t => {
  const { root, directory } = fixture(t);
  const attempt = beginMeasurement({ route: 'manual', cwd: root, directory, changeId: 'change-1' });
  attempt.finish({ decision: { decision: 'BLOCK' } });
  const late = request('a', 'late');
  Object.defineProperty(late, 'prompt', { get() { throw new Error('finished request must not be read'); } });
  assert.doesNotThrow(() => attempt.request(late, { kind: 'proposed-task' }));
  const records = loadMeasurementDirectory(directory).records.filter(record => record.attemptId === attempt.id);
  assert.deepEqual(records.map(record => record.phase).sort(), ['start', 'terminal']);
  assert.equal(records.find(record => record.phase === 'terminal').request, null);
});

test('throwing request and finish getters stay inside the optional diagnostic boundary', t => {
  const { root, directory } = fixture(t);
  const attempt = beginMeasurement({ route: 'manual', cwd: root, directory, changeId: 'change-1' });
  const malformed = request('a', 'malformed');
  Object.defineProperty(malformed, 'prompt', { get() { throw new Error('malformed request getter'); } });
  assert.doesNotThrow(() => attempt.request(malformed));
  assert.doesNotThrow(() => attempt.finish({ decision: { decision: 'BLOCK' } }));
  assert.equal(terminalFor(directory, attempt).decision.decision, 'BLOCK');

  const other = beginMeasurement({ route: 'manual', cwd: root, directory, changeId: 'change-1' });
  const malformedFinish = Object.defineProperty({}, 'state', { get() { throw new Error('malformed finish getter'); } });
  assert.doesNotThrow(() => other.finish(malformedFinish));
  const records = loadMeasurementDirectory(directory).records.filter(record => record.attemptId === other.id);
  assert.deepEqual(records.map(record => record.phase), ['start']);
  assert.doesNotThrow(() => other.request(request('c', 'after-failed-finish')));
});

test('beginMeasurement contains malformed diagnostic options and preserves valid reviews', t => {
  const { root, directory } = fixture(t);
  const throwing = Object.defineProperty({}, 'directory', { get() { throw new Error('unavailable diagnostic config'); } });
  assert.doesNotThrow(() => beginMeasurement(throwing));
  assert.equal(beginMeasurement(null).id, null);
  assert.equal(beginMeasurement(/** @type {any} */ ({})).id, null);
  const valid = beginMeasurement({ route: 'manual', cwd: root, directory, changeId: 'change-1' });
  assert.ok(valid.id);
  valid.finish({ decision: { decision: 'PASS' } });
  assert.equal(terminalFor(directory, valid).decision.decision, 'PASS');
});

test('reentrant finish during request serialization leaves one terminal record without a request', t => {
  const { root, directory } = fixture(t);
  let attempt;
  const scope = { toJSON() {
    attempt.finish({ decision: { decision: 'BLOCK' } });
    return { kind: 'proposed-task' };
  } };
  attempt = beginMeasurement({ route: 'manual', cwd: root, directory, changeId: 'change-1' });
  assert.doesNotThrow(() => attempt.request(request('a', 'reentrant'), scope));
  const records = loadMeasurementDirectory(directory).records.filter(record => record.attemptId === attempt.id);
  assert.deepEqual(records.map(record => record.phase).sort(), ['start', 'terminal']);
  const terminal = records.find(record => record.phase === 'terminal');
  assert.equal(terminal.request, null);
  assert.equal(terminal.decision.decision, 'BLOCK');
});

test('start context is snapshotted once before persistence and cannot reenter or mutate later phases', t => {
  const { root, directory } = fixture(t);
  let attempt;
  let serializations = 0;
  const context = { nested: { label: 'captured' }, toJSON() {
    serializations++;
    if (attempt) attempt.finish({ decision: { decision: 'BLOCK' } });
    return { nested: this.nested };
  } };
  attempt = beginMeasurement({ route: 'manual', cwd: root, directory, changeId: 'change-1', context });
  assert.equal(serializations, 1);
  context.nested.label = 'mutated';
  attempt.request(request('a', 'context-snapshot'), { kind: 'proposed-task' });
  attempt.finish({ decision: { decision: 'PASS' } });

  const records = loadMeasurementDirectory(directory).records.filter(record => record.attemptId === attempt.id);
  assert.equal(serializations, 1, 'context toJSON must not be invoked again by prepared or terminal writes');
  assert.deepEqual(records.map(record => record.phase).sort(), ['prepared', 'start', 'terminal']);
  assert.deepEqual(records.find(record => record.phase === 'start').context, { nested: { label: 'captured' } });
  assert.deepEqual(records.find(record => record.phase === 'terminal').context, { nested: { label: 'captured' } });
  assert.equal(records.find(record => record.phase === 'terminal').decision.decision, 'PASS');
});

test('failed exclusive prepared write leaves request unset and permits a clean retry', t => {
  const { root, directory } = fixture(t);
  const attempt = beginMeasurement({ route: 'manual', cwd: root, directory, changeId: 'change-1' });
  const preparedPath = join(directory, `${attempt.id}.prepared.json`);
  writeFileSync(preparedPath, 'occupied');
  attempt.request(request('a', 'failed'), { kind: 'proposed-task' });
  unlinkSync(preparedPath);
  attempt.request(request('c', 'retry'), { kind: 'tracked-working-tree' });
  attempt.finish();

  const records = loadMeasurementDirectory(directory).records.filter(record => record.attemptId === attempt.id);
  assert.equal(records.filter(record => record.phase === 'prepared').length, 1);
  assert.equal(records.find(record => record.phase === 'prepared').request.requestId, 'c'.repeat(64));
  assert.equal(records.find(record => record.phase === 'terminal').request.requestId, 'c'.repeat(64));
});


test('oversized terminal capture becomes an incomplete gap without rewriting the prepared request', t => {
  const { root, directory } = fixture(t);
  const attempt = beginMeasurement({ route: 'manual', cwd: root, directory, changeId: 'change-1' });
  attempt.request(request('a', 'selected'), { kind: 'proposed-task' });
  const decision = { decision: 'BLOCK', summary: 's'.repeat(256 * 1024) };
  assert.doesNotThrow(() => attempt.finish({ decision }));
  assert.equal(decision.summary.length, 256 * 1024, 'capture must not mutate the caller result');
  const records = loadMeasurementDirectory(directory).records;
  const terminal = records.find(r => r.phase === 'terminal');
  assert.equal(terminal.state, 'incomplete'); assert.equal(terminal.decision, null);
  assert.deepEqual(terminal.observation, { gap: 'record-too-large' });
  assert.deepEqual(terminal.request, records.find(r => r.phase === 'prepared').request);
});
