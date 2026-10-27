import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { linkSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { parseWorkflow } from './helpers/workflow-structure.mjs';
import { assertProceduralV5Acceptance } from '../dist/ci-procedural-acceptance.mjs';
import { changedSelectedAuthorityPaths } from '../dist/ci-procedural-authority-change.mjs';

const sourceRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const git = (root, ...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...process.env, GIT_AUTHOR_NAME: 'Test', GIT_AUTHOR_EMAIL: 'test@example.invalid',
    GIT_COMMITTER_NAME: 'Test', GIT_COMMITTER_EMAIL: 'test@example.invalid' } }).trim();
const write = (root, path, bytes) => { mkdirSync(dirname(join(root, path)), { recursive: true }); writeFileSync(join(root, path), bytes); };

async function gitFixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'procedural-authority-change-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  git(root, 'init', '-q');
  for (const [path, text] of Object.entries({ 'docs/architecture.md': '# Architecture\n',
    'docs/policy.md': '# Policy\n', 'README.md': '# Consumer\n' })) write(root, path, text);
  git(root, 'add', '.'); git(root, 'commit', '-qm', 'base');
  const baseSha = git(root, 'rev-parse', 'HEAD');
  const repository = 'example/project';
  const members = ['docs/architecture.md', 'docs/policy.md'].map((path, index) => {
    const bytes = readFileSync(join(root, path));
    return { id: index === 0 ? 'architecture' : 'policy', repository, resolvedCommit: baseSha,
      path, byteLength: bytes.length, sha256: hash(bytes) };
  });
  members.push({ id: 'external-rule', repository: 'other/rules', resolvedCommit: 'c'.repeat(40),
    path: 'docs/external.md', byteLength: 14, sha256: hash(Buffer.from('# External\n')) });
  const provenance = { version: 2, selfRepository: repository, authorityRevision: baseSha,
    manifestSha256: 'a'.repeat(64), setDigest: hash(Buffer.from(JSON.stringify(members))), members };
  return { root, baseSha, repository, provenance };
}

test('procedural v5 detects edits to every selected same-repository authority, not unrelated or external files', async t => {
  const f = await gitFixture(t);
  write(f.root, 'README.md', '# Updated consumer docs\n');
  git(f.root, 'add', 'README.md'); git(f.root, 'commit', '-qm', 'unrelated consumer edit');
  const unrelatedHead = git(f.root, 'rev-parse', 'HEAD');
  assert.deepEqual(changedSelectedAuthorityPaths({ provenance: f.provenance, repository: f.repository,
    baseSha: f.baseSha, headSha: unrelatedHead, cwd: f.root }), []);

  write(f.root, 'docs/policy.md', '# Changed policy\n');
  write(f.root, 'docs/external.md', '# Candidate cannot select another repository\n');
  git(f.root, 'add', 'docs'); git(f.root, 'commit', '-qm', 'change selected and external path');
  const changedHead = git(f.root, 'rev-parse', 'HEAD');
  assert.deepEqual(changedSelectedAuthorityPaths({ provenance: f.provenance, repository: f.repository,
    baseSha: f.baseSha, headSha: changedHead, cwd: f.root }), ['docs/policy.md']);
  assert.throws(() => changedSelectedAuthorityPaths({ provenance: f.provenance, repository: f.repository,
    baseSha: 'b'.repeat(40), headSha: changedHead, cwd: f.root }), /does not match the recorded base/);
});

test('Git collaborator receives an unchecked late reread of a selected path', async t => {
  const f = await gitFixture(t);
  const selected = f.provenance.members[0];
  const selectedPath = selected.path;
  let pathReads = 0;
  Object.defineProperty(selected, 'path', {
    enumerable: true,
    configurable: true,
    get() { pathReads += 1; return pathReads <= 5 ? selectedPath : 17; },
  });
  let receivedArgs;
  const changed = changedSelectedAuthorityPaths({ provenance: f.provenance, repository: f.repository,
    baseSha: f.baseSha, headSha: f.baseSha, cwd: f.root,
    execFile: (_file, args) => { receivedArgs = args; return Buffer.from(''); } });
  assert.deepEqual(changed, []);
  assert.equal(receivedArgs[7], 17);
});

test('source and emitted procedural CLI preserve output bytes through the runner-output adapter', async t => {
  const f = await gitFixture(t);
  const output = join(f.root, 'output');
  const scripts = ['src/ci-procedural-authority-change.mts', 'dist/ci-procedural-authority-change.mjs'];
  const env = { ...process.env, AUTHORITY_PROVENANCE: Buffer.from(JSON.stringify(f.provenance)).toString('base64'),
    SELF_REPOSITORY: f.repository, BASE_SHA: f.baseSha, HEAD_SHA: f.baseSha };
  for (const layout of scripts) {
    writeFileSync(output, 'existing=true\n');
    const result = spawnSync(process.execPath, [join(sourceRoot, layout)], { cwd: f.root, encoding: 'utf8',
      env: { ...env, GITHUB_OUTPUT: output } });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(readFileSync(output, 'utf8'), 'existing=true\nchanged=false\npaths_base64=W10=\n');
  }
  const symlink = join(f.root, 'output-link');
  const hardlink = join(f.root, 'output-hardlink');
  symlinkSync(output, symlink);
  linkSync(output, hardlink);
  writeFileSync(output, 'existing=true\n');
  for (const layout of scripts) {
    for (const selected of [symlink, hardlink, join(f.root, 'absent'), 'relative-output']) {
      const result = spawnSync(process.execPath, [join(sourceRoot, layout)], { cwd: f.root, encoding: 'utf8',
        env: { ...env, GITHUB_OUTPUT: selected } });
      assert.notEqual(result.status, 0, `${layout} rejects ${selected}`);
      assert.equal(result.stdout, '');
      assert.equal(readFileSync(output, 'utf8'), 'existing=true\n');
    }
  }
});

