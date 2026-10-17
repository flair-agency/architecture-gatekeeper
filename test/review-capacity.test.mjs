import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { capacityState, checkReviewCapacity } from '../scripts/review-capacity.mjs';

const toolRoot = fileURLToPath(new URL('../', import.meta.url));
const cli = join(toolRoot, 'scripts/review-capacity.mjs');
const runtimeFiles = [
  '.github/workflows/self-architecture-gate.yml', '.github/workflows/architecture-gate.yml',
  'src/authority-set.mjs', 'src/resolve-ci-policy.mjs', 'src/prepare-authority-set.mjs',
  'src/preflight-authority-set-review.mjs', 'src/prepare-review-context.mjs',
  'src/authority-validation/authority-set.mts', 'src/authority-validation/resolve-ci-policy.mts',
  'src/authority-validation/prepare-authority-set.mts',
  'src/authority-validation/preflight-authority-set-review.mts',
  'src/review-inputs/prepare-review-context.mts',
];
const sentinel = 'PRIVATE_CAPACITY_CONTENT_SENTINEL';
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

test('measures actual production-prepared UTF-8/escaped input and redacts private payloads', async t => {
  const f = fixture(t);
  const input = candidate(f, { 'subject.md': 'after 雪 " \\\n', 'line\nname.md': 'new path\n' });
  const report = await checkReviewCapacity(input);
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
  const overReadBound = await checkReviewCapacity(candidate(f, { 'subject.md': 'long documentation\n'.repeat(1000) }));
  assert.equal(overReadBound.state, 'undetermined');
  assert.equal(overReadBound.measurement.totalBytes, null);
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
  const invalid = run(['--limit', '999999999']);
  assert.equal(invalid.status, 2);
  assert.equal(JSON.parse(invalid.stdout).reason, 'invalid-arguments');
});
