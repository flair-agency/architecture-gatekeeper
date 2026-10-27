import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, mkdtempSync, mkdirSync, readFileSync, rmSync, unlinkSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { capacityState, checkReviewCapacity, supportsPreparationFormatDigest } from '../scripts/review-capacity.mjs';

const toolRoot = fileURLToPath(new URL('../', import.meta.url));
const cli = join(toolRoot, 'scripts/review-capacity.mjs');
const runtimeFiles = [
  '.github/workflows/self-architecture-gate.yml', '.github/workflows/architecture-gate.yml',
  'src/authority-set.mts', 'src/resolve-ci-policy.mts', 'src/prepare-authority-set.mts',
  'src/preflight-authority-set-review.mts', 'src/prepare-review-context.mts',
  'src/authority-validation/authority-set.mts', 'src/authority-validation/resolve-ci-policy.mts',
  'src/authority-validation/prepare-authority-set.mts',
  'src/io/read-descriptor.mts',
  'src/authority-validation/preflight-authority-set-review.mts',
  'src/review-inputs/prepare-review-context.mts',
];
const sentinel = 'PRIVATE_CAPACITY_CONTENT_SENTINEL';
const calledWorkflow = '.github/workflows/architecture-gate.yml';
const currentCalledWorkflowSha256 = 'b43e548e66bd3aeaeacc56e611f96301faab21c7605d43d0e088a19aa6ea80db';
const preGuardCalledWorkflowSha256 = 'e0ba804c39a8ad52b875084c3f2c9a77edda261af1583558f08d74472ddd5906';
const previousCalledWorkflowSha256 = '237e6a6ba0baebc4a70e8190911bac60044636c2c9d5cf675aa253b5e5095b45';
const earlierCalledWorkflowSha256 = 'ecf6a70d7bffb73f152143dacd5d44a09a57a54c616fa4e3ed94117c89abb046';
const olderCalledWorkflowSha256 = '3bd669043e677fed4f79d43f8fbe40778aa5b82a4ebd95e50e31d949f00076f2';
const oldestCalledWorkflowSha256 = '65af7366c7cd8493ab836d1bf5a8b259e02d4fad71426e7c16b158693e64eebf';
const currentSelfWorkflowSha256 = 'a2cf546e9eb9e606bab39dd7432d9b01c46816490b76831a5ebf1ec9222259a1';
const adoptedBaseSelfWorkflowSha256 = 'ac9db4d9fe85aca79d48ee7d51fffc1ddb658b8a510cbf6dd96ef860dc0cb654';
const preConnectionSelfWorkflowSha256 = 'b3cd229184f6a90e4edd78ccc15d7a1c527c5c71ac99eb13030298eeba9e6412';
const git = (root, ...args) => execFileSync('git', ['--no-replace-objects', '-C', root, ...args], {
  encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env,
    GIT_AUTHOR_NAME: 'Capacity test', GIT_AUTHOR_EMAIL: 'capacity@example.invalid',
    GIT_COMMITTER_NAME: 'Capacity test', GIT_COMMITTER_EMAIL: 'capacity@example.invalid' },
}).trim();

function put(root, path, bytes) {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), bytes);
}

function fixture(t, { limit = 16_384, amendBase } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'agk-capacity-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  git(root, 'init', '-q');
  git(root, 'config', 'core.autocrlf', 'false');
  for (const path of runtimeFiles) put(root, path, readFileSync(join(toolRoot, path)));
  const policy = JSON.parse(readFileSync(join(toolRoot, '.codex/gatekeeper/ci-policy.json')));
  policy.branches.main.authorityLimits.maxPromptBytes = limit;
  const manifest = { version: 1, authorities: [{ id: 'architecture-contract', repository: 'self',
    revision: 'authority-revision', path: 'docs/authority.md' }] };
  put(root, '.codex/gatekeeper/ci-policy.json', JSON.stringify(policy));
  put(root, '.codex/gatekeeper/authorities.json', JSON.stringify(manifest));
  put(root, '.codex/gatekeeper/ci-prompt.md', `Instructions café 🧭 " \\ ${sentinel}\n`);
  put(root, 'docs/authority.md', `Complete authority 雪 " \\ ${sentinel}\n`);
  for (const name of ['ci-decision.schema.json', 'decision.validation.json']) {
    put(root, `.codex/gatekeeper/${name}`, readFileSync(join(toolRoot, `.codex/gatekeeper/${name}`)));
  }
  put(root, 'subject.md', 'before\n');
  amendBase?.({ root, policy, manifest });
  git(root, 'add', '.');
  git(root, 'commit', '-qm', 'protected input fixture');
  const base = git(root, 'rev-parse', 'HEAD');
  return { root, base, policy, manifest };
}

