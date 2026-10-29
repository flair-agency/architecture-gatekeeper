import test from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

function fixture(t) {
  const parent = mkdtempSync(join(realpathSync(tmpdir()), 'agk-collector-runtime-'));
  t.after(() => rmSync(parent, { recursive: true, force: true }));
  const copy = name => {
    const root = join(parent, name); mkdirSync(root);
    cpSync(new URL('../dist/', import.meta.url), join(root, 'dist'), { recursive: true });
    cpSync(new URL('../package.json', import.meta.url), join(root, 'package.json'));
    const directory = join(parent, `${name}-records`); mkdirSync(directory, { mode: 0o700 });
    return { root, directory };
  };
  return { copy };
}
function observe({ root, directory }) {
  const module = new URL(`file://${join(root, 'dist/measurement.mjs')}`).href;
  const script = `import {beginMeasurement,loadMeasurementDirectory,redactMeasurement} from ${JSON.stringify(module)};const a=beginMeasurement({route:'manual',cwd:process.cwd(),directory:process.env.AGK_MEASUREMENT_DIR});a.finish({state:'completed'});console.log(JSON.stringify(loadMeasurementDirectory(process.env.AGK_MEASUREMENT_DIR).records.map(redactMeasurement)));`;
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], { cwd: root, env: { ...process.env, AGK_MEASUREMENT_DIR: directory }, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  return { records: JSON.parse(result.stdout), stderr: result.stderr };
}

test('collector identity is stable across relocated complete installations and every exported phase', t => {
  const { copy } = fixture(t); const first = observe(copy('first')); const second = observe(copy('relocated'));
  assert.equal(first.records.length, 2); assert.equal(first.records[0].runtime.version, second.records[0].runtime.version);
  const digest = first.records[0].runtime.collectorSha256; assert.match(digest, /^[a-f0-9]{64}$/);
  for (const record of [...first.records, ...second.records]) assert.equal(record.runtime.collectorSha256, digest);
});

for (const path of ['diagnostic-path.mjs', 'io/read-descriptor.mjs', 'measurement-consistency.mjs', 'local-review/local-gate.mjs', 'native-review.mjs', 'native-session-paths.mjs', 'measurement-ci.mjs', 'measurement-ci-jobs.mjs', 'authority-validation/json-schema.mjs']) {
  test(`collector digest changes when installed dependency/adapter changes: ${path}`, t => {
    const { copy } = fixture(t); const baseline = observe(copy('baseline')); const changed = copy('changed');
    const file = join(changed.root, 'dist', path); writeFileSync(file, readFileSync(file, 'utf8') + '\n// isolated identity mutation\n');
    const actual = observe(changed); assert.equal(actual.records.length, 2);
    assert.equal(actual.records[0].runtime.version, baseline.records[0].runtime.version);
    assert.notEqual(actual.records[0].runtime.collectorSha256, baseline.records[0].runtime.collectorSha256);
    assert.equal(actual.records[1].runtime.collectorSha256, actual.records[0].runtime.collectorSha256);
  });
}

for (const fault of ['oversized', 'total-byte-limit', 'entry-limit', 'depth-limit', 'symlink']) {
  test(`unavailable bounded collector inventory remains a recording gap: ${fault}`, t => {
    const { copy } = fixture(t); const selected = copy('fault'); const dist = join(selected.root, 'dist');
    if (fault === 'oversized') writeFileSync(join(dist, 'unloaded.mjs'), 'x'.repeat(256 * 1024 + 1));
    if (fault === 'total-byte-limit') for (let i = 0; i < 34; i++) writeFileSync(join(dist, `unloaded-${i}.mjs`), 'x'.repeat(256 * 1024));
    if (fault === 'entry-limit') for (let i = 0; i < 4097; i++) writeFileSync(join(dist, `unrelated-${i}`), '');
    if (fault === 'depth-limit') mkdirSync(join(dist, ...Array(9).fill('nested')), { recursive: true });
    if (fault === 'symlink') symlinkSync(join(dist, 'measurement.mjs'), join(dist, 'unloaded.mjs'));
    const result = observe(selected); assert.deepEqual(result.records, []); assert.match(result.stderr, /AGK measurement gap/);
  });
}

