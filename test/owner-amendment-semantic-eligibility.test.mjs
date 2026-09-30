import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { parseCiPolicyJson, resolveCiPolicy } from '../src/resolve-ci-policy.mjs';
import { produceOwnerAmendmentOwnerDecision } from '../scripts/owner-amendment-owner-decision-producer.mjs';
import { buildOwnerAmendmentOwnerDecisionAmendmentRecord,
  validateOwnerAmendmentOwnerDecisionAmendmentRecord } from '../src/owner-amendment-owner-decision-amendment-record.mjs';
import {
  completeOwnerAmendmentSemanticEligibility,
  createOwnerAmendmentSemanticEligibilityProducer,
  validateOwnerAmendmentSemanticEligibilityReceipt,
} from '../src/owner-amendment-semantic-eligibility.mjs';

const baseSha = 'a'.repeat(40);
const bSha = 'b'.repeat(40);
const triggerHeadSha = 'c'.repeat(40);
const mergeSha = 'd'.repeat(40);
const repository = 'flair-agency/architecture-gatekeeper';
const path = 'docs/architecture.md';
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const gitTagOid = bytes => createHash('sha1').update(Buffer.from(`tag ${bytes.length}\0`)).update(bytes).digest('hex');
const authorityBytes = Buffer.from('# Previous canonical architecture\nExisting rule: retain the protected boundary.\n');
const proposedAuthorityBytes = Buffer.from('# Previous canonical architecture\nExisting rule: amend the protected boundary.\n');
const digest = byte => sha256(Buffer.from(byte));
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort((a, b) => a < b ? -1 : a > b ? 1 : 0).map(key => [key, canonical(value[key])])) : value;
const canonicalBytes = value => Buffer.from(`${JSON.stringify(canonical(value))}\n`);
function structuredCloneProtectedInputs(value) {
  return { ...value, policyBytes: Buffer.from(value.policyBytes), manifestBytes: Buffer.from(value.manifestBytes),
    diffBytes: Buffer.from(value.diffBytes), authoritySet: { digest: value.authoritySet.digest,
      members: value.authoritySet.members.map(member => ({ ...member, bytes: Buffer.from(member.bytes) })) },
    changes: value.changes.map(change => ({ ...change, beforeBytes: Buffer.from(change.beforeBytes), afterBytes: Buffer.from(change.afterBytes) })) };
}

