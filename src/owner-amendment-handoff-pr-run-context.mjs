// Select GitHub's authenticated PR and workflow-run metadata for an
// OWNER_AMENDMENT handoff. This is context only; later layers must verify the
// protected Git objects, evidence, and eligibility independently.
import { matchesGitHubAssociatedRepository } from './github-associated-repository.mjs';
const REPOSITORY = /^[A-Za-z0-9][A-Za-z0-9-]*\/[A-Za-z0-9][A-Za-z0-9._-]*$/;
const SHA = /^[a-f0-9]{40}$/;
const SELF_WORKFLOW_PATH = '.github/workflows/self-architecture-gate.yml';
const KEYS = ['repository', 'bPrNumber', 'aPrNumber', 'runId', 'runAttempt'];

const fail = message => { throw new Error(`Owner amendment handoff PR/run context: ${message}`); };
const positiveId = value => (typeof value === 'string' && /^[1-9]\d*$/.test(value)) ||
  (Number.isSafeInteger(value) && value > 0);
const repoName = repo => typeof repo?.full_name === 'string' ? repo.full_name : undefined;
const repoId = repo => Number.isSafeInteger(repo?.id) && repo.id > 0 ? repo.id : undefined;

function validateInput(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input) ||
      Object.keys(input).sort().join(',') !== [...KEYS].sort().join(',')) {
    fail('trusted repository, PR numbers, and run identity are incomplete or contain unknown fields.');
  }
  if (!REPOSITORY.test(input.repository) || !positiveId(input.bPrNumber) || !positiveId(input.aPrNumber) ||
      !positiveId(input.runId) || !positiveId(input.runAttempt) ||
      String(input.bPrNumber) === String(input.aPrNumber)) {
    fail('trusted repository, PR numbers, or run identity are invalid.');
  }
  return input;
}

function validatePullRequest(pr, { repository, number, label, requireOpen }) {
  if (String(pr?.number) !== String(number) ||
      (requireOpen && (pr.state !== 'open' || pr.draft !== false)) ||
      (!requireOpen && (pr.merged !== false || pr.merged_at !== null)) ||
      repoName(pr.base?.repo) !== repository || pr.base?.ref !== 'main' ||
      repoName(pr.head?.repo) !== repository ||
      !SHA.test(pr.base?.sha) || !SHA.test(pr.head?.sha) ||
      repoId(pr.base?.repo) === undefined || repoId(pr.head?.repo) === undefined ||
      repoId(pr.base.repo) !== repoId(pr.head.repo)) {
    fail(`${label} PR is not the expected same-repository main-base pull request.`);
  }
  return pr;
}

function validateRun(run, { repository, runId, runAttempt, aPrNumber, aHeadSha, baseSha, repositoryId }) {
  const workflowPath = typeof run?.path === 'string' ? run.path.split('@', 1)[0] : undefined;
  // pull_request_target run metadata can name either the protected base or the
  // exact A head. The separately selected PR and later ReviewRecord/artifact
  // checks bind A; run.head_sha alone is not evidence of that binding.
  const runHeadIsExactPullRequestEvent = run?.head_sha === aHeadSha || run?.head_sha === baseSha;
  const pullRequests = run?.pull_requests;
  const exactAssociatedPullRequests = Array.isArray(pullRequests) ? pullRequests.filter(pr =>
    String(pr?.number) === String(aPrNumber) && pr?.base?.ref === 'main' && pr?.base?.sha === baseSha &&
    matchesGitHubAssociatedRepository(pr?.base?.repo, { repository, repositoryId }) && pr?.head?.sha === aHeadSha &&
    matchesGitHubAssociatedRepository(pr?.head?.repo, { repository, repositoryId })) : [];
  if (String(run?.id) !== String(runId) || String(run.run_attempt) !== String(runAttempt) ||
      run.status !== 'completed' || run.event !== 'pull_request_target' ||
      repoName(run.repository) !== repository || repoName(run.head_repository) !== repository ||
      repoId(run.repository) !== repositoryId || repoId(run.head_repository) !== repositoryId ||
      !runHeadIsExactPullRequestEvent || !Array.isArray(pullRequests) ||
      (pullRequests.length > 0 && (pullRequests.length !== 1 || exactAssociatedPullRequests.length !== 1)) ||
      workflowPath !== SELF_WORKFLOW_PATH) {
    fail('workflow run does not match the exact completed self pull_request_target attempt, protected base/A head and PR association.');
  }
  return { workflowPath, headSha: run.head_sha, repositoryId: repoId(run.repository) };
}

