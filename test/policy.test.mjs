import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseCiPolicyJson, resolveCiPolicy } from '../src/resolve-ci-policy.mjs';
import { MAX_AUTHORITY_LIMITS, MULTI_AUTHORITY_PROFILE, materializeAuthoritySet, parseAuthorityManifest } from '../src/authority-set.mjs';
import { validateAuthorityReviewSchema } from '../src/preflight-authority-set-review.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const policy = { version: 1, default: { mode: 'local-only' }, branches: { main: { mode: 'enforced', model: 'gpt-6.1-sol', reasoningEffort: 'medium', authorityFiles: ['docs/architecture.md'], promptPath: '.codex/gatekeeper/ci-prompt.md', schemaPath: '.codex/gatekeeper/decision.schema.json', validationPath: null } } };
test('resolves exact base-branch policy', () => assert.deepEqual(resolveCiPolicy(policy, 'main'), { baseBranch: 'main', mode: 'enforced', model: 'gpt-6.1-sol', reasoningEffort: 'medium', policyVersion: 1, legacyAuthorityFilesBase64: Buffer.from('["docs/architecture.md"]').toString('base64'), legacyPromptPath: '.codex/gatekeeper/ci-prompt.md', legacySchemaPath: '.codex/gatekeeper/decision.schema.json', legacyValidationPath: '' }));
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
  assert.match(workflow, /if: steps\.resolve\.outputs\.authorityManifestPath != '' \|\| steps\.resolve\.outputs\.policyVersion == '1'/);
  assert.match(workflow, /name: Materialize recorded-base legacy authority before review/);
  assert.match(workflow, /run: node \.architecture-gatekeeper-validation-runtime\/src\/prepare-legacy-ci-authority\.mjs prepare/);
  assert.match(workflow, /name: Require exact reported legacy authority files/);
  assert.match(workflow, /run: node \.architecture-gatekeeper-validation-runtime\/src\/prepare-legacy-ci-authority\.mjs validate/);
  assert.match(workflow, /LEGACY_AUTHORITY_PROVENANCE_BASE64: \$\{\{ needs\.review\.outputs\.legacy_authority_provenance \}\}/);
  assert.match(workflow, /test "\$POLICY_PATH" = \.codex\/gatekeeper\/ci-policy\.json/);
  assert.match(workflow, /PROMPT_PATH: \$\{\{ needs\.policy\.outputs\.policy_version == '1' && needs\.policy\.outputs\.legacy_prompt_path \|\| inputs\.prompt-path \}\}/);
  assert.match(workflow, /SCHEMA_PATH: \$\{\{ needs\.policy\.outputs\.policy_version == '1' && needs\.policy\.outputs\.legacy_schema_path \|\| inputs\.schema-path \}\}/);
  assert.match(workflow, /if: \(needs\.policy\.outputs\.policy_version == '1' && needs\.policy\.outputs\.legacy_validation_path != ''\) \|\| \(needs\.policy\.outputs\.policy_version != '1' && inputs\.validation-path != ''\)/);
  assert.match(workflow, /name: Require caller validation selection to match recorded-base v1 policy\n        if: steps\.resolve\.outputs\.policyVersion == '1'[\s\S]*?CALLER_VALIDATION_PATH: \$\{\{ inputs\.validation-path \}\}[\s\S]*?BASE_VALIDATION_PATH: \$\{\{ steps\.resolve\.outputs\.legacyValidationPath \}\}[\s\S]*?run: node \.architecture-gatekeeper-runtime\/src\/verify-legacy-validation-selection\.mjs "\$BASE_VALIDATION_PATH" "\$CALLER_VALIDATION_PATH"/);
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
  assert.throws(() => execFileSync(process.execPath, [join(root, 'src/resolve-ci-policy.mjs'), file, 'main'], { stdio: 'ignore' }));
});

