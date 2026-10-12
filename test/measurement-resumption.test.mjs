import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, realpathSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beginMeasurement, loadMeasurementDirectory, measurementDigest, resumeMeasurement, resumeNativeMeasurement } from '../dist/measurement.mjs';

function fixture(t, route = 'ci-review') {
  const parent = mkdtempSync(join(realpathSync(tmpdir()), 'agk-resumption-'));
  t.after(() => rmSync(parent, { recursive: true, force: true }));
  const root = join(parent, 'repo'); mkdirSync(root);
  const directory = join(parent, 'records'); mkdirSync(directory, { mode: 0o700 });
  const requestPath = join(parent, 'request.json');
  const request = { requestId: 'a'.repeat(64), reviewedRevision: 'b'.repeat(40), prompt: 'scope', schema: {}, repositoryRoot: root };
  const attempt = beginMeasurement({ route, cwd: root, directory, changeId: 'change-1', correlation: measurementDigest(requestPath) });
  attempt.request(request, { kind: 'proposed-task' });
  return { directory, root, requestPath, request, attempt };
}
function replace(f, phase, mutation) {
  const path = join(f.directory, `${f.attempt.id}.${phase}.json`);
  const record = JSON.parse(readFileSync(path, 'utf8')); mutation(record);
  writeFileSync(path, JSON.stringify(record));
}

for (const [label, phase, mutation] of [
  ['different start ID', 'start', r => { r.attemptId = 'cccccccc-aaaa-aaaa-aaaa-aaaaaaaaaaaa'; }],
  ['wrong start phase', 'start', r => { r.phase = 'prepared'; }],
  ['different prepared ID', 'prepared', r => { r.attemptId = 'cccccccc-aaaa-aaaa-aaaa-aaaaaaaaaaaa'; }],
  ['wrong prepared phase', 'prepared', r => { r.phase = 'start'; }],
  ...['route', 'changeId', 'startedAt', 'runtime', 'context'].map(field => [
    `conflicting ${field}`, 'prepared', r => { r[field] = field === 'startedAt' ? '2026-10-01T00:00:00Z' : field === 'route' ? 'manual' : field === 'changeId' ? 'different' : { different: true }; },
  ]),
]) {
  test(`resumption refuses ${label} before writing any terminal`, t => {
    const f = fixture(t); replace(f, phase, mutation);
    const resumed = resumeMeasurement(f.attempt.id, f.directory);
    assert.equal(resumed.id, null);
    assert.doesNotThrow(() => resumed.finish({ decision: { decision: 'PASS' } }));
    assert.ok(!loadMeasurementDirectory(f.directory).records.some(r => r.phase === 'terminal'));
  });
}

test('malformed preparation is a gap, while absent preparation remains resumable', t => {
  const f = fixture(t);
  writeFileSync(join(f.directory, `${f.attempt.id}.prepared.json`), '{bad');
  assert.equal(resumeMeasurement(f.attempt.id, f.directory).id, null);
  rmSync(join(f.directory, `${f.attempt.id}.prepared.json`));
  const resumed = resumeMeasurement(f.attempt.id, f.directory);
  assert.equal(resumed.id, f.attempt.id);
  resumed.finish({ state: 'incomplete' });
  assert.equal(loadMeasurementDirectory(f.directory).records.find(r => r.phase === 'terminal').state, 'incomplete');
});

test('completed attempts cannot resume or append preparation after their terminal', t => {
  const f = fixture(t); f.attempt.finish();
  rmSync(join(f.directory, `${f.attempt.id}.prepared.json`));
  const resumed = resumeMeasurement(f.attempt.id, f.directory);
  assert.equal(resumed.id, null);
  resumed.request(f.request); resumed.finish();
  assert.deepEqual(loadMeasurementDirectory(f.directory).records.map(r => r.phase).sort(), ['start', 'terminal']);
});

test('native resumption applies the same phase envelope check and retains valid host request binding', t => {
  const f = fixture(t, 'native');
  assert.equal(resumeNativeMeasurement(f.requestPath, f.request, f.directory).id, f.attempt.id);
  assert.equal(resumeNativeMeasurement(f.requestPath + '-other', f.request, f.directory).id, null);
  assert.equal(resumeNativeMeasurement(f.requestPath, { ...f.request, requestId: 'c'.repeat(64) }, f.directory).id, null);
  replace(f, 'start', r => { r.changeId = 'different'; });
  const resumed = resumeNativeMeasurement(f.requestPath, f.request, f.directory);
  assert.equal(resumed.id, null); resumed.finish();
  assert.ok(!loadMeasurementDirectory(f.directory).records.some(r => r.phase === 'terminal'));
});


test('resumption checks any terminal through bounded parsing-independent direct-file I/O', t => {
  const f = fixture(t);
  const terminal = join(f.directory, `${f.attempt.id}.terminal.json`);
  for (const bytes of ['{torn', 'x'.repeat(256 * 1024 + 1)]) {
    writeFileSync(terminal, bytes);
    assert.equal(resumeMeasurement(f.attempt.id, f.directory).id, null);
    assert.ok(!loadMeasurementDirectory(f.directory).records.some(r => r.phase === 'terminal'));
  }
});


