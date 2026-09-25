#!/usr/bin/env node
// Read-only feasibility probe. Its output is never acceptance evidence.
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const REPOSITORY = /^[A-Za-z0-9][A-Za-z0-9-]{0,38}\/[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/;
const SHA = /^[a-f0-9]{40}$/;
const DIGEST = /^sha256:[a-f0-9]{64}$/;

function positiveInteger(value, label) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 1) throw new Error(`Invalid ${label}`);
  return number;
}

async function getJson(fetchImpl, url, token) {
  const headers = { accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28' };
  if (token) headers.authorization = `Bearer ${token}`;
  const response = await fetchImpl(url, { headers });
  if (!response.ok) throw new Error(`GitHub API returned HTTP ${response.status} for ${new URL(url).pathname}`);
  const size = Number(response.headers?.get?.('content-length'));
  if (size > 2_000_000) throw new Error('GitHub API response is too large');
  const body = await response.text();
  if (body.length > 2_000_000) throw new Error('GitHub API response is too large');
  return JSON.parse(body);
}

export async function probeHistoricalBlockMetadata({
  repository, runId, attemptNumber, artifactName, token = '', fetchImpl = fetch,
  apiUrl = 'https://api.github.com',
}) {
  if (!REPOSITORY.test(repository || '')) throw new Error('Invalid repository');
  const run = positiveInteger(runId, 'run ID');
  const attempt = positiveInteger(attemptNumber, 'attempt number');
  if (typeof artifactName !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(artifactName)) {
    throw new Error('Invalid artifact name');
  }
  const root = `${apiUrl}/repos/${repository}/actions/runs/${run}`;
  const [runData, attemptData, jobData, artifactData] = await Promise.all([
    getJson(fetchImpl, root, token),
    getJson(fetchImpl, `${root}/attempts/${attempt}`, token),
    getJson(fetchImpl, `${root}/attempts/${attempt}/jobs?per_page=100`, token),
    getJson(fetchImpl, `${root}/artifacts?name=${encodeURIComponent(artifactName)}&per_page=100`, token),
  ]);
  if (runData.id !== run || runData.repository?.full_name !== repository ||
      attemptData.id !== run || attemptData.run_attempt !== attempt ||
      attemptData.repository?.id !== runData.repository.id ||
      !SHA.test(attemptData.head_sha || '') ||
      runData.head_sha !== attemptData.head_sha ||
      runData.workflow_id !== attemptData.workflow_id ||
      runData.event !== attemptData.event || runData.path !== attemptData.path ||
      !Number.isSafeInteger(runData.run_attempt) || runData.run_attempt < attempt) {
    throw new Error('Run and attempt metadata do not agree');
  }
  if (attemptData.status !== 'completed') throw new Error('Selected attempt is incomplete');
  if (!Array.isArray(jobData.jobs) || jobData.total_count !== jobData.jobs.length) {
    throw new Error('Attempt jobs are incomplete or paginated');
  }
  if (jobData.jobs.some(job => job.run_id !== run || job.head_sha !== attemptData.head_sha)) {
    throw new Error('Job metadata does not match the selected run');
  }
  if (!Array.isArray(artifactData.artifacts) || artifactData.total_count !== 1 || artifactData.artifacts.length !== 1) {
    throw new Error('Expected exactly one named artifact in the run');
  }
  const artifact = artifactData.artifacts[0];
  if (artifact.name !== artifactName || artifact.expired !== false ||
      !Number.isSafeInteger(artifact.id) || artifact.id < 1 ||
      !DIGEST.test(artifact.digest || '') ||
      artifact.workflow_run?.id !== run ||
      artifact.workflow_run?.repository_id !== runData.repository.id ||
      artifact.workflow_run?.head_sha !== attemptData.head_sha) {
    throw new Error('Artifact metadata does not match the run');
  }
  return {
    classification: 'METADATA_CANDIDATE_ONLY',
    repository: { id: runData.repository.id, fullName: repository },
    run: { id: run, latestAttempt: runData.run_attempt, selectedAttempt: attempt,
      event: attemptData.event, workflowId: attemptData.workflow_id,
      workflowPath: attemptData.path, workflowTriggerSha: attemptData.head_sha,
      referencedWorkflows: attemptData.referenced_workflows || [] },
    jobs: jobData.jobs.map(job => ({ id: job.id, name: job.name, conclusion: job.conclusion })),
    artifact: { id: artifact.id, name: artifact.name, digest: artifact.digest,
      createdAt: artifact.created_at, expiresAt: artifact.expires_at },
    unverified: ['artifact bytes and ReviewRecord schema', 'artifact uploader job and attempt',
      'protected producer workflow and source boundary', 'current PR/base/head and policy freshness',
      'owner identity'],
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const [repository, runId, attemptNumber, artifactName] = process.argv.slice(2);
  if (!repository || !runId || !attemptNumber || !artifactName) {
    throw new Error('Usage: node scripts/probe-historical-block-metadata.mjs OWNER/REPO RUN_ID ATTEMPT ARTIFACT_NAME');
  }
  const result = await probeHistoricalBlockMetadata({
    repository, runId, attemptNumber, artifactName,
    token: process.env.GITHUB_TOKEN || '',
  });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}
