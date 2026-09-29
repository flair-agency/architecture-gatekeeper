import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { buildOwnerAmendmentOwnerDecisionAmendmentRecord, validateOwnerAmendmentOwnerDecisionAmendmentRecord } from '../src/owner-amendment-owner-decision-amendment-record.mjs';

const sha = value => createHash('sha256').update(value).digest('hex');
const base = 'a'.repeat(40); const bSha = 'b'.repeat(40); const aHead = 'c'.repeat(40); const merge = 'd'.repeat(40);
const before = Buffer.from('# Prior\n'); const after = Buffer.from('# Amended\n'); const bundle = Buffer.from('{"bundle":true}');
const decision = { decision: 'OWNER_DECISION', ownerDecisionId: 'decision-existing-42', authorityIds: ['architecture'] };
const decisionBytes = Buffer.from(JSON.stringify(decision));
const review = { version: 1, kind: 'owner-amendment-owner-decision-review-record', repository: 'flair-agency/architecture-gatekeeper',
  prNumber: 17, baseSha: base, headSha: aHead, mergeSha: merge, workflowSha: base,
  workflowPath: '.github/workflows/self-architecture-gate.yml', runId: '101', runAttempt: '1',
  authority: { version: 1, selfRepository: 'flair-agency/architecture-gatekeeper', authorityRevision: base,
    manifestSha256: sha('manifest'), setDigest: sha('set'), members: [{ id: 'architecture', repository: 'flair-agency/architecture-gatekeeper',
      resolvedCommit: base, path: 'docs/architecture.md', byteLength: before.length, sha256: sha(before) }] },
  inputDigests: Object.fromEntries(['manifest','policy','prompt','schema','validation'].map(key => [key, sha(key)])),
  decisionSha256: sha(decisionBytes), decisionBytesBase64: decisionBytes.toString('base64'), decision };
const reviewBytes = Buffer.from(`${JSON.stringify(review)}\n`);
const call = () => buildOwnerAmendmentOwnerDecisionAmendmentRecord({ reviewRecordBytes: reviewBytes,
  attestationBundleBytes: bundle, repository: review.repository, baseSha: base, bSha,
  authorityId: 'architecture', authorityPath: 'docs/architecture.md', previousAuthorityBytes: before,
  amendedAuthorityBytes: after, purpose: 'Resolve the selected existing architecture decision.' });

test('builds a closed OWNER_DECISION AmendmentRecord bound to exact trigger and authority bytes', () => {
  const built = call();
  assert.equal(built.record.ownerDecisionId, 'decision-existing-42');
  const result = validateOwnerAmendmentOwnerDecisionAmendmentRecord({ bytes: built.bytes, expected: {
    repository: review.repository, baseSha: base, bSha, policyRevision: base,
    triggerProfile: 'completed-owner-decision-self-v1', triggerReviewRecordSha256: sha(reviewBytes),
    authoritySetDigest: review.authority.setDigest, resultingAuthoritySetDigest: sha('result-set'),
    ownerDecisionId: decision.ownerDecisionId,
    changes: [{ path: 'docs/architecture.md', beforeSha256: sha(before), afterSha256: sha(after) }],
  } });
  assert.equal(result.status, 'VERIFIED_OWNER_AMENDMENT_RECORD');
  assert.equal(result.ownerDecisionId, 'decision-existing-42');
});

test('rejects a different trigger digest, decision ID, or changed authority bytes', () => {
  const built = call();
  const expected = { repository: review.repository, baseSha: base, bSha, policyRevision: base,
    triggerProfile: 'completed-owner-decision-self-v1', triggerReviewRecordSha256: sha(reviewBytes),
    authoritySetDigest: review.authority.setDigest, resultingAuthoritySetDigest: sha('result-set'),
    ownerDecisionId: decision.ownerDecisionId,
    changes: [{ path: 'docs/architecture.md', beforeSha256: sha(before), afterSha256: sha(after) }] };
  assert.equal(validateOwnerAmendmentOwnerDecisionAmendmentRecord({ bytes: built.bytes,
    expected: { ...expected, triggerReviewRecordSha256: sha('other') } }).status, 'INCOMPLETE');
  assert.equal(validateOwnerAmendmentOwnerDecisionAmendmentRecord({ bytes: built.bytes,
    expected: { ...expected, ownerDecisionId: 'different-owner-choice' } }).status, 'INCOMPLETE');
  const changedReview = Buffer.from(JSON.stringify({ ...review, decision: { ...decision, ownerDecisionId: 'other-id' } }));
  assert.throws(() => buildOwnerAmendmentOwnerDecisionAmendmentRecord({ reviewRecordBytes: changedReview,
    attestationBundleBytes: bundle, repository: review.repository, baseSha: base, bSha,
    authorityId: 'architecture', authorityPath: 'docs/architecture.md', previousAuthorityBytes: before,
    amendedAuthorityBytes: after, purpose: 'Resolve the selected existing architecture decision.' }), /exact decision bytes and decision digest/);
  assert.throws(() => buildOwnerAmendmentOwnerDecisionAmendmentRecord({ reviewRecordBytes: reviewBytes,
    attestationBundleBytes: bundle, repository: review.repository, baseSha: base, bSha,
    authorityId: 'architecture', authorityPath: 'docs/architecture.md', previousAuthorityBytes: after,
    amendedAuthorityBytes: after, purpose: 'Resolve the selected existing architecture decision.' }), /invalid or unchanged/);
});
