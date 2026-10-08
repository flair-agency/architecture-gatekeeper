import { matchesGitHubAssociatedRepository } from '../github-associated-repository.mjs';
// Fetch a GitHub Actions artifact archive for a trusted BLOCK producer run.
// This transports compressed evidence; it does not extract or authenticate its
// contents, verify attestation, or decide acceptance.
import { createHash } from 'node:crypto';

const REPOSITORY = /^[A-Za-z0-9][A-Za-z0-9-]*\/[A-Za-z0-9][A-Za-z0-9._-]*$/;
const SHA = /^[a-f0-9]{40}$/;
const MAX_ZIP_BYTES = 2 * 1024 * 1024;
const EXPECTED_KEYS = ['repository', 'artifactId', 'runId', 'runAttempt', 'baseSha', 'headSha'];
const PROFILES = Object.freeze({ block: 'owner-amendment-block', ownerDecision: 'owner-amendment-owner-decision', eligibility: 'owner-amendment-eligibility' });

export type Awaitable<T> = T | PromiseLike<T>;
export type OwnerAmendmentArtifactProfile = keyof typeof PROFILES;
export type OwnerAmendmentArtifactFetchResponse = {
  ok?: unknown;
  status?: unknown;
  json?: () => Awaitable<unknown>;
  body?: unknown;
};
export type OwnerAmendmentArtifactFetch = (url: string, options: {
  headers: Record<string, string>;
  redirect: 'error' | 'follow';
}) => Awaitable<OwnerAmendmentArtifactFetchResponse>;
export type OwnerAmendmentArtifactInput = {
  expected: unknown;
  token: string;
  fetchImpl?: OwnerAmendmentArtifactFetch;
};
type FetchedOwnerAmendmentArtifact = {
  readonly status: 'FETCHED_OWNER_AMENDMENT_BLOCK_ARTIFACT' | 'FETCHED_OWNER_AMENDMENT_ELIGIBILITY_ARTIFACT';
  readonly artifactId: string;
  readonly artifactName: unknown;
  readonly artifactDigest: unknown;
  readonly runId: string;
  readonly runAttempt: string;
  readonly baseSha: unknown;
  readonly headSha: unknown;
  readonly zipBytes: Buffer;
  readonly reason?: never;
};
type IncompleteOwnerAmendmentArtifact = {
  readonly status: 'INCOMPLETE';
  readonly reason: unknown;
  readonly artifactId?: never;
  readonly artifactName?: never;
  readonly artifactDigest?: never;
  readonly runId?: never;
  readonly runAttempt?: never;
  readonly baseSha?: never;
  readonly headSha?: never;
  readonly zipBytes?: never;
};
export type OwnerAmendmentArtifactResult = FetchedOwnerAmendmentArtifact | IncompleteOwnerAmendmentArtifact;
// Erased property views describe the original operations, not validation.
// External values and mutable accessor readbacks remain unknown. Operation
// casts preserve the historical coercion/failure behavior and add no checks.
type ExpectedView = { repository: unknown; artifactId: unknown; runId: unknown; runAttempt: unknown; baseSha: unknown; headSha: unknown; profile?: unknown };
type JsonRun = { id: unknown; event: unknown; repository: { id: unknown; full_name: unknown }; head_repository: { id: unknown; full_name: unknown }; head_sha: unknown; pull_requests: unknown; run_attempt: unknown };
type JsonPullRequest = { base: { ref: unknown; sha: unknown; repo: unknown }; head: { sha: unknown; repo: unknown } };
type JsonArtifact = { id: unknown; name: unknown; expired: unknown; workflow_run: { id: unknown; repository_id: unknown; head_repository_id: unknown; head_sha: unknown }; size_in_bytes: unknown; digest: unknown };
type ArtifactStreamReader = { read: () => Awaitable<{ done?: unknown; value?: unknown }>; cancel: () => { catch: (onRejected: () => unknown) => Awaitable<unknown> }; releaseLock: () => void };
type ArtifactResponseView = { body?: { getReader: () => ArtifactStreamReader } | null; ok?: unknown; status?: unknown };

