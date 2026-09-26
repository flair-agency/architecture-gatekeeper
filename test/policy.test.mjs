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
const policy = { version: 1, default: { mode: 'local-only' }, branches: { main: { mode: 'enforced', model: 'gpt-5.6-sol', reasoningEffort: 'medium' } } };
test('resolves exact base-branch policy', () => assert.deepEqual(resolveCiPolicy(policy, 'main'), { baseBranch: 'main', mode: 'enforced', model: 'gpt-5.6-sol', reasoningEffort: 'medium' }));
test('uses explicit local-only default', () => assert.equal(resolveCiPolicy(policy, 'preview').mode, 'local-only'));
test('rejects incomplete enforcement', () => assert.throws(() => resolveCiPolicy({ ...policy, branches: { main: { mode: 'enforced' } } }, 'main')));
test('rejects v2-like selectors instead of silently using the legacy route', () => {
  assert.throws(() => resolveCiPolicy({ ...policy, authoritySet: [] }, 'main'), /Unknown CI policy field/);
  assert.throws(() => resolveCiPolicy({ ...policy, default: { mode: 'local-only', authoritySet: [] } }, 'main'), /Unknown CI policy default field/);
  assert.throws(() => resolveCiPolicy({ ...policy, branches: { main: policy.branches.main, preview: { mode: 'local-only', authoritySet: [] } } }, 'main'), /Unknown CI policy branch preview field/);
});
test('validates every branch entry, including unselected branches', () => {
  assert.throws(() => resolveCiPolicy({ ...policy, branches: { main: policy.branches.main, preview: { mode: 'enforced', model: 'gpt-6-sol', reasoningEffort: 'medium', authoritySet: [] } } }, 'main'), /Unknown CI policy branch preview field/);
  assert.throws(() => resolveCiPolicy({ ...policy, branches: { main: policy.branches.main, preview: null } }, 'main'), /Invalid CI policy branch preview/);
});
test('rejects extra fields on local-only policies and malformed policy objects', () => {
  assert.throws(() => resolveCiPolicy({ ...policy, default: { mode: 'local-only', model: 'ignored' } }, 'main'), /Unknown CI policy default field|Invalid CI policy default/);
  assert.throws(() => resolveCiPolicy([], 'main'));
  assert.throws(() => resolveCiPolicy({ ...policy, default: [] }, 'main'));
  assert.throws(() => resolveCiPolicy({ ...policy, branches: [] }, 'main'));
});