function candidate(f, changes = { 'subject.md': 'after 雪 " \\\n' }) {
  git(f.root, 'checkout', '-q', '--detach', f.base);
  for (const [path, bytes] of Object.entries(changes)) put(f.root, path, bytes);
  git(f.root, 'add', '.');
  git(f.root, 'commit', '-qm', 'candidate input fixture');
  const head = git(f.root, 'rev-parse', 'HEAD');
  git(f.root, 'checkout', '-q', '--detach', f.base);
  git(f.root, 'merge', '--no-ff', '-qm', 'local preview fixture', head);
  return { root: f.root, base: f.base, head, reviewed: git(f.root, 'rev-parse', 'HEAD') };
}

test('supports current and exact predecessor called-workflow fingerprints and rejects unknown drift', () => {
  assert.equal(createHash('sha256').update(readFileSync(join(toolRoot, calledWorkflow))).digest('hex'), currentCalledWorkflowSha256);
  assert.equal(supportsPreparationFormatDigest(calledWorkflow,
    '49554405ef79fbca9e85e7719189462594998bdb47b2b04d25cafd28b093e159', currentCalledWorkflowSha256), true);
  assert.equal(supportsPreparationFormatDigest('src/authority-validation/resolve-ci-policy.mts',
    'cdaae106b4ff0e10b39cb5831b32a590ff5c94f32dcccd9c1ccf96064a652ae2',
    createHash('sha256').update(readFileSync(join(toolRoot, 'src/authority-validation/resolve-ci-policy.mts'))).digest('hex')), true);
  assert.equal(supportsPreparationFormatDigest(calledWorkflow, preGuardCalledWorkflowSha256, currentCalledWorkflowSha256), true);
  assert.equal(supportsPreparationFormatDigest(calledWorkflow, 'b0411a1b5d21741e9c1233f1c4dd9163c27436caf415acb15b1eed9866f92fe0', currentCalledWorkflowSha256), true);
  const selfWorkflow = '.github/workflows/self-architecture-gate.yml';
  assert.equal(createHash('sha256').update(readFileSync(join(toolRoot, selfWorkflow))).digest('hex'), currentSelfWorkflowSha256);
  assert.equal(supportsPreparationFormatDigest(selfWorkflow, currentSelfWorkflowSha256, currentSelfWorkflowSha256), true);
  assert.equal(supportsPreparationFormatDigest(selfWorkflow, adoptedBaseSelfWorkflowSha256, currentSelfWorkflowSha256), true);
  assert.equal(supportsPreparationFormatDigest(selfWorkflow, preConnectionSelfWorkflowSha256, currentSelfWorkflowSha256), true);
  assert.equal(supportsPreparationFormatDigest(selfWorkflow, 'f'.repeat(64), currentSelfWorkflowSha256), false);
  assert.equal(supportsPreparationFormatDigest(selfWorkflow, adoptedBaseSelfWorkflowSha256, 'f'.repeat(64)), false);
  assert.equal(supportsPreparationFormatDigest(calledWorkflow, currentCalledWorkflowSha256,
    currentCalledWorkflowSha256), true);
  assert.equal(supportsPreparationFormatDigest(calledWorkflow, previousCalledWorkflowSha256,
    currentCalledWorkflowSha256), true);
  assert.equal(supportsPreparationFormatDigest(calledWorkflow, earlierCalledWorkflowSha256,
    currentCalledWorkflowSha256), true);
  assert.equal(supportsPreparationFormatDigest(calledWorkflow, olderCalledWorkflowSha256,
    currentCalledWorkflowSha256), true);
  assert.equal(supportsPreparationFormatDigest(calledWorkflow, oldestCalledWorkflowSha256,
    currentCalledWorkflowSha256), true);
  assert.equal(supportsPreparationFormatDigest(calledWorkflow, 'f'.repeat(64), currentCalledWorkflowSha256), false);
  assert.equal(supportsPreparationFormatDigest(calledWorkflow, earlierCalledWorkflowSha256,
    'f'.repeat(64)), false);
  assert.equal(supportsPreparationFormatDigest(selfWorkflow,
    earlierCalledWorkflowSha256, currentSelfWorkflowSha256), false);
});

