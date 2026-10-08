import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { composeOwnerAmendmentMergeGroupEvidence } from '../dist/owner-amendment-merge-group-evidence.mjs';
import { readFileSync } from 'node:fs';
import { verifyOwnerAmendmentBlockEvidenceBundle } from '../dist/owner-amendment-block-evidence-composer.mjs';

const repository = 'flair-agency/example';
const baseSha = 'a'.repeat(40), bSha = 'b'.repeat(40), tagNamespace = 'refs/tags/architecture-gatekeeper/amendments';
const tagRef = `${tagNamespace}/${bSha}`;
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object' ?
  Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;

function fixture({ recordChanges = {}, envelopeChanges = {}, tagReadChanges = {} } = {}) {
  const policyBytes = Buffer.from('{"previousPolicy":true}\n');
  const baseAuthority = Buffer.from('previous canonical authority');
  const headAuthority = Buffer.from('proposed amended authority');
  const gitContext = { repository, baseSha, headSha: bSha, policyBytes,
    policy: { ownerAmendmentGrade: 'G0', ownerAmendmentScope: 'authority-only', ownerAmendmentTriggerProfile: 'completed-block-v1' },
    scope: { authorityId: 'architecture', authorityPath: 'docs/architecture.md' },
    authorityBytes: { base: baseAuthority, head: headAuthority } };
  const review = { version: 1, kind: 'owner-amendment-block-review-record', repository,
    baseSha, headSha: 'c'.repeat(40), mergeSha: 'd'.repeat(40), workflowSha: baseSha,
    workflowPath: '.github/workflows/self-architecture-gate.yml', runId: '42', runAttempt: '2',
    inputDigests: { policy: digest(policyBytes) } };
  Object.assign(review, recordChanges);
  const reviewRecordBytes = Buffer.from(`${JSON.stringify(review)}\n`);
  const attestationBundleBytes = Buffer.from('{"bundle":"fixture"}\n');
  const amendmentRecordBytes = Buffer.from('{"version":2}\n');
  const envelope = { version: 2, profile: 'self-g0', bSha,
    reviewRecordBase64: reviewRecordBytes.toString('base64'), reviewRecordSha256: digest(reviewRecordBytes),
    attestationBundleBase64: attestationBundleBytes.toString('base64'), attestationBundleSha256: digest(attestationBundleBytes),
    amendmentRecordBase64: amendmentRecordBytes.toString('base64'), amendmentRecordSha256: digest(amendmentRecordBytes), ...envelopeChanges };
  const tagName = tagRef.slice('refs/tags/'.length);
  const objectBytes = Buffer.from(`object ${bSha}\ntype commit\ntag ${tagName}\ntagger Fixture <fixture@example.invalid> 1790000000 +0000\n\n${JSON.stringify(canonical(envelope))}\n`);
  const objectOid = createHash('sha1').update(Buffer.from(`tag ${objectBytes.length}\0`)).update(objectBytes).digest('hex');
  const tagRead = { status: 'READ_BACK_OWNER_AMENDMENT_TAG', repository, bSha, tagRef,
    observedTagRefOid: objectOid, tag: { ref: tagRef, objectOid, objectBytes }, ...tagReadChanges };
  const calls = {};
  const result = () => composeOwnerAmendmentMergeGroupEvidence({ repository, baseSha, bSha, runGit() {},
    tagNamespace, tagRef, rulesetId: 12, token: 'secret',
    resolveGitContext(args) { calls.git = args; return gitContext; },
    async readTag(args) { calls.read = args; return tagRead; },
    verifyEvidence(args) {
      calls.verify = args;
      assert.deepEqual(Object.keys(args.trustedContext).sort(),
        ['authority', 'baseSha', 'bSha', 'policy', 'policyRevision', 'repository'].sort());
      return { status: 'VERIFIED_OWNER_AMENDMENT_BLOCK_EVIDENCE', repository, baseSha, bSha,
        policyRevision: baseSha, reviewRecordSha256: digest(reviewRecordBytes), amendmentRecordSha256: digest(amendmentRecordBytes),
        attestationBundleSha256: digest(attestationBundleBytes), tagObjectOid: objectOid };
    } });
  return { result, calls, objectOid, reviewRecordBytes };
}

test('composes immutable Git context, exact tag evidence, and producer expectation into eligibility inputs', async () => {
  const f = fixture();
  const result = await f.result();
  assert.equal(result.status, 'VERIFIED_OWNER_AMENDMENT_MERGE_GROUP_EVIDENCE');
  assert.equal(result.policySha256, digest(Buffer.from('{"previousPolicy":true}\n')));
  assert.equal(result.previousAuthoritySha256, digest(Buffer.from('previous canonical authority')));
  assert.equal(result.proposedAuthoritySha256, digest(Buffer.from('proposed amended authority')));
  assert.equal(f.calls.git.headSha, bSha);
  assert.equal(f.calls.read.rulesetId, 12);
  assert.equal(f.calls.verify.producerContext.workflowSha, baseSha);
  assert.equal(f.calls.verify.producerContext.runId, '42');
  assert.deepEqual(f.calls.verify.tagEnvelope.reviewRecordBytes, f.reviewRecordBytes);
  assert.equal(Object.hasOwn(result, 'acceptance'), false);
});

