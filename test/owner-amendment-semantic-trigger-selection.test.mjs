import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { selectSelfSemanticTrigger } from '../scripts/owner-amendment-semantic-trigger-selection.mjs';
import { inspectOwnerAmendmentAttestation } from '../dist/owner-amendment-attestation.mjs';

const repository = 'flair-agency/architecture-gatekeeper';
const baseSha = 'a'.repeat(40);
const sha = bytes => createHash('sha256').update(bytes).digest('hex');

for (const [triggerProfile, kind] of [
  ['completed-block-v1', 'owner-amendment-block-review-record'],
  ['completed-owner-decision-self-v1', 'owner-amendment-owner-decision-review-record'],
]) {
  test(`${triggerProfile} semantic adapter rejects a different caller's otherwise-consistent evidence`, () => {
    const record = { kind, repository, workflowPath: '.github/workflows/self-architecture-gate.yml',
      workflowSha: baseSha, runId: 12345, runAttempt: 2 };
    const { producer, expected } = selectSelfSemanticTrigger({ record, repository, baseSha, triggerProfile });
    assert.deepEqual(producer, { workflowPath: record.workflowPath, workflowSha: baseSha,
      workflowRef: 'refs/heads/main', runId: '12345', runAttempt: '2', jobId: 'owner-amendment-owner-decision-record' });
    assert.deepEqual(expected, { repository, workflowPath: record.workflowPath, workflowSha: baseSha,
      workflowRef: 'refs/heads/main', runId: '12345', runAttempt: '2' });

    const otherCaller = '.github/workflows/architecture-gate.yml';
    assert.throws(() => selectSelfSemanticTrigger({ record: { ...record, workflowPath: otherCaller },
      repository, baseSha, triggerProfile }), /does not identify the selected self trigger workflow/);

    // Even if a valid attestation is internally consistent with another caller,
    // verification against the adapter's independently selected caller fails.
    const recordBytes = Buffer.from(`${JSON.stringify({ ...record, workflowPath: otherCaller })}\n`);
    const signer = `https://github.com/${repository}/.github/workflows/architecture-gate.yml@refs/heads/main`;
    const caller = `https://github.com/${repository}/${otherCaller}@refs/heads/main`;
    const bundle = [{ verificationResult: { signature: { certificate: {
      subjectAlternativeName: signer, buildSignerURI: signer, buildConfigURI: caller,
      githubWorkflowRepository: repository, githubWorkflowSHA: baseSha, buildSignerDigest: baseSha,
      buildConfigDigest: baseSha, sourceRepositoryDigest: baseSha,
      sourceRepositoryURI: `https://github.com/${repository}`, sourceRepositoryRef: 'refs/heads/main',
      githubWorkflowTrigger: 'pull_request_target',
      runInvocationURI: `https://github.com/${repository}/actions/runs/12345/attempts/2`,
    } }, statement: { predicateType: 'https://slsa.dev/provenance/v1', subject: [{
      name: 'review-record.json', digest: { sha256: sha(recordBytes) },
    }] } } }];
    const result = inspectOwnerAmendmentAttestation({ recordBytes, verified: bundle, expected });
    assert.equal(result.status, 'INCOMPLETE');
    assert.match(result.reason, /Build config URI differs from trusted expectation/);
  });
}

test('semantic adapter rejects a self-claimed workflow revision or ref', () => {
  const record = { kind: 'owner-amendment-owner-decision-review-record', repository,
    workflowPath: '.github/workflows/self-architecture-gate.yml', workflowSha: 'b'.repeat(40), runId: '123', runAttempt: '1' };
  assert.throws(() => selectSelfSemanticTrigger({ record, repository, baseSha, triggerProfile: 'completed-owner-decision-self-v1' }),
    /does not identify the selected self trigger workflow/);
});