test('preparation fingerprints pin the preparer and helper while retaining the exact pre-helper format', () => {
  const preparer = 'src/authority-validation/prepare-authority-set.mts';
  const helper = 'src/io/read-descriptor.mts';
  const previousPreparer = '9bce34d75aa8b4d414a089f042616cabb2dd1ac331fcfbe70a43afff304e9dae';
  const preparerBytes = readFileSync(join(toolRoot, preparer));
  const helperBytes = readFileSync(join(toolRoot, helper));
  const digest = bytes => createHash('sha256').update(bytes).digest('hex');
  assert.equal(supportsPreparationFormatDigest(preparer, digest(preparerBytes), digest(preparerBytes)), true);
  assert.equal(supportsPreparationFormatDigest(preparer, previousPreparer, digest(preparerBytes)), true);
  assert.equal(supportsPreparationFormatDigest(preparer, 'f'.repeat(64), digest(preparerBytes)), false);
  assert.equal(supportsPreparationFormatDigest(helper, digest(helperBytes), digest(helperBytes)), true);
  assert.equal(supportsPreparationFormatDigest(helper, 'f'.repeat(64), digest(helperBytes)), false);
  assert.equal(supportsPreparationFormatDigest(helper, digest(helperBytes), 'f'.repeat(64)), false);
});

async function production(t, f, input) {
  const temp = mkdtempSync(join(tmpdir(), 'agk-capacity-production-'));
  t.after(() => rmSync(temp, { recursive: true, force: true }));
  const outputDir = join(temp, 'architecture-gate-authority-set');
  const limits = f.policy.branches.main.authorityLimits;
  const env = { ...process.env, RUNNER_TEMP: temp, GITHUB_WORKSPACE: f.root,
    GITHUB_REPOSITORY: 'flair-agency/architecture-gatekeeper', BASE_SHA: input.base,
    HEAD_SHA: input.head, REVIEWED_SHA: input.reviewed, AUTHORITY_ROUTE_SELECTED: 'true',
    AUTHORITY_LIMITS_BASE64: Buffer.from(JSON.stringify(limits)).toString('base64'),
    AUTHORITY_PROFILE: 'v1', POLICY_VERSION: '' };
  const run = (name, args = []) => execFileSync(process.execPath, [join(toolRoot, 'dist', name), ...args], {
    cwd: f.root, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 30_000,
  });
  const manifestPath = join(temp, 'architecture-gate-authorities.json');
  writeFileSync(manifestPath, JSON.stringify(f.manifest), { flag: 'wx', mode: 0o600 });
  // Exercise the same CLI's decoded/validated selection as protected CI, rather
  // than supplying a raw test-policy object directly to the preparer API.
  run('prepare-authority-set.mjs', ['--manifest', manifestPath, '--limits-base64', env.AUTHORITY_LIMITS_BASE64,
    '--self-repository', env.GITHUB_REPOSITORY, '--self-root', f.root, '--authority-sha', input.base,
    '--output-dir', outputDir]);
  const promptPath = join(temp, 'architecture-gate-complete-prompt.md');
  writeFileSync(promptPath, Buffer.concat([
    execFileSync('git', ['--no-replace-objects', '-C', f.root, 'show', `${f.base}:.codex/gatekeeper/ci-prompt.md`]),
    readFileSync(join(outputDir, 'authority-prompt.md')),
  ]), { flag: 'wx', mode: 0o600 });
  const result = JSON.parse(run('prepare-review-context.mjs'));
  return { result, bytes: readFileSync(join(temp, 'architecture-gate-review-prompt.md')) };
}

test('exact pre-helper preparer bases retain their former format with absent or unused helper files', async t => {
  const oldPreparer = readFileSync(join(toolRoot,
    'test/fixtures/review-capacity/pre-helper-preparer.mts.txt'));
  const oldDigest = '9bce34d75aa8b4d414a089f042616cabb2dd1ac331fcfbe70a43afff304e9dae';
  for (const helperMode of ['absent', 'unused']) {
    const f = fixture(t, { amendBase: ({ root }) => {
      put(root, 'src/authority-validation/prepare-authority-set.mts', oldPreparer);
      if (helperMode === 'absent') rmSync(join(root, 'src/io/read-descriptor.mts'));
      else put(root, 'src/io/read-descriptor.mts', 'unused legacy helper bytes\n');
    } });
    const input = candidate(f);
    const report = await checkReviewCapacity(input);
    assert.equal(report.state, 'fit', helperMode);
    assert.equal(report.measurement.exact, true, helperMode);
    assert.equal(report.policy.formatDigests['src/authority-validation/prepare-authority-set.mts'], oldDigest);
    assert.equal(Object.hasOwn(report.policy.formatDigests, 'src/io/read-descriptor.mts'), false, helperMode);
    const actual = await production(t, f, input);
    assert.equal(report.measurement.totalBytes, actual.bytes.length, helperMode);
    assert.equal(report.measurement.promptSha256, createHash('sha256').update(actual.bytes).digest('hex'), helperMode);
  }
});

