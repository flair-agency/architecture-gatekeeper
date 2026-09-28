import { createHash } from 'node:crypto';
import { createGitHubAuthoritySource } from './github-authority-source.mjs';

const HEX40 = /^[a-f0-9]{40}$/;
const HEX64 = /^[a-f0-9]{64}$/;
const REPOSITORY = /^[A-Za-z0-9][A-Za-z0-9-]{0,38}\/[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/;

function fail(message) { throw new Error(`GitHub OWNER_AMENDMENT readback: ${message}`); }
function sha256(bytes) { return createHash('sha256').update(bytes).digest('hex'); }

/**
 * Read-only post-merge verification for the self GitHub merge-commit profile.
 * This proves only the observed merge and canonical authority placement; it
 * does not evaluate evidence eligibility or claim OWNER_AMENDMENT acceptance.
 */
export async function verifyGitHubOwnerAmendmentReadback({ token, repository, targetBranch = 'main',
  pullRequestNumber, bSha, previousBaseSha, authorityPath, authorityDigest,
  fetchImpl = globalThis.fetch } = {}) {
  if (typeof token !== 'string' || !token || token.length > 4_096 || /[\r\n]/.test(token) ||
      typeof fetchImpl !== 'function' || !REPOSITORY.test(repository ?? '') ||
      !Number.isSafeInteger(pullRequestNumber) || pullRequestNumber < 1 ||
      !HEX40.test(bSha ?? '') || !HEX40.test(previousBaseSha ?? '') ||
      typeof targetBranch !== 'string' || !/^[A-Za-z0-9._/-]{1,128}$/.test(targetBranch) ||
      targetBranch.startsWith('refs/') || targetBranch.split('/').some(part => !part || part === '.' || part === '..') ||
      typeof authorityPath !== 'string' || authorityPath.length > 240 || authorityPath.startsWith('/') ||
      authorityPath.split('/').some(part => !part || part === '.' || part === '..') ||
      !HEX64.test(authorityDigest ?? '')) fail('input identity is invalid.');

  const root = `https://api.github.com/repos/${repository}`;
  const headers = { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}`,
    'X-GitHub-Api-Version': '2022-11-28' };
  const get = async url => {
    let response;
    try { response = await fetchImpl(url, { method: 'GET', headers, redirect: 'manual' }); }
    catch { fail('GitHub API request failed.'); }
    if (!response || response.status !== 200 || response.redirected || (response.url && response.url !== url)) {
      fail('GitHub API response is unavailable or redirected.');
    }
    try { return await response.json(); } catch { fail('GitHub API returned malformed JSON.'); }
  };
  const pr = await get(`${root}/pulls/${pullRequestNumber}`);
  if (pr.number !== pullRequestNumber || pr.state !== 'closed' || pr.merged !== true ||
      pr.base?.ref !== targetBranch || pr.base?.repo?.full_name?.toLowerCase() !== repository.toLowerCase() ||
      pr.head?.sha !== bSha || !HEX40.test(pr.merge_commit_sha ?? '') ||
      typeof pr.merged_at !== 'string' || !Number.isFinite(Date.parse(pr.merged_at))) {
    fail('pull request is stale, unmerged, or does not identify the expected B and target.');
  }
  const mergeSha = pr.merge_commit_sha;
  const merge = await get(`${root}/git/commits/${mergeSha}`);
  if (merge.sha !== mergeSha || !Array.isArray(merge.parents) || merge.parents.length !== 2 ||
      merge.parents[0]?.sha !== previousBaseSha || merge.parents[1]?.sha !== bSha) {
    fail('PR did not produce a two-parent merge commit with the expected previous base and exact B.');
  }

  const targetRef = await get(`${root}/git/ref/heads/${targetBranch}`);
  const targetSha = targetRef.object?.sha;
  if (targetRef.ref !== `refs/heads/${targetBranch}` || targetRef.object?.type !== 'commit' || !HEX40.test(targetSha ?? '')) {
    fail('current target ref is unavailable or invalid.');
  }
  // Compare immutable SHAs; the commits array may be truncated and the API
  // response does not include head_commit on every GitHub version.
  const comparison = await get(`${root}/compare/${mergeSha}...${targetSha}`);
  if (comparison.status !== 'ahead' && comparison.status !== 'identical') {
    fail('PR merge commit is not in the current target branch ancestry.');
  }
  if (comparison.base_commit?.sha !== mergeSha || comparison.merge_base_commit?.sha !== mergeSha) {
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
  if (finalTargetRef.ref !== `refs/heads/${targetBranch}` || finalTargetRef.object?.type !== 'commit' ||
      finalTargetRef.object?.sha !== targetSha) fail('current target ref moved during canonical readback.');
  return Object.freeze({ status: 'VERIFIED_OWNER_AMENDMENT_CANONICAL_READBACK',
    repository, pullRequestNumber, targetBranch, previousBaseSha, bSha, mergeSha, targetSha,
    mergedAt: new Date(Date.parse(pr.merged_at)).toISOString(), authorityPath,
    authorityDigest: mergeDigest, targetAuthorityDigest: targetDigest,
    assurance: 'canonical readback only; does not establish OWNER_AMENDMENT acceptance' });
}
