import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveCiPolicy } from '../src/resolve-ci-policy.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const policy = { version: 1, default: { mode: 'local-only' }, branches: { main: { mode: 'enforced', model: 'gpt-5.6-sol', reasoningEffort: 'medium' } } };
test('resolves exact base-branch policy', () => assert.deepEqual(resolveCiPolicy(policy, 'main'), { baseBranch: 'main', mode: 'enforced', model: 'gpt-5.6-sol', reasoningEffort: 'medium' }));
test('uses explicit local-only default', () => assert.equal(resolveCiPolicy(policy, 'preview').mode, 'local-only'));
test('rejects incomplete enforcement', () => assert.throws(() => resolveCiPolicy({ ...policy, branches: { main: { mode: 'enforced' } } }, 'main')));

test('keeps protected codex-action arguments compatible', () => {
  const workflow = readFileSync(join(root, '.github/workflows/architecture-gate.yml'), 'utf8');
  assert.match(workflow, /uses: flair-agency\/codex-action@f93255fd2e5a17a0b4bd557599535e80c8607537/);
  assert.doesNotMatch(workflow, /uses: openai\/codex-action@/);
  assert.match(workflow, /codex-action-integrity:\n[\s\S]*?repository: flair-agency\/codex-action/);
  assert.match(workflow, /codex-action-integrity:\n    if: needs\.policy\.outputs\.mode == 'enforced'\n    needs: policy/);
  assert.match(workflow, /codex-action-integrity:\n[\s\S]*?timeout-minutes: 5/);
  assert.match(workflow, /src\/verify-codex-action\.mjs/);
  assert.match(workflow, /provenance\/codex-action-v1\.12-pr151\.json/);
  assert.match(workflow, /fetch-depth: 0/);
  assert.match(workflow, /ref: f93255fd2e5a17a0b4bd557599535e80c8607537/);
  assert.match(workflow, /Verify the pinned action before exposing review credentials/);
  assert.match(workflow, /name: Setup pnpm\n[\s\S]*?version: 10\.33\.0/);
  assert.match(workflow, /pnpm run check/);
  assert.match(workflow, /pnpm test/);
  assert.match(workflow, /needs: \[policy, codex-action-integrity\]/);
  assert.match(workflow, /persist-credentials: false/);
  assert.match(workflow, /safety-strategy: drop-sudo/);
  assert.doesNotMatch(workflow, /--ignore-user-config/);
});