for (const route of ['manual', 'native']) {
  test(`resumption does not label a changed installed collector as the original: ${route}`, t => {
    const { copy } = fixture(t); const selected = copy('original');
    const module = new URL(`file://${join(selected.root, 'dist/measurement.mjs')}`).href;
    const requestPath = join(selected.root, 'host-request.json');
    const request = { requestId: 'a'.repeat(64), reviewedRevision: 'b'.repeat(40), prompt: 'fixture', schema: {}, reviewer: { model: 'fixture' } };
    const execute = source => {
      const r = spawnSync(process.execPath, ['--input-type=module', '-e', source], { cwd: selected.root, env: { ...process.env, AGK_MEASUREMENT_DIR: selected.directory }, encoding: 'utf8' });
      assert.equal(r.status, 0, r.stderr); return r;
    };
    const prepared = execute(`import {beginMeasurement,measurementDigest} from ${JSON.stringify(module)};const a=beginMeasurement({route:${JSON.stringify(route)},directory:process.env.AGK_MEASUREMENT_DIR,correlation:measurementDigest(${JSON.stringify(requestPath)})});a.request(${JSON.stringify(request)});console.log(a.id);`);
    const id = prepared.stdout.trim(); assert.match(id, /^[0-9a-f-]{36}$/);
    const resume = `import {resumeMeasurement,resumeNativeMeasurement,loadMeasurementDirectory} from ${JSON.stringify(module)};const a=${route === 'native' ? `resumeNativeMeasurement(${JSON.stringify(requestPath)},${JSON.stringify(request)})` : `resumeMeasurement(${JSON.stringify(id)},process.env.AGK_MEASUREMENT_DIR)`};console.log(JSON.stringify({id:a.id,records:loadMeasurementDirectory(process.env.AGK_MEASUREMENT_DIR).records}));`;
    assert.equal(JSON.parse(execute(resume).stdout).id, id);
    const dependency = join(selected.root, 'dist/diagnostic-path.mjs'); writeFileSync(dependency, readFileSync(dependency, 'utf8') + '\n// changed collector dependency\n');
    const rejected = execute(resume); const result = JSON.parse(rejected.stdout); assert.equal(result.id, null); assert.match(rejected.stderr, /AGK measurement gap/);
    assert.equal(result.records.length, 2); assert.ok(!result.records.some(r => r.phase === 'terminal'));
  });
}


test('typed source execution binds typed collector and adapter bytes', t => {
  const { copy } = fixture(t); const selected = copy('source');
  cpSync(new URL('../src/', import.meta.url), join(selected.root, 'src'), { recursive: true });
  const module = new URL(`file://${join(selected.root, 'src/measurement.mts')}`).href;
  const capture = () => {
    const script = `import {beginMeasurement,loadMeasurementDirectory,redactMeasurement} from ${JSON.stringify(module)};const a=beginMeasurement({route:'manual',directory:process.env.AGK_MEASUREMENT_DIR});a.finish();console.log(JSON.stringify(loadMeasurementDirectory(process.env.AGK_MEASUREMENT_DIR).records.map(redactMeasurement).filter(r=>r.attemptId===a.id)));`;
    const r = spawnSync(process.execPath, ['--experimental-strip-types', '--input-type=module', '-e', script], { cwd: selected.root, env: { ...process.env, AGK_MEASUREMENT_DIR: selected.directory }, encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr); const records = JSON.parse(r.stdout); assert.equal(records.length, 2); return records[0].runtime.collectorSha256;
  };
  const first = capture(); const path = join(selected.root, 'src/local-review/local-gate.mts'); writeFileSync(path, readFileSync(path, 'utf8') + '\n// typed adapter mutation\n');
  const changed = capture(); assert.notEqual(changed, first);
  const collector = join(selected.root, 'src/measurement.mts'); writeFileSync(collector, readFileSync(collector, 'utf8') + '\n// typed collector mutation\n'); assert.notEqual(capture(), changed);
});
