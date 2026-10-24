import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createOwnerAmendmentMergeGroupAcceptanceVerifier } from '../dist/owner-amendment-merge-group-acceptance.mjs';

const repository = 'flair-agency/architecture-gatekeeper';
const baseSha = 'a'.repeat(40), bSha = 'b'.repeat(40), groupSha = 'c'.repeat(40);
const triggerSha = '1'.repeat(64), amendmentSha = '2'.repeat(64), policySha = '3'.repeat(64);
const authoritySetDigest = '4'.repeat(64), receiptSha = '5'.repeat(64), artifactSha = '6'.repeat(64);
const tagOid = 'd'.repeat(40), tagNamespace = 'refs/tags/architecture-gatekeeper/amendments';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
const canonicalBytes = value => Buffer.from(`${JSON.stringify(canonical(value))}\n`);
const runtime = { repository, revision: baseSha };
const event = { action: 'checks_requested', repository: { full_name: repository }, merge_group: {
  base_ref: 'refs/heads/main', base_sha: baseSha, head_sha: groupSha,
} };

function fixture(profile = 'completed-block-v1', edits = {}) {
  const decision = profile === 'completed-block-v1' ? 'BLOCK' : 'OWNER_DECISION';
  const ids = ['architecture-contract'];
  const diffBytes = Buffer.from('exact protected-base-to-B authority diff\n');
  const promptBytes = Buffer.from('exact protected semantic eligibility prompt\n');
  const schemaBytes = Buffer.from('{"type":"object","additionalProperties":false}\n');
  const selection = { status: 'SELECTED_OWNER_AMENDMENT_MERGE_GROUP_B_CONTEXT', repository, repositoryId: 17,
    mergeGroupBaseSha: baseSha, mergeGroupHeadSha: groupSha, bPrNumber: '8', bBaseSha: baseSha,
    bHeadSha: bSha, bPullRequestCreatedAt: '2026-09-29T10:00:00Z',
    queueEntryState: 'AWAITING_CHECKS', queueEnteredAt: '2026-09-29T12:00:00Z' };
  const policy = { status: 'RESOLVED_PREVIOUS_OWNER_AMENDMENT_POLICY', repository, baseSha,
    grade: 'G0', scope: 'authority-only', triggerProfile: profile,
    authorityId: ids[0], authorityPath: 'docs/architecture.md', tagNamespace,
    authoritySha256: '8'.repeat(64), policySha256: policySha, authoritySetDigest, authorityIds: ids,
    model: 'gpt-6-sol', reasoningEffort: 'medium', maxPromptBytes: 4096 };
  const trigger = { status: 'VERIFIED_OWNER_AMENDMENT_TRIGGER', repository, baseSha,
    triggerProfile: profile, decision,
    reviewRecordSha256: triggerSha, producerWorkflowPath: '.github/workflows/self-architecture-gate.yml',
    producerWorkflowSha: baseSha, producerWorkflowRef: 'refs/heads/main', producerRunId: '101',
    producerRunAttempt: '1', provenanceVerified: true };
  const tag = { status: 'VERIFIED_OWNER_AMENDMENT_TAG', repository, baseSha, bSha,
    triggerProfile: profile, triggerReviewRecordSha256: triggerSha, amendmentRecordSha256: amendmentSha,
    authorityId: ids[0], authorityPath: 'docs/architecture.md', previousAuthoritySha256: '8'.repeat(64),
    amendedAuthoritySha256: '9'.repeat(64), priorAuthoritySetDigest: authoritySetDigest,
    resultingAuthoritySetDigest: '7'.repeat(64), changes: [{ path: 'docs/architecture.md',
      beforeSha256: '8'.repeat(64), afterSha256: '9'.repeat(64) }], purpose: 'Resolve the selected authority trigger', targetValidated: true,
    tagRef: `${tagNamespace}/${bSha}`, tagObjectOid: tagOid, observedTagRefOid: tagOid,
    protectedAgainstUpdateAndDeletion: true };
  const producer = { workflowPath: '.github/workflows/self-architecture-gate.yml', workflowSha: baseSha,
    workflowRef: 'refs/heads/main', runId: '202', runAttempt: '1', jobId: 'owner-amendment-eligibility' };
  const receipt = { version: 1, kind: 'owner-amendment-semantic-eligibility-receipt', eligibility: 'ELIGIBLE',
    repository, baseSha, bSha, triggerProfile: profile, triggerReviewRecordSha256: triggerSha,
    amendmentRecordSha256: amendmentSha, policyRevision: baseSha, policySha256: policySha,
    authoritySetDigest, authorityIds: ids,
    changes: [{ path: 'docs/architecture.md', beforeSha256: '8'.repeat(64), afterSha256: '9'.repeat(64) }],
    diffSha256: hash(diffBytes), promptSha256: hash(promptBytes), schemaSha256: hash(schemaBytes),
    decisionSha256: 'e'.repeat(64), model: 'gpt-6-sol', reasoningEffort: 'medium',
    tag: { tagRef: tag.tagRef, tagObjectOid: tagOid, observedTagRefOid: tagOid },
    producer, gatekeeper: { repository, revision: baseSha, package: null } };
  const receiptBytes = canonicalBytes(receipt);
  const eligibility = { status: 'VERIFIED_OWNER_AMENDMENT_ELIGIBILITY_EVIDENCE', receiptBytes,
    receiptSha256: hash(receiptBytes), artifactId: '9001', artifactSha256: artifactSha,
    provenanceVerified: true, checkConclusion: 'success', completedAt: '2026-09-29T11:59:00Z',
    producerWorkflowPath: producer.workflowPath, producerWorkflowSha: producer.workflowSha,
    producerWorkflowRef: producer.workflowRef, producerRunId: producer.runId,
    producerRunAttempt: producer.runAttempt, producerJobId: producer.jobId,
    gatekeeperRepository: repository, gatekeeperRevision: baseSha,
    principalAuthentication: 'not_verified', exactClaimAuthorization: 'not_verified' };
  const reviewInputs = { status: 'RESOLVED_PROTECTED_OWNER_AMENDMENT_REVIEW_INPUTS', repository,
    baseSha, bSha, triggerProfile: profile, triggerReviewRecordSha256: triggerSha,
    amendmentRecordSha256: amendmentSha, policySha256: policySha, authoritySetDigest,
    priorAuthoritySetDigest: authoritySetDigest, resultingAuthoritySetDigest: tag.resultingAuthoritySetDigest,
    authorityIds: ids, changes: receipt.changes, diffSha256: hash(diffBytes), promptSha256: hash(promptBytes),
    schemaSha256: hash(schemaBytes), model: policy.model, reasoningEffort: policy.reasoningEffort,
    diffBytes, promptBytes, schemaBytes };
  const values = { selection, policy, trigger, tag, eligibility, reviewInputs, ...edits };
  const calls = [];
  const verifier = createOwnerAmendmentMergeGroupAcceptanceVerifier({ runtime,
    selectBContext: async () => { calls.push('select'); return values.selection; },
    resolveProtectedPolicy: async ({ selection: selected, baseSha: resolvedBase }) => {
      calls.push('policy'); assert.equal(selected.bBaseSha, resolvedBase); return values.policy;
    },
    verifyTrigger: async () => { calls.push('trigger'); return values.trigger; },
    verifyTag: async () => { calls.push('tag'); return values.tag; },
    resolveEligibilityReviewInputs: async () => { calls.push('inputs'); return values.reviewInputs; },
    verifyEligibility: async () => { calls.push('eligibility'); return values.eligibility; },
  });
  return { verifier, calls, values };
}