test('current preparer bases require the exact helper and unknown preparers remain undetermined', async t => {
  const cases = [
    ['missing helper', ({ root }) => rmSync(join(root, 'src/io/read-descriptor.mts'))],
    ['drifted helper', ({ root }) => put(root, 'src/io/read-descriptor.mts', 'changed helper bytes\n')],
    ['unknown preparer', ({ root }) => put(root, 'src/authority-validation/prepare-authority-set.mts', 'changed preparer bytes\n')],
  ];
  for (const [label, amendBase] of cases) {
    const f = fixture(t, { amendBase });
    const report = await checkReviewCapacity(candidate(f));
    assert.equal(report.state, 'undetermined', label);
    assert.equal(report.measurement.exact, false, label);
    assert.equal(report.measurement.totalBytes, null, label);
    assert.equal(report.measurement.remainingBytes, null, label);
  }
});

test('local helper pin is enforced even when the base uses the exact pre-helper preparer', t => {
  const oldPreparer = readFileSync(join(toolRoot,
    'test/fixtures/review-capacity/pre-helper-preparer.mts.txt'));
  const f = fixture(t, { amendBase: ({ root }) => {
    put(root, 'src/authority-validation/prepare-authority-set.mts', oldPreparer);
    rmSync(join(root, 'src/io/read-descriptor.mts'));
  } });
  const input = candidate(f);
  const copy = mkdtempSync(join(tmpdir(), 'agk-capacity-tool-copy-'));
  t.after(() => rmSync(copy, { recursive: true, force: true }));
  cpSync(join(toolRoot, 'src'), join(copy, 'src'), { recursive: true });
  for (const path of runtimeFiles.filter(path => path.startsWith('.github/'))) {
    put(copy, path, readFileSync(join(toolRoot, path)));
  }
  mkdirSync(join(copy, 'scripts'));
  cpSync(cli, join(copy, 'scripts/review-capacity.mjs'));
  symlinkSync(join(toolRoot, 'node_modules'), join(copy, 'node_modules'), 'dir');
  writeFileSync(join(copy, 'src/io/read-descriptor.mts'),
    `${readFileSync(join(toolRoot, 'src/io/read-descriptor.mts'), 'utf8')}\n// drifted local helper\n`);
  const run = spawnSync(process.execPath, [join(copy, 'scripts/review-capacity.mjs'), '--base', input.base,
    '--head', input.head],
    { cwd: f.root, encoding: 'utf8', timeout: 30_000 });
  assert.equal(run.status, 2, run.stderr);
  const report = JSON.parse(run.stdout);
  assert.equal(report.state, 'undetermined');
  assert.equal(report.reason, 'unsupported-preparation-format');
  assert.equal(report.measurement.exact, false);
  assert.equal(report.measurement.totalBytes, null);
  assert.equal(report.measurement.remainingBytes, null);
});

test('measures actual production-prepared UTF-8/escaped input and redacts private payloads', async t => {
  const f = fixture(t);
  const input = candidate(f, { 'subject.md': 'after 雪 " \\\n', 'line\nname.md': 'new path\n' });
  const report = await checkReviewCapacity(input);
  assert.equal(report.policy.formatDigests['src/authority-validation/prepare-authority-set.mts'],
    createHash('sha256').update(readFileSync(join(toolRoot, 'src/authority-validation/prepare-authority-set.mts'))).digest('hex'));
  assert.equal(report.policy.formatDigests['src/io/read-descriptor.mts'],
    createHash('sha256').update(readFileSync(join(toolRoot, 'src/io/read-descriptor.mts'))).digest('hex'));
  const actual = await production(t, f, input);
  assert.equal(report.state, 'fit');
  assert.equal(report.measurement.exact, true);
  assert.equal(report.measurement.totalBytes, actual.bytes.length);
  assert.equal(report.measurement.totalBytes, actual.result.finalPromptBytes);
  assert.equal(report.measurement.promptSha256, createHash('sha256').update(actual.bytes).digest('hex'));
  assert.equal(report.policy.maxPromptBytes, actual.result.maxPromptBytes);
  assert.equal(Object.values(report.measurement.components).reduce((a, b) => a + b), actual.bytes.length);
  assert.equal(report.measurement.schema.countedInPromptLimit, false);
  assert.equal(report.measurement.schema.bytes, readFileSync(join(f.root, '.codex/gatekeeper/ci-decision.schema.json')).length);
  assert.equal(report.measurement.changedPathCount, 2);
  assert.deepEqual(report.measurement.publicChangedFileContributors, []);
  assert.doesNotMatch(JSON.stringify(report), new RegExp(`${sentinel}|${f.root}|line\\\\nname`));
});

