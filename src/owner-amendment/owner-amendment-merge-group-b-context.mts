import { parseGithubMergeGroupEvent } from '../github-merge-group-event.mjs';

const API = 'https://api.github.com';
const SHA = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/;
const fail: (message: unknown) => never = message => { throw new Error(`Owner amendment merge-group B context: ${message}`); };
const SELF_REPOSITORY = 'flair-agency/architecture-gatekeeper';
const SELF_API = 'https://api.github.com/repos/flair-agency/architecture-gatekeeper';

export type OwnerAmendmentMergeGroupBContextAwaitable<T> = T | PromiseLike<T>;
export type OwnerAmendmentMergeGroupBContextResponse = {
  ok?: unknown; status?: unknown; json?: () => OwnerAmendmentMergeGroupBContextAwaitable<unknown>; body?: unknown;
};
export type OwnerAmendmentMergeGroupBContextRequestOptions = {
  method?: string; headers?: Record<string, string>; body?: string; redirect?: 'error' | 'follow';
};
export type OwnerAmendmentMergeGroupBContextFetch = (
  url: string,
  options: { method?: string; headers: Record<string, string>; body?: string; redirect: 'error' },
) => OwnerAmendmentMergeGroupBContextResponse | PromiseLike<OwnerAmendmentMergeGroupBContextResponse>;

export type SelectOwnerAmendmentMergeGroupBContextInput = {
  event?: unknown; token?: unknown; fetchImpl?: OwnerAmendmentMergeGroupBContextFetch;
};
type IncompleteResult = Readonly<{
  status: 'INCOMPLETE'; reason: unknown;
  repository?: never; repositoryId?: never; mergeGroupBaseSha?: never; mergeGroupHeadSha?: never;
  bPrNumber?: never; bBaseSha?: never; bHeadSha?: never; bPullRequestCreatedAt?: never;
  queueEntryState?: never; queueEnteredAt?: never;
}>;
type SelectedResult = Readonly<{
  status: 'SELECTED_OWNER_AMENDMENT_MERGE_GROUP_B_CONTEXT';
  repository: string; repositoryId: unknown; mergeGroupBaseSha: unknown; mergeGroupHeadSha: unknown;
  bPrNumber: string; bBaseSha: unknown; bHeadSha: unknown; bPullRequestCreatedAt: unknown;
  queueEntryState: unknown; queueEnteredAt: unknown; reason?: never;
}>;
export type SelectOwnerAmendmentMergeGroupBContextResult = IncompleteResult | SelectedResult;

type FetchOptionsView = { headers?: Record<string, string> };
type FetchResponseView = { ok?: unknown; status?: unknown; json?: () => OwnerAmendmentMergeGroupBContextAwaitable<unknown>; body?: unknown };
type JsonResponseOperationView = { json: () => OwnerAmendmentMergeGroupBContextAwaitable<unknown> };
type RepositoryView = { id?: unknown; full_name?: unknown };
type ParentView = { sha?: unknown };
type CommitView = {
  sha?: unknown; parents?: unknown;
  commit?: { tree?: { sha?: unknown } };
};
type PullRequestRepositoryView = { full_name?: unknown; id?: unknown };
type PullRequestRefView = { ref?: unknown; sha?: unknown; repo?: PullRequestRepositoryView };
type PullRequestView = {
  number?: unknown; state?: unknown; draft?: unknown; base?: PullRequestRefView; head?: PullRequestRefView; created_at?: unknown;
};
type GraphRepositoryView = { id?: unknown; nameWithOwner?: unknown; pullRequest?: unknown };
type QueueEntryView = {
  state?: unknown; enqueuedAt?: unknown; baseCommit?: { oid?: unknown }; headCommit?: { oid?: unknown };
  pullRequest?: { number?: unknown };
};
type GraphPullRequestView = {
  number?: unknown; state?: unknown; isDraft?: unknown; baseRefName?: unknown; baseRefOid?: unknown; headRefOid?: unknown;
  baseRepository?: { id?: unknown; nameWithOwner?: unknown };
  headRepository?: { id?: unknown; nameWithOwner?: unknown };
  mergeQueueEntry?: unknown;
};

async function request(fetchImpl: OwnerAmendmentMergeGroupBContextFetch, token: string, url: string,
  options: OwnerAmendmentMergeGroupBContextRequestOptions = {}): Promise<unknown> {
  const response = await fetchImpl(url, {
    ...options,
    headers: { accept: 'application/vnd.github+json', authorization: `Bearer ${token}`,
      'x-github-api-version': '2022-11-28', ...(options.headers ?? {}) },
    redirect: 'error',
  });
  if (!(response as FetchResponseView | null | undefined)?.ok) fail(`GitHub API request failed (${(response as FetchResponseView | null | undefined)?.status ?? 'no response'}).`);
  let body: unknown;
  try { body = await (response as JsonResponseOperationView).json(); } catch { fail('GitHub API returned invalid JSON.'); }
  return body;
}

