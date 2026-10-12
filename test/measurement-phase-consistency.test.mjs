import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, realpathSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beginMeasurement, loadMeasurementDirectory, redactMeasurement } from '../dist/measurement.mjs';
import { aggregateMeasurement, validateMeasurementDataset } from '../dist/measurement-analysis.mjs';

function records(t, options = {}) {
  const parent = mkdtempSync(join(realpathSync(tmpdir()), 'agk-phase-consistency-'));
  t.after(() => rmSync(parent, { recursive: true, force: true }));
  const root = join(parent, 'repo'); mkdirSync(root);
  const directory = join(parent, 'records'); mkdirSync(directory, { mode: 0o700 });
  const attempt = beginMeasurement({ route: 'manual', cwd: root, directory, changeId: 'change-1', ...options });
  assert.ok(attempt.id);
  attempt.request({ requestId: 'a'.repeat(64), reviewedRevision: 'b'.repeat(40), prompt: 'task', schema: {} });
  attempt.finish();
  return loadMeasurementDirectory(directory).records;
}
const dataset = records => ({ version: 1, records, population: [], cases: [], audits: [] });

test('production phase records and their redacted exports validate and aggregate', t => {
  const privateRecords = records(t);
  assert.equal(privateRecords.length, 3);
  assert.doesNotThrow(() => aggregateMeasurement(dataset(privateRecords)));
  const exported = dataset(privateRecords.map(redactMeasurement));
  assert.doesNotThrow(() => aggregateMeasurement(exported));
});

test('rejects conflicting shared phase envelope metadata before aggregation', t => {
  const original = records(t);
  for (const [field, replacement] of [['route', 'PostToolUse'], ['changeId', 'change-2'], ['startedAt', '2026-10-01T00:00:00.000Z']]) {
    const changed = original.map(record => ({ ...record }));
    changed.find(record => record.phase === 'prepared')[field] = replacement;
    assert.throws(() => aggregateMeasurement(dataset(changed)), /conflicting phase metadata/);
  }
  const omitted = original.map(record => ({ ...record }));
  delete omitted.find(record => record.phase === 'prepared').changeId;
  assert.throws(() => aggregateMeasurement(dataset(omitted)), /conflicting phase metadata/);
  const changedIdentity = JSON.parse(JSON.stringify(original));
  changedIdentity.find(record => record.phase === 'prepared').request.requestId = 'c'.repeat(64);
  assert.throws(() => validateMeasurementDataset(dataset(changedIdentity)), /conflicting phase request metadata/);
  const changedScope = JSON.parse(JSON.stringify(original));
  changedScope.find(record => record.phase === 'prepared').request.scope.kind = 'tracked-working-tree';
  assert.throws(() => validateMeasurementDataset(dataset(changedScope)), /conflicting phase request metadata/);
  const redacted = original.map(redactMeasurement);
  redacted.find(record => record.phase === 'prepared').requestId = 'c'.repeat(64);
  assert.throws(() => validateMeasurementDataset(dataset(redacted)), /conflicting phase request metadata/);
  const redactedScope = original.map(redactMeasurement);
  redactedScope.find(record => record.phase === 'prepared').scopeKind = 'proposed-task';
  assert.throws(() => validateMeasurementDataset(dataset(redactedScope)), /conflicting phase request metadata/);
  const contextConflict = original.map(record => ({ ...record }));
  contextConflict[1] = { ...contextConflict[1], context: { z: 1, a: { b: 2 } } };
  contextConflict[0] = { ...contextConflict[0], context: { a: { b: 2 }, z: 1 } };
  assert.throws(() => validateMeasurementDataset(dataset(contextConflict)), /conflicting phase metadata/);
});

test('compares nested envelope objects independent of key order and fails closed at its traversal bound', t => {
  const original = records(t);
  const reordered = original.map(record => ({ ...record, context: { z: { y: 2 }, a: 1 } }));
  reordered[1] = { ...reordered[1], context: { a: 1, z: { y: 2 } } };
  assert.doesNotThrow(() => validateMeasurementDataset(dataset(reordered)));
  let nested = 1;
  for (let i = 0; i < 34; i++) nested = { child: nested };
  const deep = original.map(record => ({ ...record, context: JSON.parse(JSON.stringify(nested)) }));
  assert.throws(() => validateMeasurementDataset(dataset(deep)), /comparison depth/);
  const wide = Object.fromEntries(Array.from({ length: 12001 }, (_, i) => [`key-${i}`, i]));
  const acceptedWide = original.map(record => ({ ...record, context: JSON.parse(JSON.stringify(wide)) }));
  assert.doesNotThrow(() => validateMeasurementDataset(dataset(acceptedWide)));
  const tooWide = Object.fromEntries(Array.from({ length: 270000 }, (_, i) => [`key-${i}`, i]));
  const oversized = original.map(record => ({ ...record, context: JSON.parse(JSON.stringify(tooWide)) }));
  assert.throws(() => validateMeasurementDataset(dataset(oversized)), /comparison budget/);
});

test('terminal-only records remain valid and retain terminalWithoutStart diagnostics', () => {
  const id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  const terminal = { version: 1, kind: 'agk-diagnostic', attemptId: id, phase: 'terminal', route: 'manual', startedAt: '2026-10-01T00:00:00.000Z', completedAt: '2026-10-01T00:00:01.000Z', state: 'completed', changeId: 'change-1' };
  const data = dataset([terminal]);
  data.population.push({ changeId: 'change-1', eligible: true, cohort: 'natural', domain: 'self' });
  const result = aggregateMeasurement(data);
  assert.equal(result.coverage.terminalWithoutStart, 1);
});


test('numeric date coercion cannot change timestamps between private records and export', () => {
  const base = { version: 1, kind: 'agk-diagnostic', attemptId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', phase: 'terminal', route: 'manual',
    startedAt: '2026-10-01T00:00:00Z', completedAt: '2026-10-01T00:00:01Z', state: 'completed' };
  for (const field of ['startedAt', 'completedAt']) {
    assert.throws(() => validateMeasurementDataset(dataset([{ ...base, [field]: 0 }])), /Invalid diagnostic record/);
    assert.throws(() => redactMeasurement({ ...base, [field]: 0 }), /Invalid diagnostic record/);
  }
});
