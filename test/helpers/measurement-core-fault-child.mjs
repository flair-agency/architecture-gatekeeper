import assert from 'node:assert/strict';
import { closeSync, mkdirSync, mkdtempSync, readdirSync, realpathSync, renameSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { beginMeasurement, measurementDigest, resumeMeasurement, resumeNativeMeasurement } from '../../dist/measurement.mjs';
const [scenario] = process.argv.slice(2);
const parent = mkdtempSync(join(realpathSync(tmpdir()), 'agk-core-child-'));
const root = join(parent, 'repo'); const directory = join(parent, 'records');
mkdirSync(root); mkdirSync(directory, { mode: 0o700 });
const originalCwd = process.cwd();
try {
  process.chdir(root);
  if (scenario === 'subdirectory-root') {
    execFileSync('git', ['init', '--quiet'], { cwd: root });
    const subdir = join(root, 'src'); mkdirSync(subdir);
    const inside = join(root, 'private-records'); mkdirSync(inside, { mode: 0o700 });
    const fromRoot = beginMeasurement({ route: 'native', directory, correlation: measurementDigest(join(parent, 'request.json')) });
    const request = { requestId: 'a'.repeat(64), prompt: 'fixture', schema: {} }; fromRoot.request(request);
    process.chdir(subdir);
    for (const cwd of [undefined, subdir]) {
      assert.equal(beginMeasurement({ route: 'manual', directory: inside, cwd }).id, null);
      assert.equal(resumeMeasurement(fromRoot.id, inside, cwd).id, null);
      assert.equal(resumeNativeMeasurement(join(parent, 'request.json'), { ...request, repositoryRoot: cwd }, inside).id, null);
    }
    assert.deepEqual(readdirSync(inside), []);
    const fromSubdir = beginMeasurement({ route: 'manual', directory }); assert.ok(fromSubdir.id); fromSubdir.finish();
    const { loadMeasurementDirectory } = await import('../../dist/measurement.mjs');
    const records = loadMeasurementDirectory(directory).records;
    assert.equal(records.find(r => r.attemptId === fromRoot.id).repositoryId, records.find(r => r.attemptId === fromSubdir.id).repositoryId);
    assert.equal(resumeMeasurement(fromRoot.id, directory).id, fromRoot.id);
    assert.equal(resumeNativeMeasurement(join(parent, 'request.json'), request, directory).id, fromRoot.id);
  } else if (scenario.startsWith('cwd-')) {
    const inside = join(root, 'private-records'); mkdirSync(inside, { mode: 0o700 });
    process.env.AGK_MEASUREMENT_DIR = inside;
    const options = scenario === 'cwd-option' ? { directory: inside } : scenario === 'cwd-environment' ? {} :
      { directory: inside, cwd: scenario === 'cwd-null' ? null : scenario === 'cwd-empty' ? '' : 42 };
    assert.equal(beginMeasurement({ route: 'manual', ...options }).id, null);
    assert.deepEqual(readdirSync(inside), []);
    const external = beginMeasurement({ route: 'manual', directory });
    assert.ok(external.id); external.finish();
  } else if (scenario.startsWith('resume-') && scenario !== 'resume-warning') {
    const native = scenario.startsWith('resume-native');
    const requestPath = join(parent, 'host-request.json');
    const request = { requestId: 'a'.repeat(64), prompt: 'fixture', schema: {} };
    const attempt = beginMeasurement({ route: native ? 'native' : 'manual', cwd: root, directory,
      correlation: native ? measurementDigest(requestPath) : undefined });
    assert.ok(attempt.id); attempt.request(request);
    const invalidRoot = scenario.endsWith('-null') ? null : scenario.endsWith('-empty') ? '' : scenario.endsWith('-number') ? 42 : undefined;
    let selected = directory;
    if (scenario.endsWith('-worktree')) { selected = join(root, 'private-records'); renameSync(directory, selected); }
    const before = readdirSync(selected).sort();
    const resumed = native ? resumeNativeMeasurement(requestPath, { ...request, repositoryRoot: invalidRoot }, selected) : resumeMeasurement(attempt.id, selected);
    resumed.finish({ decision: { decision: 'PASS' } });
    assert.equal(resumed.id, null); assert.deepEqual(readdirSync(selected).sort(), before);
  } else {
    const attempt = beginMeasurement({ route: 'manual', cwd: root, directory });
    assert.ok(attempt.id);
    process.stderr.write = () => { throw new Error('warning sink unavailable'); };
    if (scenario === 'closed-warning') { closeSync(process.stderr.fd); assert.equal(beginMeasurement({ route: 'manual', directory: '/unavailable' }).id, null); }
    if (scenario === 'setup-warning') assert.equal(beginMeasurement({ route: 'manual', directory: '/unavailable' }).id, null);
    if (scenario === 'request-warning') assert.doesNotThrow(() => attempt.request({ get prompt() { throw new Error('capture unavailable'); } }));
    if (scenario === 'finish-warning') { rmSync(directory, { recursive: true }); assert.doesNotThrow(() => attempt.finish()); }
    if (scenario === 'resume-warning') assert.equal(resumeMeasurement('not-an-attempt', directory).id, null);
  }
} finally { process.chdir(originalCwd); rmSync(parent, { recursive: true, force: true }); }
