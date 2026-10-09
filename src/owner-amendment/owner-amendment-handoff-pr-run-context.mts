// Select GitHub's authenticated PR and workflow-run metadata for an
// OWNER_AMENDMENT handoff. This is context only; later layers must verify the
// protected Git objects, evidence, and eligibility independently.
import { matchesGitHubAssociatedRepository } from '../github-associated-repository.mjs';

export type OwnerAmendmentHandoffPrRunContext = Readonly<{
  status: 'SELECTED_OWNER_AMENDMENT_HANDOFF_PR_RUN_CONTEXT';
  repository: unknown;
  repositoryId: unknown;
  baseSha: unknown;
  bPrNumber: string;
  bHeadSha: unknown;
  aPrNumber: string;
  aHeadSha: unknown;
  runId: string;
  runAttempt: string;
  workflowPath: string;
  runHeadSha: unknown;
  runRepositoryId: unknown;
}>;

export type OwnerAmendmentHandoffPrRunContextResult = OwnerAmendmentHandoffPrRunContext |
  Readonly<{ status: 'INCOMPLETE'; reason: unknown; } & { [K in Exclude<keyof OwnerAmendmentHandoffPrRunContext, 'status'>]?: never }>;

export type Awaitable<T> = T | PromiseLike<T>;
export type OwnerAmendmentHandoffPrRunContextResponse = { ok?: unknown; status?: unknown; json: () => Awaitable<unknown> };
export type OwnerAmendmentHandoffPrRunContextInput = Readonly<{
  input: unknown;
  token: unknown;
  fetchImpl?: (url: string, options: { headers: Record<string, string>; redirect: 'error' }) =>
    Awaitable<OwnerAmendmentHandoffPrRunContextResponse>;
}>;

const REPOSITORY = /^[A-Za-z0-9][A-Za-z0-9-]*\/[A-Za-z0-9][A-Za-z0-9._-]*$/;
const SHA = /^[a-f0-9]{40}$/;
const SELF_WORKFLOW_PATH = '.github/workflows/self-architecture-gate.yml';
const KEYS = ['repository', 'bPrNumber', 'aPrNumber', 'runId', 'runAttempt'];

const fail: (message: string) => never = message => { throw new Error(`Owner amendment handoff PR/run context: ${message}`); };
const positiveId = (value: unknown) => (typeof value === 'string' && /^[1-9]\d*$/.test(value)) ||
  (Number.isSafeInteger(value) && (value as number) > 0);
// Access views preserve existing reads; their assertions do not validate provenance or stable values.
type RepoView = { full_name?: unknown; id?: unknown };
type InputView = { repository: unknown; bPrNumber: unknown; aPrNumber: unknown; runId: unknown; runAttempt: unknown };
type PullRequestView = { number: unknown; state: unknown; draft: unknown; merged: unknown; merged_at: unknown; base: { repo: RepoView; ref: unknown; sha: unknown }; head: { repo: RepoView; sha: unknown } };
type RunView = { path: unknown; head_sha: unknown; pull_requests: unknown; id: unknown; run_attempt: unknown; status: unknown; event: unknown; repository: RepoView; head_repository: RepoView };
type RunSelectors = { repository: unknown; runId: unknown; runAttempt: unknown; aPrNumber: unknown; aHeadSha: unknown; baseSha: unknown; repositoryId: unknown };
const repoName = (repo: RepoView | null | undefined) => typeof repo?.full_name === 'string' ? repo.full_name : undefined;
const repoId = (repo: RepoView | null | undefined) => Number.isSafeInteger(repo?.id) && ((repo as RepoView).id as number) > 0 ? (repo as RepoView).id : undefined;

function validateInput(input: unknown) {
  if (!input || typeof input !== 'object' || Array.isArray(input) ||
      Object.keys(input).sort().join(',') !== [...KEYS].sort().join(',')) {
    fail('trusted repository, PR numbers, and run identity are incomplete or contain unknown fields.');
  }
  if (!REPOSITORY.test((input as InputView).repository as string) || !positiveId((input as InputView).bPrNumber) || !positiveId((input as InputView).aPrNumber) ||
      !positiveId((input as InputView).runId) || !positiveId((input as InputView).runAttempt) ||
      String((input as InputView).bPrNumber) === String((input as InputView).aPrNumber)) {
    fail('trusted repository, PR numbers, or run identity are invalid.');
  }
  return input;
}