function fixture(triggerProfile, { multiAuthority = false, maxPromptBytes = 300_000, maxFileBytes = 131_072,
  maxTotalBytes = 524_288, baseBranch = 'main' } = {}) {
  const policy = {
    version: 2,
    default: { mode: 'local-only' },
    branches: { [baseBranch]: { mode: 'enforced', model: 'gpt-6.1-sol', reasoningEffort: 'medium',
      authorityManifestPath: '.codex/gatekeeper/authorities.json',
      authorityLimits: { maxManifestBytes: 16_384, maxMembers: 16, maxFileBytes,
        maxTotalBytes, maxPromptBytes: 524_288 },
      ownerAmendment: { version: 1, grade: 'G0', scope: 'authority-only', triggerProfile,
        authorityId: 'architecture', authorityPath: path,
        evidenceProducer: 'github-actions-attestation', tagNamespace: 'refs/tags/architecture-gatekeeper/amendments',
        maxPromptBytes } } },
  };
  const policyBytes = Buffer.from(`${JSON.stringify(policy)}\n`);
  const members = [{ id: 'architecture', repository, resolvedCommit: baseSha, path,
    byteLength: authorityBytes.length, sha256: sha256(authorityBytes) }];
  if (multiAuthority) {
    const bytes = Buffer.from('# Ownership boundaries\nExisting ownership remains with the project owner.\n');
    members.push({ id: 'ownership', repository, resolvedCommit: baseSha, path: 'docs/ownership.md',
      byteLength: bytes.length, sha256: sha256(bytes), bytes });
  }
  const authoritySet = { members: members.map(member => ({ ...member, bytes: member.bytes ?? authorityBytes })),
    digest: sha256(Buffer.from(JSON.stringify(members.map(({ bytes, ...member }) => member)))) };
  const manifestBytes = Buffer.from(JSON.stringify({ version: 1, authorities: members.map(member => ({
    id: member.id, repository: 'self', revision: 'authority-revision', path: member.path,
  })) }));
  const descriptors = authoritySet.members.map(({ bytes, ...member }) => member);
  let decision = { decision: triggerProfile === 'completed-block-v1' ? 'BLOCK' : 'OWNER_DECISION',
    authorityIds: members.map(member => member.id), summary: 'The existing rule requires an owner choice.' };
  const workflowPath = '.github/workflows/self-architecture-gate.yml';
  const triggerProducer = { workflowPath, workflowSha: baseSha, workflowRef: `refs/heads/${baseBranch}`,
    runId: '1001', runAttempt: '1', jobId: 'architecture-gate' };
  let decisionBytes = Buffer.from(`${JSON.stringify(decision)}\n`);
  let triggerRecord = {
    version: 1,
    kind: triggerProfile === 'completed-block-v1'
      ? 'owner-amendment-block-review-record'
      : 'owner-amendment-owner-decision-review-record',
    repository, prNumber: 77, baseSha, headSha: triggerHeadSha, mergeSha,
    workflowSha: baseSha, workflowPath, runId: triggerProducer.runId, runAttempt: triggerProducer.runAttempt,
    authority: { version: 1, selfRepository: repository, authorityRevision: baseSha,
      manifestSha256: sha256(manifestBytes), setDigest: authoritySet.digest, members: descriptors },
    inputDigests: Object.fromEntries(['manifest', 'policy', 'prompt', 'schema', 'validation'].map(key =>
      [key, key === 'manifest' ? sha256(manifestBytes) : key === 'policy' ? sha256(policyBytes) : digest(key)])),
    decisionSha256: sha256(decisionBytes), decisionBytesBase64: decisionBytes.toString('base64'), decision,
  };
  if (triggerProfile === 'completed-owner-decision-self-v1') {
    decision = { decision: 'OWNER_DECISION', findings: [], summary: 'The existing rule requires an owner choice.',
      authority: members.map(member => member.id), authorityFiles: members.map(member => member.path),
      authorityIds: members.map(member => member.id), responsibility: ['owner decision'],
      capabilitySurface: ['review'], qualityGuarantees: ['preserve protected policy'], reviewedScope: ['change A'],
      prohibitedChanges: ['self acceptance'],
      gates: { sharedMechanism: { decision: 'OWNER_DECISION', summary: 'Existing rule needs a choice.',
        consumerOwnership: '', failClosedBehavior: '', compatibility: '', minimality: '' },
      trustBoundary: { decision: 'PASS', summary: 'No trust change.', tokenPermissions: '', untrustedInputs: '',
        credentialHandling: '', reportingIsolation: '' } } };
    decisionBytes = Buffer.from(`${JSON.stringify(decision)}\n`);
    const authorityProvenance = { version: 1, selfRepository: repository, authorityRevision: baseSha,
      manifestSha256: sha256(manifestBytes), setDigest: authoritySet.digest, members: descriptors };
    const baseInputs = { policy: policyBytes, manifest: manifestBytes, prompt: Buffer.from('review prompt'),
      schema: readFileSync(join(root, '.codex/gatekeeper/ci-decision.schema.json')),
      validation: readFileSync(join(root, '.codex/gatekeeper/decision.validation.json')) };
    triggerRecord = produceOwnerAmendmentOwnerDecision({ decisionBytes, provenance: authorityProvenance,
      context: { repository, prNumber: 77, baseSha, headSha: triggerHeadSha, mergeSha, workflowSha: baseSha,
        workflowPath, runId: triggerProducer.runId, runAttempt: triggerProducer.runAttempt },
      baseInputs, readAuthority: () => authorityBytes });
  }
  const triggerReviewRecordBytes = Buffer.from(`${JSON.stringify(triggerRecord)}\n`);
  const changes = [{ path, beforeBytes: authorityBytes, afterBytes: proposedAuthorityBytes }];
  if (multiAuthority) changes.push({ path: 'docs/ownership.md', beforeBytes: authoritySet.members[1].bytes,
    afterBytes: Buffer.from('# Ownership boundaries\nOwnership remains with the project owner.\n') });
  const diffBytes = Buffer.from(changes.map(change => {
    const before = change.beforeBytes.toString('utf8').trimEnd().split('\n');
    const after = change.afterBytes.toString('utf8').trimEnd().split('\n');
    const prefix = before[0] === after[0] ? ` ${before[0]}\n` : `-${before[0]}\n+${after[0]}\n`;
    const oldChanged = before.slice(1).join('\n');
    const newChanged = after.slice(1).join('\n');
    return `diff --git a/${change.path} b/${change.path}\nindex ${'1'.repeat(7)}..${'2'.repeat(7)} 100644\n--- a/${change.path}\n+++ b/${change.path}\n@@ -1,2 +1,2 @@\n${prefix}-${oldChanged}\n+${newChanged}\n`;
  }).join(''));
  const resultingDescriptors = authoritySet.members.map(member => {
    const change = changes.find(item => item.path === member.path);
    return change ? { id: member.id, repository: member.repository, resolvedCommit: member.resolvedCommit,
      path: member.path, byteLength: change.afterBytes.length, sha256: sha256(change.afterBytes) } :
      { id: member.id, repository: member.repository, resolvedCommit: member.resolvedCommit,
        path: member.path, byteLength: member.byteLength, sha256: member.sha256 };
  });
  const resultingAuthoritySetDigest = sha256(Buffer.from(JSON.stringify(resultingDescriptors)));
  const amendment = {
    fixtureSchema: `amendment-${triggerProfile}`,
    repository, baseSha, bSha, policyRevision: baseSha, triggerProfile,
    triggerReviewRecordSha256: sha256(triggerReviewRecordBytes), priorAuthoritySetDigest: authoritySet.digest,
    resultingAuthoritySetDigest, target: 'architecture#existing-rule-17', purpose: 'Resolve the existing canonical rule escalation.',
  };
  const attestationBundleBytes = Buffer.from('{"attestation":"fixture"}\n');
  const amendmentRecordBytes = triggerProfile === 'completed-owner-decision-self-v1'
    ? buildOwnerAmendmentOwnerDecisionAmendmentRecord({ reviewRecordBytes: triggerReviewRecordBytes,
      attestationBundleBytes, repository, baseSha, bSha, authorityId: 'architecture', authorityPath: path,
      previousAuthorityBytes: authorityBytes, amendedAuthorityBytes: proposedAuthorityBytes,
      purpose: amendment.purpose }).bytes
    : Buffer.from(JSON.stringify(amendment));
  const semanticProducer = { workflowPath, workflowSha: baseSha, workflowRef: `refs/heads/${baseBranch}`,
    runId: '2002', runAttempt: '1', jobId: 'owner-amendment-eligibility' };
  const gatekeeper = { repository, revision: 'e'.repeat(40), package: null };
  const tagRef = `refs/tags/architecture-gatekeeper/amendments/${bSha}`;
  const tagAnnotation = Buffer.from(`${JSON.stringify({ triggerProfile,
    triggerReviewRecordSha256: sha256(triggerReviewRecordBytes), amendmentRecordSha256: sha256(amendmentRecordBytes) })}\n`);
  const tagObjectBytes = Buffer.from(`object ${bSha}\ntype commit\ntag ${tagRef.slice('refs/tags/'.length)}\n` +
    'tagger Fixture <fixture@example.invalid> 1780000000 +0000\n\n' + tagAnnotation.toString('utf8'));
  const tagObjectOid = gitTagOid(tagObjectBytes);
  const tag = { tagRef, tagObjectOid, observedTagRefOid: tagObjectOid };
  const verifyTrigger = ({ bytes, expected }) => {
    assert.deepEqual(bytes, triggerReviewRecordBytes);
    return { status: 'VERIFIED_OWNER_AMENDMENT_TRIGGER', repository: expected.repository,
      baseSha: expected.baseSha, triggerProfile: expected.triggerProfile,
      triggerReviewRecordSha256: expected.triggerReviewRecordSha256, workflowPath: expected.workflowPath,
      workflowSha: expected.workflowSha, workflowRef: expected.workflowRef,
      runId: expected.runId, runAttempt: expected.runAttempt };
  };
  const verifyAmendment = ({ bytes, expected }) => {
    const value = JSON.parse(bytes.toString('utf8'));
    assert.equal(value.fixtureSchema, `amendment-${expected.triggerProfile}`);
    for (const key of ['repository', 'baseSha', 'bSha', 'policyRevision', 'triggerProfile',
      'triggerReviewRecordSha256', 'priorAuthoritySetDigest', 'resultingAuthoritySetDigest',
      ]) {
      assert.equal(value[key], key === 'priorAuthoritySetDigest' ? expected.authoritySetDigest : expected[key]);
    }
    assert.ok(value.target);
    return { status: 'VERIFIED_OWNER_AMENDMENT_RECORD', repository: value.repository,
      baseSha: value.baseSha, bSha: value.bSha, policyRevision: value.policyRevision,
      triggerProfile: value.triggerProfile, triggerReviewRecordSha256: value.triggerReviewRecordSha256,
      priorAuthoritySetDigest: value.priorAuthoritySetDigest,
      resultingAuthoritySetDigest: value.resultingAuthoritySetDigest, targetValidated: true, purpose: value.purpose };
  };
  const verifyTag = ({ tag: tagInput, expected }) => {
    assert.deepEqual(tagInput, tag);
    return { status: 'VERIFIED_OWNER_AMENDMENT_TAG', repository: expected.repository,
      baseSha: expected.baseSha, bSha: expected.bSha, triggerProfile: expected.triggerProfile,
      triggerReviewRecordSha256: expected.triggerReviewRecordSha256, amendmentRecordSha256: expected.amendmentRecordSha256,
      tagRef: expected.tagRef, tagObjectOid: expected.tagObjectOid, observedTagRefOid: expected.observedTagRefOid };
  };
  const protectedInputs = { baseBranch, policyBytes, manifestBytes, authoritySet, changes, diffBytes };
  const validators = { resolveProtectedInputs: () => structuredCloneProtectedInputs(protectedInputs),
    resolveExactGitDiff: () => ({ diffBytes: Buffer.from(diffBytes) }),
    resolveExactBFiles: ({ paths }) => ({ files: paths.map(value => {
      const change = changes.find(candidate => candidate.path === value);
      return { path: value, bytes: Buffer.from(change.afterBytes) };
    }) }),
    resolveProtectedSelection: () => ({ selectedProducer: semanticProducer, selectedGatekeeper: gatekeeper }),
    validateTriggerProvenance: verifyTrigger,
    validateAmendmentRecord: triggerProfile === 'completed-owner-decision-self-v1'
      ? ({ bytes, expected }) => validateOwnerAmendmentOwnerDecisionAmendmentRecord({ bytes, expected })
      : verifyAmendment,
    validateTag: verifyTag };
  const producer = createOwnerAmendmentSemanticEligibilityProducer(validators);
  const args = { repository, baseSha, bSha, triggerProfile, policyRevision: baseSha, policyBytes,
    authoritySet, manifestBytes, changes, diffBytes, triggerReviewRecordBytes, triggerProducer, amendmentRecordBytes,
    tag, tagObjectBytes, producer: semanticProducer, selectedProducer: semanticProducer,
    gatekeeper, selectedGatekeeper: gatekeeper, reviewModel: policy.branches[baseBranch].model,
    reviewReasoningEffort: policy.branches[baseBranch].reasoningEffort };
  return { args, producer, validators, policy, authoritySet, triggerRecord, triggerReviewRecordBytes, amendmentRecordBytes,
    semanticProducer, gatekeeper, tag, tagObjectBytes, resultingAuthoritySetDigest };
}