async function associatedPullRequests(fetchImpl: OwnerAmendmentMergeGroupBContextFetch, token: string, repository: unknown, commitSha: unknown): Promise<unknown[]> {
  if (repository !== SELF_REPOSITORY || !SHA.test((commitSha ?? '') as string)) fail('associated PR lookup must be scoped to an exact self commit.');
  const matches: unknown[] = [];
  for (let page = 1; page <= 100; page += 1) {
    const result = await request(fetchImpl, token,
      `${SELF_API}/commits/${(commitSha as string)}/pulls?per_page=100&page=${page}`);
    if (!Array.isArray(result) || result.length > 100) fail('associated pull-request response is malformed.');
    matches.push(...(result as unknown[]));
    if (result.length < 100) return matches;
  }
  fail('associated pull-request listing exceeds the page limit.');
}

function matchesExactBPullRequest(candidate: unknown, repository: unknown, repositoryId: unknown, baseSha: unknown, bHeadSha: unknown): boolean {
  return Number.isSafeInteger((candidate as PullRequestView | null | undefined)?.number) && ((candidate as PullRequestView).number as number) > 0 && (candidate as PullRequestView).state === 'open' && (candidate as PullRequestView).draft === false &&
    (candidate as PullRequestView).base?.ref === 'main' && (candidate as PullRequestView).base?.sha === baseSha && (candidate as PullRequestView).head?.sha === bHeadSha &&
    (candidate as PullRequestView).base?.repo?.full_name === repository && (candidate as PullRequestView).head?.repo?.full_name === repository &&
    (candidate as PullRequestView).base?.repo?.id === repositoryId && (candidate as PullRequestView).head?.repo?.id === repositoryId &&
    typeof (candidate as PullRequestView).created_at === 'string' && Number.isFinite(Date.parse((candidate as PullRequestView).created_at as string));
}

const MERGE_QUEUE_QUERY = `query($owner: String!, $name: String!, $number: Int!) {
  repository(owner: $owner, name: $name) {
    id nameWithOwner
    pullRequest(number: $number) {
      number state isDraft baseRefName baseRefOid headRefOid
      baseRepository { id nameWithOwner }
      headRepository { id nameWithOwner }
      mergeQueueEntry { state enqueuedAt baseCommit { oid } headCommit { oid } pullRequest { number } }
    }
  }
}`;

/**
 * Resolve the one open, same-repository B represented by a merge-group commit.
 * This is context selection only; it makes no eligibility or acceptance claim.
 * The supported queue shape is a two-parent merge-group commit with exact B as
 * its second parent and B's protected main base as its first parent.
 */
