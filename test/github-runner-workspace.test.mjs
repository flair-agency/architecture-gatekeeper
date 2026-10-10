import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { trustedGitHubWorkspaceRoot } from '../dist/github-runner-workspace.mjs';

const materializeCli = fileURLToPath(new URL('../dist/materialize-regular-git-snapshot.mjs', import.meta.url));
const prepareCli = fileURLToPath(new URL('../dist/prepare-legacy-ci-authority.mjs', import.meta.url));
const git = (root, ...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', env: {
  ...process.env, GIT_AUTHOR_NAME: 'Test', GIT_AUTHOR_EMAIL: 'test@example.com',
  GIT_COMMITTER_NAME: 'Test', GIT_COMMITTER_EMAIL: 'test@example.com',
} }).trim();
const write = (root, path, content) => {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), content);
};

test('trusted GitHub workspace accessor returns the raw current environment value on each call', t => {
  const original = process.env.GITHUB_WORKSPACE;
  t.after(() => { if (original === undefined) delete process.env.GITHUB_WORKSPACE; else process.env.GITHUB_WORKSPACE = original; });
  delete process.env.GITHUB_WORKSPACE;
  assert.equal(trustedGitHubWorkspaceRoot(), undefined);
  process.env.GITHUB_WORKSPACE = '';
  assert.equal(trustedGitHubWorkspaceRoot(), '');
  process.env.GITHUB_WORKSPACE = 'relative/../runner checkout';
  assert.equal(trustedGitHubWorkspaceRoot(), 'relative/../runner checkout');
});

test('GitHub CLI entrypoints read recorded-base snapshots from the supplied runner workspace', t => {
  const root = mkdtempSync(join(tmpdir(), 'github-workspace-cli-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  git(root, 'init', '-q');
  const policyPath = '.codex/gatekeeper/ci-policy.json';
  const promptPath = '.codex/gatekeeper/ci-prompt.md';
  const schemaPath = '.codex/gatekeeper/decision.schema.json';
  const validationPath = '.codex/gatekeeper/decision.validation.json';
  const authorityPath = 'docs/architecture.md';
  const policy = { version: 1, default: { mode: 'local-only' }, branches: { main: {
    mode: 'enforced', model: 'gpt-6.1-sol', reasoningEffort: 'low', authorityFiles: [authorityPath],
    promptPath, schemaPath, validationPath,
  } } };
  write(root, policyPath, JSON.stringify(policy));
  write(root, promptPath, 'review prompt');
  write(root, schemaPath, '{"type":"object"}');
  write(root, validationPath, '{"rules":[]}');
  write(root, authorityPath, 'recorded base authority');
  git(root, 'add', '.'); git(root, 'commit', '-qm', 'base');
  const baseSha = git(root, 'rev-parse', 'HEAD');

  const snapshotPath = join(root, 'snapshot.out');
  const materializeEnv = { ...process.env, GITHUB_WORKSPACE: root };
  delete materializeEnv.GITHUB_OUTPUT;
  const materialized = spawnSync(process.execPath, [materializeCli, baseSha,
    authorityPath, snapshotPath], { cwd: tmpdir(), encoding: 'utf8', env: materializeEnv });
  assert.equal(materialized.status, 0, materialized.stderr);
  assert.equal(readFileSync(snapshotPath, 'utf8'), 'recorded base authority');

  write(root, 'src/app.mjs', 'export const value = 1;\n');
  git(root, 'add', '.'); git(root, 'commit', '-qm', 'candidate implementation');
  const candidateSha = git(root, 'rev-parse', 'HEAD');
  const outputPromptPath = join(root, 'prompt.out');
  const outputSchemaPath = join(root, 'schema.out');
  const outputValidationPath = join(root, 'validation.out');
  const outputPath = join(root, 'complete.out');
  const provenancePath = join(root, 'provenance.json');
  const prepareEnv = {
    ...process.env,
    GITHUB_WORKSPACE: root,
    BASE_SHA: baseSha,
    HEAD_SHA: candidateSha,
    REVIEWED_SHA: candidateSha,
    BASE_BRANCH: 'main',
    POLICY_PATH: policyPath,
    PROMPT_PATH: promptPath,
    SCHEMA_PATH: schemaPath,
    VALIDATION_PATH: validationPath,
    PROMPT_OUTPUT_PATH: outputPromptPath,
    SCHEMA_OUTPUT_PATH: outputSchemaPath,
    VALIDATION_OUTPUT_PATH: outputValidationPath,
    OUTPUT_PATH: outputPath,
    PROVENANCE_PATH: provenancePath,
  };
  delete prepareEnv.GITHUB_OUTPUT;
  const prepare = () => spawnSync(process.execPath, [prepareCli, 'prepare'],
    { cwd: tmpdir(), encoding: 'utf8', env: prepareEnv });
  const prepared = prepare();
  assert.equal(prepared.status, 0, prepared.stderr);
  assert.match(readFileSync(outputPath, 'utf8'), /recorded base authority/);
  assert.deepEqual(JSON.parse(readFileSync(provenancePath, 'utf8')).members.map(member => member.path), [authorityPath]);
  assert.equal(readFileSync(outputPromptPath, 'utf8'), 'review prompt');
  assert.equal(readFileSync(outputSchemaPath, 'utf8'), '{"type":"object"}');
  assert.equal(readFileSync(outputValidationPath, 'utf8'), '{"rules":[]}');

  write(root, authorityPath, 'candidate-selected authority');
  git(root, 'add', '.'); git(root, 'commit', '-qm', 'candidate changes selected authority');
  const changedSha = git(root, 'rev-parse', 'HEAD');
  prepareEnv.HEAD_SHA = changedSha;
  prepareEnv.REVIEWED_SHA = changedSha;
  const rejected = prepare();
  assert.notEqual(rejected.status, 0);
  assert.match(rejected.stderr, /Candidate changes canonical authority/);
});