test('fails closed on producer policy drift, candidate ref drift, and readback mismatch', async t => {
  await t.test('ReviewRecord does not bind protected policy digest', async () => {
    const f = fixture({ recordChanges: { inputDigests: { policy: 'f'.repeat(64) } } });
    const result = await f.result();
    assert.equal(result.status, 'INCOMPLETE');
    assert.match(result.reason, /policy digest/);
    assert.equal(f.calls.verify, undefined);
  });
  await t.test('candidate tag ref differs', async () => {
    const f = fixture();
    const result = await composeOwnerAmendmentMergeGroupEvidence({ repository, baseSha, bSha, runGit() {},
      tagNamespace, tagRef: `${tagNamespace}/other`, rulesetId: 12, token: 'secret',
      resolveGitContext: args => { assert.equal(args.headSha, bSha); return {}; } });
    assert.equal(result.status, 'INCOMPLETE');
    assert.match(result.reason, /tag ref/);
  });
  await t.test('tag readback identifies another repository', async () => {
    const f = fixture({ tagReadChanges: { repository: 'other/repo' } });
    const result = await f.result();
    assert.equal(result.status, 'INCOMPLETE');
    assert.match(result.reason, /does not bind/);
  });
});

test('rejects malformed canonical envelope bytes and evidence digest mismatch before verification', async () => {
  const f = fixture({ envelopeChanges: { reviewRecordSha256: 'e'.repeat(64) } });
  let verificationCalled = false;
  const result = await composeOwnerAmendmentMergeGroupEvidence({ repository, baseSha, bSha, runGit() {}, tagNamespace, tagRef,
    rulesetId: 12, token: 'secret', resolveGitContext: () => ({
      repository, baseSha, headSha: bSha, policyBytes: Buffer.from('policy'),
      policy: { ownerAmendmentGrade: 'G0', ownerAmendmentScope: 'authority-only', ownerAmendmentTriggerProfile: 'completed-block-v1' },
      scope: { authorityId: 'architecture', authorityPath: 'docs/architecture.md' },
      authorityBytes: { base: Buffer.from('base'), head: Buffer.from('head') } }),
    readTag: async () => ({ status: 'READ_BACK_OWNER_AMENDMENT_TAG', repository, bSha, tagRef,
      observedTagRefOid: f.objectOid, tag: { ref: tagRef, objectOid: f.objectOid,
        objectBytes: Buffer.from(`object ${bSha}\ntype commit\ntag ${tagRef.slice(10)}\ntagger Fixture <fixture@example.invalid> 1790000000 +0000\n\n${JSON.stringify(canonical({ version: 2, profile: 'self-g0', bSha,
          reviewRecordBase64: Buffer.from('x').toString('base64'), reviewRecordSha256: 'e'.repeat(64),
          attestationBundleBase64: Buffer.from('y').toString('base64'), attestationBundleSha256: digest(Buffer.from('y')),
          amendmentRecordBase64: Buffer.from('z').toString('base64'), amendmentRecordSha256: digest(Buffer.from('z')) }))}\n`) } }),
    verifyEvidence() { verificationCalled = true; return {}; } });
  assert.equal(result.status, 'INCOMPLETE');
  assert.match(result.reason, /ReviewRecord bytes or digest/);
  assert.equal(verificationCalled, false);
});