const common = { policyVersion: '5', evidenceProducer: 'github-actions', reviewResult: 'success',
  ownerAdditionSelected: 'G0', ownerAdditionResult: 'success', ownerAdditionEligibility: 'ELIGIBLE' };

test('v5 procedural acceptance rejects ordinary PASS when selected authority changed', () => {
  assert.throws(() => assertProceduralV5Acceptance({ ...common, selectedAuthorityChanged: 'true', conclusion: 'PASS' }),
    /selected authority requires successful OWNER_ADDITION/);
});

test('v5 accepts PASS only without selected-authority changes and keeps OWNER_ADDITION eligibility route', () => {
  assert.deepEqual(assertProceduralV5Acceptance({ ...common, selectedAuthorityChanged: 'false', conclusion: 'PASS' }),
    { route: 'ordinary-pass' });
  assert.deepEqual(assertProceduralV5Acceptance({ ...common, selectedAuthorityChanged: 'true', conclusion: 'OWNER_ADDITION_G0_PENDING' }),
    { route: 'owner-addition-pending' });
  assert.throws(() => assertProceduralV5Acceptance({ ...common, selectedAuthorityChanged: 'true', conclusion: 'OWNER_ADDITION_G0_PENDING',
    ownerAdditionEligibility: 'INELIGIBLE' }), /selected authority requires/);
  assert.throws(() => assertProceduralV5Acceptance({ ...common, policyVersion: '3', selectedAuthorityChanged: 'false', conclusion: 'PASS' }),
    /requires its selected policy/);
});

test('reusable workflow wires protected-base authority comparison to the procedural accept job only', () => {
  const workflow = readFileSync(join(sourceRoot, '.github/workflows/architecture-gate.yml'), 'utf8');
  const parsed = parseWorkflow(workflow, 'architecture-gate.yml');
  assert.match(workflow, /selected_authority_changed: \$\{\{ steps\.selected-authority-change\.outputs\.changed \}\}/);
  assert.match(workflow, /if: needs\.policy\.outputs\.mode == 'procedural'\n        id: selected-authority-change/);
  const authorityChange = parsed.jobs.review.steps.find(step => step.name === 'Detect candidate changes to the selected Authority Set');
  assert.equal(authorityChange.run, 'node "$GATEKEEPER_RUNTIME_ROOT/dist/ci-procedural-authority-change.mjs"');
  assert.match(workflow, /node \.architecture-gatekeeper-runtime\/dist\/ci-procedural-acceptance\.mjs/);
  assert.match(workflow, /if: needs\.policy\.outputs\.mode == 'procedural' \|\| needs\.policy\.outputs\.mode == 'enforced'\n        uses: actions\/checkout@v5\n        with:\n          repository: \$\{\{ job\.workflow_repository \}\}\n          ref: \$\{\{ job\.workflow_sha \}\}/);
});

for (const policyVersion of ['5', '6']) test(`v${policyVersion} procedural acceptance preserves decision and explicit eligibility boundaries`, () => {
  const input = { ...common, policyVersion };
  assert.deepEqual(assertProceduralV5Acceptance({ ...input, selectedAuthorityChanged: 'false', conclusion: 'PASS' }), { route: 'ordinary-pass' });
  assert.deepEqual(assertProceduralV5Acceptance({ ...input, selectedAuthorityChanged: 'true', conclusion: 'OWNER_ADDITION_G0_PENDING' }), { route: 'owner-addition-pending' });
  for (const changed of ['true', '', undefined]) assert.throws(() => assertProceduralV5Acceptance({ ...input, selectedAuthorityChanged: changed, conclusion: 'PASS' }));
  for (const conclusion of ['BLOCK', 'OWNER_DECISION', 'UNVERIFIED', 'OWNER_AMENDMENT']) assert.throws(() => assertProceduralV5Acceptance({ ...input, selectedAuthorityChanged: 'false', conclusion }));
  for (const missing of ['evidenceProducer', 'reviewResult', 'ownerAdditionSelected', 'ownerAdditionResult', 'ownerAdditionEligibility']) {
    assert.throws(() => assertProceduralV5Acceptance({ ...input, [missing]: undefined, selectedAuthorityChanged: 'true', conclusion: 'OWNER_ADDITION_G0_PENDING' }));
  }
});
