import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { verifyOwnerAmendmentOwnerDecisionContext } from '../src/owner-amendment-owner-decision-context-verifier.mjs';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const baseSha = 'a'.repeat(40), bSha = 'b'.repeat(40), aSha = 'c'.repeat(40), mergeSha = 'd'.repeat(40);
const repository = 'flair-agency/architecture-gatekeeper', id = 'architecture', path = 'docs/architecture.md';
const before = Buffer.from('before\n'), after = Buffer.from('after\n'), bundle = Buffer.from('attestation');
const decision = { decision: 'OWNER_DECISION', authorityIds: [id] };
const decisionBytes = Buffer.from(JSON.stringify(decision));
const trigger = { version: 1, kind: 'owner-amendment-owner-decision-review-record', repository, prNumber: 8,
  baseSha, headSha: aSha, mergeSha, workflowSha: baseSha, workflowPath: '.github/workflows/self-architecture-gate.yml',
  runId: '42', runAttempt: '1', authority: { selfRepository: repository, authorityRevision: baseSha,
    members: [{ id, path, repository, resolvedCommit: baseSha, sha256: hash(before) }] }, decision,
  inputDigests: Object.fromEntries(['manifest','policy','prompt','schema','validation'].map(key => [key, hash(key)])),
  decisionSha256: hash(decisionBytes), decisionBytesBase64: decisionBytes.toString('base64') };
const triggerBytes = Buffer.from(JSON.stringify(trigger));
const amendment = { version: 1, kind: 'owner-amendment-owner-decision-amendment-record',
  triggerProfile: 'completed-owner-decision-self-v1', repository, baseSha, headSha: bSha, policyRevision: baseSha,
  authority: { id, path, previousSha256: hash(before), newSha256: hash(after) },
  triggeringReviewSha256: hash(triggerBytes), attestationBundleSha256: hash(bundle), purpose: 'Resolve selected existing decision.' };
const amendmentBytes = Buffer.from(`${JSON.stringify(amendment)}\n`);
const trustedContext = { repository, baseSha, bSha, policyRevision: baseSha,
  policy: { grade: 'G0', scope: 'authority-only', triggerProfile: 'completed-owner-decision-self-v1', authorities: [{ id, path }] },
  authority: { id, path, previousSha256: hash(before), newSha256: hash(after) } };
const input = () => ({ trustedContext, tagEnvelope: { headSha: bSha,
  tag: { objectOid: 'e'.repeat(40) }, tagRef: `refs/tags/architecture-gatekeeper/amendments/${bSha}`,
  observedTagRefOid: 'e'.repeat(40), reviewRecordBytes: triggerBytes, attestationBundleBytes: bundle,
  amendmentRecordBytes: amendmentBytes, triggerProfile: 'completed-owner-decision-self-v1' } });

test('verifies the exact OWNER_DECISION trigger digest, AmendmentRecord and predecessor authority without an ID', () => {
  const result = verifyOwnerAmendmentOwnerDecisionContext(input());
  assert.equal(result.status, 'VERIFIED_OWNER_DECISION_AMENDMENT_CONTEXT', result.reason);
  assert.equal(Object.hasOwn(result, 'ownerDecisionId'), false);
  assert.equal(result.reviewRecordSha256, hash(triggerBytes));
});

test('fails closed on mismatched trigger profile, unrecognized ID claim, or exact authority digest', () => {
  for (const changed of [
    { trustedContext: { ...trustedContext, policy: { ...trustedContext.policy, triggerProfile: 'completed-block-v1' } } },
    { tagEnvelope: { ...input().tagEnvelope, triggerProfile: 'completed-block-v1' } },
    { tagEnvelope: { ...input().tagEnvelope, amendmentRecordBytes: Buffer.from(`${JSON.stringify({ ...amendment, ownerDecisionId: 'unadopted-id' })}\n`) } },
  ]) assert.equal(verifyOwnerAmendmentOwnerDecisionContext({ ...input(), ...changed }).status, 'INCOMPLETE');
});