const effectiveLimits = { maxManifestBytes: 16384, maxMembers: 16, maxFileBytes: 65536, maxTotalBytes: 262144, maxPromptBytes: 524288 };
const distributed = { version: 2, default: { mode: 'local-only' }, branches: { main: { mode: 'enforced', model: 'gpt-6-sol', reasoningEffort: 'medium', authorityManifestPath: '.codex/gatekeeper/authorities.json', authorityLimits: effectiveLimits } } };
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
    mode: 'enforced', model: 'gpt-6-sol', reasoningEffort: 'medium', ownerAddition: enabled,
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
    mode: 'procedural', model: 'gpt-6-sol', reasoningEffort: 'medium',
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
  assert.match(workflow, /uses: flair-agency\/codex-action@f93255fd2e5a17a0b4bd557599535e80c8607537/);
  assert.doesNotMatch(workflow, /uses: openai\/codex-action@/);
  assert.match(workflow, /codex-action-integrity:\n[\s\S]*?repository: flair-agency\/codex-action/);
  assert.match(workflow, /codex-action-integrity:\n    if: \(needs\.policy\.outputs\.mode == 'enforced' \|\| needs\.policy\.outputs\.mode == 'procedural'\)\n    needs: policy/);
  assert.match(workflow, /codex-action-integrity:\n[\s\S]*?timeout-minutes: 5/);
  assert.match(workflow, /review:\n[\s\S]*?timeout-minutes: 20/);
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
  assert.match(workflow, /name: Run read-only architecture review\n        id: codex\n        timeout-minutes: 5/);
  assert.match(workflow, /output-file: \$\{\{ runner\.temp \}\}\/architecture-gate-codex-final\.json/);
  assert.match(workflow, /name: Diagnose architecture reviewer completion\n        if: always\(\)\n        timeout-minutes: 1\n        continue-on-error: true/);
  assert.match(workflow, /Codex final message file: (?:present|absent)/);
  assert.match(workflow, /Codex final message JSON: parseable/);
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
  assert.match(workflow, /git ls-tree -z --full-tree "\$BASE_SHA" -- "\$POLICY_PATH" > "\$RUNNER_TEMP\/architecture-gate-policy-tree"/);
  assert.match(workflow, /if test -s "\$RUNNER_TEMP\/architecture-gate-policy-tree"; then\n            git show "\$BASE_SHA:\$POLICY_PATH"/);
  assert.match(workflow, /git show "\$BASE_SHA:\$SCHEMA_PATH"/);
  assert.match(workflow, /protected-review-instructions:/);
  assert.match(workflow, /prompt-file: \$\{\{ needs\.policy\.outputs\.authority_manifest_path/);
  assert.match(workflow, /output-schema-file: \$\{\{ inputs\.protected-review-instructions/);
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
  assert.doesNotMatch(workflow, /owner-decision-environment/);
  assert.doesNotMatch(workflow, /owner-decision-preflight/);
  assert.doesNotMatch(workflow, /Require protected owner approval/);
  assert.match(workflow, /name: Require successful reporting\n[\s\S]*?REPORT_RESULT: \$\{\{ needs\.report\.result \}\}\n[\s\S]*?test "\$REPORT_RESULT" = success/);
  assert.match(workflow, /name: Require model-backed PASS or verified G0 owner addition\n        if: needs\.policy\.outputs\.mode == 'enforced'/);
  assert.match(workflow, /name: Require PASS or pre-merge G0 eligibility\n        if: needs\.policy\.outputs\.mode == 'procedural'/);
  assert.match(workflow, /decision_kind: \$\{\{ steps\.decision\.outputs\.kind \}\}/);
  assert.match(workflow, /name: Identify the completed ordinary decision\n        if: needs\.policy\.outputs\.mode == 'procedural'\n        id: decision/);
  assert.match(workflow, /test "\$CONCLUSION" = PASS/);
  assert.match(workflow, /test "\$CONCLUSION" = OWNER_ADDITION_G0/);
  assert.match(workflow, /test "\$OWNER_ADDITION_RESULT" = success/);
  const additionJob = workflow.match(/  owner-addition:\n([\s\S]*?)\n  report:/)?.[1];
  assert.ok(additionJob);
  assert.match(additionJob, /if: \(needs\.policy\.outputs\.mode == 'enforced' \|\| needs\.policy\.outputs\.mode == 'procedural'\) && needs\.policy\.outputs\.owner_addition_grade == 'G0' && \(needs\.policy\.outputs\.mode == 'enforced' \|\| needs\.review\.outputs\.decision_kind == 'OWNER_DECISION'\)/);
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
  assert.match(caller, /pull_request_target:/);
  assert.match(caller, /uses: \.\/\.github\/workflows\/architecture-gate\.yml/);
  assert.match(caller, /contents: read/);
  assert.doesNotMatch(caller, /actions: read/);
  assert.match(caller, /pull-requests: write/);
  assert.match(caller, /protected-review-instructions: true/);
  assert.match(caller, /schema-path: \.codex\/gatekeeper\/ci-decision\.schema\.json/);
  assert.match(caller, /validation-path: \.codex\/gatekeeper\/decision\.validation\.json/);
  assert.doesNotMatch(caller, /owner-decision-environment/);
  assert.match(caller, /OPENAI_API_KEY: \$\{\{ secrets\.OPENAI_API_KEY \}\}/);
  assert.doesNotMatch(caller, /actions\/checkout/);
});

test('selects and materializes the protected self Authority Set for CI and local review', async () => {
  const selfPolicy = parseCiPolicyJson(readFileSync(join(root, '.codex/gatekeeper/ci-policy.json'), 'utf8'));
  const selected = resolveCiPolicy(selfPolicy, 'main');
  assert.equal(selfPolicy.version, 2);
  assert.equal(selected.mode, 'enforced');
  assert.equal(selected.model, 'gpt-6-sol');
  assert.equal(selected.reasoningEffort, 'medium');
  assert.equal(selected.authorityManifestPath, '.codex/gatekeeper/authorities.json');
  assert.deepEqual(JSON.parse(Buffer.from(selected.authorityLimitsBase64, 'base64').toString()), effectiveLimits);
  const manifestBytes = readFileSync(join(root, selected.authorityManifestPath));
  const manifest = parseAuthorityManifest(manifestBytes, effectiveLimits);
  assert.deepEqual(manifest.authorities, [{ id: 'architecture-contract', repository: 'self', revision: 'authority-revision', path: 'docs/architecture.md' }]);
  const authorityRevision = execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const materialized = await materializeAuthoritySet({ manifestBytes, limits: effectiveLimits,
    selfRepository: 'flair-agency/architecture-gatekeeper', selfRoot: root, authorityRevision });
  assert.deepEqual(materialized.members.map(member => member.id), ['architecture-contract']);
  const completePrompt = readFileSync(join(root, '.codex/gatekeeper/ci-prompt.md')) + materialized.prompt;
  assert.ok(Buffer.byteLength(completePrompt) <= effectiveLimits.maxPromptBytes);

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
  const localConfig = JSON.parse(readFileSync(join(root, '.codex/gatekeeper/config.json'), 'utf8'));
  assert.equal(localConfig.version, 2);
  assert.equal(localConfig.schemaPath, '.codex/gatekeeper/ci-decision.schema.json');
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
