import { matchesGitHubAssociatedRepository } from '../github-associated-repository.mjs';
// Discover the one BLOCK artifact emitted by an exact trusted Actions run.
// This only selects an artifact ID; a later layer fetches and authenticates it.
const REPOSITORY = /^[A-Za-z0-9][A-Za-z0-9-]*\/[A-Za-z0-9][A-Za-z0-9._-]*$/;
const SHA = /^[a-f0-9]{40}$/;
const PAGE_SIZE = 100;
const MAX_PAGES = 100;
const KEYS = ['repository', 'runId', 'runAttempt', 'baseSha', 'headSha'];
const PROFILES = Object.freeze({ block: 'owner-amendment-block', ownerDecision: 'owner-amendment-owner-decision', eligibility: 'owner-amendment-eligibility' });

export type Awaitable<T> = T | PromiseLike<T>;
export type OwnerAmendmentArtifactDiscoveryProfile = keyof typeof PROFILES;
export type OwnerAmendmentArtifactDiscoveryFetchResponse = {
  ok?: unknown;
  status?: unknown;
  json: () => Awaitable<unknown>;
};
export type OwnerAmendmentArtifactDiscoveryFetch = (url: string, options: {
  headers: Record<string, string>;
  redirect: 'error';
}) => Awaitable<OwnerAmendmentArtifactDiscoveryFetchResponse>;
export type OwnerAmendmentArtifactDiscoveryInput = {
  expected: unknown;
  token: string;
  fetchImpl?: OwnerAmendmentArtifactDiscoveryFetch;
};
type DiscoveredOwnerAmendmentArtifact = {
  readonly status: 'DISCOVERED_OWNER_AMENDMENT_BLOCK_ARTIFACT' | 'DISCOVERED_OWNER_AMENDMENT_ELIGIBILITY_ARTIFACT' | 'DISCOVERED_OWNER_AMENDMENT_OWNER_DECISION_ARTIFACT';
  readonly profile?: unknown;
  readonly artifactId: string;
  readonly artifactName: unknown;
  readonly runId: string;
  readonly runAttempt: string;
  readonly baseSha: unknown;
  readonly headSha: unknown;
  readonly expiresAt: unknown;
  readonly reason?: never;
};
type IncompleteOwnerAmendmentArtifactDiscovery = {
  readonly status: 'INCOMPLETE';
  readonly reason: unknown;
  readonly profile?: never;
  readonly artifactId?: never;
  readonly artifactName?: never;
  readonly runId?: never;
  readonly runAttempt?: never;
  readonly baseSha?: never;
  readonly headSha?: never;
  readonly expiresAt?: never;
};
export type OwnerAmendmentArtifactDiscoveryResult = DiscoveredOwnerAmendmentArtifact | IncompleteOwnerAmendmentArtifactDiscovery;
// Erased property views describe the original operations, not validation.
// External values and mutable accessor readbacks remain unknown. Operation
// casts preserve the historical coercion/failure behavior and add no checks.
type ExpectedView = { repository: unknown; runId: unknown; runAttempt: unknown; baseSha: unknown; headSha: unknown; profile?: unknown };
type JsonRun = { id: unknown; status: unknown; event: unknown; repository: { id: unknown; full_name: unknown }; head_repository: { id: unknown; full_name: unknown }; head_sha: unknown; pull_requests: unknown; run_attempt: unknown };
type JsonPullRequest = { base: { ref: unknown; sha: unknown; repo: unknown }; head: { sha: unknown; repo: unknown } };
type JsonArtifact = { id: unknown; name: unknown; expired: unknown; expires_at: unknown; workflow_run: { id: unknown; repository_id: unknown; head_repository_id: unknown; head_sha: unknown } };
type JsonArtifactList = { total_count: unknown; artifacts: unknown };

const fail: (message: string) => never = message => { throw new Error(`Owner amendment artifact discovery: ${message}`); };
const numericId = (value: unknown) => Number.isSafeInteger(value) && (value as number) > 0;
const positiveId = (value: unknown) => (typeof value === 'string' && /^[1-9]\d*$/.test(value)) ||
  (Number.isSafeInteger(value) && (value as number) > 0);

