import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('declares separate installed adapters', () => {
  const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(manifest.version, '0.6.0-preview.4');
  assert.equal(manifest.bin['architecture-gatekeeper'], 'dist/local-gate.mjs');
  assert.equal(manifest.bin['architecture-review'], 'dist/manual-review.mjs');
  assert.equal(manifest.bin['architecture-review-native'], 'dist/native-review.mjs');
  assert.equal(manifest.bin['architecture-owner-addition-finalize'], 'dist/owner-addition-finalize.mjs');
  assert.equal(manifest.publishConfig.registry, 'https://npm.pkg.github.com');
});

test('keeps child Codex execution out of the shared contract and Skill adapter', () => {
  const contract = readFileSync(new URL('../src/review-contract.mjs', import.meta.url), 'utf8');
  const skill = readFileSync(new URL('../skills/architecture-review/SKILL.md', import.meta.url), 'utf8');
  const transport = readFileSync(new URL('../src/codex-transport.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(contract, /['"]exec['"]/);
  assert.match(skill, /host-native reviewer\/subagent/);
  assert.match(skill, /Do not use shell\s+execution or nested `codex exec`/s);
  assert.match(skill, /role is limited to\s+reviewing and does not include changing the reviewed repository/s);
  assert.match(skill, /Host-enforced read-only sandboxing and an exact hard timeout are optional/s);
  assert.match(skill, /do not validate/);
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

test('includes the linked native Skill E2E template in the package archive', () => {
  const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  const workflow = readFileSync(new URL('../.github/workflows/publish-package.yml', import.meta.url), 'utf8');
  const template = 'docs/investigations/native-skill-e2e-template.md';
  assert.ok(manifest.files.includes(template));
  assert.ok(readFileSync(new URL('../README.md', import.meta.url), 'utf8').includes(template));
  assert.ok(workflow.includes(template));
});

test('provides a committed self local review configuration', () => {
  const config = JSON.parse(readFileSync(new URL('../.codex/gatekeeper/config.json', import.meta.url), 'utf8'));
  const reviewer = JSON.parse(readFileSync(new URL('../.codex/gatekeeper/reviewer.config.json', import.meta.url), 'utf8'));
  const prompt = readFileSync(new URL('../.codex/gatekeeper/local-prompt.md', import.meta.url), 'utf8');
  assert.equal(config.version, 2);
  assert.equal(config.selfRepository, 'flair-agency/architecture-gatekeeper');
  assert.equal(config.authorityManifestPath, '.codex/gatekeeper/authorities.json');
  assert.equal(config.authorityLimits.maxPromptBytes, 524288);
  assert.equal(config.schemaPath, '.codex/gatekeeper/ci-decision.schema.json');
  assert.equal(config.validationPath, '.codex/gatekeeper/decision.validation.json');
  assert.equal(config.reviewerConfigPath, '.codex/gatekeeper/reviewer.config.json');
  assert.equal(config.reviewTimeoutMs, 180000);
  assert.equal(reviewer.model, 'gpt-6.1-sol');
  assert.match(prompt, /canonical repository-owned authority/);
  assert.match(prompt, /working-tree files[\s\S]*untrusted evidence/);
});

test('CI reviewer excludes checkout-owned AGENTS.md instructions', () => {
  const workflow = readFileSync(new URL('../.github/workflows/architecture-gate.yml', import.meta.url), 'utf8');
  const args = workflow.match(/^\s+codex-args: \$\{\{ needs\.policy\.outputs\.codex_args \|\| \(inputs\.self-flex-probe && '(.+)' \|\| '([^']+)'\) \}\}$/mu);
  assert.ok(args, 'CI review must set explicit default and self Flex Codex arguments');
  assert.deepEqual(JSON.parse(args[2]), [
    '--ephemeral',
    '-c',
    'project_doc_max_bytes=0',
    '--json',
  ]);
  // GitHub expression literals decode doubled single quotes before sending
  // this JSON string to codex-action.
  assert.deepEqual(JSON.parse(args[1].replaceAll("''", "'")), [
    '--ephemeral',
    '-c',
    'project_doc_max_bytes=0',
    '-c',
    "service_tier='flex'",
    '--json',
  ]);
  assert.equal(JSON.parse(args[2]).includes('--json'), true);
  assert.match(workflow, /Confine optional Flex probe to the self reviewer/);
  assert.match(workflow, /name: Confine optional Flex probe to the self reviewer\n\s+if: inputs\.self-flex-probe && needs\.policy\.outputs\.codex_args == ''/);
  const flexProbeCheckRuns = (selfFlexProbe, policyCodexArgs) => selfFlexProbe && policyCodexArgs === '';
  assert.equal(flexProbeCheckRuns(true, ''), true, 'legacy caller-selected Flex still receives confinement checks');
  assert.equal(flexProbeCheckRuns(true, JSON.stringify(JSON.parse(args[2]))), false, 'policy-selected Codex args bypass the legacy probe check');
  assert.equal(flexProbeCheckRuns(false, ''), false, 'the check remains opt-in for legacy callers');
  const selfWorkflow = readFileSync(new URL('../.github/workflows/self-architecture-gate.yml', import.meta.url), 'utf8');
  assert.match(selfWorkflow, /self-flex-probe: \$\{\{ vars\.ARCHITECTURE_GATE_SELF_FLEX == 'true'/);
  assert.match(selfWorkflow, /vars\.ARCHITECTURE_GATE_SELF_FLEX_PR == format\('\{0\}', github\.event\.pull_request\.number\)/);
  assert.match(selfWorkflow, /vars\.ARCHITECTURE_GATE_SELF_FLEX_HEAD == github\.event\.pull_request\.head\.sha/);
  assert.match(workflow, /protected-review-instructions/);
});