for (const state of ['completed', 'error', 'incomplete', 'cancelled']) {
  test(`native resumption excludes newer ${state} attempts and retains unfinished candidates`, t => {
    const f = fixture(t, 'native');
    const newer = beginMeasurement({ route: 'native', cwd: f.root, directory: f.directory, changeId: 'change-1', correlation: measurementDigest(f.requestPath) });
    newer.request(f.request, { kind: 'proposed-task' }); newer.finish({ state });
    // Pin the newer timestamp for deterministic ordering while retaining the same
    // envelope across all three phases; it must not shadow an eligible attempt.
    for (const phase of ['start', 'prepared', 'terminal']) {
      const path = join(f.directory, `${newer.id}.${phase}.json`); const r = JSON.parse(readFileSync(path));
      r.startedAt = '2099-01-01T00:00:00.000Z'; if (phase === 'terminal') r.completedAt = '2099-01-01T00:00:00.001Z';
      writeFileSync(path, JSON.stringify(r));
    }
    const resumed = resumeNativeMeasurement(f.requestPath, f.request, f.directory);
    assert.equal(resumed.id, f.attempt.id); resumed.finish({ decision: { decision: 'PASS' } });
    assert.equal(loadMeasurementDirectory(f.directory).records.find(r => r.phase === 'terminal' && r.attemptId === f.attempt.id).state, 'completed');
    assert.equal(resumeNativeMeasurement(f.requestPath, f.request, f.directory).id, null, 'all completed matching candidates leave no eligible attempt');
  });
}


test('native selection skips a newer unfinished observation from another collector', t => {
  const f = fixture(t, 'native');
  const newer = beginMeasurement({ route: 'native', cwd: f.root, directory: f.directory, correlation: measurementDigest(f.requestPath) });
  newer.request(f.request);
  for (const phase of ['start', 'prepared']) {
    const path = join(f.directory, `${newer.id}.${phase}.json`); const value = JSON.parse(readFileSync(path));
    value.runtime.collectorSha256 = 'f'.repeat(64); writeFileSync(path, JSON.stringify(value));
  }
  const resumed = resumeNativeMeasurement(f.requestPath, f.request, f.directory); assert.equal(resumed.id, f.attempt.id);
  resumed.finish({ state: 'completed' });
  assert.equal(loadMeasurementDirectory(f.directory).records.find(r => r.phase === 'terminal').attemptId, f.attempt.id);
});


for (const payload of ['{torn', 'x'.repeat(256 * 1024 + 1)]) test(`native selection excludes an existing unreadable terminal (${payload.length} bytes)`, t => {
  const f = fixture(t, 'native'); const newer = beginMeasurement({ route: 'native', cwd: f.root, directory: f.directory, correlation: measurementDigest(f.requestPath) }); newer.request(f.request);
  const originalStart = loadMeasurementDirectory(f.directory).records.find(r => r.attemptId === f.attempt.id).startedAt;
  for (const phase of ['start', 'prepared']) {
    const path = join(f.directory, `${newer.id}.${phase}.json`); const value = JSON.parse(readFileSync(path)); value.startedAt = new Date(Date.parse(originalStart) + 1000).toISOString(); writeFileSync(path, JSON.stringify(value));
  }
  const terminalPath = join(f.directory, `${newer.id}.terminal.json`); writeFileSync(terminalPath, payload);
  const resumed = resumeNativeMeasurement(f.requestPath, f.request, f.directory); assert.equal(resumed.id, f.attempt.id); resumed.finish({ state: 'completed' });
  assert.equal(readFileSync(terminalPath, 'utf8'), payload); assert.equal(loadMeasurementDirectory(f.directory).gaps, 1);
  assert.equal(resumeNativeMeasurement(f.requestPath, f.request, f.directory).id, null);
});


test('explicit resumption workspace retains containment without requiring the runner current directory', t => {
  const f = fixture(t);
  for (const root of [f.directory, null, '', 42]) {
    assert.equal(resumeMeasurement(f.attempt.id, f.directory, root).id, null);
    assert.ok(!loadMeasurementDirectory(f.directory).records.some(r => r.phase === 'terminal'));
  }
  const resumed = resumeMeasurement(f.attempt.id, f.directory, f.root);
  assert.equal(resumed.id, f.attempt.id); resumed.finish({ state: 'completed' });
  assert.equal(loadMeasurementDirectory(f.directory).records.find(r => r.phase === 'terminal').state, 'completed');
});


test('native selection skips newer unfinished candidates with conflicting phase metadata', t => {
  const f = fixture(t, 'native');
  for (const field of ['changeId', 'runtime', 'context']) {
    const newer = beginMeasurement({ route: 'native', cwd: f.root, directory: f.directory, correlation: measurementDigest(f.requestPath) });
    newer.request(f.request);
    for (const phase of ['start', 'prepared']) {
      const path = join(f.directory, `${newer.id}.${phase}.json`); const record = JSON.parse(readFileSync(path));
      record.startedAt = '2099-01-01T00:00:00.000Z';
      if (phase === 'start') record[field] = field === 'runtime' ? { collectorSha256: 'f'.repeat(64) } : field === 'context' ? { conflict: true } : 'conflict';
      writeFileSync(path, JSON.stringify(record));
    }
  }
  const resumed = resumeNativeMeasurement(f.requestPath, f.request, f.directory);
  assert.equal(resumed.id, f.attempt.id); resumed.finish({ state: 'completed' });
  assert.deepEqual(loadMeasurementDirectory(f.directory).records.filter(r => r.phase === 'terminal').map(r => r.attemptId), [f.attempt.id]);
  assert.equal(resumeNativeMeasurement(f.requestPath, f.request, f.directory).id, null, 'all remaining candidates are corrupt');
});