test('keeps protected codex-action arguments compatible', () => {
  const workflow = readFileSync(join(root, '.github/workflows/architecture-gate.yml'), 'utf8');
  assert.match(workflow, /uses: flair-agency\/codex-action@643fb31fa44e961453125534c4c7182a5a0a6ba0/);
  assert.doesNotMatch(workflow, /uses: openai\/codex-action@/);
  assert.match(workflow, /codex-action-integrity:\n[\s\S]*?repository: flair-agency\/codex-action/);
  assert.match(workflow, /codex-action-integrity:\n    if: \(needs\.policy\.outputs\.mode == 'enforced' \|\| needs\.policy\.outputs\.mode == 'procedural'\)\n    needs: policy/);
  assert.match(workflow, /codex-action-integrity:\n[\s\S]*?timeout-minutes: 5/);
  assert.match(workflow, /review-generic:\n[\s\S]*?timeout-minutes: 20/);
  assert.match(workflow, /src\/verify-codex-action\.mjs/);
  assert.match(workflow, /provenance\/codex-action-v1\.12-runtime-cancellation\.json/);
  assert.match(workflow, /provenance\/codex-action-runtime-integrity-procedure-v1\.json/);
  assert.match(workflow, /provenance\/fixtures\/codex-action-runtime-candidate-v1\.json/);
  assert.match(workflow, /fetch-depth: 0/);
  assert.match(workflow, /ref: 643fb31fa44e961453125534c4c7182a5a0a6ba0/);
  assert.match(workflow, /Verify the pinned action before exposing review credentials/);
  assert.match(workflow, /name: Setup pnpm\n[\s\S]*?version: 10\.33\.0/);
  assert.match(workflow, /pnpm run check/);
  assert.match(workflow, /pnpm test/);
  assert.match(workflow, /needs: \[policy, codex-action-integrity\]/);
  assert.match(workflow, /persist-credentials: false/);
  assert.match(workflow, /safety-strategy: drop-sudo/);
  assert.match(workflow, /name: Run read-only architecture review\n        id: codex\n        timeout-minutes: 5/);
  assert.match(workflow, /output-file: \$\{\{ runner\.temp \}\}\/architecture-gate-codex-final\.json/);
  assert.match(workflow, /name: Diagnose architecture reviewer completion\n        if: always\(\)\n        timeout-minutes: 1\n        continue-on-error: true/);
  assert.match(workflow, /Codex final message file: (?:present|absent)/);
  assert.match(workflow, /Codex final message JSON: parseable/);
  assert.doesNotMatch(workflow, /--ignore-user-config/);
});

test('bounds every Codex Action call to 240 seconds with outer cleanup headroom', () => {
  const workflow = readFileSync(join(root, '.github/workflows/architecture-gate.yml'), 'utf8');
  const pin = '643fb31fa44e961453125534c4c7182a5a0a6ba0';
  const actionSteps = workflow
    .split(/^      - name: /m)
    .slice(1)
    .map((step) => `      - name: ${step}`)
    .filter((step) => /^        uses: flair-agency\/codex-action@/m.test(step));

  assert.ok(actionSteps.length >= 2);
  for (const step of actionSteps) {
    assert.match(step, new RegExp(`uses: flair-agency/codex-action@${pin}`));
    assert.match(step, /timeout-seconds: "240"/);
  }
});

