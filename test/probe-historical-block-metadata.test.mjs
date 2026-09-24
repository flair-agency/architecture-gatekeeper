import test from 'node:test';
import assert from 'node:assert/strict';
import { probeHistoricalBlockMetadata } from '../scripts/probe-historical-block-metadata.mjs';

const repository = 'flair-agency/architecture-gatekeeper';
const sha = 'a'.repeat(40);
const name = 'architecture-review-record-v1-run-42-attempt-1';

function responses(overrides = {}) {
  const data = {
    run: { id: 42, run_attempt: 2, head_sha: sha, workflow_id: 99,
      event: 'pull_request_target', path: '.github/workflows/self-architecture-gate.yml@main',
      repository: { id: 7, full_name: repository } },
    attempt: { id: 42, run_attempt: 1, status: 'completed', event: 'pull_request_target',
      workflow_id: 99, path: '.github/workflows/self-architecture-gate.yml@main',
      head_sha: sha, repository: { id: 7 }, referenced_workflows: [] },
    jobs: { total_count: 1, jobs: [{ id: 8, run_id: 42, head_sha: sha,
      name: 'architecture-gate / review', conclusion: 'success' }] },
    artifacts: { total_count: 1, artifacts: [{ id: 10, name, expired: false,
      digest: `sha256:${'b'.repeat(64)}`, workflow_run: { id: 42, repository_id: 7, head_sha: sha } }] },
    ...overrides,
  };
  return async url => {
    const key = url.includes('/attempts/1/jobs') ? 'jobs' :
      url.includes('/attempts/1') ? 'attempt' : url.includes('/artifacts?') ? 'artifacts' : 'run';
    return new Response(JSON.stringify(data[key]), { status: 200 });
  };
}

function probe(fetchImpl) {
  return probeHistoricalBlockMetadata({ repository, runId: 42, attemptNumber: 1,
    artifactName: name, fetchImpl });
}

test('historical attempt is addressable, but metadata remains only a candidate', async () => {
  const result = await probe(responses());
  assert.equal(result.classification, 'METADATA_CANDIDATE_ONLY');
  assert.equal(result.run.selectedAttempt, 1);
  assert.equal(result.run.latestAttempt, 2);
  assert.equal(result.artifact.id, 10);
  assert.ok(result.unverified.includes('artifact uploader job and attempt'));
});

test('a different run artifact is rejected', async () => {
  const artifact = { id: 10, name, expired: false, digest: `sha256:${'b'.repeat(64)}`,
    workflow_run: { id: 43, repository_id: 7, head_sha: sha } };
  await assert.rejects(probe(responses({ artifacts: { total_count: 1, artifacts: [artifact] } })),
    /Artifact metadata does not match/);
});

test('missing, expired, or ambiguous artifacts are rejected', async () => {
  await assert.rejects(probe(responses({ artifacts: { total_count: 0, artifacts: [] } })),
    /exactly one/);
  const expired = { id: 10, name, expired: true, digest: `sha256:${'b'.repeat(64)}`,
    workflow_run: { id: 42, repository_id: 7, head_sha: sha } };
  await assert.rejects(probe(responses({ artifacts: { total_count: 1, artifacts: [expired] } })),
    /Artifact metadata does not match/);
});

test('an incomplete historical attempt or truncated job page is rejected', async () => {
  await assert.rejects(probe(responses({ attempt: { id: 42, run_attempt: 1, status: 'in_progress',
    event: 'pull_request_target', workflow_id: 99,
    path: '.github/workflows/self-architecture-gate.yml@main',
    head_sha: sha, repository: { id: 7 } } })), /incomplete/);
  await assert.rejects(probe(responses({ jobs: { total_count: 2, jobs: [] } })), /paginated/);
});