function initiatedFixture() {
  const f = fixture('owner-initiated-self-v1');
  f.values.trigger = { status: 'VERIFIED_OWNER_AMENDMENT_TRIGGER', repository, baseSha,
    triggerProfile: 'owner-initiated-self-v1', historicalTrigger: 'none' };
  for (const value of [f.values.tag, f.values.reviewInputs]) {
    delete value.triggerReviewRecordSha256;
    value.historicalTrigger = 'none';
  }
  const receipt = JSON.parse(f.values.eligibility.receiptBytes);
  receipt.version = 2;
  delete receipt.triggerReviewRecordSha256;
  receipt.historicalTrigger = 'none';
  f.values.eligibility.receiptBytes = canonicalBytes(receipt);
  f.values.eligibility.receiptSha256 = hash(f.values.eligibility.receiptBytes);
  return f;
}
test('owner-initiated Queue retains exact eligibility chain without historical evidence', async () => {
  const f = initiatedFixture();
  const result = await f.verifier.verify(event);
  assert.equal(result.status, 'VERIFIED_OWNER_AMENDMENT_G0_FOR_TRANSITION', result.reason);
  assert.equal(result.historicalTrigger, 'none');
  assert.equal(Object.hasOwn(result, 'triggerDecision'), false);
  assert.equal(Object.hasOwn(result, 'triggerReviewRecordSha256'), false);
});
for (const [label, mutate] of [
  ['mixed trigger', f => { f.values.trigger.reviewRecordSha256 = triggerSha; }],
  ['mixed tag', f => { f.values.tag.triggerReviewRecordSha256 = triggerSha; }],
  ['mixed inputs', f => { f.values.reviewInputs.triggerReviewRecordSha256 = triggerSha; }],
  ['missing absence marker', f => { delete f.values.trigger.historicalTrigger; }],
  ['unverified eligibility provenance', f => { f.values.eligibility.provenanceVerified = false; }],
  ['stale Queue entry', f => { f.values.eligibility.completedAt = f.values.selection.queueEnteredAt; }],
  ['altered diff', f => { f.values.reviewInputs.diffBytes = Buffer.from('tampered'); }],
  ['unprotected tag', f => { f.values.tag.protectedAgainstUpdateAndDeletion = false; }],
]) test(`owner-initiated Queue rejects ${label}`, async () => {
  const f = initiatedFixture(); mutate(f);
  assert.equal((await f.verifier.verify(event)).status, 'INCOMPLETE');
});
