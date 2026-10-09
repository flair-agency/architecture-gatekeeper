import { createHash } from 'node:crypto';
import { createGitHubAuthoritySource } from './github-authority-source.mts';

import type { GitHubAuthorityFetchOptions, GitHubAuthorityFetchResponse, GitHubAuthorityAwaitable } from './github-authority-source.mts';

export type GitHubOwnerAmendmentReadbackFetch = (url: string, options: GitHubAuthorityFetchOptions) =>
  GitHubAuthorityAwaitable<GitHubAuthorityFetchResponse & { json: () => GitHubAuthorityAwaitable<unknown> }>;
export type GitHubOwnerAmendmentReadbackOptions = Readonly<{
  token?: unknown; repository?: unknown; targetBranch?: unknown; pullRequestNumber?: unknown;
  bSha?: unknown; previousBaseSha?: unknown; authorityPath?: unknown; authorityDigest?: unknown;
  fetchImpl?: GitHubOwnerAmendmentReadbackFetch;
}>;
export type GitHubOwnerAmendmentReadbackResult = Readonly<{
  status: 'VERIFIED_OWNER_AMENDMENT_CANONICAL_READBACK'; repository: unknown;
  pullRequestNumber: unknown; targetBranch: string; previousBaseSha: unknown; bSha: unknown;
  mergeSha: unknown; targetSha: unknown; treeSha: unknown; mergedAt: string;
  authorityPath: string; authorityDigest: string; targetAuthorityDigest: string;
  assurance: 'canonical readback only; does not establish OWNER_AMENDMENT acceptance';
}>;
// Access views preserve original reads of external JSON. They supply no
// stable-value, protected-origin, eligibility or acceptance guarantee.
type PullRequestView = { number?: unknown; state?: unknown; merged?: unknown; merged_at?: unknown;
  merge_commit_sha?: unknown; base?: { ref?: unknown; repo?: { full_name?: { toLowerCase: () => unknown } | null } };
  head?: { sha?: unknown } };
type CommitView = { sha?: unknown; parents?: { sha?: unknown }[]; tree?: { sha?: unknown } };
type RefView = { ref?: unknown; object?: { type?: unknown; sha?: unknown } };
type ComparisonView = { status?: unknown; base_commit?: { sha?: unknown }; merge_base_commit?: { sha?: unknown } };

