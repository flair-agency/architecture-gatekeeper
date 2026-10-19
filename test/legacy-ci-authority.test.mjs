import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { prepareLegacyAuthority, validateLegacyAuthorityDecision } from '../dist/prepare-legacy-ci-authority.mjs';
import { verifyLegacyValidationSelection } from '../dist/verify-legacy-validation-selection.mjs';
import { assertGitHubOutputCliBoundary } from './fixtures/github-output-cli-boundary.mjs';

test('caller validation selection must match explicit base path or null', () => {
  assert.deepEqual(verifyLegacyValidationSelection('', ''), { validationPath: null });
  assert.deepEqual(verifyLegacyValidationSelection('.codex/gatekeeper/decision.validation.json', '.codex/gatekeeper/decision.validation.json'), { validationPath: '.codex/gatekeeper/decision.validation.json' });
  assert.throws(() => verifyLegacyValidationSelection('', '.codex/gatekeeper/decision.validation.json'), /exactly match/);
  assert.throws(() => verifyLegacyValidationSelection('.codex/gatekeeper/decision.validation.json', ''), /exactly match/);
});

test('legacy v1 workflow passes protected selectors and output paths to preparation', () => {
  const workflow = readFileSync(new URL('../.github/workflows/architecture-gate.yml', import.meta.url), 'utf8');
  const step = workflow.split('      - name: Materialize recorded-base legacy authority before review\n')[1]
    ?.split('      - name: Materialize protected Authority Set before review\n')[0];
  assert.ok(step, 'legacy preparation step must exist');
  for (const binding of [
    'POLICY_SHA256: ${{ needs.policy.outputs.policy_sha256 }}',
    'PROMPT_PATH: ${{ needs.policy.outputs.legacy_prompt_path }}',
    'SCHEMA_PATH: ${{ needs.policy.outputs.legacy_schema_path }}',
    'PROMPT_OUTPUT_PATH: ${{ runner.temp }}/architecture-gate-prompt.md',
    'SCHEMA_OUTPUT_PATH: ${{ runner.temp }}/architecture-gate-decision.schema.json',
    'REVIEWED_SHA: ${{ steps.revision.outputs.sha }}',
  ]) assert.ok(step.includes(binding), `missing legacy workflow binding: ${binding}`);
  assert.match(workflow, /output-schema-file: \$\{\{ needs\.policy\.outputs\.policy_version == '1'/);
});

const git = (root, ...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', env: {
  ...process.env, GIT_AUTHOR_NAME: 'Test', GIT_AUTHOR_EMAIL: 'test@example.com',
  GIT_COMMITTER_NAME: 'Test', GIT_COMMITTER_EMAIL: 'test@example.com',
} }).trim();
function write(root, path, content) { mkdirSync(dirname(join(root, path)), { recursive: true }); writeFileSync(join(root, path), content); }
function prepareAt(root, options) {
  const oldCwd = process.cwd();
  const oldRunnerTemp = process.env.RUNNER_TEMP;
  try {
    process.chdir(root);
    process.env.RUNNER_TEMP = root;
    return prepareLegacyAuthority(options);
  } finally {
    process.chdir(oldCwd);
    if (oldRunnerTemp === undefined) delete process.env.RUNNER_TEMP;
    else process.env.RUNNER_TEMP = oldRunnerTemp;
  }
}

