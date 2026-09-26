import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { prepareLegacyAuthority, validateLegacyAuthorityDecision } from '../src/prepare-legacy-ci-authority.mjs';

const git = (root, ...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', env: {
  ...process.env, GIT_AUTHOR_NAME: 'Test', GIT_AUTHOR_EMAIL: 'test@example.com',
  GIT_COMMITTER_NAME: 'Test', GIT_COMMITTER_EMAIL: 'test@example.com',
} }).trim();
function write(root, path, content) { mkdirSync(dirname(join(root, path)), { recursive: true }); writeFileSync(join(root, path), content); }

test('legacy v1 uses recorded-base authority and rejects candidate self-authorization', t => {
  const root = mkdtempSync(join(tmpdir(), 'legacy-authority-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  git(root, 'init', '-q');
  const policyPath = '.codex/gatekeeper/ci-policy.json';
  const authorityPath = 'docs/architecture.md';
  const policy = { version: 1, default: { mode: 'local-only' }, branches: { main: {
    mode: 'enforced', model: 'gpt-6-sol', reasoningEffort: 'medium', authorityFiles: [authorityPath],
    promptPath: '.codex/gatekeeper/ci-prompt.md', schemaPath: '.codex/gatekeeper/decision.schema.json',
  } } };
  write(root, policyPath, JSON.stringify(policy));
  write(root, authorityPath, '# Architecture\n\nMigration completion is unverified.\n');
  write(root, 'src/app.mjs', 'export const value = 1;\n');
  git(root, 'add', '.'); git(root, 'commit', '-qm', 'base');
  const baseSha = git(root, 'rev-parse', 'HEAD');
  const promptPath = join(root, 'protected-prompt.md');
  writeFileSync(promptPath, 'Review against canonical authority.');
  const args = { root, baseSha, baseBranch: 'main', policyPath, promptPath,
    outputPath: join(root, 'complete-prompt.md'), provenancePath: join(root, 'provenance.json') };

  write(root, 'src/app.mjs', 'export const value = 2;\n');
  git(root, 'add', '.'); git(root, 'commit', '-qm', 'authorized implementation');
  const ordinaryHead = git(root, 'rev-parse', 'HEAD');
  const provenance = prepareLegacyAuthority({ ...args, headSha: ordinaryHead });
  assert.deepEqual(provenance.members.map(member => member.path), [authorityPath]);
  assert.match(readFileSync(args.outputPath, 'utf8'), /Migration completion is unverified/);
  assert.deepEqual(validateLegacyAuthorityDecision(JSON.stringify({ decision: 'PASS', authorityFiles: [authorityPath] }), provenance).authorityFiles, [authorityPath]);
  assert.throws(() => validateLegacyAuthorityDecision(JSON.stringify({ decision: 'PASS', authorityFiles: [] }), provenance), /exact base-selected/);

  write(root, policyPath, JSON.stringify({ ...policy, branches: { main: { ...policy.branches.main, authorityFiles: ['docs/other.md'] } } }));
  git(root, 'add', '.'); git(root, 'commit', '-qm', 'candidate policy self-selection');
  const policyHead = git(root, 'rev-parse', 'HEAD');
  assert.deepEqual(prepareLegacyAuthority({ ...args, headSha: policyHead }).members.map(member => member.path), [authorityPath]);

  write(root, authorityPath, '# Architecture\n\nMigration completed; missing decision adopted.\n');
  write(root, 'src/app.mjs', 'export const value = 3;\n');
  git(root, 'add', '.'); git(root, 'commit', '-qm', 'candidate self-authorization');
  const changedHead = git(root, 'rev-parse', 'HEAD');
  assert.throws(() => prepareLegacyAuthority({ ...args, headSha: changedHead }), /Candidate changes canonical authority/);
});