test('uses the immutable called-workflow runtime and keeps review jobs read-only', () => {
  const workflow = readFileSync(join(root, '.github/workflows/architecture-gate.yml'), 'utf8');
  assert.match(workflow, /repository: \$\{\{ job\.workflow_repository \}\}/);
  assert.match(workflow, /ref: \$\{\{ job\.workflow_sha \}\}/);
  assert.doesNotMatch(workflow, /ref: v0\.1\.0/);
  assert.match(workflow, /review:\n[\s\S]*?permissions:\n      contents: read/);
  assert.match(workflow, /src\/ci-report\.mjs/);
  assert.match(workflow, /CONCLUSION: \$\{\{ needs\.report\.outputs\.conclusion \}\}/);
  assert.doesNotMatch(workflow, /JSON\.parse\(process\.env\.DECISION\)/);
  assert.match(workflow, /group: architecture-gate-\$\{\{ github\.repository \}\}-\$\{\{ github\.event\.pull_request\.number \}\}/);
  assert.match(workflow, /cancel-in-progress: true/);
  assert.match(workflow, /git show "\$BASE_SHA:\$PROMPT_PATH"/);
  assert.match(workflow, /git show "\$BASE_SHA:\$SCHEMA_PATH"/);
  assert.match(workflow, /protected-review-instructions:/);
  assert.match(workflow, /prompt-file: \$\{\{ inputs\.protected-review-instructions/);
  assert.match(workflow, /output-schema-file: \$\{\{ inputs\.protected-review-instructions/);
  assert.match(workflow, /git show "\$BASE_SHA:\$VALIDATION_PATH"/);
  assert.match(workflow, /src\/validate-decision\.mjs/);
  assert.match(workflow, /reviewed_sha: \$\{\{ steps\.revision\.outputs\.sha \}\}/);
  assert.match(workflow, /sha=\$\(git rev-parse HEAD\)/);
  assert.match(workflow, /REVIEWED_SHA: \$\{\{ needs\.review\.outputs\.reviewed_sha \}\}/);
  assert.doesNotMatch(workflow, /REVIEWED_SHA: \$\{\{ github\.event\.pull_request\.head\.sha \}\}/);
  assert.match(workflow, /report:\n[\s\S]*?permissions:\n      contents: read\n      pull-requests: write/);
  assert.doesNotMatch(workflow, /owner-decision-environment/);
  assert.doesNotMatch(workflow, /owner-decision-preflight/);
  assert.doesNotMatch(workflow, /Require protected owner approval/);
  assert.match(workflow, /name: Require successful reporting\n[\s\S]*?REPORT_RESULT: \$\{\{ needs\.report\.result \}\}\n[\s\S]*?test "\$REPORT_RESULT" = success/);
  assert.match(workflow, /name: Require model-backed PASS\n        if: needs\.policy\.outputs\.mode == 'enforced'/);
  assert.match(workflow, /test "\$CONCLUSION" = PASS/);
});

test('dogfoods only the protected reusable workflow with separated permissions', () => {
  const caller = readFileSync(join(root, '.github/workflows/self-architecture-gate.yml'), 'utf8');
  assert.match(caller, /pull_request_target:/);
  assert.match(caller, /uses: \.\/\.github\/workflows\/architecture-gate\.yml/);
  assert.match(caller, /contents: read/);
  assert.doesNotMatch(caller, /actions: read/);
  assert.match(caller, /pull-requests: write/);
  assert.match(caller, /protected-review-instructions: true/);
  assert.match(caller, /validation-path: \.codex\/gatekeeper\/decision\.validation\.json/);
  assert.doesNotMatch(caller, /owner-decision-environment/);
  assert.match(caller, /OPENAI_API_KEY: \$\{\{ secrets\.OPENAI_API_KEY \}\}/);
  assert.doesNotMatch(caller, /actions\/checkout/);
});

test('keeps self-review policy and schema valid', () => {
  const policy = JSON.parse(readFileSync(join(root, '.codex/gatekeeper/ci-policy.json'), 'utf8'));
  const schema = JSON.parse(readFileSync(join(root, '.codex/gatekeeper/decision.schema.json'), 'utf8'));
  assert.deepEqual(resolveCiPolicy(policy, 'main'), { baseBranch: 'main', mode: 'enforced', model: 'gpt-5.6-sol', reasoningEffort: 'medium' });
  assert.deepEqual(schema.properties.decision.enum, ['PASS', 'BLOCK', 'OWNER_DECISION']);
  assert.deepEqual(schema.properties.gates.required, ['sharedMechanism', 'trustBoundary']);
  assert.equal('anyOf' in schema, false);
  const validation = JSON.parse(readFileSync(join(root, '.codex/gatekeeper/decision.validation.json'), 'utf8'));
  assert.equal(validation.version, 1);
  assert.equal(validation.rules.length, 2);
});

test('dogfoods the committed local and manual review entrypoints', () => {
  const config = JSON.parse(readFileSync(join(root, '.codex/gatekeeper/config.json'), 'utf8'));
  const reviewer = JSON.parse(readFileSync(join(root, '.codex/gatekeeper/reviewer.config.json'), 'utf8'));
  const hooks = JSON.parse(readFileSync(join(root, '.codex/hooks.json'), 'utf8'));
  assert.deepEqual(config.authorityFiles, [
    'README.md',
    'package.json',
    '.github/workflows/architecture-gate.yml',
    'test/local.test.mjs'
  ]);
  assert.equal(config.promptPath, '.codex/gatekeeper/ci-prompt.md');
  assert.equal(config.schemaPath, '.codex/gatekeeper/decision.schema.json');
  assert.equal(config.validationPath, '.codex/gatekeeper/decision.validation.json');
  assert.equal(reviewer.model, 'gpt-5.6-sol');
  assert.equal(hooks.hooks.UserPromptSubmit[0].hooks[0].command, 'node src/hook.mjs');
});

test('publishes an exact reviewed package through the Flair registry contract', () => {
  const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  const workflow = readFileSync(join(root, '.github/workflows/publish.yml'), 'utf8');
  assert.equal(manifest.version, '0.3.2');
  assert.equal(manifest.repository.url, 'https://github.com/flair-agency/architecture-gatekeeper.git');
  assert.equal(manifest.publishConfig.registry, 'https://npm.pkg.github.com');
  assert.match(workflow, /expected_sha:/);
  assert.match(workflow, /EXPECTED_SHA: \$\{\{ inputs\.expected_sha \}\}/);
  assert.match(workflow, /publication must run from the protected default branch/);
  assert.match(workflow, /persist-credentials: false/);
  assert.match(workflow, /publish:\n    needs: build/);
  assert.match(workflow, /packages: write/);
  assert.match(workflow, /npm pack --ignore-scripts --json/);
  assert.match(workflow, /npm publish .*--ignore-scripts --registry=https:\/\/npm\.pkg\.github\.com/);
  assert.match(workflow, /visibility\)" = private/);
  for (const reference of workflow.matchAll(/uses:\s+([^\s#]+)/g)) {
    assert.match(reference[1], /@[0-9a-f]{40}$/);
  }
  const privilegedJob = workflow.slice(workflow.indexOf('\n  publish:'));
  assert.doesNotMatch(privilegedJob, /actions\/checkout|npm test|npm pack/);
});
