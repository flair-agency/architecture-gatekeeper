import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { verifyOwnerAmendmentBlockEvidenceBundle } from '../dist/owner-amendment-block-evidence-composer.mjs';

const a = 'a'.repeat(40), b = 'b'.repeat(40), c = 'c'.repeat(40);
const oldHash = '1'.repeat(64), newHash = '2'.repeat(64);
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object' ?
  Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;

function fixture() {
  const trustedContext = { repository: 'flair-agency/architecture-gatekeeper', baseSha: a, bSha: b, policyRevision: a,
    policy: { grade: 'G0', scope: 'authority-only', triggerProfile: 'completed-block-v1',
      authorities: [{ id: 'architecture', path: 'docs/architecture.md' }] },
    authority: { id: 'architecture', path: 'docs/architecture.md', previousSha256: oldHash, newSha256: newHash } };
  const producerContext = { repository: trustedContext.repository,
    workflowPath: '.github/workflows/self-architecture-gate.yml', workflowSha: a,
    workflowRef: 'refs/heads/main', runId: '12345', runAttempt: '2' };
  const review = { version: 1, kind: 'owner-amendment-block-review-record', repository: trustedContext.repository,
    prNumber: 22, baseSha: a, headSha: c, mergeSha: 'd'.repeat(40), workflowSha: a,
    workflowPath: producerContext.workflowPath, runId: producerContext.runId, runAttempt: producerContext.runAttempt,
    authority: { version: 1, selfRepository: trustedContext.repository, authorityRevision: a,
      manifestSha256: '3'.repeat(64), setDigest: '4'.repeat(64), members: [{ id: 'architecture',
        repository: trustedContext.repository, resolvedCommit: a, path: 'docs/architecture.md', byteLength: 10, sha256: oldHash }] },
    inputDigests: { manifest: '5'.repeat(64), policy: '6'.repeat(64), prompt: '7'.repeat(64), schema: '8'.repeat(64), validation: '9'.repeat(64) },
    decisionSha256: '', decisionBytesBase64: '', decision: { decision: 'BLOCK', authorityIds: ['architecture'] } };
  const decisionBytes = Buffer.from(JSON.stringify(review.decision));
  review.decisionSha256 = digest(decisionBytes);
  review.decisionBytesBase64 = decisionBytes.toString('base64');
  const reviewRecordBytes = Buffer.from(`${JSON.stringify(review)}\n`);
  const attestationBundleBytes = Buffer.from('{"attestationBundle":"exact"}');
  const amendment = { version: 2, repository: trustedContext.repository, baseSha: a, headSha: b, policyRevision: a,
    authority: trustedContext.authority, triggeringReviewSha256: digest(reviewRecordBytes),
    attestationBundleSha256: digest(attestationBundleBytes), purpose: 'Adopt the authorized architecture amendment' };
  const amendmentRecordBytes = Buffer.from(JSON.stringify(canonical(amendment)));
  const tagRef = 'refs/tags/architecture-gatekeeper/amendments/change-b';
  const envelope = { version: 2, profile: 'self-g0', bSha: b,
    reviewRecordBase64: reviewRecordBytes.toString('base64'), reviewRecordSha256: digest(reviewRecordBytes),
    attestationBundleBase64: attestationBundleBytes.toString('base64'), attestationBundleSha256: digest(attestationBundleBytes),
    amendmentRecordBase64: amendmentRecordBytes.toString('base64'), amendmentRecordSha256: digest(amendmentRecordBytes) };
  const tagObjectBytes = Buffer.from(`object ${b}\ntype commit\ntag ${tagRef.slice('refs/tags/'.length)}\n` +
    'tagger Fixture <fixture@example.invalid> 1789990000 +0000\n\n' + `${JSON.stringify(canonical(envelope))}\n`);
  const tagObjectOid = createHash('sha1').update(Buffer.from(`tag ${tagObjectBytes.length}\0`)).update(tagObjectBytes).digest('hex');
  const tagEnvelope = { headSha: b, tag: { ref: tagRef, objectOid: tagObjectOid, objectBytes: tagObjectBytes },
    tagRef, observedTagRefOid: tagObjectOid, reviewRecordBytes, amendmentRecordBytes, attestationBundleBytes };
  const runGh = (command, args) => {
    assert.equal(command, 'gh');
    const recordBytes = readFileSync(args[2]);
    assert.deepEqual(readFileSync(args[4]), attestationBundleBytes);
    const signer = `https://github.com/${producerContext.repository}/.github/workflows/architecture-gate.yml@${producerContext.workflowRef}`;
    const caller = `https://github.com/${producerContext.repository}/${producerContext.workflowPath}@${producerContext.workflowRef}`;
    return JSON.stringify([{ verificationResult: { signature: { certificate: {
      subjectAlternativeName: signer, buildSignerURI: signer, buildConfigURI: caller,
      githubWorkflowRepository: producerContext.repository, githubWorkflowSHA: producerContext.workflowSha,
      buildSignerDigest: producerContext.workflowSha, buildConfigDigest: producerContext.workflowSha,
      sourceRepositoryDigest: producerContext.workflowSha, sourceRepositoryURI: `https://github.com/${producerContext.repository}`,
      sourceRepositoryRef: producerContext.workflowRef, githubWorkflowTrigger: 'pull_request_target',
      runInvocationURI: `https://github.com/${producerContext.repository}/actions/runs/${producerContext.runId}/attempts/${producerContext.runAttempt}`,
    } }, statement: { predicateType: 'https://slsa.dev/provenance/v1', subject: [{ name: 'review-record.json', digest: { sha256: digest(recordBytes) } }] } } }]);
  };
  return { trustedContext, producerContext, tagEnvelope, runGh };
}

test('verifies the exact tag-embedded BLOCK and attestation bundle against trusted producer context', () => {
  const f = fixture();
  const result = verifyOwnerAmendmentBlockEvidenceBundle(f);
  assert.equal(result.status, 'VERIFIED_OWNER_AMENDMENT_BLOCK_EVIDENCE');
  assert.equal(result.reviewRecordSha256, digest(f.tagEnvelope.reviewRecordBytes));
  assert.equal(result.attestationBundleSha256, digest(f.tagEnvelope.attestationBundleBytes));
  assert.equal(result.producerRunAttempt, '2');
  assert.equal(Object.hasOwn(result, 'acceptance'), false);
});

test('rejects a ReviewRecord producer that differs from trusted protected host context', () => {
  const f = fixture(); f.producerContext.runAttempt = '1';
  assert.equal(verifyOwnerAmendmentBlockEvidenceBundle(f).status, 'INCOMPLETE');
  const g = fixture(); g.producerContext.workflowPath = '.github/workflows/other.yml';
  assert.equal(verifyOwnerAmendmentBlockEvidenceBundle(g).status, 'INCOMPLETE');
});

test('rejects altered tag-bound evidence bytes and GitHub verifier failure', () => {
  const altered = fixture(); altered.tagEnvelope.attestationBundleBytes = Buffer.from('changed bundle');
  assert.equal(verifyOwnerAmendmentBlockEvidenceBundle(altered).status, 'INCOMPLETE');
  const alteredRecord = fixture(); alteredRecord.tagEnvelope.reviewRecordBytes = Buffer.from('changed ReviewRecord');
  assert.equal(verifyOwnerAmendmentBlockEvidenceBundle(alteredRecord).status, 'INCOMPLETE');
  const verifierFailure = fixture(); verifierFailure.runGh = () => { throw new Error('fixture verification failure'); };
  assert.equal(verifyOwnerAmendmentBlockEvidenceBundle(verifierFailure).status, 'INCOMPLETE');
});
