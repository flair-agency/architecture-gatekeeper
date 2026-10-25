import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync, renameSync, symlinkSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { prepareSelfAmendmentPr, validateSelfAmendmentPrDecision, verifySelfAmendmentSquashReadback } from '../dist/self-amendment-pr.mjs';
const repository = 'flair-agency/architecture-gatekeeper';
const policyPath = '.codex/gatekeeper/ci-policy.json';
const manifestPath = '.codex/gatekeeper/authorities.json';
const manifest = JSON.parse(readFileSync(new URL(`../${manifestPath}`, import.meta.url)));
const paths = manifest.authorities.map(member => member.path);
const limits = { maxManifestBytes: 16384, maxMembers: 16, maxFileBytes: 81920, maxTotalBytes: 262144, maxPromptBytes: 524288 };
const policy = { version: 2, default: { mode: 'local-only' }, branches: { main: { mode: 'enforced',
  model: 'gpt-6.1-sol', reasoningEffort: 'medium', authorityManifestPath: manifestPath, authorityLimits: limits,
  ownerAmendment: { version: 1, acceptance: 'protected-pr', scope: 'authority-only', maxPromptBytes: 524288 } } } };
const git = (cwd, ...args) => execFileSync('git', ['--no-replace-objects', ...args], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const write = (root, path, data) => { mkdirSync(join(root, path, '..'), { recursive: true }); writeFileSync(join(root, path), data); };
async function fixture(t, change = root => write(root, paths[1], '# Revised decision\n'), oldPolicy = policy, initialChange = () => {}) {
  const cwd = realpathSync(mkdtempSync(join(tmpdir(), 'self-amendment-pr-')));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  git(cwd, 'init', '-qb', 'main'); git(cwd, 'config', 'user.name', 'Test'); git(cwd, 'config', 'user.email', 'test@example.invalid');
  write(cwd, policyPath, JSON.stringify(oldPolicy)); write(cwd, manifestPath, JSON.stringify(manifest));
  for (const path of paths) write(cwd, path, `# Old ${path}\n`);
  initialChange(cwd);
  git(cwd, 'add', '.'); git(cwd, 'commit', '-qm', 'base'); const baseSha = git(cwd, 'rev-parse', 'HEAD');
  git(cwd, 'switch', '-qc', 'candidate'); change(cwd); git(cwd, 'add', '-A'); git(cwd, 'commit', '--allow-empty', '-qm', 'candidate');
  const headSha = git(cwd, 'rev-parse', 'HEAD'); git(cwd, 'switch', '-q', 'main'); git(cwd, 'merge', '--no-ff', '-qm', 'reviewed merge', headSha);
  return { cwd, repository, baseSha, headSha, reviewedSha: git(cwd, 'rev-parse', 'HEAD'), baseBranch: 'main', policyPath, purpose: 'Revise the existing decision' };
}
const decision = prepared => ({ version: 1, kind: 'owner-amendment-semantic-eligibility-decision', eligibility: 'ELIGIBLE',
  triggerProfile: 'owner-initiated-self-v1', authorityIds: prepared.authorityIds, authoritySetDigest: prepared.authoritySetDigest,
  checks: Object.fromEntries(JSON.parse(prepared.schemaBytes).properties.checks.required.map(key => [key, true])) });
const validate = (prepared, object) => validateSelfAmendmentPrDecision({ prepared, decisionBytes: Buffer.from(JSON.stringify(object)) });

test('any selected member alone is eligible input without root target, tag or historical review', async t => {
  for (const path of paths) {
    const f = await fixture(t, root => write(root, path, '# Revised\n'));
    const prepared = await prepareSelfAmendmentPr(f);
    assert.deepEqual(prepared.authorityIds, manifest.authorities.map(member => member.id));
    assert.equal(validate(prepared, decision(prepared)).eligibility, 'ELIGIBLE');
    assert.match(prepared.promptBytes.toString(), /untrusted data/);
    for (const oldPath of paths) assert.ok(prepared.promptBytes.includes(Buffer.from(`# Old ${oldPath}`)));
  }
});
test('ordinary/no changes, mixed implementation/configuration, A/D/R/mode and symlink reject', async t => {
  for (const change of [() => {}, root => write(root, 'code.mjs', 'export default 1;'),
    root => { write(root, paths[0], '# Revised'); write(root, 'code.mjs', 'x'); },
    root => write(root, policyPath, JSON.stringify(policy)),
    root => rmSync(join(root, paths[0])), root => renameSync(join(root, paths[0]), join(root, 'new.md')),
    root => chmodSync(join(root, paths[0]), 0o755),
    root => { rmSync(join(root, paths[0])); symlinkSync('architecture/authority-set.md', join(root, paths[0])); }]) {
    await assert.rejects(prepareSelfAmendmentPr(await fixture(t, change)));
  }
});
test('immutable base selection and exact merge bindings fail closed', async t => {
  const f = await fixture(t);
  for (const overrides of [{ baseSha: '0'.repeat(40) }, { headSha: 'bad' }, { reviewedSha: f.headSha },
    { policySha256: '0'.repeat(64) }, { repository: 'other/repo' }, { purpose: '' }]) await assert.rejects(prepareSelfAmendmentPr({ ...f, ...overrides }));
  await assert.rejects(prepareSelfAmendmentPr(await fixture(t, undefined, policy, root => rmSync(join(root, paths[5])))));
  const noRoute = structuredClone(policy); delete noRoute.branches.main.ownerAmendment;
  await assert.rejects(prepareSelfAmendmentPr(await fixture(t, root => { write(root, paths[0], '# Revised'); write(root, policyPath, JSON.stringify(policy)); }, noRoute)));
});
test('closed decision cannot reinterpret PASS, false checks, wrong IDs/digest or missing/extra/duplicate fields', async t => {
  const prepared = await prepareSelfAmendmentPr(await fixture(t));
  const valid = decision(prepared);
  for (const modify of [d => { d.eligibility = 'PASS'; }, d => { delete d.kind; }, d => { d.extra = true; },
    d => { d.authorityIds.reverse(); }, d => { d.authoritySetDigest = '0'.repeat(64); },
    d => { d.checks.materiallyAddressesTrigger = false; }, d => { delete d.checks.amendsOnlyTargetDecision; }]) {
    const d = structuredClone(valid); modify(d); assert.throws(() => validate(prepared, d));
  }
  assert.throws(() => validateSelfAmendmentPrDecision({ prepared, decisionBytes: Buffer.from('{"version":1,"version":1}') }));
  const d = structuredClone(valid); d.eligibility = 'INELIGIBLE'; d.checks.materiallyAddressesTrigger = false;
  assert.equal(validate(prepared, d).eligibility, 'INELIGIBLE');
  assert.equal(validate(prepared, valid).eligibility, 'ELIGIBLE');
});
test('squash readback requires exact base parent and reviewed tree', async t => {
  const f = await fixture(t); const prepared = await prepareSelfAmendmentPr(f);
  const tree = git(f.cwd, 'rev-parse', `${f.reviewedSha}^{tree}`);
  const adoptedSha = git(f.cwd, 'commit-tree', tree, '-p', f.baseSha, '-m', 'squash');
  assert.equal(verifySelfAmendmentSquashReadback({ prepared, cwd: f.cwd, adoptedSha }).status, 'VERIFIED_SQUASH_PLACEMENT');
  assert.throws(() => verifySelfAmendmentSquashReadback({ prepared, cwd: f.cwd, adoptedSha: f.reviewedSha }));
});

test('CLI refuses spoofed caller before reading Git or emitting outputs', () => {
  const result = spawnSync(process.execPath, ['scripts/self-amendment-pr.mjs', 'complete'], {
    cwd: new URL('..', import.meta.url), encoding: 'utf8', env: { PATH: process.env.PATH, POLICY_PATH: policyPath, POLICY_SHA256: '0'.repeat(64), DECISION: '{"eligibility":"ELIGIBLE"}' } });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /protected self caller metadata mismatch/);
  assert.equal(result.stdout, '');
});