function integratedFixture({ invalidProvenance = false } = {}) {
  const policyBytes = Buffer.from('{"previousPolicy":true}\n');
  const baseAuthority = Buffer.from('previous canonical authority');
  const headAuthority = Buffer.from('proposed amended authority');
  const gitContext = { repository, baseSha, headSha: bSha, policyBytes,
    policy: { ownerAmendmentGrade: 'G0', ownerAmendmentScope: 'authority-only', ownerAmendmentTriggerProfile: 'completed-block-v1' },
    scope: { authorityId: 'architecture', authorityPath: 'docs/architecture.md' },
    authorityBytes: { base: baseAuthority, head: headAuthority } };
  const producerContext = { repository, workflowPath: '.github/workflows/self-architecture-gate.yml',
    workflowSha: baseSha, workflowRef: 'refs/heads/main', runId: '42', runAttempt: '2' };
  const decision = { decision: 'BLOCK', authorityIds: ['architecture'] };
  const decisionBytes = Buffer.from(JSON.stringify(decision));
  const review = { version: 1, kind: 'owner-amendment-block-review-record', repository, prNumber: 17,
    baseSha, headSha: 'c'.repeat(40), mergeSha: 'd'.repeat(40), workflowSha: baseSha,
    workflowPath: producerContext.workflowPath, runId: producerContext.runId, runAttempt: producerContext.runAttempt,
    authority: { version: 1, selfRepository: repository, authorityRevision: baseSha,
      manifestSha256: '1'.repeat(64), setDigest: '2'.repeat(64), members: [{ id: 'architecture', repository,
        resolvedCommit: baseSha, path: 'docs/architecture.md', byteLength: baseAuthority.length, sha256: digest(baseAuthority) }] },
    inputDigests: { manifest: '3'.repeat(64), policy: digest(policyBytes), prompt: '4'.repeat(64),
      schema: '5'.repeat(64), validation: '6'.repeat(64) },
    decisionSha256: digest(decisionBytes), decisionBytesBase64: decisionBytes.toString('base64'), decision };
  const reviewRecordBytes = Buffer.from(`${JSON.stringify(review)}\n`);
  const attestationBundleBytes = Buffer.from('{"attestation":"verified fixture"}\n');
  const amendment = { version: 2, repository, baseSha, headSha: bSha, policyRevision: baseSha,
    authority: { id: 'architecture', path: 'docs/architecture.md', previousSha256: digest(baseAuthority), newSha256: digest(headAuthority) },
    triggeringReviewSha256: digest(reviewRecordBytes), attestationBundleSha256: digest(attestationBundleBytes),
    purpose: 'Adopt an authorized architecture amendment' };
  const amendmentRecordBytes = Buffer.from(JSON.stringify(canonical(amendment)));
  const envelope = { version: 2, profile: 'self-g0', bSha,
    reviewRecordBase64: reviewRecordBytes.toString('base64'), reviewRecordSha256: digest(reviewRecordBytes),
    attestationBundleBase64: attestationBundleBytes.toString('base64'), attestationBundleSha256: digest(attestationBundleBytes),
    amendmentRecordBase64: amendmentRecordBytes.toString('base64'), amendmentRecordSha256: digest(amendmentRecordBytes) };
  const tagName = tagRef.slice('refs/tags/'.length);
  const objectBytes = Buffer.from(`object ${bSha}\ntype commit\ntag ${tagName}\ntagger Fixture <fixture@example.invalid> 1790000000 +0000\n\n${JSON.stringify(canonical(envelope))}\n`);
  const objectOid = createHash('sha1').update(Buffer.from(`tag ${objectBytes.length}\0`)).update(objectBytes).digest('hex');
  const tagRead = { status: 'READ_BACK_OWNER_AMENDMENT_TAG', repository, bSha, tagRef,
    observedTagRefOid: objectOid, tag: { ref: tagRef, objectOid, objectBytes } };
  const runGh = (command, args) => {
    assert.equal(command, 'gh');
    const exactRecord = readFileSync(args[2]);
    assert.deepEqual(exactRecord, reviewRecordBytes);
    assert.deepEqual(readFileSync(args[4]), attestationBundleBytes);
    if (invalidProvenance) return '[]';
    const signer = `https://github.com/${repository}/.github/workflows/architecture-gate.yml@refs/heads/main`;
    const caller = `https://github.com/${repository}/${producerContext.workflowPath}@refs/heads/main`;
    return JSON.stringify([{ verificationResult: { signature: { certificate: {
      subjectAlternativeName: signer, buildSignerURI: signer, buildConfigURI: caller,
      githubWorkflowRepository: repository, githubWorkflowSHA: baseSha, buildSignerDigest: baseSha,
      buildConfigDigest: baseSha, sourceRepositoryDigest: baseSha,
      sourceRepositoryURI: `https://github.com/${repository}`, sourceRepositoryRef: 'refs/heads/main',
      githubWorkflowTrigger: 'pull_request_target',
      runInvocationURI: `https://github.com/${repository}/actions/runs/42/attempts/2`,
    } }, statement: { predicateType: 'https://slsa.dev/provenance/v1',
      subject: [{ name: 'review-record.json', digest: { sha256: digest(exactRecord) } }] } } }]);
  };
  return { gitContext, tagRead, runGh, reviewRecordBytes, objectOid };
}

test('integrates real BLOCK evidence verification with a complete tag fixture and rejects malformed provenance', async t => {
  for (const invalidProvenance of [false, true]) await t.test(invalidProvenance ? 'malformed provenance' : 'verified provenance', async () => {
    const f = integratedFixture({ invalidProvenance });
    const result = await composeOwnerAmendmentMergeGroupEvidence({ repository, baseSha, bSha, runGit() {}, tagNamespace, tagRef,
      rulesetId: 12, token: 'fixture-token', resolveGitContext: () => f.gitContext,
      readTag: async () => f.tagRead, runGh: f.runGh });
    if (invalidProvenance) {
      assert.equal(result.status, 'INCOMPLETE');
      assert.match(result.reason, /Exactly one cryptographically verified attestation/);
    } else {
      assert.equal(result.status, 'VERIFIED_OWNER_AMENDMENT_MERGE_GROUP_EVIDENCE');
      assert.equal(result.reviewRecordSha256, digest(f.reviewRecordBytes));
      assert.equal(result.tagObjectOid, f.objectOid);
      assert.equal(Object.hasOwn(result, 'acceptance'), false);
    }
  });
});
