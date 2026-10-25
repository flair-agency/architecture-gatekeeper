import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseCiPolicyJson, resolveCiPolicy } from '../dist/resolve-ci-policy.mjs';
import { MAX_AUTHORITY_LIMITS, MULTI_AUTHORITY_PROFILE, materializeAuthoritySet, parseAuthorityManifest } from '../dist/authority-set.mjs';
import { validateAuthorityReviewSchema } from '../dist/preflight-authority-set-review.mjs';
import { parseWorkflow } from './helpers/workflow-structure.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const policy = { version: 1, default: { mode: 'local-only' }, branches: { main: { mode: 'enforced', model: 'gpt-6.1-sol', reasoningEffort: 'medium', authorityFiles: ['docs/architecture.md'], promptPath: '.codex/gatekeeper/ci-prompt.md', schemaPath: '.codex/gatekeeper/decision.schema.json', validationPath: null } } };
test('resolves exact base-branch policy', () => assert.deepEqual(resolveCiPolicy(policy, 'main'), { baseBranch: 'main', mode: 'enforced', model: 'gpt-6.1-sol', reasoningEffort: 'medium', policyVersion: 1, legacyAuthorityFilesBase64: Buffer.from('["docs/architecture.md"]').toString('base64'), legacyPromptPath: '.codex/gatekeeper/ci-prompt.md', legacySchemaPath: '.codex/gatekeeper/decision.schema.json', legacyValidationPath: '' }));
test('artifact CLI workflows run from runner.temp with anchored runtime paths', () => {
  for (const name of ['architecture-gate.yml', 'architecture-gate-consumer.yml', 'architecture-gate-providers.yml']) {
    const parsed = parseWorkflow(readFileSync(join(root, '.github/workflows', name), 'utf8'), name);
    // Consumer/self legacy steps are checked by assertWorkflowStructure;
    // the provider workflow is outside that helper's selected workflow set.
    if (name === 'architecture-gate-providers.yml') {
      const review = parsed.jobs.review;
      for (const [stepName, command] of [
        ['Materialize recorded-base legacy authority before review', 'node "$GATEKEEPER_RUNTIME_ROOT/dist/prepare-legacy-ci-authority.mjs" prepare'],
        ['Require exact reported legacy authority files', 'node "$GATEKEEPER_RUNTIME_ROOT/dist/prepare-legacy-ci-authority.mjs" validate'],
      ]) {
        const step = review.steps.find(candidate => candidate.name === stepName);
        assert.equal(step['working-directory'], '${{ runner.temp }}', `${name}: ${stepName} cwd`);
        assert.equal(step.run, command, `${name}: ${stepName} runtime`);
      }
    }
    const addition = parsed.jobs['owner-addition'];
    for (const [stepName, command] of [
      ['Verify the exact G0 procedure and prepare protected eligibility input', 'node "$GITHUB_WORKSPACE/.architecture-gatekeeper-runtime/dist/owner-addition-ci.mjs" prepare'],
      ['Require completed B-specific eligibility review', 'node "$GITHUB_WORKSPACE/.architecture-gatekeeper-runtime/dist/owner-addition-ci.mjs" validate'],
    ]) {
      const step = addition.steps.find(candidate => candidate.name === stepName);
      assert.equal(step['working-directory'], '${{ runner.temp }}', `${name}: ${stepName} cwd`);
      assert.equal(step.run, command, `${name}: ${stepName} runtime`);
    }
  }
});

