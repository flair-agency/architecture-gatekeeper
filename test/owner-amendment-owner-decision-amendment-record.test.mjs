import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { buildOwnerAmendmentOwnerDecisionAmendmentRecord, validateOwnerAmendmentOwnerDecisionAmendmentRecord } from '../src/owner-amendment-owner-decision-amendment-record.mjs';

const sha = value => createHash('sha256').update(value).digest('hex');
const base = 'a'.repeat(40); const bSha = 'b'.repeat(40); const aHead = 'c'.repeat(40); const merge = 'd'.repeat(40);
const before = Buffer.from('# Prior\n'); const after = Buffer.from('# Amended\n'); const bundle = Buffer.from('{"bundle":true}');
const beforeSecurity = Buffer.from('# Security before\n'); const afterSecurity = Buffer.from('# Security after\n');
const pathSecurity = 'docs/security.md';
const descriptors = [
  { id: 'architecture', repository: 'flair-agency/architecture-gatekeeper', resolvedCommit: base,
    path: 'docs/architecture.md', byteLength: before.length, sha256: sha(before) },
  { id: 'security', repository: 'flair-agency/architecture-gatekeeper', resolvedCommit: base,
    path: pathSecurity, byteLength: beforeSecurity.length, sha256: sha(beforeSecurity) },
];
const priorAuthoritySetDigest = sha(Buffer.from(JSON.stringify(descriptors)));
const resultingDescriptors = [
  { ...descriptors[0], byteLength: after.length, sha256: sha(after) },
  { ...descriptors[1], byteLength: afterSecurity.length, sha256: sha(afterSecurity) },
];
const resultingAuthoritySetDigest = sha(Buffer.from(JSON.stringify(resultingDescriptors)));
  const decision = { decision: 'OWNER_DECISION', authorityIds: ['architecture', 'security'] };
const decisionBytes = Buffer.from(JSON.stringify(decision));
const review = { version: 1, kind: 'owner-amendment-owner-decision-review-record', repository: 'flair-agency/architecture-gatekeeper',
  prNumber: 17, baseSha: base, headSha: aHead, mergeSha: merge, workflowSha: base,
  workflowPath: '.github/workflows/self-architecture-gate.yml', runId: '101', runAttempt: '1',
  authority: { version: 1, selfRepository: 'flair-agency/architecture-gatekeeper', authorityRevision: base,
    manifestSha256: sha('manifest'), setDigest: priorAuthoritySetDigest, members: descriptors },
  inputDigests: Object.fromEntries(['manifest','policy','prompt','schema','validation'].map(key => [key, sha(key)])),
  decisionSha256: sha(decisionBytes), decisionBytesBase64: decisionBytes.toString('base64'), decision };
const reviewBytes = Buffer.from(`${JSON.stringify(review)}\n`);
const call = () => buildOwnerAmendmentOwnerDecisionAmendmentRecord({ reviewRecordBytes: reviewBytes,
  attestationBundleBytes: bundle, repository: review.repository, baseSha: base, bSha,
  authorityId: 'architecture', authorityPath: 'docs/architecture.md', previousAuthorityBytes: before,
  amendedAuthorityBytes: after, authorityChanges: [
    { path: 'docs/architecture.md', beforeBytes: before, afterBytes: after },
    { path: pathSecurity, beforeBytes: beforeSecurity, afterBytes: afterSecurity },
  ], priorAuthoritySetDigest, resultingAuthoritySetDigest,
  purpose: 'Resolve the selected existing architecture decision.' });