test('rebinds changed candidates and protected policy limits; exact hard-limit boundaries agree with prepare', async t => {
  const f = fixture(t);
  const first = candidate(f);
  const a = await checkReviewCapacity(first);
  const second = candidate(f, { 'subject.md': 'a different candidate\n'.repeat(25) });
  const b = await checkReviewCapacity(second);
  assert.notEqual(a.scope.headSha, b.scope.headSha);
  assert.notEqual(a.measurement.promptSha256, b.measurement.promptSha256);
  assert.ok(b.measurement.totalBytes > a.measurement.totalBytes);
  for (const delta of [-1, 0, 1]) {
    const policyFixture = fixture(t, { limit: a.measurement.totalBytes + delta });
    const input = candidate(policyFixture);
    const measured = await checkReviewCapacity(input);
    assert.equal(measured.measurement.totalBytes, a.measurement.totalBytes);
    assert.equal(measured.policy.maxPromptBytes, a.measurement.totalBytes + delta);
    assert.equal(measured.measurement.remainingBytes, delta);
    assert.equal(measured.state, delta === -1 ? 'exceeded' : 'approaching-limit');
    assert.notEqual(measured.policy.sha256, a.policy.sha256);
    if (delta < 0) await assert.rejects(() => production(t, policyFixture, input), /final review prompt including task context exceeds/);
    else assert.equal((await production(t, policyFixture, input)).result.finalPromptBytes, measured.measurement.totalBytes);
  }
});

test('advisory threshold and hard limit have separate exact integer boundaries', () => {
  assert.equal(capacityState(899, 1000), 'fit');
  assert.equal(capacityState(900, 1000), 'approaching-limit');
  assert.equal(capacityState(999, 1000), 'approaching-limit');
  assert.equal(capacityState(1000, 1000), 'approaching-limit');
  assert.equal(capacityState(1001, 1000), 'exceeded');
  assert.equal(capacityState(NaN, 1000), 'undetermined');
});

