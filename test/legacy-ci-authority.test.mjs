import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { prepareLegacyAuthority, validateLegacyAuthorityDecision } from '../src/prepare-legacy-ci-authority.mjs';
import { verifyLegacyValidationSelection } from '../src/verify-legacy-validation-selection.mjs';

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
    mode: 'enforced', model: 'gpt-6-sol', reasoningEffort: 'medium', authorityFiles: [authorityPath],
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
    outputPromptPath: join(root, 'base-prompt.md'), outputSchemaPath: join(root, 'base-schema.json'),
    outputValidationPath: join(root, 'base-validation.json'),
    outputPath: join(root, 'complete-prompt.md'), provenancePath: join(root, 'provenance.json') };

  write(root, 'src/app.mjs', 'export const value = 2;\n');
  git(root, 'add', '.'); git(root, 'commit', '-qm', 'authorized implementation');
  const ordinaryHead = git(root, 'rev-parse', 'HEAD');
  const provenance = prepareLegacyAuthority({ ...args, headSha: ordinaryHead, reviewedSha: ordinaryHead });
  assert.deepEqual(provenance.members.map(member => member.path), [authorityPath]);
  assert.match(readFileSync(args.outputPath, 'utf8'), /Migration completion is unverified/);
  assert.equal(provenance.policy.path, policyPath);
  assert.equal(provenance.prompt.path, promptPath);
  assert.equal(provenance.schema.path, schemaPath);
  assert.equal(provenance.validation.path, validationPath);
  assert.equal(readFileSync(args.outputSchemaPath, 'utf8'), '{"type":"object"}');
  assert.equal(readFileSync(args.outputValidationPath, 'utf8'), '{"rules":[]}');
  assert.deepEqual(validateLegacyAuthorityDecision(JSON.stringify({ decision: 'PASS', authorityFiles: [authorityPath] }), provenance).authorityFiles, [authorityPath]);
  assert.throws(() => validateLegacyAuthorityDecision(JSON.stringify({ decision: 'PASS', authorityFiles: [] }), provenance), /exact base-selected/);

  write(root, policyPath, JSON.stringify({ ...policy, branches: { main: { ...policy.branches.main, authorityFiles: ['docs/other'] } } }));
  git(root, 'add', '.'); git(root, 'commit', '-qm', 'candidate policy self-selection');
  const policyHead = git(root, 'rev-parse', 'HEAD');
  assert.deepEqual(prepareLegacyAuthority({ ...args, headSha: policyHead, reviewedSha: policyHead }).members.map(member => member.path), [authorityPath]);

  write(root, authorityPath, 'Migration completed; missing decision adopted.');
  write(root, 'src/app.mjs', 'export const value = 3;\n');
  git(root, 'add', '.'); git(root, 'commit', '-qm', 'candidate self-authorization');
  const changedHead = git(root, 'rev-parse', 'HEAD');
  assert.throws(() => prepareLegacyAuthority({ ...args, headSha: changedHead, reviewedSha: changedHead }), /Candidate changes canonical authority/);
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
    mode: 'enforced', model: 'gpt-6-sol', reasoningEffort: 'low', authorityFiles: [authorityPath],
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
  const provenance = prepareLegacyAuthority({ root, baseSha, headSha, reviewedSha, baseBranch: 'main', policyPath,
    outputPromptPath: join(root, 'prompt.out'), outputSchemaPath: join(root, 'schema.out'),
    outputPath: join(root, 'complete.out'), provenancePath: join(root, 'provenance.json') });
  assert.equal(provenance.reviewedSha, reviewedSha);
  assert.match(readFileSync(join(root, 'complete.out'), 'utf8'), /Updated base authority/);
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
      mode: 'enforced', model: 'gpt-6-sol', reasoningEffort: 'medium', authorityFiles: [selectedPaths.authority],
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
    assert.throws(() => prepareLegacyAuthority({ root, baseSha, headSha: baseSha, reviewedSha: baseSha, baseBranch: 'main',
      policyPath: selectedPaths.policy, outputPromptPath: join(root, 'prompt.out'),
      outputSchemaPath: join(root, 'schema.out'), outputValidationPath: join(root, 'validation.out'),
      outputPath: join(root, 'complete.out'), provenancePath: join(root, 'provenance.json'),
    }), /not a regular file/);
  });
}
