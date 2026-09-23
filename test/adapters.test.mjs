import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('declares separate installed adapters', () => {
  const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(manifest.version, '0.4.1');
  assert.equal(manifest.bin['architecture-gatekeeper'], 'src/local-gate.mjs');
  assert.equal(manifest.bin['architecture-review'], 'src/manual-review.mjs');
  assert.equal(manifest.bin['architecture-review-native'], 'src/native-review.mjs');
  assert.equal(manifest.publishConfig.registry, 'https://npm.pkg.github.com');
});

test('keeps child Codex execution out of the shared contract and Skill adapter', () => {
  const contract = readFileSync(new URL('../src/review-contract.mjs', import.meta.url), 'utf8');
  const skill = readFileSync(new URL('../skills/architecture-review/SKILL.md', import.meta.url), 'utf8');
  const transport = readFileSync(new URL('../src/codex-transport.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(contract, /['"]exec['"]/);
  assert.match(skill, /host-native reviewer\/subagent/);
  assert.match(skill, /Do not use shell\s+execution or nested `codex exec`/s);
  assert.match(skill, /`reviewTimeoutMs`/);
  assert.match(skill, /do not run validation/);
  assert.match(transport, /\['exec'/);
});

test('publishes only an exact tested tag through GitHub Packages', () => {
  const workflow = readFileSync(new URL('../.github/workflows/publish-package.yml', import.meta.url), 'utf8');
  assert.match(workflow, /test "\$\(git rev-parse HEAD\)" = "\$RELEASE_SHA"/);
  assert.match(workflow, /npm pack --ignore-scripts --json/);
  assert.match(workflow, /id: archive/);
  assert.match(workflow, /npm install --ignore-scripts --offline "\$ARCHIVE_PATH"/);
  assert.match(workflow, /installed-smoke\.mjs/);
  assert.match(workflow, /npm publish "\$ARCHIVE_PATH" --ignore-scripts/);
  assert.match(workflow, /EXPECTED_INTEGRITY: \$\{\{ steps\.archive\.outputs\.integrity \}\}/);
  assert.match(workflow, /test "\$ACTUAL_INTEGRITY" = "\$EXPECTED_INTEGRITY"/);
});

test('provides a committed self local review configuration', () => {
  const config = JSON.parse(readFileSync(new URL('../.codex/gatekeeper/config.json', import.meta.url), 'utf8'));
  const reviewer = JSON.parse(readFileSync(new URL('../.codex/gatekeeper/reviewer.config.json', import.meta.url), 'utf8'));
  const prompt = readFileSync(new URL('../.codex/gatekeeper/local-prompt.md', import.meta.url), 'utf8');
  assert.deepEqual(config.authorityFiles, ['docs/architecture.md']);
  assert.deepEqual(config.requiredReportedAuthorityFiles, ['docs/architecture.md']);
  assert.equal(config.schemaPath, '.codex/gatekeeper/decision.schema.json');
  assert.equal(config.validationPath, '.codex/gatekeeper/decision.validation.json');
  assert.equal(config.reviewerConfigPath, '.codex/gatekeeper/reviewer.config.json');
  assert.equal(config.reviewTimeoutMs, 180000);
  assert.equal(reviewer.model, 'gpt-6-sol');
  assert.match(prompt, /canonical repository-owned authority/);
  assert.match(prompt, /working-tree files[\s\S]*untrusted evidence/);
});

test('CI reviewer excludes checkout-owned AGENTS.md instructions', () => {
  const workflow = readFileSync(new URL('../.github/workflows/architecture-gate.yml', import.meta.url), 'utf8');
  const args = workflow.match(/^\s+codex-args: '([^']+)'$/mu);
  assert.ok(args, 'CI review must set explicit Codex arguments');
  assert.deepEqual(JSON.parse(args[1]), [
    '--ephemeral',
    '-c',
    'project_doc_max_bytes=0',
  ]);
  assert.match(workflow, /protected-review-instructions/);
});