test('legacy v1 uses recorded-base arbitrary authority paths and binds every review input', t => {
  const root = mkdtempSync(join(tmpdir(), 'legacy-authority-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  git(root, 'init', '-q');
  const policyPath = '.codex/gatekeeper/ci-policy.json';
  const authorityPath = 'docs/architecture';
  const promptPath = '.codex/gatekeeper/ci-prompt.md';
  const schemaPath = '.codex/gatekeeper/decision.schema.json';
  const validationPath = '.codex/gatekeeper/decision.validation.json';
  const policy = { version: 1, default: { mode: 'local-only' }, branches: { main: {
    mode: 'enforced', model: 'gpt-6.1-sol', reasoningEffort: 'medium', authorityFiles: [authorityPath],
    promptPath, schemaPath, validationPath,
  } } };
  write(root, policyPath, JSON.stringify(policy));
  write(root, promptPath, 'Review against canonical authority.');
  write(root, schemaPath, '{"type":"object"}');
  write(root, validationPath, '{"rules":[]}');
  write(root, authorityPath, 'Migration completion is unverified.');
  write(root, 'src/app.mjs', 'export const value = 1;\n');
  git(root, 'add', '.'); git(root, 'commit', '-qm', 'base');
  const baseSha = git(root, 'rev-parse', 'HEAD');
  const args = { root, baseSha, baseBranch: 'main', policyPath,
    outputPromptPath: 'architecture-gate-prompt.md', outputSchemaPath: 'architecture-gate-decision.schema.json',
    outputValidationPath: 'architecture-gate-decision.validation.json',
    outputPath: 'architecture-gate-legacy-prompt.md', provenancePath: 'architecture-gate-legacy-provenance.json' };

  write(root, 'src/app.mjs', 'export const value = 2;\n');
  git(root, 'add', '.'); git(root, 'commit', '-qm', 'authorized implementation');
  const ordinaryHead = git(root, 'rev-parse', 'HEAD');
  const provenance = prepareAt(root, { ...args, headSha: ordinaryHead, reviewedSha: ordinaryHead });
  assert.deepEqual(provenance.members.map(member => member.path), [authorityPath]);
  assert.match(readFileSync(join(root, args.outputPath), 'utf8'), /Migration completion is unverified/);
  assert.equal(provenance.policy.path, policyPath);
  assert.equal(provenance.prompt.path, promptPath);
  assert.equal(provenance.schema.path, schemaPath);
  assert.equal(provenance.validation.path, validationPath);
  assert.equal(readFileSync(join(root, args.outputSchemaPath), 'utf8'), '{"type":"object"}');
  assert.equal(readFileSync(join(root, args.outputValidationPath), 'utf8'), '{"rules":[]}');
  assert.deepEqual(validateLegacyAuthorityDecision(JSON.stringify({ decision: 'PASS', authorityFiles: [authorityPath] }), provenance).authorityFiles, [authorityPath]);
  assert.throws(() => validateLegacyAuthorityDecision(JSON.stringify({ decision: 'PASS', authorityFiles: [] }), provenance), /exact base-selected/);
  const output = join(root, 'runner-output');
  writeFileSync(output, 'previous=value\n');
  const cli = [fileURLToPath(new URL('../dist/prepare-legacy-ci-authority.mjs', import.meta.url)), 'prepare'];
  const env = { ...process.env, GITHUB_WORKSPACE: root, BASE_SHA: baseSha, HEAD_SHA: ordinaryHead,
    REVIEWED_SHA: ordinaryHead, BASE_BRANCH: args.baseBranch, POLICY_PATH: policyPath,
    RUNNER_TEMP: root, PROMPT_OUTPUT_PATH: args.outputPromptPath, SCHEMA_OUTPUT_PATH: args.outputSchemaPath,
    VALIDATION_OUTPUT_PATH: args.outputValidationPath, OUTPUT_PATH: args.outputPath,
    PROVENANCE_PATH: args.provenancePath, GITHUB_OUTPUT: output };
  execFileSync(process.execPath, cli, { cwd: root, env });
  assert.equal(readFileSync(output, 'utf8'), `previous=value\nprovenance=${Buffer.from(JSON.stringify(provenance)).toString('base64')}\n`);
  assertGitHubOutputCliBoundary({ root, args: cli, env, label: 'legacy-prepare' });
  assert.deepEqual(JSON.parse(readFileSync(join(root, args.provenancePath), 'utf8')), provenance);

  write(root, policyPath, JSON.stringify({ ...policy, branches: { main: { ...policy.branches.main, authorityFiles: ['docs/other'] } } }));
  git(root, 'add', '.'); git(root, 'commit', '-qm', 'candidate policy self-selection');
  const policyHead = git(root, 'rev-parse', 'HEAD');
  assert.deepEqual(prepareAt(root, { ...args, headSha: policyHead, reviewedSha: policyHead }).members.map(member => member.path), [authorityPath]);

  write(root, authorityPath, 'Migration completed; missing decision adopted.');
  write(root, 'src/app.mjs', 'export const value = 3;\n');
  git(root, 'add', '.'); git(root, 'commit', '-qm', 'candidate self-authorization');
  const changedHead = git(root, 'rev-parse', 'HEAD');
  assert.throws(() => prepareAt(root, { ...args, headSha: changedHead, reviewedSha: changedHead }), /Candidate changes canonical authority/);
});

test('legacy v1 does not attribute a base-only authority update to the candidate merge', t => {
  const root = mkdtempSync(join(tmpdir(), 'legacy-base-update-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  git(root, 'init', '-q'); git(root, 'branch', '-M', 'main');
  const policyPath = '.codex/gatekeeper/ci-policy.json';
  const authorityPath = 'docs/architecture.md';
  const promptPath = '.codex/gatekeeper/ci-prompt.md';
  const schemaPath = '.codex/gatekeeper/decision.schema.json';
  write(root, policyPath, JSON.stringify({ version: 1, default: { mode: 'local-only' }, branches: { main: {
    mode: 'enforced', model: 'gpt-6.1-sol', reasoningEffort: 'low', authorityFiles: [authorityPath],
    promptPath, schemaPath, validationPath: null,
  } } }));
  write(root, promptPath, 'Review the selected authority.');
  write(root, schemaPath, '{"type":"object"}');
  write(root, authorityPath, 'Original authority.');
  write(root, 'src/app.mjs', 'export const value = 1;\n');
  git(root, 'add', '.'); git(root, 'commit', '-qm', 'initial base');
  git(root, 'switch', '-c', 'candidate');
  write(root, 'src/app.mjs', 'export const value = 2;\n');
  git(root, 'add', '.'); git(root, 'commit', '-qm', 'candidate implementation');
  const headSha = git(root, 'rev-parse', 'HEAD');
  git(root, 'switch', 'main');
  write(root, authorityPath, 'Updated base authority.');
  git(root, 'add', '.'); git(root, 'commit', '-qm', 'base-only authority update');
  const baseSha = git(root, 'rev-parse', 'HEAD');
  git(root, 'merge', '--no-ff', '-qm', 'reviewed merge', 'candidate');
  const reviewedSha = git(root, 'rev-parse', 'HEAD');
  const provenance = prepareAt(root, { root, baseSha, headSha, reviewedSha, baseBranch: 'main', policyPath,
    outputPromptPath: 'architecture-gate-prompt.md', outputSchemaPath: 'architecture-gate-decision.schema.json',
    outputPath: 'architecture-gate-legacy-prompt.md', provenancePath: 'architecture-gate-legacy-provenance.json' });
  assert.equal(provenance.reviewedSha, reviewedSha);
  assert.match(readFileSync(join(root, 'architecture-gate-legacy-prompt.md'), 'utf8'), /Updated base authority/);
});

test('legacy preparation accepts only the five fixed runner-temp output selections', t => {
  const root = mkdtempSync(join(tmpdir(), 'legacy-artifact-boundary-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  git(root, 'init', '-q');
  const policyPath = '.codex/gatekeeper/ci-policy.json';
  const authorityPath = 'docs/architecture.md';
  const promptPath = '.codex/gatekeeper/ci-prompt.md';
  const schemaPath = '.codex/gatekeeper/decision.schema.json';
  write(root, policyPath, JSON.stringify({ version: 1, default: { mode: 'local-only' }, branches: { main: {
    mode: 'enforced', model: 'gpt-6.1-sol', reasoningEffort: 'low', authorityFiles: [authorityPath],
    promptPath, schemaPath, validationPath: null,
  } } }));
  write(root, promptPath, 'Review the selected authority.');
  write(root, schemaPath, '{"type":"object"}');
  write(root, authorityPath, 'Canonical rule.');
  git(root, 'add', '.'); git(root, 'commit', '-qm', 'base');
  const baseSha = git(root, 'rev-parse', 'HEAD');
  const cli = [fileURLToPath(new URL('../dist/prepare-legacy-ci-authority.mjs', import.meta.url)), 'prepare'];
  const setup = () => ({ ...process.env, GITHUB_WORKSPACE: root, RUNNER_TEMP: root, BASE_SHA: baseSha, HEAD_SHA: baseSha,
    REVIEWED_SHA: baseSha, BASE_BRANCH: 'main', POLICY_PATH: policyPath,
    PROMPT_OUTPUT_PATH: join(root, 'architecture-gate-prompt.md'), SCHEMA_OUTPUT_PATH: 'architecture-gate-decision.schema.json',
    OUTPUT_PATH: 'architecture-gate-legacy-prompt.md', PROVENANCE_PATH: 'architecture-gate-legacy-provenance.json',
    GITHUB_OUTPUT: join(root, 'github-output') });

  const normalEnv = setup();
  writeFileSync(normalEnv.GITHUB_OUTPUT, 'old=value\n');
  execFileSync(process.execPath, cli, { cwd: root, env: normalEnv });
  assert.equal(readFileSync(join(root, 'architecture-gate-prompt.md'), 'utf8'), 'Review the selected authority.');
  assert.match(readFileSync(join(root, normalEnv.OUTPUT_PATH), 'utf8'), /Canonical rule/);
  assert.match(readFileSync(join(root, normalEnv.PROVENANCE_PATH), 'utf8'), /"version":1/);
  assert.match(readFileSync(normalEnv.GITHUB_OUTPUT, 'utf8'), /^old=value\nprovenance=/);

  const rejected = spawnSync(process.execPath, cli, { cwd: root,
    env: { ...setup(), PROMPT_OUTPUT_PATH: join(root, 'outside.md') }, encoding: 'utf8' });
  assert.notEqual(rejected.status, 0);
  assert.match(rejected.stderr, /fixed runner-temp output selection/);
});

const selectedPaths = {
  policy: '.codex/gatekeeper/ci-policy.json',
  prompt: '.codex/gatekeeper/ci-prompt.md',
  schema: '.codex/gatekeeper/decision.schema.json',
  validation: '.codex/gatekeeper/decision.validation.json',
  authority: 'docs/architecture',
};
for (const [kind, badPath] of Object.entries(selectedPaths)) {
  test(`legacy v1 rejects a symlink snapshot for selected ${kind}`, t => {
    const root = mkdtempSync(join(tmpdir(), `legacy-${kind}-symlink-`));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    git(root, 'init', '-q');
    const policy = { version: 1, default: { mode: 'local-only' }, branches: { main: {
      mode: 'enforced', model: 'gpt-6.1-sol', reasoningEffort: 'medium', authorityFiles: [selectedPaths.authority],
      promptPath: selectedPaths.prompt, schemaPath: selectedPaths.schema, validationPath: selectedPaths.validation,
    } } };
    write(root, selectedPaths.policy, JSON.stringify(policy));
    write(root, selectedPaths.prompt, 'review prompt');
    write(root, selectedPaths.schema, '{"type":"object"}');
    write(root, selectedPaths.validation, '{"rules":[]}');
    write(root, selectedPaths.authority, 'canonical rules');
    write(root, 'snapshot-target', 'link target');
    unlinkSync(join(root, badPath));
    symlinkSync('snapshot-target', join(root, badPath));
    git(root, 'add', '.'); git(root, 'commit', '-qm', 'base with non-regular selected input');
    const baseSha = git(root, 'rev-parse', 'HEAD');
    assert.throws(() => prepareAt(root, { root, baseSha, headSha: baseSha, reviewedSha: baseSha, baseBranch: 'main',
      policyPath: selectedPaths.policy, outputPromptPath: 'architecture-gate-prompt.md',
      outputSchemaPath: 'architecture-gate-decision.schema.json', outputValidationPath: 'architecture-gate-decision.validation.json',
      outputPath: 'architecture-gate-legacy-prompt.md', provenancePath: 'architecture-gate-legacy-provenance.json',
    }), /not a regular file/);
  });
}