function eligibilityDecision(prepared, result = 'ELIGIBLE') {
  const checks = Object.fromEntries([
    'materiallyAddressesTrigger', 'amendsOnlyTargetDecision', 'excludesUnrelatedChanges',
    'excludesImplementationWorkflowAndExecutablePolicyEdits', 'excludesUnsupportedCompletionClaims',
    'resultingAuthorityIsCoherent', 'assessesResultingRulesWithoutRequiringAgreementWithSupersededRules',
  ].map(key => [key, true]));
  if (result === 'INELIGIBLE') checks.excludesUnrelatedChanges = false;
  return canonicalBytes({ version: 1, kind: 'owner-amendment-semantic-eligibility-decision',
    eligibility: result, triggerProfile: prepared.triggerProfile, authorityIds: [...prepared.authorityIds],
    authoritySetDigest: prepared.authoritySetDigest, checks });
}

test('shared producer prepares and validates the enabled BLOCK self trigger profile with exact receipt bindings', () => {
  for (const profile of ['completed-block-v1']) {
    const f = fixture(profile);
    const resolvedPolicy = resolveCiPolicy(parseCiPolicyJson(f.args.policyBytes.toString('utf8')), 'main');
    assert.equal(resolvedPolicy.ownerAmendmentTriggerProfile, profile);
    assert.equal(resolvedPolicy.ownerAmendmentAuthorityId, 'architecture');
    assert.equal(resolvedPolicy.ownerAmendmentAuthorityPath, path);
    assert.equal(resolvedPolicy.ownerAmendmentMaxPromptBytes, 300_000);
    const prepared = f.producer.prepare(f.args);
    assert.equal(prepared.status, 'PREPARED_OWNER_AMENDMENT_SEMANTIC_ELIGIBILITY');
    assert.equal(prepared.triggerProfile, profile);
    assert.equal(prepared.authoritySetDigest, f.authoritySet.digest);
    assert.equal(prepared.resultingAuthoritySetDigest, f.resultingAuthoritySetDigest);
    assert.ok(prepared.promptBytes.length <= f.policy.branches.main.ownerAmendment.maxPromptBytes);
    assert.equal(sha256(prepared.promptBytes), prepared.promptSha256);
    assert.equal(sha256(prepared.schemaBytes), prepared.schemaSha256);
    assert.match(prepared.promptBytes.toString('utf8'), new RegExp(profile));
    assert.match(prepared.promptBytes.toString('utf8'), /complete previous Authority Set/);
    assert.match(prepared.promptBytes.toString('utf8'), /<untrusted-trigger-review-record-utf8>/);
    assert.match(prepared.promptBytes.toString('utf8'), /<untrusted-amendment-record-utf8>/);
    assert.match(prepared.promptBytes.toString('utf8'), /target and purpose are proposed claims/);

    const completed = completeOwnerAmendmentSemanticEligibility({ prepared,
      decisionBytes: eligibilityDecision(prepared), producer: f.semanticProducer, gatekeeper: f.gatekeeper,
      reviewModel: prepared.model, reviewReasoningEffort: prepared.reasoningEffort });
    assert.equal(completed.status, 'COMPLETED_OWNER_AMENDMENT_SEMANTIC_ELIGIBILITY');
    assert.equal(completed.receipt.kind, 'owner-amendment-semantic-eligibility-receipt');
    assert.equal(completed.receipt.triggerProfile, profile);
    assert.equal(completed.receipt.triggerReviewRecordSha256, sha256(f.triggerReviewRecordBytes));
    assert.equal(completed.receipt.amendmentRecordSha256, sha256(f.amendmentRecordBytes));
    assert.equal(completed.receipt.policyRevision, baseSha);
    assert.equal(completed.receipt.gatekeeper.repository, repository);
    assert.deepEqual(completed.receipt.tag, f.tag);
    assert.deepEqual(completed.receipt.producer, f.semanticProducer);
    assert.equal(completed.receipt.decisionSha256, sha256(completed.decisionBytes));
    assert.equal(completed.receiptBytes.at(-1), 0x0a);
    assert.equal(validateOwnerAmendmentSemanticEligibilityReceipt({ receiptBytes: completed.receiptBytes,
      expected: completed.receipt }).status, 'VERIFIED_OWNER_AMENDMENT_SEMANTIC_ELIGIBILITY_RECEIPT');
  }
});

