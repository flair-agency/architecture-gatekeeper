import { parseGithubMergeGroupEvent } from './github-merge-group-event.mjs';

const API = 'https://api.github.com';
const SHA = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/;
const fail = message => { throw new Error(`Owner amendment merge-group B context: ${message}`); };
const repoIdentity = value => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9-]*\/[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value);

async function request(fetchImpl, token, url, options = {}) {
  const response = await fetchImpl(url, {
    ...options,
    headers: { accept: 'application/vnd.github+json', authorization: `Bearer ${token}`,
      'x-github-api-version': '2022-11-28', ...(options.headers ?? {}) },
    redirect: 'error',
  });
  if (!response?.ok) fail(`GitHub API request failed (${response?.status ?? 'no response'}).`);
  let body;
  try { body = await response.json(); } catch { fail('GitHub API returned invalid JSON.'); }
  return body;
}

async function associatedPullRequests(fetchImpl, token, repository, commitSha) {
  const [owner, name] = repository.split('/');
  const matches = [];
  for (let page = 1; page <= 100; page += 1) {
    const result = await request(fetchImpl, token,
      `${API}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/commits/${commitSha}/pulls?per_page=100&page=${page}`);
    if (!Array.isArray(result) || result.length > 100) fail('associated pull-request response is malformed.');
    matches.push(...result);
    if (result.length < 100) return matches;
  }
  fail('associated pull-request listing exceeds the page limit.');
}

function matchesExactBPullRequest(candidate, repository, repositoryId, baseSha, bHeadSha) {
  return Number.isSafeInteger(candidate?.number) && candidate.number > 0 && candidate.state === 'open' && candidate.draft === false &&
    candidate.base?.ref === 'main' && candidate.base?.sha === baseSha && candidate.head?.sha === bHeadSha &&
    candidate.base?.repo?.full_name === repository && candidate.head?.repo?.full_name === repository &&
    candidate.base?.repo?.id === repositoryId && candidate.head?.repo?.id === repositoryId;
}

const MERGE_QUEUE_QUERY = `query($owner: String!, $name: String!, $number: Int!) {
  repository(owner: $owner, name: $name) {
    id nameWithOwner
    pullRequest(number: $number) {
      number state isDraft baseRefName baseRefOid headRefOid
      baseRepository { id nameWithOwner }
      headRepository { id nameWithOwner }
      mergeQueueEntry { state baseCommit { oid } headCommit { oid } pullRequest { number } }
    }
  }
}`;

/**
 * Resolve the one open, same-repository B represented by a merge-group commit.
 * This is context selection only; it makes no eligibility or acceptance claim.
 * The supported queue shape is a two-parent merge-group commit with exact B as
 * its second parent and B's protected main base as its first parent.
 */
export async function selectOwnerAmendmentMergeGroupBContext({ event, token, fetchImpl = fetch } = {}) {
  try {
    if (typeof token !== 'string' || !token.trim() || typeof fetchImpl !== 'function') fail('authenticated API access is required.');
    const parsed = parseGithubMergeGroupEvent(event);
    if (parsed.status !== 'PARSED_MERGE_GROUP_EVENT') fail(parsed.reason ?? 'merge-group event is invalid.');
    if (!repoIdentity(parsed.repository) || parsed.baseRef !== 'refs/heads/main' ||
        !SHA.test(parsed.baseSha) || !SHA.test(parsed.headSha)) fail('event must identify a valid main merge group.');

    const [owner, name] = parsed.repository.split('/');
    const repoPath = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`;
    const [repo, mergeCommit] = await Promise.all([
      request(fetchImpl, token, `${API}${repoPath}`),
      request(fetchImpl, token, `${API}${repoPath}/commits/${parsed.headSha}`),
    ]);
    if (!Number.isSafeInteger(repo?.id) || repo.id < 1 || repo.full_name !== parsed.repository ||
        mergeCommit?.sha !== parsed.headSha || !Array.isArray(mergeCommit.parents) || mergeCommit.parents.length !== 2 ||
        mergeCommit.parents[0]?.sha !== parsed.baseSha || !SHA.test(mergeCommit.parents[1]?.sha ?? '')) {
      fail('merge-group commit does not have the exact protected base and one exact B parent.');
    }
    const bHeadSha = mergeCommit.parents[1].sha;
    const associated = await associatedPullRequests(fetchImpl, token, parsed.repository, bHeadSha);
    const exactCandidates = associated.filter(candidate =>
      matchesExactBPullRequest(candidate, parsed.repository, repo.id, parsed.baseSha, bHeadSha));
    if (exactCandidates.length !== 1) fail('merge-group B parent has no unique exact open, non-draft, same-repository main pull request.');
    const candidate = exactCandidates[0];

    const graph = await request(fetchImpl, token, `${API}/graphql`, { method: 'POST',
      headers: { 'content-type': 'application/json' }, body: JSON.stringify({ query: MERGE_QUEUE_QUERY,
        variables: { owner, name, number: candidate.number } }) });
    if (Array.isArray(graph?.errors) && graph.errors.length) fail('merge queue API returned GraphQL errors.');
    const graphRepo = graph?.data?.repository;
    const queued = graphRepo?.pullRequest;
    const entry = queued?.mergeQueueEntry;
    if (String(queued?.number) !== String(candidate.number) || queued?.state !== 'OPEN' || queued?.isDraft !== false ||
        queued?.baseRefName !== 'main' || queued?.baseRefOid !== parsed.baseSha || queued?.headRefOid !== bHeadSha ||
        typeof graphRepo?.id !== 'string' || !graphRepo.id || graphRepo.nameWithOwner !== parsed.repository ||
        queued?.baseRepository?.id !== graphRepo.id || queued?.baseRepository?.nameWithOwner !== parsed.repository ||
        queued?.headRepository?.id !== graphRepo.id || queued?.headRepository?.nameWithOwner !== parsed.repository ||
        !entry || !['AWAITING_CHECKS', 'LOCKED', 'MERGEABLE', 'QUEUED'].includes(entry.state) ||
        entry.baseCommit?.oid !== parsed.baseSha || entry.headCommit?.oid !== bHeadSha ||
        String(entry.pullRequest?.number) !== String(candidate.number)) {
      fail('authenticated merge queue entry does not bind this open PR to the exact event base and B head.');
    }

    return Object.freeze({ status: 'SELECTED_OWNER_AMENDMENT_MERGE_GROUP_B_CONTEXT',
      repository: parsed.repository, repositoryId: repo.id, mergeGroupBaseSha: parsed.baseSha,
      mergeGroupHeadSha: parsed.headSha, bPrNumber: String(candidate.number), bBaseSha: parsed.baseSha,
      bHeadSha, queueEntryState: entry.state });
  } catch (error) {
    return Object.freeze({ status: 'INCOMPLETE', reason: error.message });
  }
}