/**
 * Fetch and validate the open B PR, the A PR, and one exact Actions run
 * attempt. GitHub can return an empty `pull_requests` list for
 * pull_request_target runs, so an empty list is tolerated; a non-empty list
 * must contain exactly the selected A PR. Later artifact and ReviewRecord
 * checks still bind the selected evidence to A's exact head and run attempt.
 *
 * The returned context is metadata only. It does not establish B eligibility,
 * evidence validity, or acceptance; callers must cross-check it against the
 * protected Git objects and the selected evidence.
 */
export async function selectOwnerAmendmentHandoffPrRunContext({ input, token, fetchImpl = fetch }) {
  try {
    input = validateInput(input);
    if (typeof token !== 'string' || token.length === 0) fail('GitHub API token is required.');
    if (typeof fetchImpl !== 'function') fail('authenticated fetch helper is required.');

    const [owner, name] = input.repository.split('/');
    const repoPath = `${encodeURIComponent(owner)}/${encodeURIComponent(name)}`;
    const api = 'https://api.github.com';
    const headers = { accept: 'application/vnd.github+json', authorization: `Bearer ${token}`,
      'x-github-api-version': '2022-11-28' };
    const getJson = async path => {
      const response = await fetchImpl(`${api}${path}`, { headers, redirect: 'error' });
      if (!response?.ok) fail(`GitHub API request failed (${response?.status ?? 'no response'}).`);
      return response.json();
    };

    const [bPr, aPr, run] = await Promise.all([
      getJson(`/repos/${repoPath}/pulls/${encodeURIComponent(String(input.bPrNumber))}`),
      getJson(`/repos/${repoPath}/pulls/${encodeURIComponent(String(input.aPrNumber))}`),
      getJson(`/repos/${repoPath}/actions/runs/${encodeURIComponent(String(input.runId))}/attempts/${encodeURIComponent(String(input.runAttempt))}`),
    ]);
    validatePullRequest(bPr, { repository: input.repository, number: input.bPrNumber, label: 'B', requireOpen: true });
    validatePullRequest(aPr, { repository: input.repository, number: input.aPrNumber, label: 'A', requireOpen: false });

    const repositoryId = repoId(bPr.base.repo);
    if (repoId(aPr.base.repo) !== repositoryId || bPr.base.sha !== aPr.base.sha) {
      fail('A and B are not based on the same repository revision.');
    }
    const runContext = validateRun(run, { repository: input.repository, runId: input.runId,
      runAttempt: input.runAttempt, aPrNumber: input.aPrNumber, aHeadSha: aPr.head.sha,
      baseSha: aPr.base.sha, repositoryId });

    return Object.freeze({ status: 'SELECTED_OWNER_AMENDMENT_HANDOFF_PR_RUN_CONTEXT',
      repository: input.repository, repositoryId, baseSha: bPr.base.sha,
      bPrNumber: String(input.bPrNumber), bHeadSha: bPr.head.sha,
      aPrNumber: String(input.aPrNumber), aHeadSha: aPr.head.sha,
      runId: String(input.runId), runAttempt: String(input.runAttempt),
      workflowPath: runContext.workflowPath, runHeadSha: runContext.headSha,
      runRepositoryId: runContext.repositoryId });
  } catch (error) {
    return Object.freeze({ status: 'INCOMPLETE', reason: error.message });
  }
}