const HEX40 = /^[a-f0-9]{40}$/;
const HEX64 = /^[a-f0-9]{64}$/;
const REPOSITORY = /^[A-Za-z0-9][A-Za-z0-9-]{0,38}\/[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/;

function fail(message: string): never { throw new Error(`GitHub OWNER_AMENDMENT readback: ${message}`); }
function sha256(bytes: Buffer) { return createHash('sha256').update(bytes).digest('hex'); }

/**
 * Read-only post-merge verification for the self GitHub merge-commit profile.
 * This proves only the observed merge and canonical authority placement; it
 * does not evaluate evidence eligibility or claim OWNER_AMENDMENT acceptance.
 */
export async function verifyGitHubOwnerAmendmentReadback({ token, repository, targetBranch = 'main',
  pullRequestNumber, bSha, previousBaseSha, authorityPath, authorityDigest,
  fetchImpl = globalThis.fetch }: GitHubOwnerAmendmentReadbackOptions = {}): Promise<GitHubOwnerAmendmentReadbackResult> {
  if (typeof token !== 'string' || !token || token.length > 4_096 || /[\r\n]/.test(token) ||
      typeof fetchImpl !== 'function' || !REPOSITORY.test((repository ?? '') as string) ||
      !Number.isSafeInteger(pullRequestNumber) || (pullRequestNumber as number) < 1 ||
      !HEX40.test((bSha ?? '') as string) || !HEX40.test((previousBaseSha ?? '') as string) ||
      typeof targetBranch !== 'string' || !/^[A-Za-z0-9._/-]{1,128}$/.test(targetBranch) ||
      targetBranch.startsWith('refs/') || targetBranch.split('/').some(part => !part || part === '.' || part === '..') ||
      typeof authorityPath !== 'string' || authorityPath.length > 240 || authorityPath.startsWith('/') ||
      authorityPath.split('/').some(part => !part || part === '.' || part === '..') ||
      !HEX64.test((authorityDigest ?? '') as string)) fail('input identity is invalid.');

  const root = `https://api.github.com/repos/${repository}`;
  const headers: GitHubAuthorityFetchOptions['headers'] = { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}`,
    'X-GitHub-Api-Version': '2022-11-28' };
  const get = async (url: string): Promise<unknown> => {
    let response;
    try { response = await fetchImpl(url, { method: 'GET', headers, redirect: 'manual' }); }
    catch { fail('GitHub API request failed.'); }
    if (!response || response.status !== 200 || response.redirected || (response.url && response.url !== url)) {
      fail('GitHub API response is unavailable or redirected.');
    }
    try { return await response.json(); } catch { fail('GitHub API returned malformed JSON.'); }
  };
  const pr = await get(`${root}/pulls/${pullRequestNumber}`);
  if ((pr as PullRequestView).number !== pullRequestNumber || (pr as PullRequestView).state !== 'closed' || (pr as PullRequestView).merged !== true ||
      (pr as PullRequestView).base?.ref !== targetBranch || (pr as PullRequestView).base?.repo?.full_name?.toLowerCase() !== (repository as string).toLowerCase() ||
      (pr as PullRequestView).head?.sha !== bSha || !HEX40.test(((pr as PullRequestView).merge_commit_sha ?? '') as string) ||
      typeof (pr as PullRequestView).merged_at !== 'string' || !Number.isFinite(Date.parse((pr as PullRequestView).merged_at as string))) {
    fail('pull request is stale, unmerged, or does not identify the expected B and target.');
  }
  const mergeSha = (pr as PullRequestView).merge_commit_sha;
  const merge = await get(`${root}/git/commits/${mergeSha}`);
  if ((merge as CommitView).sha !== mergeSha || !Array.isArray((merge as CommitView).parents) || ((merge as CommitView).parents as { sha?: unknown }[]).length !== 2 ||
      ((merge as CommitView).parents as { sha?: unknown }[])[0]?.sha !== previousBaseSha || ((merge as CommitView).parents as { sha?: unknown }[])[1]?.sha !== bSha) {
    fail('PR did not produce a two-parent merge commit with the expected previous base and exact B.');
  }
  const bCommit = await get(`${root}/git/commits/${bSha}`);
  if ((bCommit as CommitView).sha !== bSha || !HEX40.test(((bCommit as CommitView).tree?.sha ?? '') as string) || !HEX40.test(((merge as CommitView).tree?.sha ?? '') as string) ||
      ((bCommit as CommitView).tree as { sha?: unknown }).sha !== ((merge as CommitView).tree as { sha?: unknown }).sha) {
    fail('PR merge commit tree differs from exact B tree.');
  }

  const targetRef = await get(`${root}/git/ref/heads/${targetBranch}`);
  const targetSha = (targetRef as RefView).object?.sha;
  if ((targetRef as RefView).ref !== `refs/heads/${targetBranch}` || (targetRef as RefView).object?.type !== 'commit' || !HEX40.test((targetSha ?? '') as string)) {
    fail('current target ref is unavailable or invalid.');
  }
  // Compare immutable SHAs; the commits array may be truncated and the API
  // response does not include head_commit on every GitHub version.
  const comparison = await get(`${root}/compare/${mergeSha}...${targetSha}`);
  if ((comparison as ComparisonView).status !== 'ahead' && (comparison as ComparisonView).status !== 'identical') {
    fail('PR merge commit is not in the current target branch ancestry.');
  }
  if ((comparison as ComparisonView).base_commit?.sha !== mergeSha || (comparison as ComparisonView).merge_base_commit?.sha !== mergeSha) {
    fail('GitHub comparison does not prove the PR merge commit is an ancestor of current target.');
  }

  const readAuthority = createGitHubAuthoritySource({ token, fetchImpl });
  let atMerge;
  let atTarget;
  try {
    [atMerge, atTarget] = await Promise.all([
      readAuthority({ repository, revision: mergeSha, path: authorityPath, maxBytes: 1024 * 1024 }),
      readAuthority({ repository, revision: targetSha, path: authorityPath, maxBytes: 1024 * 1024 }),
    ]);
  } catch { fail('canonical authority bytes could not be read from both immutable commits.'); }
  const mergeDigest = sha256(atMerge.content);
  const targetDigest = sha256(atTarget.content);
  if (mergeDigest !== authorityDigest || targetDigest !== authorityDigest) {
    fail('authority bytes at the merge commit or current target differ from the expected digest.');
  }
  const finalTargetRef = await get(`${root}/git/ref/heads/${targetBranch}`);
  if ((finalTargetRef as RefView).ref !== `refs/heads/${targetBranch}` || (finalTargetRef as RefView).object?.type !== 'commit' ||
      (finalTargetRef as RefView).object?.sha !== targetSha) fail('current target ref moved during canonical readback.');
  return Object.freeze({ status: 'VERIFIED_OWNER_AMENDMENT_CANONICAL_READBACK',
    repository, pullRequestNumber, targetBranch, previousBaseSha, bSha, mergeSha, targetSha,
    treeSha: ((merge as CommitView).tree as { sha?: unknown }).sha,
    mergedAt: new Date(Date.parse((pr as PullRequestView).merged_at as string)).toISOString(), authorityPath,
    authorityDigest: mergeDigest, targetAuthorityDigest: targetDigest,
    assurance: 'canonical readback only; does not establish OWNER_AMENDMENT acceptance' });
}