test('closed-schema producer output without an ID reaches amendment eligibility under explicit base opt-in', () => {
  const ownerDecision = fixture('completed-owner-decision-self-v1');
  assert.equal(ownerDecision.triggerRecord.decision.decision, 'OWNER_DECISION');
  assert.equal(Object.hasOwn(ownerDecision.triggerRecord.decision, 'ownerDecisionId'), false);
  const prepared = ownerDecision.producer.prepare(ownerDecision.args);
  assert.equal(prepared.triggerProfile, 'completed-owner-decision-self-v1');
  assert.match(prepared.promptBytes.toString('utf8'), /preserve the completed historical OWNER_DECISION/);
  const completed = completeOwnerAmendmentSemanticEligibility({ prepared,
    decisionBytes: eligibilityDecision(prepared), producer: ownerDecision.semanticProducer,
    gatekeeper: ownerDecision.gatekeeper, reviewModel: prepared.model, reviewReasoningEffort: prepared.reasoningEffort });
  assert.equal(completed.status, 'COMPLETED_OWNER_AMENDMENT_SEMANTIC_ELIGIBILITY');
  assert.equal(completed.receipt.triggerReviewRecordSha256, sha256(ownerDecision.triggerReviewRecordBytes));
});

test('owner-decision semantic eligibility rejects an unadopted decision ID claim in the AmendmentRecord', () => {
  const f = fixture('completed-owner-decision-self-v1');
  const amendment = JSON.parse(f.amendmentRecordBytes.toString('utf8'));
  amendment.ownerDecisionId = 'unadopted-decision-id';
  f.args.amendmentRecordBytes = Buffer.from(JSON.stringify(amendment));
  assert.throws(() => f.producer.prepare(f.args));
});