const fail: (message: string) => never = message => { throw new Error(`Owner amendment artifact: ${message}`); };
const sha256 = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
const validPositiveId = (value: unknown) => (typeof value === 'string' && /^[1-9]\d*$/.test(value)) ||
  (Number.isSafeInteger(value) && (value as number) > 0);
const validGitHubNumericId = (value: unknown) => Number.isSafeInteger(value) && (value as number) > 0;

function validateExpected(expected: unknown): unknown {
  const keys = expected && Object.hasOwn(expected as object, 'profile') ? [...EXPECTED_KEYS, 'profile'] : EXPECTED_KEYS;
  if (!expected || typeof expected !== 'object' || Array.isArray(expected) ||
      Object.keys(expected as object).sort().join(',') !== [...keys].sort().join(',')) {
    fail('trusted run identity is incomplete or contains unknown fields.');
  }
  if (!REPOSITORY.test((expected as ExpectedView).repository as string) || !validPositiveId((expected as ExpectedView).artifactId) ||
      !validPositiveId((expected as ExpectedView).runId) || !validPositiveId((expected as ExpectedView).runAttempt) ||
      !SHA.test((expected as ExpectedView).baseSha as string) || !SHA.test((expected as ExpectedView).headSha as string) ||
      ((expected as ExpectedView).profile !== undefined && !Object.hasOwn(PROFILES, (expected as ExpectedView).profile as PropertyKey))) {
    fail('trusted run identity has invalid values.');
  }
  return expected;
}

function bytesOf(value: unknown): Buffer | null {
  if (Buffer.isBuffer(value)) return value;
  if (value instanceof Uint8Array) return Buffer.from(value.buffer, value.byteOffset, value.byteLength);
  return null;
}