test('legacy v1 enforced policy requires canonical paths and an explicit validation selection', () => {
  const { validationPath: _validationPath, ...missingValidation } = policy.branches.main;
  assert.throws(() => resolveCiPolicy({ ...policy, branches: { main: missingValidation } }, 'main'), /explicit base-selected validationPath or null/);
  assert.equal(resolveCiPolicy(policy, 'main').legacyValidationPath, '');
  assert.throws(() => resolveCiPolicy({ ...policy, branches: { main: { ...policy.branches.main, authorityFiles: undefined } } }, 'main'), /authorityFiles/);
  assert.equal(resolveCiPolicy({ version: 1, default: { mode: 'local-only' }, branches: {} }, 'main').mode, 'local-only');
  for (const authorityFiles of [[], ['../architecture.md'], ['docs/architecture', 'docs/architecture']]) {
    assert.throws(() => resolveCiPolicy({ ...policy, branches: { main: { ...policy.branches.main, authorityFiles } } }, 'main'), /authorityFiles/);
  }
  assert.equal(resolveCiPolicy({ ...policy, branches: { main: { ...policy.branches.main, authorityFiles: ['docs/architecture', 'decisions/owner.policy'] } } }, 'main').legacyAuthorityFilesBase64,
    Buffer.from('["docs/architecture","decisions/owner.policy"]').toString('base64'));
  assert.throws(() => resolveCiPolicy({ ...policy, branches: { main: { ...policy.branches.main, promptPath: '../unsafe.md' } } }, 'main'), /promptPath/);
  assert.throws(() => resolveCiPolicy({ ...policy, branches: { main: { ...policy.branches.main, schemaPath: undefined } } }, 'main'), /schemaPath/);
  assert.equal(resolveCiPolicy({ ...policy, branches: { main: { ...policy.branches.main, validationPath: '.codex/gatekeeper/decision.validation.json' } } }, 'main').legacyValidationPath, '.codex/gatekeeper/decision.validation.json');
  assert.throws(() => resolveCiPolicy({ ...policy, branches: { main: { ...policy.branches.main, validationPath: '' } } }, 'main'), /validationPath/);
  assert.throws(() => resolveCiPolicy({ ...policy, branches: { main: { ...policy.branches.main, validationPath: '../unsafe.json' } } }, 'main'), /validationPath/);
});
test('legacy v1 workflow binds protected instructions, authority, and exact report', () => {
  const workflow = readFileSync(join(root, '.github/workflows/architecture-gate.yml'), 'utf8');
  const parsed = parseWorkflow(workflow, 'architecture-gate.yml');
  assert.match(workflow, /if: steps\.resolve\.outputs\.authorityManifestPath != '' \|\| steps\.resolve\.outputs\.policyVersion == '1'/);
  const prepareLegacy = parsed.jobs.review.steps.find(step => step.name === 'Materialize recorded-base legacy authority before review');
  assert.equal(prepareLegacy['working-directory'], '${{ runner.temp }}');
  assert.equal(prepareLegacy.run, 'node "$GATEKEEPER_RUNTIME_ROOT/dist/prepare-legacy-ci-authority.mjs" prepare');
  const validateLegacy = parsed.jobs.review.steps.find(step => step.name === 'Require exact reported legacy authority files');
  assert.equal(validateLegacy['working-directory'], '${{ runner.temp }}');
  assert.equal(validateLegacy.run, 'node "$GATEKEEPER_RUNTIME_ROOT/dist/prepare-legacy-ci-authority.mjs" validate');
  assert.match(workflow, /LEGACY_AUTHORITY_PROVENANCE_BASE64: \$\{\{ needs\.review\.outputs\.legacy_authority_provenance \}\}/);
  assert.match(workflow, /test "\$POLICY_PATH" = \.codex\/gatekeeper\/ci-policy\.json/);
  assert.match(workflow, /PROMPT_PATH: \$\{\{ needs\.policy\.outputs\.policy_version == '1' && needs\.policy\.outputs\.legacy_prompt_path \|\| inputs\.prompt-path \}\}/);
  assert.match(workflow, /SCHEMA_PATH: \$\{\{ needs\.policy\.outputs\.policy_version == '1' && needs\.policy\.outputs\.legacy_schema_path \|\| inputs\.schema-path \}\}/);
  assert.match(workflow, /if: \(needs\.policy\.outputs\.policy_version == '1' && needs\.policy\.outputs\.legacy_validation_path != ''\) \|\| \(needs\.policy\.outputs\.policy_version != '1' && inputs\.validation-path != ''\)/);
  const selection = parsed.jobs.policy.steps.find(step => step.name === 'Require caller validation selection to match recorded-base v1 policy');
  assert.equal(selection.if, "steps.resolve.outputs.policyVersion == '1'");
  assert.deepEqual(selection.env, {
    CALLER_VALIDATION_PATH: '${{ inputs.validation-path }}',
    BASE_VALIDATION_PATH: '${{ steps.resolve.outputs.legacyValidationPath }}',
    GATEKEEPER_RUNTIME_ROOT: '${{ steps.runtime_location.outputs.root }}',
  });
  assert.equal(selection.run, 'node "$GATEKEEPER_RUNTIME_ROOT/dist/verify-legacy-validation-selection.mjs" "$BASE_VALIDATION_PATH" "$CALLER_VALIDATION_PATH"');
  assert.match(workflow, /VALIDATION_PATH: \$\{\{ needs\.policy\.outputs\.policy_version == '1' && needs\.policy\.outputs\.legacy_validation_path \|\| inputs\.validation-path \}\}/);
});
test('uses explicit local-only default', () => assert.equal(resolveCiPolicy(policy, 'preview').mode, 'local-only'));
test('rejects incomplete enforcement', () => assert.throws(() => resolveCiPolicy({ ...policy, branches: { main: { mode: 'enforced' } } }, 'main')));
test('rejects v2-like selectors instead of silently using the legacy route', () => {
  assert.throws(() => resolveCiPolicy({ ...policy, authoritySet: [] }, 'main'), /Unknown CI policy field/);
  assert.throws(() => resolveCiPolicy({ ...policy, default: { mode: 'local-only', authoritySet: [] } }, 'main'), /Unknown CI policy default field/);
  assert.throws(() => resolveCiPolicy({ ...policy, branches: { main: policy.branches.main, preview: { mode: 'local-only', authoritySet: [] } } }, 'main'), /Unknown CI policy branch preview field/);
});
test('validates every branch entry, including unselected branches', () => {
  assert.throws(() => resolveCiPolicy({ ...policy, branches: { main: policy.branches.main, preview: { mode: 'enforced', model: 'gpt-6.1-sol', reasoningEffort: 'medium', authoritySet: [] } } }, 'main'), /Unknown CI policy branch preview field/);
  assert.throws(() => resolveCiPolicy({ ...policy, branches: { main: policy.branches.main, preview: null } }, 'main'), /Invalid CI policy branch preview/);
});
test('rejects extra fields on local-only policies and malformed policy objects', () => {
  assert.throws(() => resolveCiPolicy({ ...policy, default: { mode: 'local-only', model: 'ignored' } }, 'main'), /Unknown CI policy default field|Invalid CI policy default/);
  assert.throws(() => resolveCiPolicy([], 'main'));
  assert.throws(() => resolveCiPolicy({ ...policy, default: [] }, 'main'));
  assert.throws(() => resolveCiPolicy({ ...policy, branches: [] }, 'main'));
});