test('unresolved or unsupported preparation never reports fit or an exact partial total', async t => {
  const cases = [
    ['missing-authority', ({ root }) => rmSync(join(root, 'docs/authority.md'))],
    ['invalid-policy', ({ root }) => put(root, '.codex/gatekeeper/ci-policy.json', '{"version":2}')],
    ['missing-limit', ({ root, policy }) => {
      delete policy.branches.main.authorityLimits.maxPromptBytes;
      put(root, '.codex/gatekeeper/ci-policy.json', JSON.stringify(policy));
    }],
    ['changed-format', ({ root }) => put(root, '.github/workflows/architecture-gate.yml', 'unsupported: true\n')],
    ['external-authority', ({ root, manifest }) => {
      manifest.authorities[0].repository = 'example/private-authority';
      manifest.authorities[0].revision = 'a'.repeat(40);
      put(root, '.codex/gatekeeper/authorities.json', JSON.stringify(manifest));
    }],
  ];
  for (const [name, amendBase] of cases) {
    const f = fixture(t, { amendBase });
    const report = await checkReviewCapacity(candidate(f));
    assert.equal(report.state, 'undetermined', name);
    assert.equal(report.measurement.exact, false, name);
    assert.equal(report.measurement.totalBytes, null, name);
    assert.equal(report.measurement.remainingBytes, null, name);
    assert.ok(report.reason, name);
    assert.doesNotMatch(JSON.stringify(report), new RegExp(`${sentinel}|${f.root}`));
  }
  const f = fixture(t, { limit: 4096 });
  const oversizedInput = candidate(f, { 'subject.md': 'long documentation 雪\n'.repeat(1000) });
  const overReadBound = await checkReviewCapacity(oversizedInput);
  assert.equal(overReadBound.state, 'exceeded');
  assert.equal(overReadBound.reason, 'diff-lower-bound-exceeds-limit');
  assert.deepEqual(overReadBound.measurement, { exact: false, totalBytes: null, remainingBytes: null,
    lowerBoundBytes: overReadBound.measurement.lowerBoundBytes, stage: 'diff' });
  assert.ok(overReadBound.measurement.lowerBoundBytes > f.policy.branches.main.authorityLimits.maxPromptBytes);
  assert.doesNotMatch(JSON.stringify(overReadBound), new RegExp(`${sentinel}|long documentation|${f.root}`));
  await assert.rejects(() => production(t, f, oversizedInput),
    /exact committed base-to-reviewed-merge paths or diff are unavailable or exceed the output bound|final review prompt including task context exceeds/);
  const larger = fixture(t, { limit: 100_000 });
  const largerInput = candidate(larger, { 'subject.md': 'long documentation 雪\n'.repeat(1000) });
  const completeReport = await checkReviewCapacity(largerInput);
  const prepared = await production(t, larger, largerInput);
  assert.equal(completeReport.measurement.exact, true);
  assert.ok(overReadBound.measurement.lowerBoundBytes <= prepared.bytes.length);
  assert.ok(prepared.bytes.length, 'larger selected policy permits full production preparation');

  const prefixSource = fixture(t);
  const prefixReport = await checkReviewCapacity(candidate(prefixSource));
  const prefixComponents = prefixReport.measurement.components;
  const prefixLimit = Math.max(prefixComponents.instructionsBytes, prefixComponents.authorityPromptBytes);
  assert.ok(prefixComponents.instructionsBytes + prefixComponents.authorityPromptBytes > prefixLimit);
  const prefixFixture = fixture(t, { limit: prefixLimit });
  const prefix = await checkReviewCapacity(candidate(prefixFixture));
  assert.equal(prefix.state, 'exceeded');
  assert.equal(prefix.reason, 'prepared-prefix-exceeds-limit');
  assert.equal(prefix.measurement.stage, 'prepared-prefix');
  assert.equal(prefix.measurement.lowerBoundBytes, prefixComponents.instructionsBytes + prefixComponents.authorityPromptBytes);
  assert.equal(prefix.measurement.totalBytes, null);
  await assert.rejects(() => production(t, prefixFixture, candidate(prefixFixture)),
    /selected prompt must be a bounded regular file/);

  const manyPaths = Object.fromEntries(Array.from({ length: 60 }, (_, index) =>
    [`path-${String(index).padStart(2, '0')}-${'x'.repeat(80)}.md`, 'content\n']));
  const pathLow = fixture(t, { limit: 4096 });
  const pathInput = candidate(pathLow, manyPaths);
  const pathReport = await checkReviewCapacity(pathInput);
  assert.equal(pathReport.state, 'exceeded');
  assert.equal(pathReport.reason, 'changed-path-list-lower-bound-exceeds-limit');
  assert.equal(pathReport.measurement.stage, 'changed-path-list');
  assert.ok(pathReport.measurement.lowerBoundBytes > pathLow.policy.branches.main.authorityLimits.maxPromptBytes);
  const pathHigh = fixture(t, { limit: 100_000 });
  const pathHighInput = candidate(pathHigh, manyPaths);
  const pathPrepared = await production(t, pathHigh, pathHighInput);
  assert.ok(pathReport.measurement.lowerBoundBytes <= pathPrepared.bytes.length);

  for (const [label, content] of [
    ['invalid UTF-8', Buffer.concat([Buffer.from('start\n'), Buffer.from([0xff]), Buffer.from('x'.repeat(12_000))])],
    ['NUL', Buffer.concat([Buffer.from('start\n\0'), Buffer.from('x'.repeat(12_000))])],
  ]) {
    const malformed = fixture(t, { limit: 4096 });
    const malformedReport = await checkReviewCapacity(candidate(malformed, { 'subject.md': content }));
    assert.equal(malformedReport.state, 'undetermined', label);
    assert.equal(malformedReport.measurement.exact, false, label);
    assert.equal(malformedReport.measurement.totalBytes, null, label);
    assert.equal(malformedReport.measurement.remainingBytes, null, label);
    assert.equal(malformedReport.measurement.lowerBoundBytes, undefined, label);
  }
  const input = candidate(f);
  assert.equal((await checkReviewCapacity({ ...input, base: 'missing-revision' })).state, 'undetermined');
  assert.equal((await checkReviewCapacity({ ...input, reviewed: input.head })).reason, 'invalid-merge-binding');
});