test('uses the immutable called-workflow runtime and keeps review jobs read-only', () => {
  const workflow = readFileSync(join(root, '.github/workflows/architecture-gate.yml'), 'utf8');
  assert.match(workflow, /repository: \$\{\{ job\.workflow_repository \}\}/);
  assert.match(workflow, /ref: \$\{\{ job\.workflow_sha \}\}/);
  assert.doesNotMatch(workflow, /ref: v0\.1\.0/);
  assert.match(workflow, /review-generic:\n[\s\S]*?permissions:\n      contents: read/);
  assert.match(workflow, /src\/ci-report\.mjs/);
  assert.match(workflow, /CONCLUSION: \$\{\{ needs\.report\.outputs\.conclusion \}\}/);
  assert.doesNotMatch(workflow, /JSON\.parse\(process\.env\.DECISION\)/);
  assert.match(workflow, /group: architecture-gate-\$\{\{ github\.repository \}\}-\$\{\{ github\.event\.pull_request\.number \}\}/);
  assert.match(workflow, /cancel-in-progress: true/);
  assert.match(workflow, /git show "\$BASE_SHA:\$PROMPT_PATH"/);
  assert.match(workflow, /if git cat-file -e "\$BASE_SHA:\$POLICY_PATH" 2>\/dev\/null; then/);
  assert.match(workflow, /src\/materialize-regular-git-snapshot\.mjs \\\n+              "\$BASE_SHA" "\$POLICY_PATH" "\$RUNNER_TEMP\/architecture-gate-policy\.json"/);
  assert.match(workflow, /git show "\$BASE_SHA:\$SCHEMA_PATH"/);
  assert.match(workflow, /protected-review-instructions:/);
  assert.match(workflow, /prompt-file: \$\{\{ needs\.policy\.outputs\.policy_version == '1' && format/);
  assert.match(workflow, /\|\| needs\.policy\.outputs\.authority_manifest_path/);
  assert.match(workflow, /output-schema-file: \$\{\{ needs\.policy\.outputs\.policy_version == '1'/);
  assert.match(workflow, /git show "\$BASE_SHA:\$VALIDATION_PATH"/);
  assert.match(workflow, /src\/validate-decision\.mjs/);
  assert.match(workflow, /src\/preflight-authority-set-review\.mjs/);
  assert.match(workflow, /name: Check protected Authority Set schema and complete prompt\n[\s\S]*?run: \|\n          node \.architecture-gatekeeper-validation-runtime\/src\/preflight-authority-set-review\.mjs/);
  assert.match(workflow, /--limits-base64 "\$AUTHORITY_LIMITS_BASE64"/);
  assert.match(workflow, /src\/validate-authority-set-decision\.mjs/);
  assert.match(workflow, /reviewed_sha: \$\{\{ steps\.revision\.outputs\.sha \}\}/);
  assert.match(workflow, /sha=\$\(git rev-parse HEAD\)/);
  assert.match(workflow, /REVIEWED_SHA: \$\{\{ needs\.review\.outputs\.reviewed_sha \}\}/);
  assert.doesNotMatch(workflow, /REVIEWED_SHA: \$\{\{ github\.event\.pull_request\.head\.sha \}\}/);
  assert.match(workflow, /report:\n[\s\S]*?permissions:\n      contents: read\n      pull-requests: write/);
  const reportJob = workflow.match(/  report:\n([\s\S]*?)\n  accept:/)?.[1];
  const reviewJob = workflow.match(/  review-generic:\n([\s\S]*?)\n\n\n  review-self:/)?.[1];
  assert.ok(reportJob);
  assert.ok(reviewJob);
  assert.match(reportJob, /concurrency:\n      group: architecture-gate-report-\$\{\{ github\.workflow \}\}-\$\{\{ github\.event\.pull_request\.number \}\}\n      cancel-in-progress: false/);
  assert.doesNotMatch(reviewJob, /concurrency:/);
  assert.doesNotMatch(workflow, /owner-decision-environment/);
  assert.doesNotMatch(workflow, /owner-decision-preflight/);
  assert.doesNotMatch(workflow, /Require protected owner approval/);
  assert.match(workflow, /name: Require successful reporting\n[\s\S]*?REPORT_RESULT: \$\{\{ needs\.report\.result \}\}\n[\s\S]*?test "\$REPORT_RESULT" = success/);
  assert.match(workflow, /name: Require model-backed PASS or verified G0 owner addition\/amendment\n        if: needs\.policy\.outputs\.mode == 'enforced'/);
  assert.match(workflow, /run: node \.architecture-gatekeeper-runtime\/src\/ci-enforced-acceptance\.mjs/);
  assert.match(workflow, /name: Require PASS or pre-merge G0 eligibility\n        if: needs\.policy\.outputs\.mode == 'procedural'/);
  assert.match(workflow, /decision_kind: \$\{\{ steps\.decision\.outputs\.kind \}\}/);
  assert.match(workflow, /name: Identify the completed ordinary decision\n        if: needs\.policy\.outputs\.mode == 'procedural' \|\| \(needs\.policy\.outputs\.mode == 'enforced' && \(needs\.policy\.outputs\.owner_addition_grade == 'G0' \|\| needs\.policy\.outputs\.owner_amendment_grade == 'G0'\)\)\n        id: decision/);
  assert.match(workflow, /OWNER_AMENDMENT_ATTEMPT_RESULT: \$\{\{ needs\['owner-amendment-attempt-classifier'\]\.result \}\}/);
  assert.match(workflow, /OWNER_AMENDMENT_ATTEMPTED: \$\{\{ needs\['owner-amendment-attempt-classifier'\]\.outputs\.attempted \}\}/);
  const attemptJob = workflow.match(/  owner-amendment-attempt-classifier:\n([\s\S]*?)\n  owner-amendment-semantic-eligibility:/)?.[1];
  assert.ok(attemptJob);
  assert.match(attemptJob, /ref: \$\{\{ github\.event\.pull_request\.base\.sha \}\}/);
  assert.match(attemptJob, /owner-amendment-attempt-classifier\.mjs/);
  assert.match(attemptJob, /OWNER_AMENDMENT_ATTEMPT:true\|OWNER_AMENDMENT_NOT_APPLICABLE:false/);
  assert.doesNotMatch(attemptJob, /pull-requests: write|id-token: write|attestations: write|OPENAI_API_KEY/);
  const additionJob = workflow.match(/  owner-addition:\n([\s\S]*?)\n  report:/)?.[1];
  assert.ok(additionJob);
  assert.match(additionJob, /if: \(needs\.policy\.outputs\.mode == 'enforced' \|\| needs\.policy\.outputs\.mode == 'procedural'\) && needs\.policy\.outputs\.owner_addition_grade == 'G0' && needs\.review\.outputs\.decision_kind == 'OWNER_DECISION'/);
  assert.match(additionJob, /needs: \[policy, codex-action-integrity, review\]/);
  assert.match(additionJob, /ref: \$\{\{ github\.event\.pull_request\.base\.sha \}\}/);
  assert.doesNotMatch(additionJob, /ref: refs\/pull\/.*\/merge/);
  assert.match(additionJob, /Fetch B and its annotated tag as Git objects only/);
  assert.match(additionJob, /test "\$\(git rev-parse FETCH_HEAD\)" = "\$REVIEWED_SHA"/);
  assert.match(additionJob, /test "\$MERGE_PARENT_HEAD" = "\$HEAD_SHA"/);
  assert.match(additionJob, /git -c "http\.extraheader=.*" fetch --no-tags/);
  assert.match(additionJob, /src\/owner-addition-ci\.mjs prepare/);
  assert.match(additionJob, /ORDINARY_DECISION: \$\{\{ needs\.review\.outputs\.final_message \}\}/);
  assert.match(additionJob, /PR_NUMBER: \$\{\{ github\.event\.pull_request\.number \}\}/);
  assert.match(additionJob, /src\/owner-addition-ci\.mjs validate/);
  assert.match(additionJob, /POLICY_VERSION: \$\{\{ needs\.policy\.outputs\.policy_version \}\}/);
  assert.match(additionJob, /prompt-file: \$\{\{ runner\.temp \}\}\/architecture-gate-owner-addition\/eligibility-prompt\.md/);
  assert.match(additionJob, /name: Preserve exact v5 pre-merge eligibility evidence\n        id: eligibility-evidence\n        if: needs\.policy\.outputs\.policy_version == '5'/);
  assert.match(additionJob, /uses: actions\/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02 # v4/);
  assert.match(additionJob, /id: eligibility-evidence\n        if: needs\.policy\.outputs\.policy_version == '5'/);
  assert.match(additionJob, /overwrite: false/);
  assert.match(additionJob, /name: owner-addition-eligibility-evidence-\$\{\{ github\.event\.pull_request\.head\.sha \}\}-\$\{\{ github\.run_attempt \}\}/);
  assert.match(additionJob, /path: \$\{\{ runner\.temp \}\}\/architecture-gate-owner-addition\/eligibility-evidence\.json/);
  assert.match(additionJob, /name: Record exact uploaded eligibility artifact binding/);
  assert.match(additionJob, /steps\.eligibility-evidence\.outputs\.artifact-id/);
  assert.match(additionJob, /steps\.eligibility-evidence\.outputs\.artifact-digest/);
  assert.match(additionJob, /AGK_OWNER_ADDITION_ARTIFACT_V1/);
  assert.match(workflow, /ci-procedural-acceptance\.mjs/);
  const proceduralAcceptance = readFileSync(join(root, 'src/ci-procedural-acceptance.mjs'), 'utf8');
  assert.match(proceduralAcceptance, /OWNER_ADDITION_G0_PENDING/);
  assert.match(proceduralAcceptance, /selected authority requires successful OWNER_ADDITION/);
  assert.match(workflow, /POLICY_VERSION: \$\{\{ needs\.policy\.outputs\.policy_version \}\}/);
});

test('dogfoods only the protected reusable workflow with separated permissions', () => {
  const caller = readFileSync(join(root, '.github/workflows/self-architecture-gate.yml'), 'utf8');
  const pullRequestCaller = caller;
  assert.match(caller, /pull_request_target:/);
  assert.match(caller, /uses: \.\/\.github\/workflows\/architecture-gate\.yml/);
  assert.match(pullRequestCaller, /contents: read/);
  assert.match(pullRequestCaller, /actions: read/);
  assert.match(pullRequestCaller, /pull-requests: write/);
  assert.match(pullRequestCaller, /protected-review-instructions: true/);
  assert.match(pullRequestCaller, /schema-path: \.codex\/gatekeeper\/ci-decision\.schema\.json/);
  assert.match(pullRequestCaller, /validation-path: \.codex\/gatekeeper\/decision\.validation\.json/);
  assert.doesNotMatch(pullRequestCaller, /owner-decision-environment/);
  assert.match(pullRequestCaller, /OPENAI_API_KEY: \$\{\{ \(github\.repository != 'flair-agency\/architecture-gatekeeper'[\s\S]*?&& secrets\.OPENAI_API_KEY \|\| '' \}\}/);
  assert.doesNotMatch(pullRequestCaller, /actions\/checkout/);
});

test('produces attested BLOCK records only in a credential-separated signer job', () => {
  const workflow = readFileSync(join(root, '.github/workflows/architecture-gate.yml'), 'utf8');
  const reviewJob = workflow.match(/  review-self:\n([\s\S]*?)\n\n\n  review:/)?.[1];
  const recordJob = workflow.match(/  block-review-record:\n([\s\S]*?)\n  owner-addition:/)?.[1];
  const acceptJob = workflow.match(/  accept:\n([\s\S]*)$/)?.[1];
  assert.ok(reviewJob);
  assert.ok(recordJob);
  assert.ok(acceptJob);
  assert.match(reviewJob, /permissions:\n      contents: read/);
  assert.doesNotMatch(reviewJob, /id-token: write|attestations: write/);
  assert.match(workflow, /owner_amendment_grade: \$\{\{ steps\.resolve\.outputs\.ownerAmendmentGrade \}\}/);
  assert.match(workflow, /name: Confine first owner-amendment evidence profile to self\n        if: steps\.resolve\.outputs\.ownerAmendmentGrade == 'G0'/);
  assert.match(workflow, /test "\$REPOSITORY" = flair-agency\/architecture-gatekeeper/);
  assert.match(workflow, /test "\$GITHUB_WORKFLOW_REF" = flair-agency\/architecture-gatekeeper\/\.github\/workflows\/self-architecture-gate\.yml@refs\/heads\/main/);
  assert.match(workflow, /if: github\.repository == 'flair-agency\/architecture-gatekeeper' && github\.event_name == 'pull_request_target' && github\.event\.pull_request\.base\.ref == 'main' && github\.event\.pull_request\.draft == false && needs\.policy\.result == 'success' && needs\.review\.result == 'success' && needs\.policy\.outputs\.owner_amendment_grade == 'G0' && needs\.policy\.outputs\.owner_amendment_evidence_producer == 'github-actions-attestation' && needs\.review\.outputs\.decision_kind == 'BLOCK'/);
  assert.match(recordJob, /permissions:\n      contents: read\n      id-token: write\n      attestations: write/);
  assert.doesNotMatch(recordJob, /OPENAI_API_KEY|secrets\.OPENAI_API_KEY/);
  assert.match(recordJob, /name: Check out the protected base only\n        uses: actions\/checkout@v5\n        with:\n          ref: \$\{\{ github\.event\.pull_request\.base\.sha \}\}\n          fetch-depth: 1/);
  assert.doesNotMatch(recordJob, /git fetch|refs\/pull\/\$PR_NUMBER\/merge/);
  assert.match(recordJob, /GH_TOKEN: \$\{\{ github\.token \}\}/);
  assert.doesNotMatch(recordJob, /working-directory: candidate|path: candidate|ref: refs\/pull\//);
  assert.match(recordJob, /RECORD_DIR: \.agk-block-record-input/);
  assert.match(recordJob, /cp "\$GITHUB_EVENT_PATH" "\$RECORD_DIR\/event\.json"/);
  assert.match(recordJob, /MERGE_SHA: \$\{\{ needs\.review\.outputs\.reviewed_sha \}\}/);
  assert.match(recordJob, /BASE_SHA: \$\{\{ github\.event\.pull_request\.base\.sha \}\}/);
  assert.match(recordJob, /node \.architecture-gatekeeper-runtime\/scripts\/owner-amendment-block-producer\.mjs\n/);
  assert.match(recordJob, /ref: \$\{\{ job\.workflow_sha \}\}/);
  assert.match(recordJob, /WORKFLOW_PATH: \.github\/workflows\/self-architecture-gate\.yml/);
  assert.match(recordJob, /RUN_ID: \$\{\{ github\.run_id \}\}/);
  assert.match(recordJob, /RUN_ATTEMPT: \$\{\{ github\.run_attempt \}\}/);
  assert.match(recordJob, /scripts\/owner-amendment-block-producer\.mjs/);
  assert.match(recordJob, /uses: actions\/attest\@1e69f48acb82d1966a394da916b4c1698aa569d6 # v4\.2\.2/);
  assert.match(recordJob, /subject-path: \.agk-block-record-input\/review-record\.json/);
  assert.match(recordJob, /attestation-bundle\.json/);
  assert.match(recordJob, /uses: actions\/upload-artifact\@ea165f8d65b6e75b540449e92b4886f43607fa02 # v4/);
  assert.match(recordJob, /artifact-sha256=%s;attestation-id=%s;run-id=%s;run-attempt=%s/);
  assert.doesNotMatch(acceptJob, /block-review-record/);
});

test('produces exact OWNER_DECISION trigger evidence only for the prior-policy-selected self profile', () => {
  const workflow = readFileSync(new URL('../.github/workflows/architecture-gate.yml', import.meta.url), 'utf8');
  const recordJob = workflow.match(/  owner-amendment-owner-decision-record:\n([\s\S]*?)\n  owner-amendment-semantic-eligibility:/)?.[1];
  assert.ok(recordJob);
  assert.match(workflow, /owner_amendment_trigger_profile: \$\{\{ steps\.resolve\.outputs\.ownerAmendmentTriggerProfile \}\}/);
  assert.match(recordJob, /if: github\.repository == 'flair-agency\/architecture-gatekeeper' && github\.event_name == 'pull_request_target' && github\.event\.pull_request\.base\.ref == 'main' && needs\.policy\.outputs\.mode == 'enforced' && needs\.policy\.outputs\.owner_amendment_grade == 'G0' && needs\.policy\.outputs\.owner_amendment_trigger_profile == 'completed-owner-decision-self-v1' && needs\.review\.outputs\.decision_kind == 'OWNER_DECISION'/);
  assert.match(recordJob, /needs: \[policy, codex-action-integrity, review\]/);
  assert.match(recordJob, /contents: read\n      id-token: write\n      attestations: write/);
  assert.doesNotMatch(recordJob, /OPENAI_API_KEY|secrets\.OPENAI_API_KEY/);
  assert.match(recordJob, /ref: \$\{\{ github\.event\.pull_request\.base\.sha \}\}/);
  assert.match(recordJob, /RECORD_DIR="\$RUNNER_TEMP\/architecture-gate-owner-decision-record-input"/);
  assert.match(recordJob, /working-directory: \$\{\{ runner\.temp \}\}/);
  assert.match(recordJob, /node "\$GITHUB_WORKSPACE\/scripts\/owner-amendment-owner-decision-producer\.mjs"/);
  assert.match(recordJob, /subject-path: \$\{\{ runner\.temp \}\}\/architecture-gate-owner-decision-record-input\/review-record\.json/);
  assert.doesNotMatch(recordJob, /job\.workflow_repository|job\.workflow_sha|\.architecture-gatekeeper-runtime/);
  assert.match(recordJob, /name: owner-amendment-owner-decision-\$\{\{ github\.event\.pull_request\.base\.sha \}\}-\$\{\{ github\.event\.pull_request\.head\.sha \}\}-\$\{\{ github\.run_id \}\}-\$\{\{ github\.run_attempt \}\}/);
  assert.match(workflow, /Require completed OWNER_DECISION evidence production when selected/);
  assert.match(workflow, /needs: \[policy, review, owner-addition, owner-amendment-owner-decision-record, owner-amendment-attempt-classifier, owner-amendment-semantic-eligibility, owner-amendment-semantic-eligibility-signer, report\]/);
  assert.match(workflow, /ownerAmendmentTriggerProfile/);
});

test('OWNER_AMENDMENT semantic producer never checks out or executes pull-request code', () => {
  const workflow = readFileSync(new URL('../.github/workflows/architecture-gate.yml', import.meta.url), 'utf8');
  const semanticJob = workflow.match(/  owner-amendment-semantic-eligibility:\n([\s\S]*?)\n  owner-amendment-semantic-eligibility-signer:/)?.[1];
  assert.ok(semanticJob);
  assert.match(semanticJob, /if: github\.repository == 'flair-agency\/architecture-gatekeeper' && github\.event_name == 'pull_request_target' && github\.event\.pull_request\.base\.ref == 'main'/);
  assert.match(semanticJob, /ref: \$\{\{ github\.event\.pull_request\.base\.sha \}\}/);
  assert.match(semanticJob, /B_PR_NUMBER: \$\{\{ github\.event\.pull_request\.number \}\}/);
  assert.match(semanticJob, /\[\[ "\$B_PR_NUMBER" =~ \^\[1-9\]\[0-9\]\*\$ \]\]/);
  assert.ok(semanticJob.includes('[[ "$B_HEAD_SHA" =~ ^[a-f0-9]{40}$ ]]'));
  assert.match(semanticJob, /git fetch --no-tags origin "refs\/pull\/\$\{B_PR_NUMBER\}\/head"/);
  assert.match(semanticJob, /working-directory: \$\{\{ runner\.temp \}\}/);
  assert.match(semanticJob, /node "\$GITHUB_WORKSPACE\/scripts\/owner-amendment-semantic-eligibility-producer\.mjs" prepare/);
  assert.match(semanticJob, /node "\$GITHUB_WORKSPACE\/scripts\/owner-amendment-semantic-eligibility-producer\.mjs" stage-review-output/);
  assert.match(semanticJob, /review_artifact_id: \$\{\{ steps\.review-artifact\.outputs\.artifact-id \}\}/);
  assert.doesNotMatch(semanticJob, /id-token: write|attestations: write|actions\/attest@/);
  assert.doesNotMatch(semanticJob, /job\.workflow_repository|job\.workflow_sha|ref: \$\{\{ github\.event\.pull_request\.head\.(?:sha|ref) \}\}|checkout.*head/i);

  const signerJob = workflow.match(/  owner-amendment-semantic-eligibility-signer:\n([\s\S]*?)\n  report:/)?.[1];
  assert.ok(signerJob);
  assert.match(signerJob, /needs: \[policy, owner-amendment-attempt-classifier, owner-amendment-semantic-eligibility\]/);
  assert.match(signerJob, /contents: read\n      actions: read\n      id-token: write\n      attestations: write/);
  assert.match(signerJob, /artifact-ids: \$\{\{ needs\['owner-amendment-semantic-eligibility'\]\.outputs\.review_artifact_id \}\}/);
  assert.match(signerJob, /owner-amendment-semantic-eligibility-producer\.mjs" prepare/);
  assert.match(signerJob, /owner-amendment-semantic-eligibility-producer\.mjs" complete/);
  assert.match(signerJob, /needs\['owner-amendment-attempt-classifier'\]\.outputs\.attempted == 'true'/);
  assert.doesNotMatch(signerJob, /owner-amendment-semantic-eligibility-producer\.mjs complete[^\n]*>>\s*"\$GITHUB_OUTPUT"/);
  assert.match(signerJob, /uses: actions\/attest@/);
  assert.doesNotMatch(signerJob, /codex-action@|OPENAI_API_KEY|secrets\.OPENAI_API_KEY/);
  assert.match(workflow, /OWNER_AMENDMENT_SIGNER_RESULT: \$\{\{ needs\['owner-amendment-semantic-eligibility-signer'\]\.result \}\}/);
  assert.match(workflow, /OWNER_AMENDMENT_ELIGIBILITY: \$\{\{ needs\['owner-amendment-semantic-eligibility-signer'\]\.outputs\.eligibility \}\}/);
});

test('protected amendment Git commands pass the checkout through argv instead of child-process cwd', () => {
  for (const path of [
    '../scripts/owner-amendment-merge-group-gate.mjs',
    '../scripts/owner-amendment-semantic-eligibility-producer.mjs',
  ]) {
    const source = readFileSync(new URL(path, import.meta.url), 'utf8');
    assert.match(source, /execFileSync\('git', \['-C', process\.env\.GITHUB_WORKSPACE, \.\.\.args\]/);
    assert.doesNotMatch(source, /cwd:\s*process\.env\.GITHUB_WORKSPACE/);
  }
  const ownerDecision = readFileSync(new URL('../scripts/owner-amendment-owner-decision-producer.mjs', import.meta.url), 'utf8');
  assert.match(ownerDecision, /const workspace = process\.env\.GITHUB_WORKSPACE;[\s\S]*execFileSync\('git', \['-C', workspace, \.\.\.args\]/);
  assert.doesNotMatch(ownerDecision, /cwd:\s*process\.env\.GITHUB_WORKSPACE/);
  assert.match(ownerDecision, /git\(\['show', `\$\{baseSha\}:\$\{path\}`\]/);
  assert.match(ownerDecision, /git\(\['ls-remote', 'origin', `refs\/pull\/\$\{context\.prNumber\}\/merge`\]/);
});

test('selects and materializes the protected self Authority Set for CI and local review', async () => {
  const selfPolicy = parseCiPolicyJson(readFileSync(join(root, '.codex/gatekeeper/ci-policy.json'), 'utf8'));
  const selected = resolveCiPolicy(selfPolicy, 'main');
  assert.equal(selfPolicy.version, 2);
  assert.equal(selected.mode, 'enforced');
  assert.equal(selected.model, 'gpt-6.1-sol');
  assert.equal(selected.reasoningEffort, 'medium');
  assert.equal(selected.authorityManifestPath, '.codex/gatekeeper/authorities.json');
  assert.equal(selected.ownerAmendmentTriggerProfile, 'completed-block-v1');
  assert.equal(selected.ownerAmendmentEvidenceProducer, 'github-actions-attestation');
  assert.equal(selected.ownerAmendmentAuthorityId, 'architecture-contract');
  assert.equal(selected.ownerAmendmentAuthorityPath, 'docs/architecture.md');
  const selectedLimits = JSON.parse(Buffer.from(selected.authorityLimitsBase64, 'base64').toString());
  assert.equal(selectedLimits.maxFileBytes, 73728);
  assert.deepEqual(selectedLimits, { ...effectiveLimits, maxFileBytes: 73728 });
  const manifestBytes = readFileSync(join(root, selected.authorityManifestPath));
  const manifest = parseAuthorityManifest(manifestBytes, selectedLimits);
  assert.deepEqual(manifest.authorities, [{ id: 'architecture-contract', repository: 'self', revision: 'authority-revision', path: 'docs/architecture.md' }]);
  const authorityRevision = execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const materialized = await materializeAuthoritySet({ manifestBytes, limits: selectedLimits,
    selfRepository: 'flair-agency/architecture-gatekeeper', selfRoot: root, authorityRevision });
  assert.deepEqual(materialized.members.map(member => member.id), ['architecture-contract']);
  const completePrompt = readFileSync(join(root, '.codex/gatekeeper/ci-prompt.md')) + materialized.prompt;
  assert.ok(Buffer.byteLength(completePrompt) <= selectedLimits.maxPromptBytes);

  const schemaPath = join(root, '.codex/gatekeeper/ci-decision.schema.json');
  const schema = JSON.parse(readFileSync(schemaPath, 'utf8'));
  validateAuthorityReviewSchema(schema);
  const preflightRoot = mkdtempSync(join(tmpdir(), 'gate-self-preflight-'));
  try {
    const promptPath = join(preflightRoot, 'complete-prompt.md');
    writeFileSync(promptPath, completePrompt);
    execFileSync(process.execPath, [join(root, 'src/preflight-authority-set-review.mjs'), schemaPath, promptPath],
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
  assert.equal(localConfig.authorityLimits.maxFileBytes, 73728);
  assert.deepEqual(localConfig.authorityLimits, selectedLimits);
  const localManifest = parseAuthorityManifest(manifestBytes, localConfig.authorityLimits);
  const localMaterialized = await materializeAuthoritySet({ manifestBytes, limits: localConfig.authorityLimits,
    selfRepository: localConfig.selfRepository, selfRoot: root, authorityRevision });
  assert.deepEqual(localManifest.authorities, manifest.authorities);
  assert.deepEqual(localMaterialized.members.map(member => member.id), ['architecture-contract']);
  assert.equal(schema.required.includes('authorityIds'), true);
  const validation = JSON.parse(readFileSync(join(root, '.codex/gatekeeper/decision.validation.json'), 'utf8'));
  assert.equal(validation.version, 1);
  assert.equal(validation.rules.length, 2);
});

test('keeps the protected self-review prompt aligned with canonical authority', () => {
  const prompt = readFileSync(join(root, '.codex/gatekeeper/ci-prompt.md'), 'utf8');
  assert.match(prompt, /protected-base Authority Set/);
  assert.match(prompt, /`architecture-contract` member is the normative `docs\/architecture\.md` snapshot/);
  assert.match(prompt, /Report every selected source ID exactly once in `authorityIds`/);
  assert.match(prompt, /`README\.md`,\s+`package\.json`, workflows, tests[\s\S]*as evidence of conformance/);
  assert.match(prompt, /prompt,\s+manifest and authority snapshots are selected from the protected base/);
  assert.match(prompt, /pull-request content cannot make itself authoritative/);
  assert.doesNotMatch(prompt, /tests as repository-owned\s+authority/);
});
