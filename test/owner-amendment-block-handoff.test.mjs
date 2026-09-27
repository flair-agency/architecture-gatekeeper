import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { prepareOwnerAmendmentBlockHandoffFromFiles } from '../src/owner-amendment-block-handoff.mjs';

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
  const amendment = { version: 1, repository: expected.repository, baseSha: expected.workflowSha, headSha: bSha,
    policyRevision: expected.workflowSha,
    authority: { id: 'architecture', path: 'docs/architecture.md', previousSha256: record.authority.members[0].sha256,
      newSha256: sha(Buffer.from('new authority')) },
    triggeringReviewSha256: sha(recordBytes), purpose: 'Adopt editorial ownership' };
  const amendmentBytes = Buffer.from(JSON.stringify(amendment));
  const recordPath = join(dir, 'review-record.json'), bundlePath = join(dir, 'bundle.json'), amendmentPath = join(dir, 'amendment-record.json');
  writeFileSync(recordPath, recordBytes); writeFileSync(bundlePath, bundleBytes); writeFileSync(amendmentPath, amendmentBytes);
  const signer = `https://github.com/${expected.repository}/${expected.workflowPath}@${expected.workflowRef}`;
  const verified = [{ verificationResult: { signature: { certificate: {
    subjectAlternativeName: signer, buildSignerURI: signer, buildConfigURI: signer,
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

test('runs gh attestation verify over exact record and bundle paths and constructs the v2 B tag message', t => {
  const f = fixture(t);
  const result = prepareOwnerAmendmentBlockHandoffFromFiles({ recordPath: f.recordPath, bundlePath: f.bundlePath,
    amendmentRecordPath: f.amendmentPath, expected, bSha, runGh: f.runGh });
  assert.equal(result.status, 'PREPARED_BLOCK_HANDOFF_TAG_MESSAGE');
  assert.equal(result.envelope.version, 2);
  assert.equal(result.envelope.bSha, bSha);
  assert.deepEqual(Buffer.from(result.envelope.reviewRecordBase64, 'base64'), f.recordBytes);
  assert.deepEqual(Buffer.from(result.envelope.attestationBundleBase64, 'base64'), f.bundleBytes);
  assert.match(result.tagMessage, /"bSha":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"/);
});

test('rejects malformed verifier output, malformed bundle verification, and raw-byte mismatch', t => {
  const f = fixture(t);
  assert.throws(() => prepareOwnerAmendmentBlockHandoffFromFiles({ recordPath: f.recordPath, bundlePath: f.bundlePath,
    amendmentRecordPath: f.amendmentPath, expected, bSha, runGh: () => '{' }), /malformed/);
  assert.throws(() => prepareOwnerAmendmentBlockHandoffFromFiles({ recordPath: f.recordPath, bundlePath: f.bundlePath,
    amendmentRecordPath: f.amendmentPath, expected, bSha, runGh: () => { throw new Error('invalid bundle'); } }), /verification failed/);
  writeFileSync(f.recordPath, Buffer.concat([f.recordBytes, Buffer.from(' ')]));
  assert.throws(() => prepareOwnerAmendmentBlockHandoffFromFiles({ recordPath: f.recordPath, bundlePath: f.bundlePath,
    amendmentRecordPath: f.amendmentPath, expected, bSha, runGh: () => JSON.stringify(f.verified) }), /exact ReviewRecord bytes/);
});

test('rejects a tag envelope candidate whose AmendmentRecord targets a different exact B', t => {
  const f = fixture(t);
  const altered = JSON.parse(f.amendmentBytes.toString('utf8'));
  altered.headSha = 'e'.repeat(40);
  writeFileSync(f.amendmentPath, JSON.stringify(altered));
  assert.throws(() => prepareOwnerAmendmentBlockHandoffFromFiles({ recordPath: f.recordPath, bundlePath: f.bundlePath,
    amendmentRecordPath: f.amendmentPath, expected, bSha, runGh: f.runGh }), /does not bind this exact BLOCK ReviewRecord and B/);
});

test('rejects stale or incomplete AmendmentRecord bindings before preparing a tag', t => {
  const f = fixture(t);
  for (const change of [
    a => { a.baseSha = 'e'.repeat(40); },
    a => { a.policyRevision = 'e'.repeat(40); },
    a => { a.authority.previousSha256 = 'e'.repeat(64); },
    a => { delete a.purpose; },
    a => { a.extra = true; },
  ]) {
    const candidate = JSON.parse(f.amendmentBytes.toString('utf8'));
    change(candidate);
    writeFileSync(f.amendmentPath, JSON.stringify(candidate));
    assert.throws(() => prepareOwnerAmendmentBlockHandoffFromFiles({ recordPath: f.recordPath, bundlePath: f.bundlePath,
      amendmentRecordPath: f.amendmentPath, expected, bSha, runGh: f.runGh }), /AmendmentRecord does not bind/);
  }
});
