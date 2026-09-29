import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { handoffOwnerAmendmentOwnerDecision } from '../src/owner-amendment-owner-decision-handoff.mjs';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const repository = 'flair-agency/architecture-gatekeeper';
const baseSha = 'a'.repeat(40), bSha = 'b'.repeat(40), aSha = 'c'.repeat(40), mergeSha = 'd'.repeat(40);
const path = 'docs/architecture.md';
const before = Buffer.from('previous rule\n'), after = Buffer.from('amended rule\n'), bundle = Buffer.from('bundle');
const decision = { decision: 'OWNER_DECISION', ownerDecisionId: 'owner-choice-7', authorityIds: ['architecture'] };
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

test('transports a profile-bound OWNER_DECISION tag only after provenance and exact-byte checks', async () => {
  const result = await handoffOwnerAmendmentOwnerDecision(input());
  assert.equal(result.status, 'OWNER_DECISION_TAG_TRANSPORTED_AND_READ_BACK');
  assert.equal(result.ownerDecisionId, 'owner-choice-7');
  assert.equal(result.principalAuthentication, 'not_verified');
});

test('fails closed if predecessor policy does not select the OWNER_DECISION profile or producer provenance fails', async () => {
  const wrongProfile = await handoffOwnerAmendmentOwnerDecision(input({ policy: { ...input().policy,
    ownerAmendmentTriggerProfile: 'completed-block-v1' } }));
  assert.equal(wrongProfile.status, 'INCOMPLETE');
  const badProvenance = await handoffOwnerAmendmentOwnerDecision(input({ verifyEvidence: () => ({ status: 'INCOMPLETE', reason: 'bad signature' }) }));
  assert.equal(badProvenance.status, 'INCOMPLETE');
  assert.match(badProvenance.reason, /bad signature/);
});
