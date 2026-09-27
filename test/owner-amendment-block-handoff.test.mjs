import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { prepareOwnerAmendmentBlockHandoff } from '../src/owner-amendment-block-handoff.mjs';
import { verifyOwnerAmendmentBlockEvidence } from '../src/owner-amendment-attestation.mjs';

const expected = { repository: 'flair-agency/example', workflowPath: '.github/workflows/owner-amendment.yml',
  workflowSha: 'a'.repeat(40), workflowRef: 'refs/heads/main', runId: '42', runAttempt: '2' };
const bSha = 'b'.repeat(40);
const sha = bytes => createHash('sha256').update(bytes).digest('hex');

function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), 'agk-block-handoff-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const decision = { decision: 'BLOCK', authorityIds: ['architecture'] };
  const decisionBytes = Buffer.from(JSON.stringify(decision));
  const record = { version: 1, kind: 'owner-amendment-block-review-record', repository: expected.repository,
    prNumber: 9, baseSha: expected.workflowSha, headSha: 'c'.repeat(40), mergeSha: 'd'.repeat(40),
    workflowSha: expected.workflowSha, workflowPath: expected.workflowPath, runId: expected.runId, runAttempt: expected.runAttempt,
    authority: { members: [{ id: 'architecture', path: 'docs/architecture.md', repository: expected.repository,
      resolvedCommit: expected.workflowSha, sha256: sha(Buffer.from('old authority')) }] },
    decisionBytesBase64: decisionBytes.toString('base64'), decisionSha256: sha(decisionBytes), decision };
  const recordBytes = Buffer.from(`${JSON.stringify(record)}\n`);
  const bundleBytes = Buffer.from('{"bundle":"valid fixture"}\n');
  const amendment = { version: 2, repository: expected.repository, baseSha: expected.workflowSha, headSha: bSha,
    policyRevision: expected.workflowSha,
    authority: { id: 'architecture', path: 'docs/architecture.md', previousSha256: record.authority.members[0].sha256,
      newSha256: sha(Buffer.from('new authority')) },
    triggeringReviewSha256: sha(recordBytes), attestationBundleSha256: sha(bundleBytes), purpose: 'Adopt editorial ownership' };
  const amendmentBytes = Buffer.from(JSON.stringify(amendment));
  const recordPath = join(dir, 'review-record.json'), bundlePath = join(dir, 'bundle.json'), amendmentPath = join(dir, 'amendment-record.json');
  writeFileSync(recordPath, recordBytes); writeFileSync(bundlePath, bundleBytes); writeFileSync(amendmentPath, amendmentBytes);
  const signer = `https://github.com/${expected.repository}/.github/workflows/architecture-gate.yml@${expected.workflowRef}`;
  const caller = `https://github.com/${expected.repository}/${expected.workflowPath}@${expected.workflowRef}`;
  const verified = [{ verificationResult: { signature: { certificate: {
    subjectAlternativeName: signer, buildSignerURI: signer, buildConfigURI: caller,
    githubWorkflowRepository: expected.repository, githubWorkflowSHA: expected.workflowSha,
    buildSignerDigest: expected.workflowSha, buildConfigDigest: expected.workflowSha,
    sourceRepositoryDigest: expected.workflowSha, sourceRepositoryURI: `https://github.com/${expected.repository}`,
    sourceRepositoryRef: expected.workflowRef, githubWorkflowTrigger: 'pull_request_target',
    runInvocationURI: `https://github.com/${expected.repository}/actions/runs/${expected.runId}/attempts/${expected.runAttempt}`,
  } }, statement: { predicateType: 'https://slsa.dev/provenance/v1', subject: [{ name: 'review-record.json', digest: { sha256: sha(recordBytes) } }] } } }];
  const runGh = (command, args, options) => {
    assert.equal(command, 'gh');
    assert.deepEqual(args, ['attestation', 'verify', args[2], '--bundle', args[4], '--format', 'json', '--repo', expected.repository,
      '--signer-repo', expected.repository]);
    assert.notEqual(args[2], recordPath);
    assert.notEqual(args[4], bundlePath);
    assert.deepEqual(readFileSync(args[2]), recordBytes);
    assert.deepEqual(readFileSync(args[4]), bundleBytes);
    assert.equal(options.timeout, 30_000);
    return JSON.stringify(verified);
  };
  return { dir, record, recordBytes, bundleBytes, amendmentBytes, recordPath, bundlePath, amendmentPath, verified, runGh };
}