function validateExpected(expected: unknown): unknown {
  const keys = expected && Object.hasOwn(expected as object, 'profile') ? [...KEYS, 'profile'] : KEYS;
  if (!expected || typeof expected !== 'object' || Array.isArray(expected) ||
      Object.keys(expected as object).sort().join(',') !== [...keys].sort().join(',')) {
    fail('trusted run identity is incomplete or contains unknown fields.');
  }
  if (!REPOSITORY.test((expected as ExpectedView).repository as string) || !positiveId((expected as ExpectedView).runId) || !positiveId((expected as ExpectedView).runAttempt) ||
      !SHA.test((expected as ExpectedView).baseSha as string) || !SHA.test((expected as ExpectedView).headSha as string) ||
      ((expected as ExpectedView).profile !== undefined && !Object.hasOwn(PROFILES, (expected as ExpectedView).profile as PropertyKey))) {
    fail('trusted run identity has invalid values.');
  }
  return expected;
}

function validateRun(run: JsonRun, expected: unknown): JsonRun {
  const pullRequests = run?.pull_requests;
  const associations = Array.isArray(run?.pull_requests) ? run.pull_requests.filter((pr: unknown) =>
    (pr as JsonPullRequest | null)?.base?.ref === 'main' && (pr as JsonPullRequest | null)?.base?.sha === (expected as ExpectedView).baseSha &&
    matchesGitHubAssociatedRepository((pr as JsonPullRequest | null)?.base?.repo, { repository: (expected as ExpectedView).repository as string, repositoryId: run.repository?.id }) &&
    (pr as JsonPullRequest | null)?.head?.sha === (expected as ExpectedView).headSha &&
    matchesGitHubAssociatedRepository((pr as JsonPullRequest | null)?.head?.repo, { repository: (expected as ExpectedView).repository as string, repositoryId: run.repository?.id })) : [];
  if (String(run?.id) !== String((expected as ExpectedView).runId) || run.status !== 'completed' ||
      run.event !== 'pull_request_target' ||
      run.repository?.full_name !== (expected as ExpectedView).repository || run.head_repository?.full_name !== (expected as ExpectedView).repository ||
      !SHA.test((run.head_sha ?? '') as string) || !Array.isArray(pullRequests) ||
      (pullRequests.length === 0 ? false : pullRequests.length !== 1 || associations.length !== 1) ||
      String(run.run_attempt) !== String((expected as ExpectedView).runAttempt) ||
      !numericId(run.repository?.id) || !numericId(run.head_repository?.id)) {
    fail('workflow run event, repository, head, attempt, or run ID differs from trusted expectation.');
  }
  return run;
}

function validateArtifact(artifact: JsonArtifact, expected: unknown, run: JsonRun, expectedName: string): JsonArtifact {
  const expiresAt = Date.parse(artifact?.expires_at as string);
  if (!numericId(artifact?.id) || artifact.name !== expectedName || artifact.expired !== false ||
      !Number.isFinite(expiresAt) || expiresAt <= Date.now() ||
      String(artifact.workflow_run?.id) !== String((expected as ExpectedView).runId) ||
      !numericId(artifact.workflow_run?.repository_id) || !numericId(artifact.workflow_run?.head_repository_id) ||
      artifact.workflow_run.repository_id !== run.repository.id ||
      artifact.workflow_run.head_repository_id !== run.head_repository.id ||
      artifact.workflow_run.head_sha !== run.head_sha) {
    fail('matching artifact has invalid identity, run association, or expiry metadata.');
  }
  return artifact;
}

/**
 * Find exactly one expected BLOCK artifact in the specified completed run
 * attempt. The artifact ID is derived from GitHub's authenticated listing and
 * is never accepted from the caller. No archive bytes or acceptance claim are
 * produced here.
 */