test('supports multiple selected authority paths and binds the complete resulting Authority Set', () => {
  const f = fixture('completed-block-v1', { multiAuthority: true });
  const prepared = f.producer.prepare(f.args);
  assert.deepEqual(prepared.authorityIds, ['architecture', 'ownership']);
  assert.equal(prepared.changes.length, 2);
  assert.equal(prepared.resultingAuthoritySetDigest, f.resultingAuthoritySetDigest);
  const completed = completeOwnerAmendmentSemanticEligibility({ prepared,
    decisionBytes: eligibilityDecision(prepared), producer: f.semanticProducer, gatekeeper: f.gatekeeper,
    reviewModel: prepared.model, reviewReasoningEffort: prepared.reasoningEffort });
  assert.deepEqual(completed.receipt.authorityIds, ['architecture', 'ownership']);
  assert.deepEqual(completed.receipt.changes.map(change => change.path), ['docs/architecture.md', 'docs/ownership.md']);
});

test('closed decision rejects a missing, extra, mismatched, or inconsistent field', () => {
  const f = fixture('completed-block-v1');
  const prepared = f.producer.prepare(f.args);
  const accepted = eligibilityDecision(prepared);
  const malformed = [
    Buffer.from('{'),
    Buffer.from('{"version":1,"version":1}'),
    Buffer.from(JSON.stringify(JSON.parse(accepted.toString('utf8')))),
    Buffer.from(JSON.stringify({ ...JSON.parse(accepted), surprise: true })),
    Buffer.from(JSON.stringify({ ...JSON.parse(accepted), triggerProfile: 'completed-owner-decision-self-v1' })),
    Buffer.from(JSON.stringify({ ...JSON.parse(accepted), authorityIds: [] })),
    Buffer.from(JSON.stringify({ ...JSON.parse(accepted), eligibility: 'INELIGIBLE' })),
    Buffer.from(JSON.stringify({ ...JSON.parse(accepted), checks: { ...JSON.parse(accepted).checks, surprise: true } })),
  ];
  for (const decisionBytes of malformed) assert.throws(() => completeOwnerAmendmentSemanticEligibility({ prepared,
    decisionBytes, producer: f.semanticProducer, gatekeeper: f.gatekeeper,
    reviewModel: prepared.model, reviewReasoningEffort: prepared.reasoningEffort }));
});

test('fails closed for missing or wrong-profile trigger evidence and stale base or B bindings', () => {
  const block = fixture('completed-block-v1');
  assert.throws(() => block.producer.prepare({ ...block.args,
    triggerReviewRecordBytes: Buffer.alloc(0) }), /trigger ReviewRecord bytes/);
  const policyForOwner = Buffer.from(JSON.stringify({ ...block.policy,
    branches: { main: { ...block.policy.branches.main, ownerAmendment: {
      ...block.policy.branches.main.ownerAmendment, triggerProfile: 'completed-owner-decision-self-v1' } } } }));
  assert.throws(() => block.producer.prepare({ ...block.args,
    triggerProfile: 'completed-owner-decision-self-v1', policyBytes: policyForOwner }), /previous protected policy/);
  assert.throws(() => block.producer.prepare({ ...block.args, policyRevision: 'f'.repeat(40) }), /policy revision/);
  assert.throws(() => block.producer.prepare({ ...block.args, bSha: triggerHeadSha }), /trigger ReviewRecord is stale/);
});

test('enforces prompt and byte limits and requires trusted validators at producer construction', () => {
  const f = fixture('completed-block-v1', { maxPromptBytes: 1 });
  assert.throws(() => f.producer.prepare(f.args), /exceeds the previous protected maxPromptBytes/);
  const bounded = fixture('completed-block-v1');
  const oversized = { ...bounded.validators.resolveProtectedInputs(), diffBytes: Buffer.alloc(1_048_577) };
  assert.throws(() => createOwnerAmendmentSemanticEligibilityProducer({ ...bounded.validators,
    resolveProtectedInputs: () => oversized }).prepare(bounded.args), /malformed or incomplete source data/);
  assert.throws(() => createOwnerAmendmentSemanticEligibilityProducer({ ...f.validators, validateTag: null }), /trusted validateTag dependency/);
  assert.throws(() => createOwnerAmendmentSemanticEligibilityProducer({}), /trusted resolveProtectedInputs dependency/);
});

test('real v2 resolver selects authority id/path and Authority Set limit separately; producer fails closed without ownerAmendment.maxPromptBytes', () => {
  const policyBytes = readFileSync(join(root, '.codex/gatekeeper/ci-policy.json'));
  const selected = resolveCiPolicy(parseCiPolicyJson(policyBytes.toString('utf8')), 'main');
  assert.equal(selected.ownerAmendmentTriggerProfile, 'completed-block-v1');
  assert.equal(selected.ownerAmendmentAuthorityId, 'architecture-contract');
  assert.equal(selected.ownerAmendmentAuthorityPath, 'docs/architecture.md');
  assert.equal(JSON.parse(Buffer.from(selected.authorityLimitsBase64, 'base64')).maxPromptBytes, 524_288);
  const f = fixture('completed-block-v1');
  assert.throws(() => createOwnerAmendmentSemanticEligibilityProducer({ ...f.validators,
    resolveProtectedInputs: () => ({ ...f.validators.resolveProtectedInputs(), policyBytes }) }).prepare(f.args), /previous protected policy/);
});