const effectiveLimits = { maxManifestBytes: 16384, maxMembers: 16, maxFileBytes: 65536, maxTotalBytes: 262144, maxPromptBytes: 524288 };
const distributed = { version: 2, default: { mode: 'local-only' }, branches: { main: { mode: 'enforced', model: 'gpt-6.1-sol', reasoningEffort: 'medium', authorityManifestPath: '.codex/gatekeeper/authorities.json', authorityLimits: effectiveLimits } } };
test('v2 selects protected-base Authority Set limits without changing v1 output', () => {
  const selected = resolveCiPolicy(distributed, 'main');
  assert.equal(selected.authorityManifestPath, '.codex/gatekeeper/authorities.json');
  assert.deepEqual(JSON.parse(Buffer.from(selected.authorityLimitsBase64, 'base64').toString()), effectiveLimits);
  assert.equal(Object.hasOwn(resolveCiPolicy(policy, 'main'), 'authorityManifestPath'), false);
  assert.equal(Object.hasOwn(resolveCiPolicy(distributed, 'preview'), 'authorityManifestPath'), false);
});
test('v2 rejects incomplete, invalid and over-ceiling limits even on unselected branches', () => {
  for (const branch of [
    { ...distributed.branches.main, authorityLimits: undefined },
    { ...distributed.branches.main, authorityLimits: { ...effectiveLimits, maxMembers: MAX_AUTHORITY_LIMITS.maxMembers + 1 } },
    { ...distributed.branches.main, authorityLimits: { ...effectiveLimits, maxFileBytes: 0 } },
    { ...distributed.branches.main, authorityLimits: { ...effectiveLimits, maxPromptBytes: '524288' } },
    { ...distributed.branches.main, authorityLimits: { maxMembers: 16 } },
    { ...distributed.branches.main, authorityManifestPath: '../authorities.json' },
  ]) {
    assert.throws(() => resolveCiPolicy({ ...distributed, branches: { main: distributed.branches.main, other: branch } }, 'main'));
  }
  assert.throws(() => resolveCiPolicy({ ...policy, branches: { main: { ...policy.branches.main, authorityManifestPath: 'authorities.json' } } }, 'main'), /Unknown/);
});
test('only a protected v2 enforced branch may select the exact G0 authority', () => {
  const enabled = { grade: 'G0', authorityPath: 'docs/architecture.md',
    promptPath: '.codex/gatekeeper/owner-addition-prompt.md', schemaPath: '.codex/gatekeeper/owner-addition.schema.json' };
  const selected = resolveCiPolicy({ ...distributed, branches: { main: {
    ...distributed.branches.main, ownerAddition: enabled,
  } } }, 'main');
  assert.equal(selected.ownerAdditionGrade, 'G0');
  assert.equal(selected.ownerAdditionAuthorityPath, 'docs/architecture.md');
  assert.equal(selected.ownerAdditionPromptPath, enabled.promptPath);
  assert.equal(selected.ownerAdditionSchemaPath, enabled.schemaPath);
  assert.throws(() => resolveCiPolicy({ version: 2, default: { mode: 'local-only' }, branches: { main: {
    mode: 'enforced', model: 'gpt-6.1-sol', reasoningEffort: 'medium', ownerAddition: enabled,
  } } }, 'main'), /requires a protected Authority Set/);
  assert.equal(Object.hasOwn(resolveCiPolicy(distributed, 'main'), 'ownerAdditionGrade'), false);
  for (const ownerAddition of [
    { ...enabled, grade: 'G1' },
    { ...enabled, authorityPath: '../docs/architecture.md' },
    { ...enabled, promptPath: '../owner-addition-prompt.md' },
    { ...enabled, schemaPath: 'schema.md' },
    { ...enabled, allowBlock: true },
    { grade: 'G0', authorityPath: 'docs/architecture.md' },
  ]) {
    assert.throws(() => resolveCiPolicy({ ...distributed, branches: {
      main: distributed.branches.main, other: { ...distributed.branches.main, ownerAddition },
    } }, 'main'));
  }
  assert.throws(() => resolveCiPolicy({ ...policy, branches: { main: {
    ...policy.branches.main, ownerAddition: enabled,
  } } }, 'main'), /Unknown/);
  assert.throws(() => resolveCiPolicy({ ...distributed, default: {
    mode: 'local-only', ownerAddition: enabled,
  } }, 'main'));
});