function validatePullRequest(pr: PullRequestView, { repository, number, label, requireOpen }: { repository: unknown; number: unknown; label: string; requireOpen: boolean }) {
  if (String(pr?.number) !== String(number) ||
      (requireOpen && (pr.state !== 'open' || pr.draft !== false)) ||
      (!requireOpen && (pr.merged !== false || pr.merged_at !== null)) ||
      repoName(pr.base?.repo) !== repository || pr.base?.ref !== 'main' ||
      repoName(pr.head?.repo) !== repository ||
      !SHA.test(pr.base?.sha as string) || !SHA.test(pr.head?.sha as string) ||
      repoId(pr.base?.repo) === undefined || repoId(pr.head?.repo) === undefined ||
      repoId(pr.base.repo) !== repoId(pr.head.repo)) {
    fail(`${label} PR is not the expected same-repository main-base pull request.`);
  }
  return pr;
}

function validateRun(run: RunView, { repository, runId, runAttempt, aPrNumber, aHeadSha, baseSha, repositoryId }: RunSelectors) {
  const workflowPath = typeof run?.path === 'string' ? run.path.split('@', 1)[0] : undefined;
  // pull_request_target run metadata can name either the protected base or the
  // exact A head. The separately selected PR and later ReviewRecord/artifact
  // checks bind A; run.head_sha alone is not evidence of that binding.
  const runHeadIsExactPullRequestEvent = run?.head_sha === aHeadSha || run?.head_sha === baseSha;
  const pullRequests = run?.pull_requests;
  const exactAssociatedPullRequests = Array.isArray(pullRequests) ? pullRequests.filter((pr: PullRequestView) =>
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
export async function selectOwnerAmendmentHandoffPrRunContext(
  { input, token, fetchImpl = fetch }: OwnerAmendmentHandoffPrRunContextInput,
): Promise<OwnerAmendmentHandoffPrRunContextResult> {
  try {
    input = validateInput(input);
    if (typeof token !== 'string' || token.length === 0) fail('GitHub API token is required.');
    if (typeof fetchImpl !== 'function') fail('authenticated fetch helper is required.');

    const [owner, name] = ((input as InputView).repository as string).split('/');
    const repoPath = `${encodeURIComponent(owner)}/${encodeURIComponent(name)}`;
    const api = 'https://api.github.com';
    const headers = { accept: 'application/vnd.github+json', authorization: `Bearer ${token}`,
      'x-github-api-version': '2022-11-28' };
    const getJson = async (path: string): Promise<unknown> => {
      const response = await (fetchImpl as NonNullable<typeof fetchImpl>)(`${api}${path}`, { headers, redirect: 'error' });
      if (!response?.ok) fail(`GitHub API request failed (${response?.status ?? 'no response'}).`);
      return response.json();
    };

    const [bPr, aPr, run] = await Promise.all([
      getJson(`/repos/${repoPath}/pulls/${encodeURIComponent(String((input as InputView).bPrNumber))}`),
      getJson(`/repos/${repoPath}/pulls/${encodeURIComponent(String((input as InputView).aPrNumber))}`),
      getJson(`/repos/${repoPath}/actions/runs/${encodeURIComponent(String((input as InputView).runId))}/attempts/${encodeURIComponent(String((input as InputView).runAttempt))}`),
    ]);
    validatePullRequest(bPr as PullRequestView, { repository: (input as InputView).repository, number: (input as InputView).bPrNumber, label: 'B', requireOpen: true });
    validatePullRequest(aPr as PullRequestView, { repository: (input as InputView).repository, number: (input as InputView).aPrNumber, label: 'A', requireOpen: false });

    const repositoryId = repoId((bPr as PullRequestView).base.repo);
    if (repoId((aPr as PullRequestView).base.repo) !== repositoryId || (bPr as PullRequestView).base.sha !== (aPr as PullRequestView).base.sha) {
      fail('A and B are not based on the same repository revision.');
    }
    const runContext = validateRun(run as RunView, { repository: (input as InputView).repository, runId: (input as InputView).runId,
      runAttempt: (input as InputView).runAttempt, aPrNumber: (input as InputView).aPrNumber, aHeadSha: (aPr as PullRequestView).head.sha,
      baseSha: (aPr as PullRequestView).base.sha, repositoryId });

    return Object.freeze({ status: 'SELECTED_OWNER_AMENDMENT_HANDOFF_PR_RUN_CONTEXT',
      repository: (input as InputView).repository, repositoryId, baseSha: (bPr as PullRequestView).base.sha,
      bPrNumber: String((input as InputView).bPrNumber), bHeadSha: (bPr as PullRequestView).head.sha,
      aPrNumber: String((input as InputView).aPrNumber), aHeadSha: (aPr as PullRequestView).head.sha,
      runId: String((input as InputView).runId), runAttempt: String((input as InputView).runAttempt),
      workflowPath: runContext.workflowPath, runHeadSha: runContext.headSha,
      runRepositoryId: runContext.repositoryId });
  } catch (error) {
    return Object.freeze({ status: 'INCOMPLETE', reason: (error as { message: unknown }).message });
  }
}
