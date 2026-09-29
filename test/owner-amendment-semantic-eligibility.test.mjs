import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import {
  completeOwnerAmendmentSemanticEligibility,
  prepareOwnerAmendmentSemanticEligibility,
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

function fixture(triggerProfile, { multiAuthority = false } = {}) {
  const policy = {
    version: 2,
    branches: { main: { mode: 'enforced', model: 'gpt-6-sol', reasoningEffort: 'medium',
      ownerAmendment: { version: 1, grade: 'G0', scope: 'authority-only', triggerProfile,
        evidenceProducer: 'github-actions-attestation', tagNamespace: 'refs/tags/architecture-gatekeeper/amendments',
        maxPromptBytes: 300_000 } } },
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
  const descriptors = authoritySet.members.map(({ bytes, ...member }) => member);
  const decision = { decision: triggerProfile === 'completed-block-self-v1' ? 'BLOCK' : 'OWNER_DECISION',
    ...(triggerProfile === 'completed-owner-decision-self-v1' ? { ownerDecisionId: 'existing-rule-17' } : {}),
    authorityIds: members.map(member => member.id), summary: 'The existing rule requires an owner choice.' };
  const decisionBytes = Buffer.from(`${JSON.stringify(decision)}\n`);
  const workflowPath = '.github/workflows/self-architecture-gate.yml';
  const triggerProducer = { workflowPath, workflowSha: baseSha, workflowRef: 'refs/heads/main',
    runId: '1001', runAttempt: '1', jobId: 'architecture-gate' };
  const triggerRecord = {
    version: 1,
    kind: triggerProfile === 'completed-block-self-v1'
      ? 'owner-amendment-block-review-record'
      : 'owner-amendment-owner-decision-review-record',
    repository, prNumber: 77, baseSha, headSha: triggerHeadSha, mergeSha,
    workflowSha: baseSha, workflowPath, runId: triggerProducer.runId, runAttempt: triggerProducer.runAttempt,
    authority: { version: 1, selfRepository: repository, authorityRevision: baseSha,
      manifestSha256: '1'.repeat(64), setDigest: authoritySet.digest, members: descriptors },
    inputDigests: Object.fromEntries(['manifest', 'policy', 'prompt', 'schema', 'validation'].map(key => [key, digest(key)])),
    decisionSha256: sha256(decisionBytes), decisionBytesBase64: decisionBytes.toString('base64'), decision,
  };
  const triggerReviewRecordBytes = Buffer.from(`${JSON.stringify(triggerRecord)}\n`);
  const changes = [{ path, beforeBytes: authorityBytes, afterBytes: proposedAuthorityBytes }];
  if (multiAuthority) changes.push({ path: 'docs/ownership.md', beforeBytes: authoritySet.members[1].bytes,
    afterBytes: Buffer.from('# Ownership boundaries\nOwnership remains with the project owner.\n') });
  const diffBytes = Buffer.from(changes.map(change => `diff --git a/${change.path} b/${change.path}\nindex ${'1'.repeat(7)}..${'2'.repeat(7)} 100644\n--- a/${change.path}\n+++ b/${change.path}\n@@ -1,2 +1,2 @@\n-old\n+new\n`).join(''));
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
  const amendmentRecordBytes = Buffer.from(JSON.stringify(amendment));
  const semanticProducer = { workflowPath, workflowSha: baseSha, workflowRef: 'refs/heads/main',
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
      'triggerReviewRecordSha256', 'priorAuthoritySetDigest', 'resultingAuthoritySetDigest']) {
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
  const args = { repository, baseSha, bSha, triggerProfile, policyRevision: baseSha, policyBytes,
    authoritySet, changes, diffBytes, triggerReviewRecordBytes, triggerProducer,
    validateTriggerProvenance: verifyTrigger, amendmentRecordBytes, validateAmendmentRecord: verifyAmendment,
    tag, tagObjectBytes, validateTag: verifyTag, producer: semanticProducer, selectedProducer: semanticProducer,
    gatekeeper, selectedGatekeeper: gatekeeper, reviewModel: policy.branches.main.model,
    reviewReasoningEffort: policy.branches.main.reasoningEffort };
  return { args, policy, authoritySet, triggerRecord, triggerReviewRecordBytes, amendmentRecordBytes,
    semanticProducer, gatekeeper, tag, tagObjectBytes, resultingAuthoritySetDigest };
}

function eligibilityDecision(prepared, result = 'ELIGIBLE') {
  const checks = Object.fromEntries([
    'materiallyAddressesTrigger', 'amendsOnlyTargetDecision', 'excludesUnrelatedChanges',
    'excludesImplementationWorkflowAndExecutablePolicyEdits', 'excludesUnsupportedCompletionClaims',
    'resultingAuthorityIsCoherent', 'assessesResultingRulesWithoutRequiringAgreementWithSupersededRules',
  ].map(key => [key, true]));
  if (result === 'INELIGIBLE') checks.excludesUnrelatedChanges = false;
  return Buffer.from(JSON.stringify({ version: 1, kind: 'owner-amendment-semantic-eligibility-decision',
    eligibility: result, triggerProfile: prepared.triggerProfile, authorityIds: [...prepared.authorityIds],
    authoritySetDigest: prepared.authoritySetDigest, checks }));
}

test('one shared producer prepares and validates both self trigger profiles with exact receipt bindings', () => {
  for (const profile of ['completed-block-self-v1', 'completed-owner-decision-self-v1']) {
    const f = fixture(profile);
    const prepared = prepareOwnerAmendmentSemanticEligibility(f.args);
    assert.equal(prepared.status, 'PREPARED_OWNER_AMENDMENT_SEMANTIC_ELIGIBILITY');
    assert.equal(prepared.triggerProfile, profile);
    assert.equal(prepared.authoritySetDigest, f.authoritySet.digest);
    assert.equal(prepared.resultingAuthoritySetDigest, f.resultingAuthoritySetDigest);
    assert.ok(prepared.promptBytes.length <= f.policy.branches.main.ownerAmendment.maxPromptBytes);
    assert.equal(sha256(prepared.promptBytes), prepared.promptSha256);
    assert.equal(sha256(prepared.schemaBytes), prepared.schemaSha256);
    assert.match(prepared.promptBytes.toString('utf8'), new RegExp(profile));
    assert.match(prepared.promptBytes.toString('utf8'), /complete previous Authority Set/);

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

test('supports multiple selected authority paths and binds the complete resulting Authority Set', () => {
  const f = fixture('completed-owner-decision-self-v1', { multiAuthority: true });
  const prepared = prepareOwnerAmendmentSemanticEligibility(f.args);
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
  const f = fixture('completed-block-self-v1');
  const prepared = prepareOwnerAmendmentSemanticEligibility(f.args);
  const accepted = eligibilityDecision(prepared);
  const malformed = [
    Buffer.from('{'),
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
  const block = fixture('completed-block-self-v1');
  assert.throws(() => prepareOwnerAmendmentSemanticEligibility({ ...block.args,
    triggerReviewRecordBytes: Buffer.alloc(0) }), /trigger ReviewRecord bytes/);
  const policyForOwner = Buffer.from(JSON.stringify({ ...block.policy,
    branches: { main: { ...block.policy.branches.main, ownerAmendment: {
      ...block.policy.branches.main.ownerAmendment, triggerProfile: 'completed-owner-decision-self-v1' } } } }));
  assert.throws(() => prepareOwnerAmendmentSemanticEligibility({ ...block.args,
    triggerProfile: 'completed-owner-decision-self-v1', policyBytes: policyForOwner }), /different profile/);
  assert.throws(() => prepareOwnerAmendmentSemanticEligibility({ ...block.args, policyRevision: 'f'.repeat(40) }), /policy revision/);
  assert.throws(() => prepareOwnerAmendmentSemanticEligibility({ ...block.args, bSha: triggerHeadSha }), /trigger ReviewRecord is stale/);
});

test('fails closed when B changes a non-authority path or a diff omits/changes declared paths', () => {
  const f = fixture('completed-block-self-v1');
  const nonAuthority = { path: 'docs/README.md', beforeBytes: authorityBytes,
    afterBytes: proposedAuthorityBytes };
  assert.throws(() => prepareOwnerAmendmentSemanticEligibility({ ...f.args,
    changes: [nonAuthority], diffBytes: Buffer.from('diff --git a/docs/README.md b/docs/README.md\n') }), /non-authority path/);
  assert.throws(() => prepareOwnerAmendmentSemanticEligibility({ ...f.args,
    diffBytes: Buffer.from('diff --git a/docs/other.md b/docs/other.md\n') }), /do not exactly match/);
});

test('fails closed for trigger producer, semantic producer, model, effort, and Gatekeeper identity mismatches', () => {
  const f = fixture('completed-owner-decision-self-v1');
  assert.throws(() => prepareOwnerAmendmentSemanticEligibility({ ...f.args,
    producer: { ...f.semanticProducer, runId: '2003' } }), /differs from its protected selection/);
  assert.throws(() => prepareOwnerAmendmentSemanticEligibility({ ...f.args,
    triggerProducer: { ...f.args.triggerProducer, runId: '1002' } }), /selected protected producer/);
  assert.throws(() => prepareOwnerAmendmentSemanticEligibility({ ...f.args, reviewModel: 'another-model' }), /reviewer model or reasoning effort/);
  assert.throws(() => prepareOwnerAmendmentSemanticEligibility({ ...f.args, reviewReasoningEffort: 'high' }), /reviewer model or reasoning effort/);
  assert.throws(() => prepareOwnerAmendmentSemanticEligibility({ ...f.args,
    gatekeeper: { ...f.gatekeeper, revision: '9'.repeat(40) } }), /differs from the protected selection/);
});

test('candidate cannot select its own profile or replace the protected AmendmentRecord/tag bindings', () => {
  const f = fixture('completed-block-self-v1');
  assert.throws(() => prepareOwnerAmendmentSemanticEligibility({ ...f.args,
    policyBytes: Buffer.from(JSON.stringify({ ...f.policy, branches: { main: { ...f.policy.branches.main,
      ownerAmendment: { ...f.policy.branches.main.ownerAmendment, triggerProfile: 'completed-owner-decision-self-v1' } } } })) }), /previous protected policy/);
  const wrongAmendment = (...args) => ({ ...f.args.validateAmendmentRecord(...args), resultingAuthoritySetDigest: '9'.repeat(64) });
  assert.throws(() => prepareOwnerAmendmentSemanticEligibility({ ...f.args,
    validateAmendmentRecord: wrongAmendment }), /AmendmentRecord profile validation/);
  assert.throws(() => prepareOwnerAmendmentSemanticEligibility({ ...f.args,
    tagObjectBytes: Buffer.from('forged tag') }), /does not hash its exact bytes/);
  assert.throws(() => prepareOwnerAmendmentSemanticEligibility({ ...f.args,
    validateTag: () => ({ status: 'VERIFIED_OWNER_AMENDMENT_TAG', repository, baseSha, bSha,
      triggerProfile: f.args.triggerProfile, triggerReviewRecordSha256: '0'.repeat(64),
      amendmentRecordSha256: '0'.repeat(64), ...f.tag }) }), /tag validation does not bind/);
});

test('INELIGIBLE is a completed decision with a false check and cannot be rewritten in receipt bytes', () => {
  const f = fixture('completed-owner-decision-self-v1');
  const prepared = prepareOwnerAmendmentSemanticEligibility(f.args);
  const completed = completeOwnerAmendmentSemanticEligibility({ prepared,
    decisionBytes: eligibilityDecision(prepared, 'INELIGIBLE'), producer: f.semanticProducer, gatekeeper: f.gatekeeper,
    reviewModel: prepared.model, reviewReasoningEffort: prepared.reasoningEffort });
  assert.equal(completed.receipt.eligibility, 'INELIGIBLE');
  assert.equal(validateOwnerAmendmentSemanticEligibilityReceipt({ receiptBytes: completed.receiptBytes,
    expected: completed.receipt }).eligibility, 'INELIGIBLE');
  const nonCanonical = Buffer.from(JSON.stringify(completed.receipt));
  assert.throws(() => validateOwnerAmendmentSemanticEligibilityReceipt({ receiptBytes: nonCanonical,
    expected: completed.receipt }), /canonical UTF-8 JSON/);
});