const multiAuthorityLimits = { maxManifestBytes: 16384, maxMembers: 16, maxFileBytes: 262144, maxTotalBytes: 524288, maxPromptBytes: 1048576 };
function proceduralPolicy() {
  return { version: 5, default: { mode: 'local-only' }, branches: { main: {
    mode: 'procedural', model: 'gpt-6.1-sol', reasoningEffort: 'medium',
    authorityManifestPath: '.codex/gatekeeper/authorities.json', authorityLimits: { ...multiAuthorityLimits },
    ownerAddition: { version: 2, grade: 'G0', authorityId: 'architecture', authorityPath: 'docs/architecture.md',
      promptPath: '.codex/gatekeeper/owner-addition-prompt.md', schemaPath: '.codex/gatekeeper/owner-addition.schema.json' },
    adoptionEvidence: { producer: 'github-actions', workflowPath: '.github/workflows/architecture-gate.yml', jobName: 'architecture-gate / owner-addition' },
  } } };
}

test('v5 selects recorded-base procedural G0 policy with validated producer identity and multi-authority profile', () => {
  const selected = resolveCiPolicy(proceduralPolicy(), 'main');
  assert.equal(selected.mode, 'procedural');
  assert.equal(selected.policyVersion, 5);
  assert.equal(selected.ownerAdditionVersion, 2);
  assert.equal(selected.authorityProfile, MULTI_AUTHORITY_PROFILE);
  assert.equal(selected.ownerAdditionAuthorityId, 'architecture');
  assert.equal(selected.adoptionEvidenceProducer, 'github-actions');
  assert.equal(selected.adoptionEvidenceWorkflowPath, '.github/workflows/architecture-gate.yml');
  assert.equal(selected.adoptionEvidenceJobName, 'architecture-gate / owner-addition');
  assert.deepEqual(JSON.parse(Buffer.from(selected.authorityLimitsBase64, 'base64').toString()), multiAuthorityLimits);
  assert.equal(resolveCiPolicy(proceduralPolicy(), 'preview').mode, 'local-only');
});

test('v5 rejects mixed versions, incomplete procedural selection and ambiguous adoption evidence', () => {
  const valid = proceduralPolicy();
  const mutators = [
    value => { value.version = 4; },
    value => { value.branches.main.mode = 'enforced'; },
    value => { delete value.branches.main.authorityManifestPath; },
    value => { delete value.branches.main.authorityLimits; },
    value => { delete value.branches.main.ownerAddition; },
    value => { value.branches.main.ownerAddition.version = 1; },
    value => { delete value.branches.main.ownerAddition.authorityId; },
    value => { delete value.branches.main.adoptionEvidence; },
    value => { value.branches.main.adoptionEvidence.producer = 'candidate'; },
    value => { value.branches.main.adoptionEvidence.workflowPath = '../workflow.yml'; },
    value => { value.branches.main.adoptionEvidence.workflowPath = '.github/workflows/nested/workflow.yml'; },
    value => { value.branches.main.adoptionEvidence.workflowPath = '.github/workflows/workflow.json'; },
    value => { value.branches.main.adoptionEvidence.jobName = 'architecture-gate/owner-addition'; },
    value => { value.branches.main.adoptionEvidence.jobName = 'architecture-gate / '; },
    value => { value.branches.main.adoptionEvidence.unselected = true; },
    value => { value.candidate = { policyVersion: 5 }; },
  ];
  for (const mutate of mutators) {
    const invalid = proceduralPolicy();
    mutate(invalid);
    assert.throws(() => resolveCiPolicy(invalid, 'main'));
  }
  assert.throws(() => resolveCiPolicy({ ...valid, default: { mode: 'local-only', adoptionEvidence: valid.branches.main.adoptionEvidence } }, 'main'));
  assert.throws(() => resolveCiPolicy({ version: 4, default: { mode: 'local-only' }, branches: { main: {
    ...distributed.branches.main, adoptionEvidence: valid.branches.main.adoptionEvidence,
  } } }, 'main'), /Unknown.*adoptionEvidence|requires CI policy v5/);
});

test('protected policy rejects duplicate JSON keys before resolving effective limits', t => {
  const repeated = JSON.stringify(distributed).replace('"maxMembers":16', '"maxMembers":16,"maxMembers":32');
  assert.throws(() => parseCiPolicyJson(repeated), /duplicate JSON key/);
  assert.throws(() => parseCiPolicyJson('{"version":1,"version":2,"default":{"mode":"local-only"},"branches":{}}'), /duplicate JSON key/);
  const folder = mkdtempSync(join(tmpdir(), 'gate-policy-'));
  t.after(() => rmSync(folder, { recursive: true, force: true }));
  const file = join(folder, 'ci-policy.json');
  writeFileSync(file, repeated);
  assert.throws(() => execFileSync(process.execPath, [join(root, 'dist/resolve-ci-policy.mjs'), file, 'main'], { stdio: 'ignore' }));
});