test('fails closed when B changes a non-authority path or a diff omits/changes declared paths', () => {
  const f = fixture('completed-block-v1');
  const nonAuthority = { path: 'docs/README.md', beforeBytes: authorityBytes,
    afterBytes: proposedAuthorityBytes };
  const base = f.validators.resolveProtectedInputs();
  const badChanges = structuredCloneProtectedInputs(base);
  badChanges.changes = [nonAuthority];
  badChanges.diffBytes = Buffer.from('diff --git a/docs/README.md b/docs/README.md\n');
  assert.throws(() => createOwnerAmendmentSemanticEligibilityProducer({ ...f.validators,
    resolveProtectedInputs: () => badChanges }).prepare(f.args), /differ from the independently derived complete base-to-B Git diff/);
  const badDiff = structuredCloneProtectedInputs(base);
  badDiff.diffBytes = Buffer.from('diff --git a/docs/other.md b/docs/other.md\n');
  assert.throws(() => createOwnerAmendmentSemanticEligibilityProducer({ ...f.validators,
    resolveProtectedInputs: () => badDiff }).prepare(f.args), /differ from the independently derived complete base-to-B Git diff/);
});

test('enforces resulting per-file and aggregate limits and requires the selected target path', () => {
  const limitedFile = fixture('completed-block-v1', { maxFileBytes: 128 });
  const oversizedFile = structuredCloneProtectedInputs(limitedFile.validators.resolveProtectedInputs());
  oversizedFile.changes[0].afterBytes = Buffer.alloc(129, 'x');
  assert.throws(() => createOwnerAmendmentSemanticEligibilityProducer({ ...limitedFile.validators,
    resolveProtectedInputs: () => oversizedFile,
    resolveExactBFiles: () => ({ files: [{ path: oversizedFile.changes[0].path, bytes: Buffer.from(oversizedFile.changes[0].afterBytes) }] })
  }).prepare(limitedFile.args), /change is not one exact/);

  const multiple = fixture('completed-block-v1', { multiAuthority: true, maxTotalBytes: 240 });
  const oversizedSet = structuredCloneProtectedInputs(multiple.validators.resolveProtectedInputs());
  const second = oversizedSet.changes[1];
  const previousLines = second.beforeBytes.toString('utf8').trimEnd().split('\n');
  const replacement = Buffer.from(`${previousLines[0]}\n${'x'.repeat(200)}\n`);
  second.afterBytes = replacement;
  const lines = oversizedSet.diffBytes.toString('utf8').split('\n');
  const oldCandidateLine = 'Existing ownership remains with the project owner.';
  const oldLine = lines.indexOf(`-${oldCandidateLine}`);
  const newLine = lines.indexOf('+Ownership remains with the project owner.');
  if (oldLine >= 0) lines[oldLine] = `-${oldCandidateLine}`;
  if (newLine >= 0) lines[newLine] = `+${'x'.repeat(200)}`;
  oversizedSet.diffBytes = Buffer.from(lines.join('\n'));
  assert.throws(() => createOwnerAmendmentSemanticEligibilityProducer({ ...multiple.validators,
    resolveProtectedInputs: () => oversizedSet,
    resolveExactGitDiff: () => ({ diffBytes: Buffer.from(oversizedSet.diffBytes) }),
    resolveExactBFiles: ({ paths }) => ({ files: paths.map(value => ({ path: value,
      bytes: Buffer.from(oversizedSet.changes.find(change => change.path === value).afterBytes) })) })
  }).prepare(multiple.args), /resulting Authority Set exceeds/);

  const nonTarget = fixture('completed-block-v1', { multiAuthority: true });
  const onlyOtherTarget = structuredCloneProtectedInputs(nonTarget.validators.resolveProtectedInputs());
  onlyOtherTarget.changes = [onlyOtherTarget.changes[1]];
  assert.throws(() => createOwnerAmendmentSemanticEligibilityProducer({ ...nonTarget.validators,
    resolveProtectedInputs: () => onlyOtherTarget }).prepare(nonTarget.args), /complete diff path set|policy-selected amendment target/);
});