export async function discoverOwnerAmendmentBlockArtifact({ expected, token, fetchImpl = fetch }: OwnerAmendmentArtifactDiscoveryInput): Promise<OwnerAmendmentArtifactDiscoveryResult> {
  try {
    expected = validateExpected(expected);
    if (typeof token !== 'string' || token.length === 0) fail('GitHub API token is required.');
    if (typeof fetchImpl !== 'function') fail('authenticated fetch helper is required.');

    const [owner, repositoryName] = ((expected as ExpectedView).repository as string).split('/');
    const repo = `${encodeURIComponent(owner)}/${encodeURIComponent(repositoryName)}`;
    const runId = encodeURIComponent(String((expected as ExpectedView).runId));
    const attempt = encodeURIComponent(String((expected as ExpectedView).runAttempt));
    const api = 'https://api.github.com';
    const headers = { accept: 'application/vnd.github+json', authorization: `Bearer ${token}`,
      'x-github-api-version': '2022-11-28' };
    const getJson = async (url: string): Promise<unknown> => {
      const response = await fetchImpl(url, { headers, redirect: 'error' });
      if (!response?.ok) fail(`GitHub API request failed (${response?.status ?? 'no response'}).`);
      return response.json();
    };

    const run = validateRun(await getJson(`${api}/repos/${repo}/actions/runs/${runId}/attempts/${attempt}`) as JsonRun, expected);
    const profile = ((expected as ExpectedView).profile ?? 'block') as OwnerAmendmentArtifactDiscoveryProfile;
    const expectedName = `${PROFILES[profile]}-${(expected as ExpectedView).baseSha}-${(expected as ExpectedView).headSha}-${(expected as ExpectedView).runId}-${(expected as ExpectedView).runAttempt}`;
    const artifacts = [];
    let totalCount: number | undefined;
    for (let page = 1; ; page += 1) {
      if (page > MAX_PAGES) fail('artifact listing exceeds the page limit.');
      const result = await getJson(`${api}/repos/${repo}/actions/runs/${runId}/artifacts?per_page=${PAGE_SIZE}&page=${page}`) as JsonArtifactList;
      if (!Number.isSafeInteger(result?.total_count) || (result.total_count as number) < 0 ||
          !Array.isArray(result?.artifacts) || result.artifacts.length > PAGE_SIZE) {
        fail('artifact listing response is malformed.');
      }
      if (totalCount === undefined) totalCount = result.total_count as number;
      if (result.total_count !== totalCount) fail('artifact listing changed while pages were read.');
      artifacts.push(...result.artifacts);
      if (artifacts.length > totalCount) fail('artifact listing contains more entries than declared.');
      if (artifacts.length === totalCount) break;
      if (result.artifacts.length === 0) fail('artifact listing ended before all declared entries were read.');
    }

    const matches = artifacts.filter((artifact: unknown) => (artifact as JsonArtifact | null)?.name === expectedName);
    if (matches.length !== 1) fail(`expected exactly one matching BLOCK artifact; found ${matches.length}.`);
    const artifact = validateArtifact(matches[0], expected, run, expectedName);
    return Object.freeze({ status: profile === 'block' ? 'DISCOVERED_OWNER_AMENDMENT_BLOCK_ARTIFACT' :
      profile === 'eligibility' ? 'DISCOVERED_OWNER_AMENDMENT_ELIGIBILITY_ARTIFACT' : 'DISCOVERED_OWNER_AMENDMENT_OWNER_DECISION_ARTIFACT',
      ...(profile === 'block' ? {} : { profile }),
      artifactId: String(artifact.id), artifactName: artifact.name, runId: String((expected as ExpectedView).runId),
      runAttempt: String((expected as ExpectedView).runAttempt), baseSha: (expected as ExpectedView).baseSha, headSha: (expected as ExpectedView).headSha,
      expiresAt: artifact.expires_at });
  } catch (error: unknown) {
    return Object.freeze({ status: 'INCOMPLETE', reason: (error as { message: unknown }).message });
  }
}

export const OWNER_AMENDMENT_ARTIFACT_DISCOVERY_LIMITS = Object.freeze({ pageSize: PAGE_SIZE, maxPages: MAX_PAGES });