export async function selectOwnerAmendmentMergeGroupBContext({ event, token, fetchImpl = fetch }:
  SelectOwnerAmendmentMergeGroupBContextInput = {}): Promise<SelectOwnerAmendmentMergeGroupBContextResult> {
  try {
    if (typeof token !== 'string' || !token.trim() || typeof fetchImpl !== 'function') fail('authenticated API access is required.');
    const parsed = parseGithubMergeGroupEvent(event);
    if (parsed.status !== 'PARSED_MERGE_GROUP_EVENT') fail(parsed.reason ?? 'merge-group event is invalid.');
    if (parsed.repository !== SELF_REPOSITORY || parsed.baseRef !== 'refs/heads/main' ||
        !SHA.test(parsed.baseSha as string) || !SHA.test(parsed.headSha as string)) fail('event must identify a valid main merge group.');

    const [repo, mergeCommit] = await Promise.all([
      request(fetchImpl, token, SELF_API),
      request(fetchImpl, token, `${SELF_API}/commits/${parsed.headSha as string}`),
    ]);
    if (!Number.isSafeInteger((repo as RepositoryView | null | undefined)?.id) || ((repo as RepositoryView).id as number) < 1 || (repo as RepositoryView).full_name !== parsed.repository ||
        (mergeCommit as CommitView | null | undefined)?.sha !== parsed.headSha || !Array.isArray((mergeCommit as CommitView).parents) || ((mergeCommit as { parents: unknown[] }).parents).length !== 2 ||
        ((mergeCommit as { parents: ParentView[] }).parents)[0]?.sha !== parsed.baseSha || !SHA.test((((mergeCommit as { parents: ParentView[] }).parents)[1]?.sha ?? '') as string)) {
      fail('merge-group commit does not have the exact protected base and one exact B parent.');
    }
    const bHeadSha = ((mergeCommit as { parents: ParentView[] }).parents)[1].sha;
    const bCommit = await request(fetchImpl, token, `${SELF_API}/commits/${bHeadSha as string}`);
    const mergeTreeSha = (mergeCommit as CommitView).commit?.tree?.sha;
    const bTreeSha = (bCommit as CommitView | null | undefined)?.commit?.tree?.sha;
    if ((bCommit as CommitView | null | undefined)?.sha !== bHeadSha || !SHA.test((mergeTreeSha ?? '') as string) || !SHA.test((bTreeSha ?? '') as string) || mergeTreeSha !== bTreeSha) {
      fail('merge-group commit tree does not match the exact B tree.');
    }
    const associated = await associatedPullRequests(fetchImpl, token, parsed.repository, bHeadSha);
    const exactCandidates = associated.filter(candidate =>
      matchesExactBPullRequest(candidate, parsed.repository, (repo as RepositoryView).id, parsed.baseSha, bHeadSha));
    if (exactCandidates.length !== 1) fail('merge-group B parent has no unique exact open, non-draft, same-repository main pull request.');
    const candidate = exactCandidates[0];
    const pullRequestCreatedAt = (candidate as PullRequestView).created_at;

    const graph = await request(fetchImpl, token, `${API}/graphql`, { method: 'POST',
      headers: { 'content-type': 'application/json' }, body: JSON.stringify({ query: MERGE_QUEUE_QUERY,
        variables: { owner: 'flair-agency', name: 'architecture-gatekeeper', number: (candidate as PullRequestView).number } }) });
    if (Array.isArray((graph as { errors?: unknown } | null | undefined)?.errors) && ((graph as { errors: unknown[] }).errors).length) fail('merge queue API returned GraphQL errors.');
    const graphRepo = (graph as { data?: { repository?: unknown } } | null | undefined)?.data?.repository;
    const queued = (graphRepo as GraphRepositoryView | null | undefined)?.pullRequest;
    const entry = (queued as GraphPullRequestView | null | undefined)?.mergeQueueEntry;
    if (String((queued as GraphPullRequestView | null | undefined)?.number) !== String((candidate as PullRequestView).number) || (queued as GraphPullRequestView | null | undefined)?.state !== 'OPEN' || (queued as GraphPullRequestView | null | undefined)?.isDraft !== false ||
        (queued as GraphPullRequestView | null | undefined)?.baseRefName !== 'main' || (queued as GraphPullRequestView | null | undefined)?.baseRefOid !== parsed.baseSha || (queued as GraphPullRequestView | null | undefined)?.headRefOid !== bHeadSha ||
        typeof (graphRepo as GraphRepositoryView | null | undefined)?.id !== 'string' || !(graphRepo as GraphRepositoryView).id || (graphRepo as GraphRepositoryView).nameWithOwner !== parsed.repository ||
        (queued as GraphPullRequestView | null | undefined)?.baseRepository?.id !== (graphRepo as GraphRepositoryView).id || (queued as GraphPullRequestView | null | undefined)?.baseRepository?.nameWithOwner !== parsed.repository ||
        (queued as GraphPullRequestView | null | undefined)?.headRepository?.id !== (graphRepo as GraphRepositoryView).id || (queued as GraphPullRequestView | null | undefined)?.headRepository?.nameWithOwner !== parsed.repository ||
        !entry || !['AWAITING_CHECKS', 'LOCKED', 'MERGEABLE', 'QUEUED'].includes((entry as QueueEntryView).state as string) ||
        typeof (entry as QueueEntryView).enqueuedAt !== 'string' || !Number.isFinite(Date.parse((entry as QueueEntryView).enqueuedAt as string)) ||
        (entry as QueueEntryView).baseCommit?.oid !== parsed.baseSha || (entry as QueueEntryView).headCommit?.oid !== bHeadSha ||
        String((entry as QueueEntryView).pullRequest?.number) !== String((candidate as PullRequestView).number)) {
      fail('authenticated merge queue entry does not bind this open PR to the exact event base and B head.');
    }
    if (Date.parse(pullRequestCreatedAt as string) > Date.parse((entry as QueueEntryView).enqueuedAt as string)) {
      fail('exact B pull request creation time is later than merge queue entry.');
    }

    return Object.freeze({ status: 'SELECTED_OWNER_AMENDMENT_MERGE_GROUP_B_CONTEXT',
      repository: parsed.repository, repositoryId: (repo as RepositoryView).id, mergeGroupBaseSha: parsed.baseSha,
      mergeGroupHeadSha: parsed.headSha, bPrNumber: String((candidate as PullRequestView).number), bBaseSha: parsed.baseSha,
      bHeadSha, bPullRequestCreatedAt: pullRequestCreatedAt, queueEntryState: (entry as QueueEntryView).state, queueEnteredAt: (entry as QueueEntryView).enqueuedAt });
  } catch (error: unknown) {
    return Object.freeze({ status: 'INCOMPLETE', reason: (error as { message: unknown }).message });
  }
}
