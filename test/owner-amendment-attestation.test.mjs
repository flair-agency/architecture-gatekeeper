import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { inspectOwnerAmendmentAttestation } from '../src/owner-amendment-attestation.mjs';

const expected = Object.freeze({ repository: 'flair-agency/architecture-gatekeeper',
  workflowPath: '.github/workflows/owner-amendment.yml', workflowSha: 'a'.repeat(40),
  workflowRef: 'refs/heads/main', runId: '36118896793', runAttempt: '2' });
const hash = bytes => createHash('sha256').update(bytes).digest('hex');

function fixture() {
  // Deliberately untrusted claims: this module binds bytes, not record assertions.
  const recordBytes = Buffer.from('{"repository":"attacker/claimed","decision":"BLOCK"}\n');
  const signer = `https://github.com/${expected.repository}/.github/workflows/architecture-gate.yml@${expected.workflowRef}`;
  const caller = `https://github.com/${expected.repository}/${expected.workflowPath}@${expected.workflowRef}`;
  const verified = [{ verificationResult: { signature: { certificate: {
    subjectAlternativeName: signer, buildSignerURI: signer, buildConfigURI: caller,
    githubWorkflowRepository: expected.repository, githubWorkflowSHA: expected.workflowSha,
    buildSignerDigest: expected.workflowSha, buildConfigDigest: expected.workflowSha,
    sourceRepositoryDigest: expected.workflowSha,
    sourceRepositoryURI: `https://github.com/${expected.repository}`,
    sourceRepositoryRef: expected.workflowRef, githubWorkflowTrigger: 'pull_request_target',
    runInvocationURI: `https://github.com/${expected.repository}/actions/runs/${expected.runId}/attempts/${expected.runAttempt}`,
  } }, statement: { predicateType: 'https://slsa.dev/provenance/v1', subject: [{
    name: 'review-record.json', digest: { sha256: hash(recordBytes) },
  }] } } }];
  return { recordBytes, verified, expected };
}

test('binds exact raw ReviewRecord bytes to one verified producer attestation', () => {
  const input = fixture();
  const result = inspectOwnerAmendmentAttestation(input);
  assert.deepEqual(result, { status: 'VERIFIED_PRODUCER_ATTESTATION', recordSha256: hash(input.recordBytes) });
  assert.equal(Object.hasOwn(result, 'jobId'), false);
  assert.equal(Object.hasOwn(result, 'acceptance'), false);
});

test('rejects absent, malformed, multiple and byte-mismatched evidence', () => {
  const input = fixture();
  const wrongDigest = structuredClone(input.verified);
  wrongDigest[0].verificationResult.statement.subject[0].digest.sha256 = 'b'.repeat(64);
  for (const candidate of [
    { ...input, verified: [] },
    { ...input, verified: [...input.verified, ...input.verified] },
    { ...input, verified: wrongDigest },
    { ...input, recordBytes: Buffer.from('{') },
    { ...input, recordBytes: undefined },
  ]) assert.equal(inspectOwnerAmendmentAttestation(candidate).status, 'INCOMPLETE');
});

test('rejects signer, revision, ref, run, attempt and predicate mismatches', () => {
  const input = fixture();
  const mutations = [
    c => { c.subjectAlternativeName = 'https://github.com/other/repo/workflow@refs/heads/main'; },
    c => { c.githubWorkflowSHA = 'c'.repeat(40); },
    c => { c.sourceRepositoryRef = 'refs/heads/other'; },
    c => { c.runInvocationURI = `https://github.com/${expected.repository}/actions/runs/1/attempts/2`; },
    c => { c.runInvocationURI = `https://github.com/${expected.repository}/actions/runs/${expected.runId}/attempts/1`; },
  ];
  for (const mutate of mutations) {
    const verified = structuredClone(input.verified);
    mutate(verified[0].verificationResult.signature.certificate);
    assert.equal(inspectOwnerAmendmentAttestation({ ...input, verified }).status, 'INCOMPLETE');
  }
  const verified = structuredClone(input.verified);
  verified[0].verificationResult.statement.predicateType = 'https://example.invalid/other';
  assert.equal(inspectOwnerAmendmentAttestation({ ...input, verified }).status, 'INCOMPLETE');
});

test('binds the reusable signer and expected calling workflow separately', () => {
  const input = fixture();
  for (const field of ['subjectAlternativeName', 'buildSignerURI']) {
    const verified = structuredClone(input.verified);
    verified[0].verificationResult.signature.certificate[field] =
      `https://github.com/${expected.repository}/${expected.workflowPath}@${expected.workflowRef}`;
    assert.equal(inspectOwnerAmendmentAttestation({ ...input, verified }).status, 'INCOMPLETE');
  }
  const verified = structuredClone(input.verified);
  verified[0].verificationResult.signature.certificate.buildConfigURI =
    `https://github.com/${expected.repository}/.github/workflows/architecture-gate.yml@${expected.workflowRef}`;
  assert.equal(inspectOwnerAmendmentAttestation({ ...input, verified }).status, 'INCOMPLETE');
});

test('rejects missing or unknown trusted identity fields and multiple subjects', () => {
  const input = fixture();
  assert.equal(inspectOwnerAmendmentAttestation({ ...input, expected: { ...expected, runAttempt: undefined } }).status, 'INCOMPLETE');
  assert.equal(inspectOwnerAmendmentAttestation({ ...input, expected: { ...expected, surprise: true } }).status, 'INCOMPLETE');
  const verified = structuredClone(input.verified);
  verified[0].verificationResult.statement.subject.push(verified[0].verificationResult.statement.subject[0]);
  assert.equal(inspectOwnerAmendmentAttestation({ ...input, verified }).status, 'INCOMPLETE');
});
