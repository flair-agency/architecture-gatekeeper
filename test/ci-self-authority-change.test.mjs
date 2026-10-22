import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, renameSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { materializeAuthoritySet } from '../dist/authority-set.mjs';
import { inspectSelfAuthorityChanges } from '../dist/ci-self-authority-change.mjs';
import { assertEnforcedAcceptance } from '../dist/ci-enforced-acceptance.mjs';
import { parseWorkflow } from './helpers/workflow-structure.mjs';

const repository = 'flair-agency/architecture-gatekeeper';
const policyPath = '.codex/gatekeeper/ci-policy.json';
const manifestPath = '.codex/gatekeeper/authorities.json';
const manifest = JSON.parse(readFileSync(new URL(`../${manifestPath}`, import.meta.url)));
const paths = manifest.authorities.map(member => member.path);
const limits = { maxManifestBytes: 16384, maxMembers: 16, maxFileBytes: 81920, maxTotalBytes: 262144, maxPromptBytes: 524288 };
const policy = { version: 2, default: { mode: 'local-only' }, branches: { main: {
  mode: 'enforced', model: 'gpt-6.1-sol', reasoningEffort: 'medium', authorityManifestPath: manifestPath, authorityLimits: limits } } };
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const git = (root, ...args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const write = (root, path, content) => { mkdirSync(join(root, path, '..'), { recursive: true }); writeFileSync(join(root, path), content); };
async function fixture(t, change = root => write(root, 'code.txt', 'new code\n')) {
  const cwd = mkdtempSync(join(tmpdir(), 'self-authority-'));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  git(cwd, 'init', '-q', '-b', 'main'); git(cwd, 'config', 'user.name', 'Test'); git(cwd, 'config', 'user.email', 'test@example.invalid');
  write(cwd, policyPath, JSON.stringify(policy)); write(cwd, manifestPath, JSON.stringify(manifest));
  for (const path of paths) write(cwd, path, `# Old ${path}\n`);
  write(cwd, 'unselected.md', '# Not selected\n');
  git(cwd, 'add', '.'); git(cwd, 'commit', '-qm', 'old protected inputs');
  const baseSha = git(cwd, 'rev-parse', 'HEAD');
  const old = await materializeAuthoritySet({ manifestBytes: Buffer.from(JSON.stringify(manifest)), limits,
    selfRepository: repository, selfRoot: cwd, authorityRevision: baseSha });
  const provenance = { version: 1, selfRepository: repository, authorityRevision: baseSha,
    manifestSha256: old.manifestSha256, setDigest: old.setDigest, members: old.members.map(({ content, ...member }) => member) };
  git(cwd, 'switch', '-qc', 'candidate'); change(cwd); git(cwd, 'add', '-A'); git(cwd, 'commit', '-qm', 'candidate');
  const headSha = git(cwd, 'rev-parse', 'HEAD');
  git(cwd, 'switch', '-q', 'main'); git(cwd, 'merge', '--no-ff', '-qm', 'reviewed merge', headSha);
  return { cwd, repository, baseSha, headSha, reviewedSha: git(cwd, 'rev-parse', 'HEAD'), baseBranch: 'main',
    policyPath, policySha256: hash(Buffer.from(JSON.stringify(policy))), provenance };
}
const accept = changed => assertEnforcedAcceptance({ reviewResult: 'success', conclusion: 'PASS',
  selfAuthorityCheckRequired: 'true', selectedAuthorityChanged: String(changed) });

test('ordinary code PASS uses complete old six-member selection, not dirty worktree inputs', async t => {
  const f = await fixture(t);
  write(f.cwd, manifestPath, '{invalid candidate/worktree manifest');
  write(f.cwd, paths[0], 'uncommitted change');
  assert.equal((await inspectSelfAuthorityChanges(f)).changed, false);
  assert.deepEqual(accept(false), { route: 'ordinary-pass' });
});

test('false model PASS rejects modifications to each of the six old Authority members', async t => {
  for (const path of paths) {
    const f = await fixture(t, root => write(root, path, 'Changed norm\n'));
    const result = await inspectSelfAuthorityChanges(f);
    assert.deepEqual(result.paths, [path]);
    assert.throws(() => accept(result.changed), /ordinary PASS cannot accept/);
  }
});

test('deleted, renamed, replaced and mode-changed Authority cannot disappear from the comparison', async t => {
  for (const change of [
    root => rmSync(join(root, paths[1])),
    root => renameSync(join(root, paths[1]), join(root, 'moved.md')),
    root => { rmSync(join(root, paths[1])); renameSync(join(root, 'unselected.md'), join(root, paths[1])); },
    root => { rmSync(join(root, paths[1])); symlinkSync('../architecture.md', join(root, paths[1])); },
  ]) {
    const result = await inspectSelfAuthorityChanges(await fixture(t, change));
    assert.equal(result.changed, true);
    assert.throws(() => accept(result.changed), /ordinary PASS cannot accept/);
  }
});

test('candidate configuration changes are separate and never replace the old comparison selection', async t => {
  const alterSelection = root => {
    write(root, manifestPath, JSON.stringify({ version: 1, authorities: [manifest.authorities[0]] }));
    write(root, policyPath, JSON.stringify({ ...policy, branches: { main: { mode: 'local-only' } } }));
  };
  const f = await fixture(t, alterSelection);
  const configOnly = await inspectSelfAuthorityChanges(f);
  assert.equal(configOnly.changed, false);
  assert.deepEqual(configOnly.configurationPaths, [policyPath, manifestPath]);
  // This comparison does not authorize a migration; ordinary PASS still requires old-policy semantic approval.
  const changed = await fixture(t, root => { alterSelection(root); write(root, paths[5], 'Candidate tries to omit this norm\n'); });
  assert.equal((await inspectSelfAuthorityChanges(changed)).changed, true);
});

test('base, provenance, commit and missing-input mismatches fail closed', async t => {
  const f = await fixture(t);
  for (const patch of [
    { baseSha: f.headSha }, { headSha: f.baseSha }, { reviewedSha: f.headSha },
    { baseSha: 'f'.repeat(40) }, { policySha256: 'f'.repeat(64) }, { policySha256: undefined },
    { provenance: undefined }, { provenance: { ...f.provenance, members: f.provenance.members.slice(0, 5) } },
    { provenance: { ...f.provenance, authorityRevision: f.headSha } }, { policyPath: '../escape.json' },
  ]) await assert.rejects(inspectSelfAuthorityChanges({ ...f, ...patch }));
  for (const value of [undefined, '', 'unknown', 'False']) assert.throws(() => accept(value), /comparison is unavailable/);
});

test('newly added selected member with missing old bytes is incomplete, never unchanged', async t => {
  const f = await fixture(t);
  // Build a genuine old commit with a selected file missing, then add it in the candidate.
  git(f.cwd, 'checkout', '-q', '--detach', f.baseSha);
  rmSync(join(f.cwd, paths[3])); git(f.cwd, 'add', '-A'); git(f.cwd, 'commit', '-qm', 'missing old input');
  const baseSha = git(f.cwd, 'rev-parse', 'HEAD');
  git(f.cwd, 'switch', '-qc', 'add-missing'); write(f.cwd, paths[3], 'added authority\n');
  git(f.cwd, 'add', '-A'); git(f.cwd, 'commit', '-qm', 'add selected input'); const headSha = git(f.cwd, 'rev-parse', 'HEAD');
  git(f.cwd, 'checkout', '-q', '--detach', baseSha); git(f.cwd, 'merge', '--no-ff', '-qm', 'review', headSha);
  await assert.rejects(inspectSelfAuthorityChanges({ ...f, baseSha, headSha,
    reviewedSha: git(f.cwd, 'rev-parse', 'HEAD') }), /missing or ambiguous/);
});

test('CLI publishes no false output on missing input and final accept rejects a real false-PASS candidate', async t => {
  const f = await fixture(t, root => write(root, paths[0], 'changed architecture\n'));
  const output = join(f.cwd, 'outputs'); writeFileSync(output, '');
  const env = { ...process.env, SELF_REPOSITORY: repository, BASE_SHA: f.baseSha, HEAD_SHA: f.headSha,
    REVIEWED_SHA: f.reviewedSha, BASE_BRANCH: 'main', POLICY_PATH: policyPath, POLICY_SHA256: f.policySha256,
    AUTHORITY_PROVENANCE: Buffer.from(JSON.stringify(f.provenance)).toString('base64'), GITHUB_OUTPUT: output };
  const cli = new URL('../dist/ci-self-authority-change.mjs', import.meta.url).pathname;
  const run = extra => spawnSync(process.execPath, [cli], { cwd: f.cwd, env: { ...env, ...extra }, encoding: 'utf8' });
  assert.notEqual(run({ AUTHORITY_PROVENANCE: '' }).status, 0); assert.equal(readFileSync(output, 'utf8'), '');
  assert.equal(run({}).status, 0); assert.match(readFileSync(output, 'utf8'), /^changed=true\n/);
  const final = spawnSync(process.execPath, [new URL('../dist/ci-enforced-acceptance.mjs', import.meta.url).pathname], {
    env: { ...process.env, REVIEW_RESULT: 'success', CONCLUSION: 'PASS', SELF_AUTHORITY_CHECK_REQUIRED: 'true', SELECTED_AUTHORITY_CHANGED: 'true' }, encoding: 'utf8' });
  assert.notEqual(final.status, 0); assert.doesNotMatch(final.stdout, /ordinary-pass/);
});

test('selected OWNER_ADDITION keeps its verified route; generic consumer acceptance remains compatible', () => {
  assert.deepEqual(assertEnforcedAcceptance({ reviewResult: 'success', conclusion: 'OWNER_ADDITION_G0',
    selfAuthorityCheckRequired: 'true', selectedAuthorityChanged: 'true', ownerAdditionSelected: 'G0',
    ownerAdditionResult: 'success', ownerAdditionEligibility: 'ELIGIBLE' }), { route: 'owner-addition-pending' });
  assert.deepEqual(assertEnforcedAcceptance({ reviewResult: 'success', conclusion: 'PASS' }), { route: 'ordinary-pass' });
  for (const conclusion of ['BLOCK', 'OWNER_DECISION']) assert.throws(() => assertEnforcedAcceptance({
    reviewResult: 'success', conclusion, selfAuthorityCheckRequired: 'true', selectedAuthorityChanged: 'false' }));
});

test('protected workflow carries the comparison to final Self acceptance and retains the tag guard', () => {
  const yaml = readFileSync(new URL('../.github/workflows/architecture-gate.yml', import.meta.url), 'utf8');
  const workflow = parseWorkflow(yaml, 'architecture-gate.yml');
  const step = workflow.jobs.review.steps.find(step => step.id === 'self-authority-change');
  assert.match(step.if, /mode == 'enforced'.*github.repository == 'flair-agency\/architecture-gatekeeper'/);
  assert.equal(step.env.POLICY_SHA256, '${{ needs.policy.outputs.policy_sha256 }}');
  assert.equal(step.env.AUTHORITY_PROVENANCE, '${{ steps.authority.outputs.provenance }}');
  assert.equal(step.env.REVIEWED_SHA, '${{ steps.revision.outputs.sha }}');
  assert.match(step.run, /GATEKEEPER_RUNTIME_ROOT\/dist\/ci-self-authority-change.mjs/);
  const acceptStep = workflow.jobs.accept.steps.find(step => step.run?.includes('/dist/ci-enforced-acceptance.mjs'));
  assert.equal(acceptStep.env.SELECTED_AUTHORITY_CHANGED, '${{ needs.review.outputs.self_authority_changed }}');
  assert.equal(acceptStep.env.SELF_AUTHORITY_CHECK_REQUIRED, "${{ github.repository == 'flair-agency/architecture-gatekeeper' }}");
  assert.ok(workflow.jobs.accept.steps.some(step => step.run?.includes('attempt-classifier.mjs acceptance-guard')));
});