test('capacity-risk documentation can be independently scoped before expensive verification', async t => {
  const f = fixture(t, { limit: 6500 });
  const line = 'investigation "quoted" \\ notes 雪\n';
  const initial = await checkReviewCapacity({ ...candidate(f, {
    'docs/investigation.md': line.repeat(3), 'src/feature.mts': 'export const example = true;\n'.repeat(8),
  }), publicPaths: true });
  assert.equal(initial.state, 'fit');
  assert.equal(initial.measurement.publicChangedFileContributors[0].path, 'src/feature.mts');
  const growing = candidate(f, { 'docs/investigation.md': line.repeat(130), 'src/feature.mts': 'export const example = true;\n' });
  const large = await checkReviewCapacity({ ...growing, publicPaths: true });
  assert.equal(large.state, 'exceeded');
  assert.equal(large.measurement.exact, true);
  assert.equal(large.measurement.publicChangedFileContributors[0].path, 'docs/investigation.md');
  assert.ok(large.measurement.publicChangedFileContributors[0].serializedPatchBytes > large.measurement.publicChangedFileContributors[1].serializedPatchBytes);
  await assert.rejects(() => production(t, f, growing), /final review prompt including task context exceeds/);
  const examples = [{ scope: 'initial', state: initial.state, bytes: initial.measurement.totalBytes },
    { scope: 'growing-investigation', state: large.state, bytes: large.measurement.totalBytes }];
  for (const changes of [
    { 'src/feature.mts': 'export const example = true;\n' },
    { 'docs/investigation.md': line.repeat(50) },
  ]) {
    const input = candidate(f, changes);
    const report = await checkReviewCapacity({ ...input, publicPaths: true });
    assert.equal(report.state, 'fit');
    assert.equal(report.policy.sha256, large.policy.sha256);
    assert.equal(report.measurement.totalBytes, (await production(t, f, input)).result.finalPromptBytes);
    examples.push({ scope: Object.keys(changes)[0], state: report.state, bytes: report.measurement.totalBytes });
  }
  t.diagnostic(JSON.stringify({ modelledDevelopmentCheckpoint: examples, policyLimitBytes: 6500 }));
});

test('native overflow captures distinguish usable prefixes from incomplete or unrelated failures', async t => {
  const limit = 4096;
  const f = fixture(t, { limit });
  const input = candidate(f);
  const exact = await checkReviewCapacity(input);
  assert.equal(exact.state, 'fit');
  const prefixBytes = exact.measurement.components.instructionsBytes + exact.measurement.components.authorityPromptBytes;
  const asciiBytes = limit + 20;
  const path = 'p'.repeat(150);
  const completePaths = Buffer.from(`${path}\0`.repeat(40));
  const cases = [
    { name: 'partial trailing UTF-8 character', stage: 'diff',
      stdout: Buffer.concat([Buffer.alloc(asciiBytes, 0x61), Buffer.from([0xf0, 0x9f])]),
      lowerBound: prefixBytes + asciiBytes },
    { name: 'complete paths before a truncated record', stage: 'changed-path-list',
      stdout: Buffer.concat([completePaths, Buffer.from('unmeasured tail')]),
      lowerBound: prefixBytes + 40 * (150 + 2) + 39 + 2 },
    { name: 'stderr-only overflow', stage: 'diff', stdout: Buffer.from('small stdout'),
      stderr: Buffer.alloc(asciiBytes, 0x61) },
    { name: 'different native error', stage: 'diff', stdout: Buffer.alloc(asciiBytes, 0x61), code: 'ETIMEDOUT' },
    { name: 'non-Buffer capture', stage: 'diff', stdout: 'a'.repeat(asciiBytes) },
    { name: 'no complete path record', stage: 'changed-path-list', stdout: Buffer.alloc(asciiBytes, 0x61) },
    { name: 'malformed complete path', stage: 'changed-path-list',
      stdout: Buffer.concat([Buffer.alloc(asciiBytes, 0x61), Buffer.from([0xff, 0])]) },
  ];
  for (const [index, value] of cases.entries()) {
    const marker = join(f.root, `capture-${index}`);
    const capture = { ...value, stdout: Buffer.isBuffer(value.stdout) ? value.stdout.toString('base64') : value.stdout,
      buffer: Buffer.isBuffer(value.stdout), stderr: value.stderr?.toString('base64') };
    // Fault-inject only the selected native Git capture; all revision, policy,
    // authority and schema acquisition still executes the real Git commands.
    const hook = `import cp from 'node:child_process';
import {syncBuiltinESMExports} from 'node:module'; import {writeFileSync} from 'node:fs';
const capture=${JSON.stringify(capture)}, original=cp.execFileSync;
cp.execFileSync=(command,args,options)=>{
  const selected=capture.stage==='diff'?'--text':'--name-only';
  if(command==='git'&&args.includes('diff')&&args.includes(selected)){
    writeFileSync(${JSON.stringify(marker)},capture.stage);
    throw Object.assign(new Error(${JSON.stringify(sentinel)}),{code:capture.code??'ENOBUFS',
      stdout:capture.buffer?Buffer.from(capture.stdout,'base64'):capture.stdout,
      stderr:Buffer.from(capture.stderr??'','base64')});
  }
  return original(command,args,options);
};syncBuiltinESMExports();`;
    const observed = spawnSync(process.execPath, ['--import', `data:text/javascript,${encodeURIComponent(hook)}`,
      cli, '--base', input.base, '--head', input.head], { cwd: f.root, encoding: 'utf8', timeout: 30_000 });
    assert.equal(readFileSync(marker, 'utf8'), value.stage, value.name);
    assert.equal(observed.stderr, '', value.name);
    const report = JSON.parse(observed.stdout);
    assert.equal(observed.status, value.lowerBound ? 1 : 2, value.name);
    assert.equal(report.state, value.lowerBound ? 'exceeded' : 'undetermined', value.name);
    assert.equal(report.measurement.exact, false, value.name);
    assert.equal(report.measurement.totalBytes, null, value.name);
    assert.equal(report.measurement.remainingBytes, null, value.name);
    assert.equal(report.measurement.lowerBoundBytes, value.lowerBound, value.name);
    assert.doesNotMatch(observed.stdout, new RegExp(`${sentinel}|${f.root}|unmeasured tail`), value.name);
  }
});