function prepare(f, amendmentRecordBytes = f.amendmentBytes) {
  const provenanceResult = verifyOwnerAmendmentBlockEvidence({ recordBytes: f.recordBytes,
    bundleBytes: f.bundleBytes, expected, runGh: f.runGh });
  return prepareOwnerAmendmentBlockHandoff({ recordBytes: f.recordBytes, bundleBytes: f.bundleBytes,
    amendmentRecordBytes, expected, bSha, provenanceResult });
}

test('runs gh attestation verify over exact record and bundle paths and constructs the v2 B tag message', t => {
  const f = fixture(t);
  const result = prepare(f);
  assert.equal(result.status, 'PREPARED_BLOCK_HANDOFF_TAG_MESSAGE');
  assert.equal(result.envelope.version, 2);
  assert.equal(result.envelope.bSha, bSha);
  assert.deepEqual(Buffer.from(result.envelope.reviewRecordBase64, 'base64'), f.recordBytes);
  assert.deepEqual(Buffer.from(result.envelope.attestationBundleBase64, 'base64'), f.bundleBytes);
  assert.match(result.tagMessage, /"bSha":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"/);
});

test('rejects malformed verifier output, malformed bundle verification, and raw-byte mismatch', t => {
  const f = fixture(t);
  const malformed = verifyOwnerAmendmentBlockEvidence({ recordBytes: f.recordBytes, bundleBytes: f.bundleBytes,
    expected, runGh: () => '{' });
  assert.equal(malformed.status, 'INCOMPLETE');
  assert.match(malformed.reason, /malformed/);
  const rejected = verifyOwnerAmendmentBlockEvidence({ recordBytes: f.recordBytes, bundleBytes: f.bundleBytes,
    expected, runGh: () => { throw new Error('invalid bundle'); } });
  assert.equal(rejected.status, 'INCOMPLETE');
  assert.match(rejected.reason, /verification failed/);
  const changedRecordBytes = Buffer.concat([f.recordBytes, Buffer.from(' ')]);
  const mismatchedProof = verifyOwnerAmendmentBlockEvidence({ recordBytes: changedRecordBytes,
    bundleBytes: f.bundleBytes, expected, runGh: () => JSON.stringify(f.verified) });
  assert.equal(mismatchedProof.status, 'INCOMPLETE');
  assert.match(mismatchedProof.reason, /exact ReviewRecord bytes/);
  assert.throws(() => prepareOwnerAmendmentBlockHandoff({ recordBytes: changedRecordBytes,
    bundleBytes: f.bundleBytes, amendmentRecordBytes: f.amendmentBytes, expected, bSha,
    provenanceResult: mismatchedProof }), /exact ReviewRecord bytes/);
});

test('rejects a tag envelope candidate whose AmendmentRecord targets a different exact B', t => {
  const f = fixture(t);
  const altered = JSON.parse(f.amendmentBytes.toString('utf8'));
  altered.headSha = 'e'.repeat(40);
  assert.throws(() => prepare(f, Buffer.from(JSON.stringify(altered))), /does not bind these exact BLOCK ReviewRecord/);
});

test('rejects stale or incomplete AmendmentRecord bindings before preparing a tag', t => {
  const f = fixture(t);
  for (const change of [
    a => { a.version = 1; delete a.attestationBundleSha256; },
    a => { a.baseSha = 'e'.repeat(40); },
    a => { a.policyRevision = 'e'.repeat(40); },
    a => { a.authority.previousSha256 = 'e'.repeat(64); },
    a => { delete a.purpose; },
    a => { a.extra = true; },
  ]) {
    const candidate = JSON.parse(f.amendmentBytes.toString('utf8'));
    change(candidate);
    assert.throws(() => prepare(f, Buffer.from(JSON.stringify(candidate))), /AmendmentRecord does not bind/);
  }
});

test('rejects an AmendmentRecord that does not bind the exact verified attestation bundle bytes', t => {
  const f = fixture(t);
  const changedBundle = Buffer.from('{"bundle":"different valid bytes"}\n');
  const changedVerification = structuredClone(f.verified);
  changedVerification[0].verificationResult.statement.subject[0].digest.sha256 = sha(f.recordBytes);
  const provenanceResult = verifyOwnerAmendmentBlockEvidence({ recordBytes: f.recordBytes,
    bundleBytes: changedBundle, expected, runGh: () => JSON.stringify(changedVerification) });
  assert.equal(provenanceResult.status, 'VERIFIED_PRODUCER_ATTESTATION');
  assert.throws(() => prepareOwnerAmendmentBlockHandoff({ recordBytes: f.recordBytes, bundleBytes: changedBundle,
    amendmentRecordBytes: f.amendmentBytes, expected, bSha, provenanceResult }), /attestation bundle bytes/);
});
