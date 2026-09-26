import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { assertProceduralV5Acceptance } from '../src/ci-procedural-acceptance.mjs';
import { changedSelectedAuthorityPaths } from '../src/ci-procedural-authority-change.mjs';

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
  assert.match(workflow, /selected_authority_changed: \$\{\{ steps\.selected-authority-change\.outputs\.changed \}\}/);
  assert.match(workflow, /if: needs\.policy\.outputs\.mode == 'procedural'\n        id: selected-authority-change/);
  assert.match(workflow, /node \.architecture-gatekeeper-validation-runtime\/src\/ci-procedural-authority-change\.mjs/);
  assert.match(workflow, /node \.architecture-gatekeeper-runtime\/src\/ci-procedural-acceptance\.mjs/);
  assert.match(workflow, /if: needs\.policy\.outputs\.mode == 'procedural'\n        uses: actions\/checkout@v5\n        with:\n          repository: \$\{\{ job\.workflow_repository \}\}\n          ref: \$\{\{ job\.workflow_sha \}\}/);
});