test('builds a closed OWNER_DECISION AmendmentRecord bound to exact trigger and authority bytes', () => {
  const built = call();
  assert.equal(Object.hasOwn(built.record, 'ownerDecisionId'), false);
  const result = validateOwnerAmendmentOwnerDecisionAmendmentRecord({ bytes: built.bytes, expected: {
    repository: review.repository, baseSha: base, bSha, policyRevision: base,
    triggerProfile: 'completed-owner-decision-self-v1', triggerReviewRecordSha256: sha(reviewBytes),
    authoritySetDigest: review.authority.setDigest, resultingAuthoritySetDigest,
    authorityId: 'architecture', authorityPath: 'docs/architecture.md',
    changes: [
      { path: 'docs/architecture.md', beforeSha256: sha(before), afterSha256: sha(after) },
      { path: pathSecurity, beforeSha256: sha(beforeSecurity), afterSha256: sha(afterSecurity) },
    ],
  } });
  assert.equal(result.status, 'VERIFIED_OWNER_AMENDMENT_RECORD');
  assert.deepEqual(Object.keys(result).sort(), ['status', 'repository', 'baseSha', 'bSha', 'policyRevision',
    'triggerProfile', 'triggerReviewRecordSha256', 'priorAuthoritySetDigest', 'resultingAuthoritySetDigest',
    'authorityId', 'authorityPath', 'changes', 'targetValidated', 'purpose'].sort());
  assert.equal(result.authorityId, 'architecture');
  assert.equal(result.authorityPath, 'docs/architecture.md');
});

test('rejects a different trigger digest, extra decision ID claim, or changed authority bytes', () => {
  const built = call();
  const expected = { repository: review.repository, baseSha: base, bSha, policyRevision: base,
    triggerProfile: 'completed-owner-decision-self-v1', triggerReviewRecordSha256: sha(reviewBytes),
    authoritySetDigest: review.authority.setDigest, resultingAuthoritySetDigest,
    authorityId: 'architecture', authorityPath: 'docs/architecture.md',
    changes: [
      { path: 'docs/architecture.md', beforeSha256: sha(before), afterSha256: sha(after) },
      { path: pathSecurity, beforeSha256: sha(beforeSecurity), afterSha256: sha(afterSecurity) },
    ] };
  assert.equal(validateOwnerAmendmentOwnerDecisionAmendmentRecord({ bytes: built.bytes,
    expected: { ...expected, triggerReviewRecordSha256: sha('other') } }).status, 'INCOMPLETE');
  const amendmentWithId = { ...JSON.parse(built.bytes.toString('utf8')), ownerDecisionId: 'unadopted-id' };
  assert.equal(validateOwnerAmendmentOwnerDecisionAmendmentRecord({ bytes: Buffer.from(`${JSON.stringify(amendmentWithId)}\n`),
    expected }).status, 'INCOMPLETE');
  assert.equal(validateOwnerAmendmentOwnerDecisionAmendmentRecord({ bytes: built.bytes,
    expected: { ...expected, changes: expected.changes.slice(0, 1) } }).status, 'INCOMPLETE');
  const otherChangedMember = expected.changes[1];
  const mismatchedTarget = { ...JSON.parse(built.bytes.toString('utf8')),
    authority: { id: 'security', path: pathSecurity, previousSha256: otherChangedMember.beforeSha256,
      newSha256: otherChangedMember.afterSha256 } };
  assert.equal(validateOwnerAmendmentOwnerDecisionAmendmentRecord({
    bytes: Buffer.from(`${JSON.stringify(mismatchedTarget)}\n`), expected,
  }).status, 'INCOMPLETE');
  assert.equal(validateOwnerAmendmentOwnerDecisionAmendmentRecord({
    bytes: built.bytes, expected: { ...expected, authorityId: 'security', authorityPath: pathSecurity },
  }).status, 'INCOMPLETE');
  assert.throws(() => buildOwnerAmendmentOwnerDecisionAmendmentRecord({ reviewRecordBytes: reviewBytes,
    attestationBundleBytes: bundle, repository: review.repository, baseSha: base, bSha,
    authorityId: 'architecture', authorityPath: 'docs/architecture.md', previousAuthorityBytes: after,
    amendedAuthorityBytes: after, purpose: 'Resolve the selected existing architecture decision.' }), /invalid or unchanged/);
});
