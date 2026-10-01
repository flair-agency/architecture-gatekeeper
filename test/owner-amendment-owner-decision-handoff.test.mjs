import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { handoffOwnerAmendmentOwnerDecision } from '../src/owner-amendment-owner-decision-handoff.mjs';
import { verifyOwnerAmendmentOwnerDecisionContext } from '../src/owner-amendment-owner-decision-context-verifier.mjs';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const repository = 'flair-agency/architecture-gatekeeper';
const baseSha = 'a'.repeat(40), bSha = 'b'.repeat(40), aSha = 'c'.repeat(40), mergeSha = 'd'.repeat(40);
const path = 'docs/architecture.md';
const before = Buffer.from('previous rule\n'), after = Buffer.from('amended rule\n'), bundle = Buffer.from('bundle');
const decision = { decision: 'OWNER_DECISION', authorityIds: ['architecture'] };
const decisionBytes = Buffer.from(JSON.stringify(decision));
const review = { version: 1, kind: 'owner-amendment-owner-decision-review-record', repository,
  prNumber: 3, baseSha, headSha: aSha, mergeSha, workflowSha: baseSha,
  workflowPath: '.github/workflows/self-architecture-gate.yml', runId: '31', runAttempt: '1',
  authority: { version: 1, selfRepository: repository, authorityRevision: baseSha, manifestSha256: sha('manifest'),
    setDigest: '0'.repeat(64), members: [{ id: 'architecture', repository, resolvedCommit: baseSha,
      path, byteLength: before.length, sha256: sha(before) }] },
  inputDigests: Object.fromEntries(['manifest','policy','prompt','schema','validation'].map(key => [key, sha(key)])),
  decisionSha256: sha(decisionBytes), decisionBytesBase64: decisionBytes.toString('base64'), decision };
const reviewBytes = Buffer.from(`${JSON.stringify(review)}\n`);
const input = overrides => ({ repository, policy: { ownerAmendmentVersion: 1, ownerAmendmentGrade: 'G0',
  ownerAmendmentScope: 'authority-only', ownerAmendmentTriggerProfile: 'completed-owner-decision-self-v1',
  ownerAmendmentAuthorityId: 'architecture', ownerAmendmentAuthorityPath: path,
  ownerAmendmentTagNamespace: 'refs/tags/architecture-gatekeeper/amendments' },
  manifest: { version: 1, authorities: [{ id: 'architecture', repository: 'self', revision: 'authority-revision', path }] },
  baseSha, bSha, changedFiles: [{ path, status: 'modified' }], baseAuthorityBytes: before, headAuthorityBytes: after,
  triggerRun: { runId: '31', runAttempt: '1', prNumber: 3, headSha: aSha,
    workflowPath: review.workflowPath, workflowRef: 'refs/heads/main', workflowSha: baseSha,
    event: 'pull_request_target', artifactId: '93' }, authorityId: 'architecture', authorityPath: path,
  purpose: 'Resolve an existing architecture decision.', tagNamespace: 'refs/tags/architecture-gatekeeper/amendments',
  rulesetId: 12, token: 'token', tagger: { name: 'test', email: 'test@example.invalid', date: '2026-09-29T00:00:00.000Z' },
  runGh: () => '', fetchArtifact: async ({ expected }) => {
    assert.equal(expected.profile, 'ownerDecision');
    assert.equal(expected.artifactId, '93');
    return { status: 'FETCHED_OWNER_AMENDMENT_BLOCK_ARTIFACT', zipBytes: Buffer.from('zip') };
  }, extractArtifact: () => ({ status: 'EXTRACTED_OWNER_AMENDMENT_BLOCK_ARTIFACT', reviewRecordBytes: reviewBytes, attestationBundleBytes: bundle }),
  verifyEvidence: ({ expected, recordBytes }) => {
    assert.equal(expected.workflowSha, baseSha); assert.deepEqual(recordBytes, reviewBytes);
    return { status: 'VERIFIED_PRODUCER_ATTESTATION', recordSha256: sha(reviewBytes) };
  }, createTag: async value => {
    const envelope = JSON.parse(value.tagMessage);
    assert.equal(envelope.version, 3); assert.equal(envelope.triggerProfile, 'completed-owner-decision-self-v1');
    assert.equal(envelope.bSha, bSha);
    return { tagReadback: { sha: 'e'.repeat(40) } };
  }, ...overrides });

test('transports a canonical v3 tag that passes the OWNER_DECISION context verifier', async () => {
  let tagMessage;
  const options = input({ createTag: async value => {
    tagMessage = value.tagMessage;
    return { tagReadback: { sha: 'e'.repeat(40) } };
  } });
  const result = await handoffOwnerAmendmentOwnerDecision(options);
  assert.equal(result.status, 'OWNER_DECISION_TAG_TRANSPORTED_AND_READ_BACK');
  assert.equal(Object.hasOwn(result, 'ownerDecisionId'), false);
  assert.equal(result.principalAuthentication, 'not_verified');
  const envelope = JSON.parse(tagMessage);
  const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object'
    ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
  assert.equal(tagMessage, `${JSON.stringify(canonical(envelope))}\n`);
  const tagObjectOid = 'e'.repeat(40);
  const verified = verifyOwnerAmendmentOwnerDecisionContext({ trustedContext: {
    repository, baseSha, bSha, policyRevision: baseSha,
    policy: { grade: 'G0', scope: 'authority-only', triggerProfile: 'completed-owner-decision-self-v1',
      authorities: [{ id: 'architecture', path }] },
    authority: { id: 'architecture', path, previousSha256: sha(before), newSha256: sha(after) },
  }, tagEnvelope: { headSha: bSha, tag: { objectOid: tagObjectOid },
    tagRef: `refs/tags/architecture-gatekeeper/amendments/${bSha}`, observedTagRefOid: tagObjectOid,
    reviewRecordBytes: Buffer.from(envelope.reviewRecordBase64, 'base64'),
    attestationBundleBytes: Buffer.from(envelope.attestationBundleBase64, 'base64'),
    amendmentRecordBytes: Buffer.from(envelope.amendmentRecordBase64, 'base64'), triggerProfile: envelope.triggerProfile,
  } });
  assert.equal(verified.status, 'VERIFIED_OWNER_DECISION_AMENDMENT_CONTEXT', verified.reason);
});

test('fails closed if predecessor policy does not select the OWNER_DECISION profile or producer provenance fails', async () => {
  const wrongProfile = await handoffOwnerAmendmentOwnerDecision(input({ policy: { ...input().policy,
    ownerAmendmentTriggerProfile: 'completed-block-v1' } }));
  assert.equal(wrongProfile.status, 'INCOMPLETE');
  const badProvenance = await handoffOwnerAmendmentOwnerDecision(input({ verifyEvidence: () => ({ status: 'INCOMPLETE', reason: 'bad signature' }) }));
  assert.equal(badProvenance.status, 'INCOMPLETE');
  assert.match(badProvenance.reason, /bad signature/);
});