async function readBoundedZip(response: ArtifactResponseView, expectedSize: number): Promise<Buffer> {
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
export async function fetchOwnerAmendmentBlockArtifact({ expected, token, fetchImpl = fetch }: OwnerAmendmentArtifactInput): Promise<OwnerAmendmentArtifactResult> {
  try {
    expected = validateExpected(expected);
    if (typeof token !== 'string' || token.length === 0) fail('GitHub API token is required.');
    if (typeof fetchImpl !== 'function') fail('authenticated fetch helper is required.');
    const [owner, repositoryName] = ((expected as ExpectedView).repository as string).split('/');
    const repo = `${encodeURIComponent(owner)}/${encodeURIComponent(repositoryName)}`;
    const runId = encodeURIComponent(String((expected as ExpectedView).runId));
    const runAttempt = encodeURIComponent(String((expected as ExpectedView).runAttempt));
    const api = 'https://api.github.com';
    const headers = { accept: 'application/vnd.github+json', authorization: `Bearer ${token}`, 'x-github-api-version': '2022-11-28' };
    const getJson = async (url: string): Promise<unknown> => {
      const response = await fetchImpl(url, { headers, redirect: 'error' });
      if (!response?.ok) fail(`GitHub API request failed (${response?.status ?? 'no response'}).`);
      return (response as { json: () => Awaitable<unknown> }).json();
    };
    // The unqualified endpoint describes the latest attempt. A retried run can
    // therefore hide the metadata for the exact producer attempt being checked.
    const run = await getJson(`${api}/repos/${repo}/actions/runs/${runId}/attempts/${runAttempt}`) as JsonRun;
    // GitHub Actions run metadata can expose the protected trigger revision in
    // head_sha; the pull_requests tuple binds the candidate. The verified
    // receipt and attestation later bind exact B and the protected workflow.
    const pullRequests = run?.pull_requests;
    const associations = Array.isArray(pullRequests) ? pullRequests.filter((pr: unknown) =>
      (pr as JsonPullRequest | null)?.base?.ref === 'main' && (pr as JsonPullRequest | null)?.base?.sha === (expected as ExpectedView).baseSha &&
      matchesGitHubAssociatedRepository((pr as JsonPullRequest | null)?.base?.repo, { repository: (expected as ExpectedView).repository, repositoryId: run.repository?.id }) &&
      (pr as JsonPullRequest | null)?.head?.sha === (expected as ExpectedView).headSha &&
      matchesGitHubAssociatedRepository((pr as JsonPullRequest | null)?.head?.repo, { repository: (expected as ExpectedView).repository, repositoryId: run.repository?.id })) : [];
    if (String(run.id) !== String((expected as ExpectedView).runId) || run.event !== 'pull_request_target' ||
        run.repository?.full_name !== (expected as ExpectedView).repository ||
        run.head_repository?.full_name !== (expected as ExpectedView).repository || !/^[a-f0-9]{40}$/.test((run.head_sha ?? '') as string) ||
        !Array.isArray(pullRequests) || (pullRequests.length !== 0 && (pullRequests.length !== 1 || associations.length !== 1)) ||
        String(run.run_attempt) !== String((expected as ExpectedView).runAttempt) ||
        !validGitHubNumericId(run.repository?.id) || !validGitHubNumericId(run.head_repository?.id)) {
      fail('workflow run event, repository, head, attempt, or run ID differs from trusted expectation.');
    }
    const artifact = await getJson(`${api}/repos/${repo}/actions/artifacts/${encodeURIComponent(String((expected as ExpectedView).artifactId))}`) as JsonArtifact;
    const artifactName = `${PROFILES[((expected as ExpectedView).profile ?? 'block') as OwnerAmendmentArtifactProfile]}-${(expected as ExpectedView).baseSha}-${(expected as ExpectedView).headSha}-${(expected as ExpectedView).runId}-${(expected as ExpectedView).runAttempt}`;
    if (String(artifact.id) !== String((expected as ExpectedView).artifactId) || artifact.name !== artifactName || artifact.expired !== false ||
        artifact.workflow_run?.id == null || String(artifact.workflow_run.id) !== String((expected as ExpectedView).runId) ||
        !validGitHubNumericId(artifact.workflow_run?.repository_id) ||
        !validGitHubNumericId(artifact.workflow_run?.head_repository_id) ||
        artifact.workflow_run?.repository_id !== run.repository?.id ||
        artifact.workflow_run?.head_repository_id !== run.head_repository?.id ||
        artifact.workflow_run?.head_sha !== run.head_sha ||
        !Number.isSafeInteger(artifact.size_in_bytes) || (artifact.size_in_bytes as number) < 1 || (artifact.size_in_bytes as number) > MAX_ZIP_BYTES ||
        typeof artifact.digest !== 'string' || !/^sha256:[a-f0-9]{64}$/.test(artifact.digest)) {
      fail('artifact metadata is expired, oversized, or does not match the trusted run identity.');
    }
    // GitHub's artifact endpoint returns a short-lived 302 download URL.
    const response = await fetchImpl(`${api}/repos/${repo}/actions/artifacts/${encodeURIComponent(String((expected as ExpectedView).artifactId))}/zip`, { headers, redirect: 'follow' }) as ArtifactResponseView;
    if (!response?.ok) fail(`artifact download failed (${response?.status ?? 'no response'}).`);
    const zipBytes = await readBoundedZip(response, artifact.size_in_bytes as number);
    if (`sha256:${sha256(zipBytes)}` !== artifact.digest) fail('downloaded zip SHA-256 differs from GitHub metadata.');
    return Object.freeze({ status: (expected as ExpectedView).profile === 'eligibility' ? 'FETCHED_OWNER_AMENDMENT_ELIGIBILITY_ARTIFACT' : 'FETCHED_OWNER_AMENDMENT_BLOCK_ARTIFACT', artifactId: String(artifact.id),
      artifactName: artifact.name, artifactDigest: artifact.digest, runId: String((expected as ExpectedView).runId), runAttempt: String((expected as ExpectedView).runAttempt),
      baseSha: (expected as ExpectedView).baseSha, headSha: (expected as ExpectedView).headSha,
      zipBytes: Buffer.from(zipBytes) });
  } catch (error: unknown) {
    return Object.freeze({ status: 'INCOMPLETE', reason: (error as { message: unknown }).message });
  }
}

export const OWNER_AMENDMENT_ARTIFACT_LIMITS = Object.freeze({ maxZipBytes: MAX_ZIP_BYTES });