test('uses the pinned upstream Codex Action with supported protected inputs', () => {
  const workflow = readFileSync(join(root, '.github/workflows/architecture-gate.yml'), 'utf8');
  const pin = '86365089eb2b84e0a8fb0717b304f8bdcb13b20e';
  const actionSteps = workflow
    .split(/^      - name: /m)
    .slice(1)
    .map((step) => `      - name: ${step}`)
    .filter((step) => /^        uses: openai\/codex-action@/m.test(step));

  assert.equal(actionSteps.length, 3);
  for (const step of actionSteps) {
    assert.match(step, new RegExp(`uses: openai/codex-action@${pin}`));
    assert.match(step, /openai-api-key: \$\{\{ secrets\.OPENAI_API_KEY \}\}/);
    assert.match(step, /model: \$\{\{/);
    assert.match(step, /effort: \$\{\{/);
    assert.match(step, /sandbox: read-only/);
    assert.match(step, /safety-strategy: drop-sudo/);
    assert.match(step, /codex-args:/);
    assert.doesNotMatch(step, /timeout-seconds:/);
  }

  assert.match(actionSteps[0], /output-file: \$\{\{ runner\.temp \}\}\/architecture-gate-codex-final\.json/);
  assert.match(actionSteps[0], /output-schema-file:/);
  assert.match(actionSteps[0], /prompt-file:/);
  assert.match(actionSteps[1], /output-file: \$\{\{ runner\.temp \}\}\/architecture-gate-owner-addition-final\.json/);
  assert.match(actionSteps[2], /output-schema-file:/);
  assert.match(workflow, /review:\n[\s\S]*?timeout-minutes: \$\{\{ fromJSON\(needs\.policy\.outputs\.review_job_timeout_minutes\) \}\}/);
  assert.match(workflow, /name: Run read-only architecture review\n        id: codex\n        timeout-minutes: \$\{\{ fromJSON\(needs\.policy\.outputs\.review_step_timeout_minutes\) \}\}/);
  assert.match(workflow, /name: Diagnose architecture reviewer completion\n        if: always\(\)\n        timeout-minutes: 1\n        continue-on-error: true/);
  assert.match(workflow, /output-file: \$\{\{ runner\.temp \}\}\/architecture-gate-codex-final\.json/);
  assert.match(workflow, /Codex final message file: (?:present|absent)/);
  assert.match(workflow, /Codex final message JSON: parseable/);
  assert.doesNotMatch(workflow, /--ignore-user-config/);
  assert.doesNotMatch(workflow, /uses: flair-agency\/codex-action@/);
  assert.doesNotMatch(workflow, /codex-action-integrity(?:-observe)?:/);
  assert.doesNotMatch(workflow, /needs: \[policy, codex-action-integrity/);
});

test('keeps bounded job and step deadlines around upstream Codex Action calls', () => {
  const workflow = readFileSync(join(root, '.github/workflows/architecture-gate.yml'), 'utf8');
  const actionSteps = workflow
    .split(/^      - name: /m)
    .slice(1)
    .map((step) => `      - name: ${step}`)
    .filter((step) => /^        uses: openai\/codex-action@/m.test(step));

  assert.equal(actionSteps.length, 3);
  assert.match(actionSteps[0], /timeout-minutes: \$\{\{ fromJSON\(needs\.policy\.outputs\.review_step_timeout_minutes\) \}\}/);
  assert.match(actionSteps[1], /timeout-minutes: 5/);
  assert.match(actionSteps[2], /timeout-minutes: \$\{\{ fromJSON\(needs\.policy\.outputs\.review_step_timeout_minutes\) \}\}/);
  assert.doesNotMatch(workflow, /timeout-seconds:/);
});

test('uses the protected ordinary review, Gemini, and OWNER_ADDITION paths', () => {
  const workflow = readFileSync(join(root, '.github/workflows/architecture-gate.yml'), 'utf8');
  const parsed = parseWorkflow(workflow, 'architecture-gate.yml');
  assert.match(workflow, /repository: \$\{\{ job\.workflow_repository \}\}/);
  assert.match(workflow, /ref: \$\{\{ job\.workflow_sha \}\}/);
  assert.doesNotMatch(workflow, /ref: v0\.1\.0/);
  assert.match(workflow, /git show "\$BASE_SHA:\$PROMPT_PATH"/);
  assert.match(workflow, /dist\/validate-decision\.mjs/);
  assert.match(workflow, /dist\/preflight-authority-set-review\.mjs/);
  assert.match(workflow, /dist\/validate-authority-set-decision\.mjs/);
  const review = parsed.jobs.review;
  assert.deepEqual(review.permissions, { contents: 'read' });
  assert.match(review.steps.find(step => step.name === 'Select validated pull request merge commit').run,
    /git --no-replace-objects cat-file -t "\$SELECTED_SHA"/);
  assert.match(review.steps.find(step => step.name === 'Record reviewed merge revision').run,
    /expected_parents="\$actual_sha \$BASE_SHA \$HEAD_SHA"/);
  assert.equal(parsed.jobs['gemini-review'].permissions.contents, 'read');
  assert.ok(parsed.jobs['gemini-review'].steps.some(step => step.name === 'Compare Self Authority using the recorded-base selection'));

  const addition = parsed.jobs['owner-addition'];
  assert.match(addition.if, /needs\.policy\.outputs\.owner_addition_grade == 'G0'/);
  assert.match(addition.if, /needs\.review\.outputs\.decision_kind == 'OWNER_DECISION'/);
  assert.deepEqual(addition.needs, ['policy', 'review']);
  assert.equal(addition.steps.find(step => step.name === 'Check out only the previous protected base').with.ref,
    '${{ github.event.pull_request.base.sha }}');
  assert.match(addition.steps.find(step => step.name === 'Fetch B and its annotated tag as Git objects only').run,
    /test "\$\(git rev-parse FETCH_HEAD\)" = "\$REVIEWED_SHA"/);
  assert.equal(addition.steps.find(step => step.name === 'Verify the exact G0 procedure and prepare protected eligibility input').run,
    'node "$GITHUB_WORKSPACE/.architecture-gatekeeper-runtime/dist/owner-addition-ci.mjs" prepare');
  assert.equal(addition.steps.find(step => step.name === 'Require completed B-specific eligibility review').run,
    'node "$GITHUB_WORKSPACE/.architecture-gatekeeper-runtime/dist/owner-addition-ci.mjs" validate');
  assert.match(addition.steps.find(step => step.name === 'Preserve exact v5 pre-merge eligibility evidence').if,
    /steps\.eligibility\.outputs\.eligibility == 'ELIGIBLE'/);

  assert.deepEqual(parsed.jobs.report.permissions, { contents: 'read', actions: 'read', 'pull-requests': 'write' });
  assert.deepEqual(parsed.jobs.accept.needs, ['policy', 'review', 'gemini-review', 'owner-addition', 'owner-amendment', 'report']);
  assert.equal(parsed.jobs.accept.if, 'always()');
  assert.equal(parsed.jobs.accept.steps.find(step => step.name === 'Require ordinary PASS or the selected verified Owner procedure').run,
    'node .architecture-gatekeeper-runtime/dist/ci-enforced-acceptance.mjs');
  assert.match(workflow, /name: Require successful reporting[\s\S]*?REPORT_RESULT: \$\{\{ needs\.report\.result \}\}[\s\S]*?test "\$REPORT_RESULT" = success/);
  assert.match(workflow, /name: Require PASS or pre-merge G0 eligibility[\s\S]*?needs\.policy\.outputs\.mode == 'procedural'/);
  assert.doesNotMatch(workflow, /owner-amendment-attempt-classifier|semantic-eligibility-signer|self-app-|self-queue-|merge_group:/);
});

test('runs one self amendment review from protected inputs and revalidates its same-run result at K', () => {
  const workflow = readFileSync(join(root, '.github/workflows/architecture-gate.yml'), 'utf8');
  const parsed = parseWorkflow(workflow, 'architecture-gate.yml');
  const amendment = parsed.jobs['owner-amendment'];
  assert.equal(amendment.if.startsWith('always()'), true);
  assert.deepEqual(amendment.needs, ['policy', 'review', 'owner-addition']);
  assert.match(amendment.if, /needs\.review\.outputs\.self_authority_changed == 'true'/);
  assert.match(amendment.if, /needs\['owner-addition'\]\.outputs\.eligibility != 'ELIGIBLE'/);
  assert.match(amendment.if, /needs\.review\.result == 'success'/);
  assert.deepEqual(amendment.permissions, { contents: 'read' });

  const baseCheckout = amendment.steps.find(step => step.name === 'Check out the adopted base runtime');
  assert.equal(baseCheckout.with.ref, '${{ github.event.pull_request.base.sha }}');
  assert.equal(baseCheckout.with['persist-credentials'], false);
  const prepare = amendment.steps.find(step => step.name === 'Prepare amendment review from the complete old Authority Set');
  assert.match(prepare.run, /self-amendment-pr\.mjs" prepare/);
  assert.equal(prepare.env.BASE_SHA, '${{ github.event.pull_request.base.sha }}');
  assert.equal(prepare.env.REVIEWED_SHA, '${{ needs.review.outputs.reviewed_sha }}');
  assert.equal(prepare['working-directory'], '${{ runner.temp }}');
  const model = amendment.steps.find(step => step.name === 'Review amendment eligibility');
  assert.equal(model.uses, 'openai/codex-action@86365089eb2b84e0a8fb0717b304f8bdcb13b20e');
  assert.equal(model.with['openai-api-key'], '${{ secrets.OPENAI_API_KEY }}');
  assert.equal(model.with.sandbox, 'read-only');
  assert.equal(Object.values(amendment.steps.filter(step => step !== model).map(step => step.env ?? {})).flatMap(Object.values)
    .some(value => String(value).includes('secrets.OPENAI_API_KEY')), false);
  const complete = amendment.steps.find(step => step.name === 'Validate the decision against the exact same-run inputs');
  assert.match(complete.run, /self-amendment-pr\.mjs" complete/);
  assert.equal(complete.env.DECISION, '${{ steps.codex.outputs.final-message }}');
  assert.equal(amendment.outputs.context_sha256, '${{ steps.complete.outputs.context_sha256 }}');
  assert.equal(amendment.outputs.decision_base64, '${{ steps.complete.outputs.decision_base64 }}');

  const accept = parsed.jobs.accept;
  assert.equal(accept.if, 'always()');
  assert.ok(accept.needs.includes('owner-amendment'));
  const verify = accept.steps.find(step => step.name === 'Verify amendment decision and current PR context');
  assert.match(verify.run, /self-amendment-pr\.mjs" verify/);
  assert.equal(verify.env.CONTEXT_SHA256, "${{ needs['owner-amendment'].outputs.context_sha256 }}");
  assert.equal(verify.env.DECISION_BASE64, "${{ needs['owner-amendment'].outputs.decision_base64 }}");
  assert.ok(accept.steps.indexOf(verify) < accept.steps.findIndex(step => step.name === 'Require ordinary PASS or the selected verified Owner procedure'));
  assert.doesNotMatch(workflow, /owner-amendment-(?:attempt-classifier|semantic-eligibility-signer)|actions\/attest@|attestations: write|self-app-|self-queue-|merge_group:/);
});

test('dogfoods only the protected reusable workflow with separated permissions', () => {
  const caller = readFileSync(join(root, '.github/workflows/self-architecture-gate.yml'), 'utf8');
  const pullRequestCaller = caller;
  assert.match(caller, /pull_request_target:/);
  assert.doesNotMatch(caller, /^  merge_group:/m);
  assert.doesNotMatch(caller, /merge-group-(?:accept|codex-action-integrity):/);
  assert.match(caller, /uses: \.\/\.github\/workflows\/architecture-gate\.yml/);
  assert.match(pullRequestCaller, /contents: read/);
  assert.match(pullRequestCaller, /actions: read/);
  assert.match(pullRequestCaller, /pull-requests: write/);
  assert.match(pullRequestCaller, /protected-review-instructions: true/);
  assert.match(pullRequestCaller, /schema-path: \.codex\/gatekeeper\/ci-decision\.schema\.json/);
  assert.match(pullRequestCaller, /validation-path: \.codex\/gatekeeper\/decision\.validation\.json/);
  assert.doesNotMatch(pullRequestCaller, /owner-decision-environment/);
  assert.match(pullRequestCaller, /OPENAI_API_KEY: \$\{\{ secrets\.OPENAI_API_KEY \}\}/);
  const jobs = parseWorkflow(caller).jobs;
  assert.equal(jobs['architecture-gate'].uses, './.github/workflows/architecture-gate.yml');
  assert.equal(jobs['architecture-gate'].steps, undefined);
  assert.equal(jobs['self-app-start'], undefined);
  assert.equal(jobs['self-app-report'], undefined);
  assert.doesNotMatch(caller, /self-app-|self-queue-|merge_group:/);
});

test('selects and materializes the protected self Authority Set for CI and local review', async t => {
  const selfPolicy = parseCiPolicyJson(readFileSync(join(root, '.codex/gatekeeper/ci-policy.json'), 'utf8'));
  const selected = resolveCiPolicy(selfPolicy, 'main');
  assert.equal(selfPolicy.version, 2);
  assert.equal(selected.mode, 'enforced');
  assert.equal(selected.model, 'gpt-6.1-sol');
  assert.equal(selected.reasoningEffort, 'medium');
  assert.equal(selected.authorityManifestPath, '.codex/gatekeeper/authorities.json');
  assert.equal(selected.ownerAmendmentVersion, 1);
  assert.equal(selected.ownerAmendmentAcceptance, 'protected-pr');
  assert.equal(selected.ownerAmendmentScope, 'authority-only');
  assert.equal(selected.ownerAmendmentMaxPromptBytes, 524288);
  const selectedLimits = JSON.parse(Buffer.from(selected.authorityLimitsBase64, 'base64').toString());
  assert.equal(selectedLimits.maxFileBytes, 81920);
  assert.deepEqual(selectedLimits, { ...effectiveLimits, maxFileBytes: 81920 });
  const manifestBytes = readFileSync(join(root, selected.authorityManifestPath));
  const manifest = parseAuthorityManifest(manifestBytes, selectedLimits);
  const expectedMembers = [
    ['architecture-contract', 'docs/architecture.md'],
    ['architecture-authority-set', 'docs/architecture/authority-set.md'],
    ['architecture-owner-addition', 'docs/architecture/owner-addition.md'],
    ['architecture-owner-amendment', 'docs/architecture/owner-amendment.md'],
    ['architecture-review-execution', 'docs/architecture/review-execution.md'],
    ['architecture-self-profile', 'docs/architecture/self-profile.md'],
  ].map(([id, path]) => ({ id, repository: 'self', revision: 'authority-revision', path }));
  assert.deepEqual(manifest.authorities, expectedMembers);
  // Commit the candidate inputs in a synthetic fixture so pre-commit checks
  // exercise the new selection without treating working-tree files as authority.
  const selfRoot = mkdtempSync(join(tmpdir(), 'gate-self-authority-'));
  t.after(() => rmSync(selfRoot, { recursive: true, force: true }));
  for (const member of manifest.authorities) {
    const destination = join(selfRoot, member.path);
    mkdirSync(dirname(destination), { recursive: true });
    writeFileSync(destination, readFileSync(join(root, member.path)));
  }
  const git = (...args) => execFileSync('git', ['-C', selfRoot, ...args],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  git('init'); git('config', 'user.name', 'Fixture');
  git('config', 'user.email', 'fixture@example.invalid');
  git('add', '.'); git('commit', '-m', 'Synthetic self authority snapshot');
  const authorityRevision = git('rev-parse', 'HEAD');
  const materialized = await materializeAuthoritySet({ manifestBytes, limits: selectedLimits,
    selfRepository: 'flair-agency/architecture-gatekeeper', selfRoot, authorityRevision });
  assert.deepEqual(materialized.members.map(member => member.id), expectedMembers.map(member => member.id));
  const completePrompt = readFileSync(join(root, '.codex/gatekeeper/ci-prompt.md')) + materialized.prompt;
  assert.ok(Buffer.byteLength(completePrompt) <= selectedLimits.maxPromptBytes);

  const schemaPath = join(root, '.codex/gatekeeper/ci-decision.schema.json');
  const schema = JSON.parse(readFileSync(schemaPath, 'utf8'));
  validateAuthorityReviewSchema(schema);
  const preflightRoot = mkdtempSync(join(tmpdir(), 'gate-self-preflight-'));
  try {
    const promptPath = join(preflightRoot, 'complete-prompt.md');
    writeFileSync(promptPath, completePrompt);
    execFileSync(process.execPath, [join(root, 'dist/preflight-authority-set-review.mjs'), schemaPath, promptPath],
      { env: { ...process.env, AUTHORITY_LIMITS_BASE64: selected.authorityLimitsBase64 } });
  } finally { rmSync(preflightRoot, { recursive: true, force: true }); }
  assert.deepEqual(schema.properties.decision.enum, ['PASS', 'BLOCK', 'OWNER_DECISION']);
  assert.deepEqual(schema.properties.gates.required, ['sharedMechanism', 'trustBoundary']);
  assert.equal('anyOf' in schema, false);
  const assertStrictObjectRequirements = node => {
    if (!node || typeof node !== 'object') return;
    if (node.properties) {
      assert.deepEqual([...node.required].sort(), Object.keys(node.properties).sort());
      for (const property of Object.values(node.properties)) assertStrictObjectRequirements(property);
    }
    if (node.items) assertStrictObjectRequirements(node.items);
  };
  assertStrictObjectRequirements(schema);
  assert.deepEqual(schema.properties.findings.items.properties.location.type, ['object', 'null']);
  const localConfig = JSON.parse(readFileSync(join(root, '.codex/gatekeeper/config.json'), 'utf8'));
  assert.equal(localConfig.version, 2);
  assert.equal(localConfig.schemaPath, '.codex/gatekeeper/ci-decision.schema.json');
  assert.equal(localConfig.authorityLimits.maxFileBytes, 81920);
  assert.deepEqual(localConfig.authorityLimits, selectedLimits);
  const localManifest = parseAuthorityManifest(manifestBytes, localConfig.authorityLimits);
  const localMaterialized = await materializeAuthoritySet({ manifestBytes, limits: localConfig.authorityLimits,
    selfRepository: localConfig.selfRepository, selfRoot, authorityRevision });
  assert.deepEqual(localManifest.authorities, manifest.authorities);
  assert.deepEqual(localMaterialized.members.map(member => member.id), expectedMembers.map(member => member.id));
  assert.equal(schema.required.includes('authorityIds'), true);
  const validation = JSON.parse(readFileSync(join(root, '.codex/gatekeeper/decision.validation.json'), 'utf8'));
  assert.equal(validation.version, 1);
  assert.equal(validation.rules.length, 2);
});

test('keeps the protected self-review prompt aligned with canonical authority', () => {
  const prompt = readFileSync(join(root, '.codex/gatekeeper/ci-prompt.md'), 'utf8');
  assert.match(prompt, /protected-base Authority Set/);
  assert.match(prompt, /All six selected members[\s\S]*form the normative self contract/);
  assert.match(prompt, /`architecture-contract` is its shared core at\s+`docs\/architecture\.md`/);
  assert.match(prompt, /Report every selected source ID exactly once in `authorityIds`/);
  assert.match(prompt, /`README\.md`,\s+`package\.json`, workflows, tests[\s\S]*as evidence of conformance/);
  assert.match(prompt, /prompt,\s+manifest and authority snapshots are selected from the protected base/);
  assert.match(prompt, /pull-request content cannot make itself authoritative/);
  assert.doesNotMatch(prompt, /tests as repository-owned\s+authority/);
});
