// Fetch a GitHub Actions artifact archive for a trusted BLOCK producer run.
// This transports compressed evidence; it does not extract or authenticate its
// contents, verify attestation, or decide acceptance.
import { createHash } from 'node:crypto';

const REPOSITORY = /^[A-Za-z0-9][A-Za-z0-9-]*\/[A-Za-z0-9][A-Za-z0-9._-]*$/;
const SHA = /^[a-f0-9]{40}$/;
const MAX_ZIP_BYTES = 2 * 1024 * 1024;
const EXPECTED_KEYS = ['repository', 'artifactId', 'runId', 'runAttempt', 'baseSha', 'headSha'];

const fail = message => { throw new Error(`Owner amendment artifact: ${message}`); };
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const validPositiveId = value => (typeof value === 'string' && /^[1-9]\d*$/.test(value)) ||
  (Number.isSafeInteger(value) && value > 0);

function validateExpected(expected) {
  if (!expected || typeof expected !== 'object' || Array.isArray(expected) ||
      Object.keys(expected).sort().join(',') !== [...EXPECTED_KEYS].sort().join(',')) {
    fail('trusted run identity is incomplete or contains unknown fields.');
  }
  if (!REPOSITORY.test(expected.repository) || !validPositiveId(expected.artifactId) ||
      !validPositiveId(expected.runId) || !validPositiveId(expected.runAttempt) ||
      !SHA.test(expected.baseSha) || !SHA.test(expected.headSha)) {
    fail('trusted run identity has invalid values.');
  }
  return expected;
}

function bytesOf(value) {
  if (Buffer.isBuffer(value)) return value;
  if (value instanceof Uint8Array) return Buffer.from(value.buffer, value.byteOffset, value.byteLength);
  return null;
}

async function readBoundedZip(response, expectedSize) {
  if (!response?.body || typeof response.body.getReader !== 'function') fail('artifact download is not a readable stream.');
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = bytesOf(value);
      if (!chunk || total + chunk.length > MAX_ZIP_BYTES || total + chunk.length > expectedSize) {
        fail('artifact download exceeds its declared or maximum size.');
      }
      chunks.push(chunk);
      total += chunk.length;
    }
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw error;
  } finally {
    reader.releaseLock();
  }
  if (total !== expectedSize) fail('artifact download size differs from GitHub metadata.');
  return Buffer.concat(chunks, total);
}

/**
 * Fetch one exact Actions artifact as bounded compressed bytes. This layer does
 * not decompress the archive; a later protected adapter must safely enforce
 * expanded-size, file-count, and path limits before returning file bytes. The
 * caller supplies an authenticated API fetch.
 */
export async function fetchOwnerAmendmentBlockArtifact({ expected, token, fetchImpl = fetch }) {
  try {
    expected = validateExpected(expected);
    if (typeof token !== 'string' || token.length === 0) fail('GitHub API token is required.');
    if (typeof fetchImpl !== 'function') fail('authenticated fetch helper is required.');
    const [owner, repositoryName] = expected.repository.split('/');
    const repo = `${encodeURIComponent(owner)}/${encodeURIComponent(repositoryName)}`;
    const runId = encodeURIComponent(String(expected.runId));
    const runAttempt = encodeURIComponent(String(expected.runAttempt));
    const api = 'https://api.github.com';
    const headers = { accept: 'application/vnd.github+json', authorization: `Bearer ${token}`, 'x-github-api-version': '2022-11-28' };
    const getJson = async url => {
      const response = await fetchImpl(url, { headers, redirect: 'error' });
      if (!response?.ok) fail(`GitHub API request failed (${response?.status ?? 'no response'}).`);
      return response.json();
    };
    // The unqualified endpoint describes the latest attempt. A retried run can
    // therefore hide the metadata for the exact producer attempt being checked.
    const run = await getJson(`${api}/repos/${repo}/actions/runs/${runId}/attempts/${runAttempt}`);
    if (String(run.id) !== String(expected.runId) || run.event !== 'pull_request_target' ||
        run.repository?.full_name !== expected.repository ||
        run.head_repository?.full_name !== expected.repository || run.head_sha !== expected.headSha ||
        String(run.run_attempt) !== String(expected.runAttempt)) {
      fail('workflow run event, repository, head, attempt, or run ID differs from trusted expectation.');
    }
    const artifact = await getJson(`${api}/repos/${repo}/actions/artifacts/${encodeURIComponent(String(expected.artifactId))}`);
    const artifactName = `owner-amendment-block-${expected.baseSha}-${expected.headSha}-${expected.runId}-${expected.runAttempt}`;
    if (String(artifact.id) !== String(expected.artifactId) || artifact.name !== artifactName || artifact.expired !== false ||
        artifact.workflow_run?.id == null || String(artifact.workflow_run.id) !== String(expected.runId) ||
        artifact.workflow_run?.repository_id !== run.repository?.id ||
        artifact.workflow_run?.head_repository_id !== run.head_repository?.id ||
        artifact.workflow_run?.head_sha !== expected.headSha ||
        !Number.isSafeInteger(artifact.size_in_bytes) || artifact.size_in_bytes < 1 || artifact.size_in_bytes > MAX_ZIP_BYTES ||
        typeof artifact.digest !== 'string' || !/^sha256:[a-f0-9]{64}$/.test(artifact.digest)) {
      fail('artifact metadata is expired, oversized, or does not match the trusted run identity.');
    }
    // GitHub's artifact endpoint returns a short-lived 302 download URL.
    const response = await fetchImpl(`${api}/repos/${repo}/actions/artifacts/${encodeURIComponent(String(expected.artifactId))}/zip`, { headers, redirect: 'follow' });
    if (!response?.ok) fail(`artifact download failed (${response?.status ?? 'no response'}).`);
    const zipBytes = await readBoundedZip(response, artifact.size_in_bytes);
    if (`sha256:${sha256(zipBytes)}` !== artifact.digest) fail('downloaded zip SHA-256 differs from GitHub metadata.');
    return Object.freeze({ status: 'FETCHED_OWNER_AMENDMENT_BLOCK_ARTIFACT', artifactId: String(artifact.id),
      artifactName: artifact.name, artifactDigest: artifact.digest, runId: String(expected.runId), runAttempt: String(expected.runAttempt),
      baseSha: expected.baseSha, headSha: expected.headSha,
      zipBytes: Buffer.from(zipBytes) });
  } catch (error) {
    return Object.freeze({ status: 'INCOMPLETE', reason: error.message });
  }
}

export const OWNER_AMENDMENT_ARTIFACT_LIMITS = Object.freeze({ maxZipBytes: MAX_ZIP_BYTES });