test('protected same-run CLI prepares/completes and rejects verification before API on invalid context or credentials', async t => {
  const f = await fixture(t);
  const runner = join(f.cwd, 'runner-temp'); mkdirSync(runner);
  const outputPath = join(runner, 'github-output'); writeFileSync(outputPath, '');
  const eventPath = join(runner, 'event.json');
  const event = { number: 42, repository: { full_name: repository, id: 1379218762 }, pull_request: {
    number: 42, title: 'Revise existing decision', body: 'Proposed revision',
    base: { sha: f.baseSha, ref: 'main', repo: { full_name: repository } },
    head: { sha: f.headSha, repo: { full_name: repository } },
  } };
  writeFileSync(eventPath, JSON.stringify(event));
  const prepared = await prepareSelfAmendmentPr({ ...f, purpose: `${event.pull_request.title}\n\n${event.pull_request.body}` });
  const env = { PATH: process.env.PATH, RUNNER_TEMP: runner, GITHUB_OUTPUT: outputPath, GITHUB_WORKSPACE: f.cwd,
    GITHUB_REPOSITORY: repository, GITHUB_REPOSITORY_ID: '1379218762', GITHUB_EVENT_NAME: 'pull_request_target',
    GITHUB_EVENT_PATH: eventPath, GITHUB_WORKFLOW_REF: `${repository}/.github/workflows/self-architecture-gate.yml@refs/heads/main`,
    GITHUB_WORKFLOW_SHA: f.baseSha, GITHUB_SHA: f.baseSha, GITHUB_RUN_ID: '123', GITHUB_RUN_ATTEMPT: '1', GITHUB_JOB: 'amendment',
    GATEKEEPER_WORKFLOW_REPOSITORY: repository,
    GATEKEEPER_WORKFLOW_REF: `${repository}/.github/workflows/architecture-gate.yml@refs/heads/main`, GATEKEEPER_WORKFLOW_SHA: f.baseSha,
    BASE_SHA: f.baseSha, HEAD_SHA: f.headSha, REVIEWED_SHA: f.reviewedSha, POLICY_PATH: policyPath, POLICY_SHA256: prepared.policySha256 };
  const script = new URL('../scripts/self-amendment-pr.mjs', import.meta.url).pathname;
  const run = (mode, extra = {}) => spawnSync(process.execPath, [script, mode], { cwd: runner, env: { ...env, ...extra }, encoding: 'utf8' });
  const prepare = run('prepare'); assert.equal(prepare.status, 0, prepare.stderr);
  assert.equal(readFileSync(join(runner, 'self-amendment-pr/prompt.md')).equals(prepared.promptBytes), true);
  assert.equal(readFileSync(join(runner, 'self-amendment-pr/schema.json')).equals(prepared.schemaBytes), true);
  const complete = run('complete', { DECISION: JSON.stringify(decision(prepared)) }); assert.equal(complete.status, 0, complete.stderr);
  const outputs = Object.fromEntries(readFileSync(outputPath, 'utf8').trim().split('\n').map(line => { const i = line.indexOf('='); return [line.slice(0, i), line.slice(i + 1)]; }));
  assert.equal(outputs.eligibility, 'ELIGIBLE');
  const verifyEnv = { CONTEXT_SHA256: outputs.context_sha256, DECISION_BASE64: outputs.decision_base64 };
  const unavailable = run('verify', verifyEnv);
  assert.equal(unavailable.status, 1);
  assert.match(unavailable.stderr, /GH_TOKEN is required/);
  const stale = run('verify', { ...verifyEnv, CONTEXT_SHA256: '0'.repeat(64) });
  assert.equal(stale.status, 1); assert.match(stale.stderr, /same-run context mismatch/);
  const denied = decision(prepared); denied.eligibility = 'INELIGIBLE'; denied.checks.materiallyAddressesTrigger = false;
  const ineligible = run('verify', { ...verifyEnv, DECISION_BASE64: Buffer.from(JSON.stringify(denied)).toString('base64') });
  assert.equal(ineligible.status, 1); assert.match(ineligible.stderr, /amendment is ineligible/);
  assert.equal(run('verify', { ...verifyEnv, GITHUB_WORKFLOW_SHA: f.headSha }).status, 1);
  assert.equal(run('verify', { ...verifyEnv, PURPOSE: 'different claim' }).status, 1);
});

test('resulting complete Set rejects aggregate overflow even when each file and potential prompt fit', async t => {
  const f = await fixture(t, root => write(root, paths[5], 'y'.repeat(30_000)), policy,
    root => { for (const path of paths.slice(0, 4)) write(root, path, 'x'.repeat(60_000)); });
  // Old Set is approximately 240 KiB, every old/new file is below 80 KiB,
  // and the old Set plus changed before/after bytes plus small diff is below 512 KiB.
  // The new complete Set exceeds the independently selected 256 KiB aggregate bound.
  await assert.rejects(prepareSelfAmendmentPr(f), /maxTotalBytes|total bytes|total byte|total.*limit|total size/i);
});