test('actual early CLI allows only Git subprocesses, no network/model dispatch, and has explicit exit states', t => {
  const f = fixture(t);
  const input = candidate(f);
  const hook = `import cp from 'node:child_process';
import http from 'node:http'; import https from 'node:https'; import net from 'node:net'; import tls from 'node:tls';
import {syncBuiltinESMExports} from 'node:module';
const deny=()=>{throw Error('Unexpected dispatch');}; const run=cp.execFileSync;
cp.execFileSync=(command,...args)=>{if(command!=='git')deny();return run(command,...args);};
for(const name of ['exec','execSync','execFile','spawn','spawnSync','fork'])cp[name]=deny;
http.request=http.get=https.request=https.get=net.connect=net.createConnection=tls.connect=deny;
globalThis.fetch=deny;syncBuiltinESMExports();`;
  const run = args => spawnSync(process.execPath, ['--import', `data:text/javascript,${encodeURIComponent(hook)}`, cli, ...args], {
    cwd: f.root, encoding: 'utf8', timeout: 30_000, env: { ...process.env,
      OPENAI_API_KEY: sentinel, GATEKEEPER_SOURCE_TOKEN: sentinel },
  });
  const good = run(['--base', input.base, '--head', input.head]);
  assert.equal(good.status, 0, good.stderr);
  assert.equal(JSON.parse(good.stdout).state, 'fit');
  assert.equal(good.stderr, '');
  assert.doesNotMatch(good.stdout, new RegExp(`${sentinel}|${f.root}`));
  const unknown = run(['--base', 'missing', '--head', input.head]);
  assert.equal(unknown.status, 2);
  assert.equal(JSON.parse(unknown.stdout).state, 'undetermined');
  const oversized = candidate(f, { 'subject.md': 'private oversized context\n'.repeat(1000) });
  const exceeded = run(['--base', oversized.base, '--head', oversized.head]);
  assert.equal(exceeded.status, 1);
  const exceededReport = JSON.parse(exceeded.stdout);
  assert.equal(exceededReport.state, 'exceeded');
  assert.equal(exceededReport.measurement.exact, false);
  assert.equal(exceededReport.measurement.totalBytes, null);
  assert.equal(exceededReport.measurement.remainingBytes, null);
  assert.ok(Number.isSafeInteger(exceededReport.measurement.lowerBoundBytes));
  assert.doesNotMatch(exceeded.stdout, new RegExp(`${sentinel}|private oversized context|${f.root}`));
  const invalid = run(['--limit', '999999999']);
  assert.equal(invalid.status, 2);
  assert.equal(JSON.parse(invalid.stdout).reason, 'invalid-arguments');
});


test('capacity recognizes the same preparation with pre-migration source facades', async t => {
  const facades = JSON.parse(readFileSync(join(toolRoot, 'test/fixtures/review-capacity/pre-typescript-facades.json'), 'utf8'));
  const f = fixture(t, { amendBase({ root }) {
    for (const [path, source] of Object.entries(facades)) {
      unlinkSync(join(root, path.replace(/\.mjs$/, '.mts')));
      put(root, path, source);
    }
  } });
  const report = await checkReviewCapacity(candidate(f));
  assert.equal(report.state, 'fit', JSON.stringify(report));
});