test('binds complete Authority Set, manifest and trigger identities to protected adapter selection', () => {
  const f = fixture('completed-block-v1', { multiAuthority: true });
  const full = f.validators.resolveProtectedInputs();
  const reduced = structuredCloneProtectedInputs(full);
  reduced.authoritySet.members.pop();
  reduced.authoritySet.digest = sha256(Buffer.from(JSON.stringify(reduced.authoritySet.members.map(({ bytes, ...m }) => m))));
  assert.throws(() => createOwnerAmendmentSemanticEligibilityProducer({ ...f.validators,
    resolveProtectedInputs: () => reduced }).prepare(f.args), /manifest order/);

  const mismatch = structuredCloneProtectedInputs(full);
  mismatch.manifestBytes = Buffer.from(JSON.stringify({ version: 1, authorities: [
    { id: 'other', repository: 'self', revision: 'authority-revision', path },
    { id: 'ownership', repository: 'self', revision: 'authority-revision', path: 'docs/ownership.md' },
  ] }));
  assert.throws(() => createOwnerAmendmentSemanticEligibilityProducer({ ...f.validators,
    resolveProtectedInputs: () => mismatch }).prepare(f.args), /manifest order/);

  const forgedDiff = structuredCloneProtectedInputs(full);
  forgedDiff.diffBytes = Buffer.from(forgedDiff.diffBytes.toString('utf8').replace(/[-+]Existing rule: [^\n]+/g, '-forged body\n+forged body'));
  assert.throws(() => createOwnerAmendmentSemanticEligibilityProducer({ ...f.validators,
    resolveProtectedInputs: () => forgedDiff }).prepare(f.args), /differ from the independently derived complete base-to-B Git diff/);
  const duplicateLines = fixture('completed-block-v1');
  const duplicateInputs = structuredCloneProtectedInputs(duplicateLines.validators.resolveProtectedInputs());
  const duplicatePath = duplicateInputs.changes[0].path;
  const completeDuplicateDiff = Buffer.from(`diff --git a/${duplicatePath} b/${duplicatePath}\nindex 1111111..2222222 100644\n--- a/${duplicatePath}\n+++ b/${duplicatePath}\n@@ -1,2 +1,2 @@\n-A\n-A\n+B\n+B\n`);
  duplicateInputs.diffBytes = Buffer.from(`diff --git a/${duplicatePath} b/${duplicatePath}\nindex 1111111..2222222 100644\n--- a/${duplicatePath}\n+++ b/${duplicatePath}\n@@ -1,1 +1,1 @@\n-A\n+B\n`);
  assert.throws(() => createOwnerAmendmentSemanticEligibilityProducer({ ...duplicateLines.validators,
    resolveProtectedInputs: () => duplicateInputs, resolveExactGitDiff: () => ({ diffBytes: completeDuplicateDiff })
  }).prepare(duplicateLines.args), /differ from the independently derived complete base-to-B Git diff/);

  const omittedWorkflow = fixture('completed-block-v1');
  const omittedInputs = omittedWorkflow.validators.resolveProtectedInputs();
  const workflowPath = '.github/workflows/self-architecture-gate.yml';
  const completeBaseToB = Buffer.concat([omittedInputs.diffBytes, Buffer.from(
    `diff --git a/${workflowPath} b/${workflowPath}\nindex 1111111..2222222 100644\n--- a/${workflowPath}\n+++ b/${workflowPath}\n@@ -1 +1 @@\n-old\n+new\n`)]);
  let exactDiffRequest;
  assert.throws(() => createOwnerAmendmentSemanticEligibilityProducer({ ...omittedWorkflow.validators,
    resolveExactGitDiff: request => { exactDiffRequest = request; return { diffBytes: completeBaseToB }; }
  }).prepare(omittedWorkflow.args), /differ from the independently derived complete base-to-B Git diff/);
  assert.deepEqual(Object.keys(exactDiffRequest).sort(), ['bSha', 'baseSha', 'repository']);

  const reordered = fixture('completed-block-v1');
  const reorderedInputs = structuredCloneProtectedInputs(reordered.validators.resolveProtectedInputs());
  const reorderedLines = reorderedInputs.changes[0].afterBytes.toString('utf8').trimEnd().split('\n');
  reorderedInputs.changes[0].afterBytes = Buffer.from(`${reorderedLines.reverse().join('\n')}\n`);
  assert.throws(() => createOwnerAmendmentSemanticEligibilityProducer({ ...reordered.validators,
    resolveProtectedInputs: () => reorderedInputs
  }).prepare(reordered.args), /differ from its exact B Git object/);

  for (const field of ['manifestSha256', 'policy']) {
    const bad = structuredCloneProtectedInputs(full);
    if (field === 'manifestSha256') bad.manifestBytes = Buffer.from('different manifest');
    else bad.policyBytes = Buffer.from('different policy');
    assert.throws(() => createOwnerAmendmentSemanticEligibilityProducer({ ...f.validators,
      resolveProtectedInputs: () => bad }).prepare(f.args), /previous protected policy|complete Authority Set|trigger ReviewRecord|Authority Set: manifest/);
  }

  for (const field of ['manifestSha256', 'policy']) {
    const alteredRecord = structuredClone(f.triggerRecord);
    if (field === 'manifestSha256') {
      alteredRecord.authority.manifestSha256 = '9'.repeat(64);
      alteredRecord.inputDigests.manifest = '9'.repeat(64);
    } else alteredRecord.inputDigests.policy = '9'.repeat(64);
    const bytes = Buffer.from(`${JSON.stringify(alteredRecord)}\n`);
    assert.throws(() => f.producer.prepare({ ...f.args, triggerReviewRecordBytes: bytes }), /trigger ReviewRecord does not report/);
  }
});

test('fails closed for trigger producer, semantic producer, model, effort, and Gatekeeper identity mismatches', () => {
  const f = fixture('completed-block-v1');
  assert.throws(() => f.producer.prepare({ ...f.args,
    producer: { ...f.semanticProducer, runId: '2003' } }), /differs from its protected selection/);
  assert.throws(() => f.producer.prepare({ ...f.args,
    triggerProducer: { ...f.args.triggerProducer, runId: '1002' } }), /selected protected producer/);
  assert.throws(() => f.producer.prepare({ ...f.args, reviewModel: 'another-model' }), /reviewer model or reasoning effort/);
  assert.throws(() => f.producer.prepare({ ...f.args, reviewReasoningEffort: 'high' }), /reviewer model or reasoning effort/);
  assert.throws(() => f.producer.prepare({ ...f.args,
    gatekeeper: { ...f.gatekeeper, revision: '9'.repeat(40) } }), /differs from the protected selection/);
});

test('resolves the protected base branch and binds trigger and eligibility workflows to it', () => {
  const f = fixture('completed-block-v1', { baseBranch: 'release/0.6' });
  const selected = resolveCiPolicy(parseCiPolicyJson(f.args.policyBytes.toString('utf8')), 'release/0.6');
  assert.equal(selected.ownerAmendmentTriggerProfile, f.args.triggerProfile);
  assert.doesNotThrow(() => f.producer.prepare(f.args));
  assert.throws(() => createOwnerAmendmentSemanticEligibilityProducer({ ...f.validators,
    resolveProtectedInputs: () => ({ ...f.validators.resolveProtectedInputs(), baseBranch: 'main' }) }).prepare(f.args), /previous protected policy/);
  assert.throws(() => f.producer.prepare({ ...f.args,
    triggerProducer: { ...f.args.triggerProducer, workflowRef: 'refs/heads/main' } }), /producer identity/);
});

