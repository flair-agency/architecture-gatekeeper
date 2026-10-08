import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { verifyOwnerAmendmentBlockContext } from '../dist/owner-amendment-block-context-verifier.mjs';

const a = 'a'.repeat(40), b = 'b'.repeat(40), c = 'c'.repeat(40);
const oldHash = '1'.repeat(64), newHash = '2'.repeat(64);
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object' ?
  Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;

function fixture() {
  const trustedContext = { repository: 'flair-agency/example', baseSha: a, bSha: b, policyRevision: a,
    policy: { grade: 'G0', scope: 'authority-only', triggerProfile: 'completed-block-v1',
      authorities: [{ id: 'architecture', path: 'docs/architecture.md' }] },
    authority: { id: 'architecture', path: 'docs/architecture.md', previousSha256: oldHash, newSha256: newHash } };
  const review = { version: 1, kind: 'owner-amendment-block-review-record', repository: trustedContext.repository,
    prNumber: 12, baseSha: a, headSha: c, mergeSha: 'd'.repeat(40), workflowSha: a,
    workflowPath: '.github/workflows/self-architecture-gate.yml', runId: '101', runAttempt: '1',
    authority: { version: 1, selfRepository: trustedContext.repository, authorityRevision: a,
      manifestSha256: '3'.repeat(64), setDigest: '4'.repeat(64), members: [{ id: 'architecture',
        repository: trustedContext.repository, resolvedCommit: a, path: 'docs/architecture.md', byteLength: 10, sha256: oldHash }] },
    inputDigests: { manifest: '5'.repeat(64), policy: '6'.repeat(64), prompt: '7'.repeat(64), schema: '8'.repeat(64), validation: '9'.repeat(64) },
    decisionSha256: '', decisionBytesBase64: '', decision: { decision: 'BLOCK', authorityIds: ['architecture'] } };
  const decisionBytes = Buffer.from(JSON.stringify(review.decision));
  review.decisionSha256 = digest(decisionBytes);
  review.decisionBytesBase64 = decisionBytes.toString('base64');
  const reviewRecordBytes = Buffer.from(`${JSON.stringify(review)}\n`);
  const attestationBundleBytes = Buffer.from('{"fixture":true}');
  const amendment = { version: 2, repository: trustedContext.repository, baseSha: a, headSha: b, policyRevision: a,
    authority: trustedContext.authority, triggeringReviewSha256: digest(reviewRecordBytes),
    attestationBundleSha256: digest(attestationBundleBytes), purpose: 'Adopt the reviewed architecture amendment' };
  const amendmentRecordBytes = Buffer.from(JSON.stringify(canonical(amendment)));
  const ref = 'refs/tags/architecture-gatekeeper/amendments/change-b';
  const envelope = { version: 2, profile: 'self-g0', bSha: b,
    reviewRecordBase64: reviewRecordBytes.toString('base64'), reviewRecordSha256: digest(reviewRecordBytes),
    attestationBundleBase64: attestationBundleBytes.toString('base64'), attestationBundleSha256: digest(attestationBundleBytes),
    amendmentRecordBase64: amendmentRecordBytes.toString('base64'), amendmentRecordSha256: digest(amendmentRecordBytes) };
  const envelopeText = `${JSON.stringify(canonical(envelope))}\n`;
  const tagObjectBytes = Buffer.from(`object ${b}\ntype commit\ntag ${ref.slice('refs/tags/'.length)}\n` +
    'tagger Fixture <fixture@example.invalid> 1789990000 +0000\n\n' + envelopeText);
  const tagObjectOid = createHash('sha1').update(Buffer.from(`tag ${tagObjectBytes.length}\0`)).update(tagObjectBytes).digest('hex');
  const tag = { ref, objectOid: tagObjectOid, objectBytes: tagObjectBytes };
  const envelopeArgs = { headSha: b, tag, tagRef: ref, observedTagRefOid: tagObjectOid,
    reviewRecordBytes, amendmentRecordBytes, attestationBundleBytes };
  return { trustedContext, envelopeArgs, reviewRecordBytes, amendmentRecordBytes };
}

test('validates exact BLOCK AmendmentRecord v2 against trusted B/base/policy/authority context', () => {
  const f = fixture();
  const result = verifyOwnerAmendmentBlockContext({ trustedContext: f.trustedContext, tagEnvelope: f.envelopeArgs });
  assert.equal(result.status, 'VERIFIED_BLOCK_AMENDMENT_CONTEXT');
  assert.equal(result.bSha, b);
  assert.equal(result.policyRevision, a);
  assert.equal(result.authorityId, 'architecture');
  assert.equal(result.reviewRecordSha256, digest(f.reviewRecordBytes));
  assert.equal(Object.hasOwn(result, 'acceptance'), false);
});

test('rejects mismatched trusted previous policy, B, or affected authority', () => {
  for (const mutate of [
    x => { x.trustedContext.bSha = c; },
    x => { x.trustedContext.policyRevision = c; },
    x => { x.trustedContext.policy.grade = 'G1'; },
    x => { x.trustedContext.policy.authorities = []; },
    x => { x.trustedContext.authority.previousSha256 = 'f'.repeat(64); },
  ]) {
    const f = fixture(); mutate(f);
    assert.throws(() => verifyOwnerAmendmentBlockContext({ trustedContext: f.trustedContext, tagEnvelope: f.envelopeArgs }));
  }
});

test('rejects ReviewRecord and AmendmentRecord byte or semantic mismatches', () => {
  const cases = [
    ['review bytes', f => { f.envelopeArgs.reviewRecordBytes = Buffer.from('forged'); }],
    ['not BLOCK', f => {
      const review = JSON.parse(f.reviewRecordBytes.toString()); review.decision.decision = 'PASS';
      f.envelopeArgs.reviewRecordBytes = Buffer.from(`${JSON.stringify(review)}\n`);
    }],
    ['wrong authority', f => {
      const review = JSON.parse(f.reviewRecordBytes.toString()); review.decision.authorityIds = ['other'];
      f.envelopeArgs.reviewRecordBytes = Buffer.from(`${JSON.stringify(review)}\n`);
    }],
    ['wrong B binding', f => {
      const amendment = JSON.parse(f.amendmentRecordBytes.toString()); amendment.headSha = c;
      f.envelopeArgs.amendmentRecordBytes = Buffer.from(JSON.stringify(canonical(amendment)));
    }],
  ];
  for (const [name, mutate] of cases) {
    const f = fixture(); mutate(f);
    assert.throws(() => verifyOwnerAmendmentBlockContext({ trustedContext: f.trustedContext, tagEnvelope: f.envelopeArgs }), undefined, name);
  }
});