test('candidate cannot select its own profile or replace the protected AmendmentRecord/tag bindings', () => {
  const f = fixture('completed-block-v1');
  const changedPolicy = Buffer.from(JSON.stringify({ ...f.policy, branches: { main: { ...f.policy.branches.main,
    ownerAmendment: { ...f.policy.branches.main.ownerAmendment, triggerProfile: 'completed-owner-decision-self-v1' } } } }));
  assert.throws(() => createOwnerAmendmentSemanticEligibilityProducer({ ...f.validators,
    resolveProtectedInputs: () => ({ ...f.validators.resolveProtectedInputs(), policyBytes: changedPolicy }) }).prepare(f.args), /previous protected policy/);
  const wrongAmendment = ({ bytes, expected }) => ({ ...f.validators.validateAmendmentRecord({ bytes, expected }), resultingAuthoritySetDigest: '9'.repeat(64) });
  const untrustedOverride = { ...f.args, validateAmendmentRecord: () => { throw new Error('untrusted callback called'); } };
  assert.doesNotThrow(() => f.producer.prepare(untrustedOverride));
  const untrustedAdapter = { ...f.args, resolveProtectedInputs: () => { throw new Error('untrusted adapter called'); } };
  assert.doesNotThrow(() => f.producer.prepare(untrustedAdapter));
  const callerSelectionOverride = { ...f.args, selectedProducer: { ...f.semanticProducer, runId: '9009' },
    selectedGatekeeper: { ...f.gatekeeper, revision: '9'.repeat(40) } };
  assert.doesNotThrow(() => f.producer.prepare(callerSelectionOverride));
  assert.throws(() => createOwnerAmendmentSemanticEligibilityProducer({ ...f.validators,
    resolveProtectedInputs: () => ({ policyBytes: Buffer.alloc(1) }) }).prepare(f.args), /protected Git adapter result/);
  assert.throws(() => createOwnerAmendmentSemanticEligibilityProducer({ ...f.validators,
    validateAmendmentRecord: wrongAmendment }).prepare(f.args), /AmendmentRecord profile validation/);
  for (const key of ['selectedProducer', 'selectedGatekeeper']) {
    const selected = f.validators.resolveProtectedSelection();
    if (key === 'selectedProducer') selected.selectedProducer = { ...selected.selectedProducer, runId: '9009' };
    else selected.selectedGatekeeper = { ...selected.selectedGatekeeper, revision: '9'.repeat(40) };
    assert.throws(() => createOwnerAmendmentSemanticEligibilityProducer({ ...f.validators,
      resolveProtectedSelection: () => selected }).prepare(f.args), /provenance differs from its protected selection|Gatekeeper runtime\/package identity differs/);
  }
  assert.throws(() => createOwnerAmendmentSemanticEligibilityProducer({ ...f.validators,
    resolveProtectedSelection: () => ({ selectedProducer: f.semanticProducer }) }).prepare(f.args), /independent protected runtime selection/);
  assert.throws(() => f.producer.prepare({ ...f.args,
    tagObjectBytes: Buffer.from('forged tag') }), /does not hash its exact bytes/);
  assert.throws(() => createOwnerAmendmentSemanticEligibilityProducer({ ...f.validators,
    validateTag: () => ({ status: 'VERIFIED_OWNER_AMENDMENT_TAG', repository, baseSha, bSha,
      triggerProfile: f.args.triggerProfile, triggerReviewRecordSha256: '0'.repeat(64),
      amendmentRecordSha256: '0'.repeat(64), ...f.tag }) }).prepare(f.args), /tag validation does not bind/);
});

test('INELIGIBLE is a completed decision with a false check and cannot be rewritten in receipt bytes', () => {
  const f = fixture('completed-block-v1');
  const prepared = f.producer.prepare(f.args);
  const completed = completeOwnerAmendmentSemanticEligibility({ prepared,
    decisionBytes: eligibilityDecision(prepared, 'INELIGIBLE'), producer: f.semanticProducer, gatekeeper: f.gatekeeper,
    reviewModel: prepared.model, reviewReasoningEffort: prepared.reasoningEffort });
  assert.equal(completed.receipt.eligibility, 'INELIGIBLE');
  assert.equal(validateOwnerAmendmentSemanticEligibilityReceipt({ receiptBytes: completed.receiptBytes,
    expected: completed.receipt }).eligibility, 'INELIGIBLE');
  const nonCanonical = Buffer.from(JSON.stringify(completed.receipt));
  assert.throws(() => validateOwnerAmendmentSemanticEligibilityReceipt({ receiptBytes: nonCanonical,
    expected: completed.receipt }), /canonical UTF-8 JSON/);
  const duplicateReceipt = Buffer.from(`${completed.receiptBytes.toString('utf8').trimEnd().slice(0, -1)},"version":1}\n`);
  assert.throws(() => validateOwnerAmendmentSemanticEligibilityReceipt({ receiptBytes: duplicateReceipt,
    expected: completed.receipt }), /duplicate JSON key/);
  const changedExpected = { ...completed.receipt, bSha: '9'.repeat(40) };
  assert.throws(() => validateOwnerAmendmentSemanticEligibilityReceipt({ receiptBytes: completed.receiptBytes,
    expected: changedExpected }), /differ from the protected prepared selection/);
});
