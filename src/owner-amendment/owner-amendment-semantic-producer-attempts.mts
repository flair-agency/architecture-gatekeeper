import { matchesGitHubAssociatedRepository } from '../github-associated-repository.mjs';

const SELF_REPOSITORY = 'flair-agency/architecture-gatekeeper';
const WORKFLOW_PATH = /^\.github\/workflows\/self-architecture-gate\.yml(?:@(?:refs\/heads\/main|main))?$/;
const SHA1 = /^[a-f0-9]{40}$/;
const PAGE_SIZE = 100;
const MAX_RUN_PAGES = 10;
const MAX_ATTEMPT_LOOKUPS = 1_000;
const MAX_JOB_PAGES = 10;
const MAX_TOTAL_JOB_PAGES = 1_000;
const fail: (message: unknown) => never = message => { throw new Error(`OWNER_AMENDMENT semantic producer attempts: ${message}`); };

type Awaitable<T> = T | PromiseLike<T>;
type RepositoryView = { full_name?: unknown; id?: unknown };
type PullRequestView = { number?: unknown; base?: { ref?: unknown; sha?: unknown; repo?: RepositoryView };
  head?: { sha?: unknown; repo?: RepositoryView } };
type RunView = { id?: unknown; run_attempt?: unknown; created_at?: unknown; repository?: RepositoryView;
  head_repository?: RepositoryView; event?: unknown; head_sha?: unknown; pull_requests?: unknown;
  path?: unknown };
type WorkflowRunsResponseView = { total_count?: unknown; workflow_runs?: unknown };
type JobView = { id?: unknown; name?: unknown; run_id?: unknown; run_attempt?: unknown; head_sha?: unknown;
  status?: unknown; conclusion?: unknown; started_at?: unknown; completed_at?: unknown };
type JobsResponseView = { total_count?: unknown; jobs?: unknown };
type Candidate = { run: unknown; runAttemptCount: number; associationAmbiguous: boolean; createdAtMs: number };
type SignerAttemptSortView = { run: unknown; runAttempt: string; startedAtMs: number; completedAtSort: number };
export type OwnerAmendmentSemanticSignerAttempt = Readonly<{
  run: unknown; runAttempt: string; job: unknown; startedAtMs: number;
  completedAtMs: number | null; completedAtSort: number;
}>;
export type OwnerAmendmentSemanticProducerAttemptsResult = Readonly<{
  attempts: readonly OwnerAmendmentSemanticSignerAttempt[];
  latestSignerAttempt: OwnerAmendmentSemanticSignerAttempt | null;
  hasSuccessfulSignerBeforeQueue: boolean;
  hasAmbiguousSuccessfulSignerBeforeQueue: boolean;
}>;

type ListRunsInput = Readonly<{
  repository: typeof SELF_REPOSITORY; bBaseSha: unknown; createdFrom: string; createdTo: string;
  page: number; perPage: number;
}>;
type ListJobsInput = Readonly<{
  repository: typeof SELF_REPOSITORY; runId: unknown; runAttempt: string; page: number; perPage: number;
}>;
export type OwnerAmendmentSemanticProducerAttemptsInput = Readonly<{
  repository: unknown; bBaseSha: unknown; bHeadSha: unknown;
  bPullRequestCreatedAt: unknown; queueEnteredAt: unknown;
  listRuns: (input: ListRunsInput) => Awaitable<unknown>;
  listJobs: (input: ListJobsInput) => Awaitable<unknown>;
}>;

function time(value: unknown, label: string): number {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) fail(`${label} is invalid.`);
  return Date.parse(value);
}

function searchDateTime(milliseconds: number): string {
  return new Date(milliseconds).toISOString().replace(/\.000Z$/, 'Z');
}

function compareSignerAttempts(left: SignerAttemptSortView, right: SignerAttemptSortView): number {
  return right.startedAtMs - left.startedAtMs || right.completedAtSort - left.completedAtSort ||
    ((right.run as RunView).id as number) - ((left.run as RunView).id as number) || Number(right.runAttempt) - Number(left.runAttempt);
}

function completePullRequestAssociation(pr: unknown, repositoryId: unknown): boolean {
  return Number.isSafeInteger((pr as PullRequestView | null | undefined)?.number) && ((pr as PullRequestView).number as number) > 0 &&
    typeof (pr as PullRequestView | null | undefined)?.base?.ref === 'string' && typeof (pr as PullRequestView).base!.sha === 'string' && SHA1.test((pr as PullRequestView).base!.sha as string) &&
    (typeof (pr as PullRequestView).base!.repo?.full_name === 'string' || matchesGitHubAssociatedRepository((pr as PullRequestView).base!.repo,
      { repository: SELF_REPOSITORY, repositoryId })) && typeof (pr as PullRequestView | null | undefined)?.head?.sha === 'string' && SHA1.test((pr as PullRequestView).head!.sha as string) &&
    (typeof (pr as PullRequestView).head!.repo?.full_name === 'string' || matchesGitHubAssociatedRepository((pr as PullRequestView).head!.repo,
      { repository: SELF_REPOSITORY, repositoryId }));
}

/** Refuse to treat a missing tag as ordinary when a protected signer ran before queue entry. */
export function assertMissingOwnerAmendmentTagHasNoSuccessfulSigner(attempts: unknown): void {
  if (!attempts || typeof attempts !== 'object') fail('protected producer attempts are unavailable.');
  if ((attempts as { hasSuccessfulSignerBeforeQueue?: unknown }).hasSuccessfulSignerBeforeQueue) {
    fail('exact B has a successful pre-queue semantic eligibility signer result but no protected amendment tag.');
  }
  if ((attempts as { hasAmbiguousSuccessfulSignerBeforeQueue?: unknown }).hasAmbiguousSuccessfulSignerBeforeQueue) {
    fail('a protected-base semantic eligibility signer completed before queue entry without a unique exact pull-request association, and no protected amendment tag exists.');
  }
}

/**
 * Inspect exact-B protected-base workflow attempts once for both tag absence
 * classification and eligibility artifact selection. Successful signers with
 * unavailable PR association are tracked separately and never select evidence.
 */
export function inspectOwnerAmendmentSemanticProducerAttempts(
  input: OwnerAmendmentSemanticProducerAttemptsInput,
): Promise<OwnerAmendmentSemanticProducerAttemptsResult>;
export async function inspectOwnerAmendmentSemanticProducerAttempts({ repository, bBaseSha, bHeadSha,
  bPullRequestCreatedAt, queueEnteredAt, listRuns, listJobs }: OwnerAmendmentSemanticProducerAttemptsInput = {} as OwnerAmendmentSemanticProducerAttemptsInput): Promise<OwnerAmendmentSemanticProducerAttemptsResult> {
  if (repository !== SELF_REPOSITORY || !SHA1.test((bBaseSha ?? '') as string) || !SHA1.test((bHeadSha ?? '') as string) || bBaseSha === bHeadSha ||
      typeof listRuns !== 'function' || typeof listJobs !== 'function') {
    fail('protected repository, exact B SHA, and trusted run/job readers are required.');
  }
  const pullRequestCreatedAtMs = time(bPullRequestCreatedAt, 'exact B pull-request creation time');
  const queueEnteredAtMs = time(queueEnteredAt, 'merge queue entry time');
  if (pullRequestCreatedAtMs > queueEnteredAtMs) fail('exact B pull request was created after merge queue entry.');
  // GitHub's workflow-runs endpoint caps filtered searches at 1,000. Treat a
  // count at that boundary as potentially truncated rather than complete.
  const maxRunResults = MAX_RUN_PAGES * PAGE_SIZE;
  const createdFrom = searchDateTime(Math.floor(pullRequestCreatedAtMs / 1_000) * 1_000);
  const createdTo = searchDateTime(Math.ceil(queueEnteredAtMs / 1_000) * 1_000);
  const runs: unknown[] = [];
  const seenRunIds = new Set<unknown>();
  let totalCount: unknown;
  for (let page = 1; page <= MAX_RUN_PAGES; page++) {
    const response = await listRuns({ repository, bBaseSha, createdFrom, createdTo, page, perPage: PAGE_SIZE });
    if (!response || !Number.isSafeInteger((response as WorkflowRunsResponseView).total_count) || ((response as WorkflowRunsResponseView).total_count as number) < 0 ||
        !Array.isArray((response as WorkflowRunsResponseView).workflow_runs) || ((response as WorkflowRunsResponseView).workflow_runs as unknown[]).length > PAGE_SIZE) {
      fail('protected producer workflow run listing is malformed or oversized.');
    }
    if ((response as WorkflowRunsResponseView).total_count as number >= maxRunResults) {
      fail('protected producer workflow run search reaches the 1,000-result completeness limit.');
    }
    if (totalCount === undefined) totalCount = (response as WorkflowRunsResponseView).total_count;
    else if ((response as WorkflowRunsResponseView).total_count !== totalCount) fail('protected producer workflow run count changed during pagination.');
    for (const run of (response as WorkflowRunsResponseView).workflow_runs as unknown[]) {
      if (!Number.isSafeInteger((run as RunView | null | undefined)?.id) || ((run as RunView).id as number) < 1 || seenRunIds.has((run as RunView).id)) {
        fail('protected producer workflow pagination contains an invalid or duplicate run ID.');
      }
      seenRunIds.add((run as RunView).id);
      runs.push(run);
    }
    if (runs.length === totalCount) break;
    if (runs.length > (totalCount as number) || ((response as WorkflowRunsResponseView).workflow_runs as unknown[]).length < PAGE_SIZE) {
      fail('protected producer workflow run listing is truncated or inconsistent.');
    }
    if (page === MAX_RUN_PAGES) fail('protected producer workflow run listing exceeds the bounded pagination limit.');
  }
  if (runs.length !== totalCount) fail('protected producer workflow run listing is incomplete.');
  const candidates: Candidate[] = [];
  for (const run of runs) {
    if ((run as RunView | null | undefined)?.repository?.full_name !== SELF_REPOSITORY || (run as RunView | null | undefined)?.head_repository?.full_name !== SELF_REPOSITORY ||
        (run as RunView | null | undefined)?.event !== 'pull_request_target' || !WORKFLOW_PATH.test(((run as RunView | null | undefined)?.path ?? '') as string) ||
        (run as RunView | null | undefined)?.head_sha !== bBaseSha) continue;
    const runCreatedAtMs = time((run as RunView).created_at, 'producer workflow creation time');
    if (runCreatedAtMs < pullRequestCreatedAtMs || runCreatedAtMs > queueEnteredAtMs) continue;
    const associations = (run as RunView).pull_requests;
    if (associations != null && !Array.isArray(associations)) {
      fail('protected producer pull-request association is malformed.');
    }
    const exactPullRequests = Array.isArray(associations) ? (associations as unknown[]).filter((pr: unknown) =>
      (pr as PullRequestView | null | undefined)?.base?.ref === 'main' &&
      (pr as PullRequestView | null | undefined)?.base?.sha === bBaseSha && matchesGitHubAssociatedRepository((pr as PullRequestView | null | undefined)?.base?.repo,
        { repository: SELF_REPOSITORY, repositoryId: (run as RunView).repository?.id }) && (pr as PullRequestView | null | undefined)?.head?.sha === bHeadSha &&
      matchesGitHubAssociatedRepository((pr as PullRequestView | null | undefined)?.head?.repo, { repository: SELF_REPOSITORY, repositoryId: (run as RunView).repository?.id })) : [];
    const exact = exactPullRequests.length === 1;
    const unavailableAssociation = associations == null || (Array.isArray(associations) && (associations as unknown[]).length === 0) ||
      (Array.isArray(associations) && (associations as unknown[]).some((pr: unknown) => !completePullRequestAssociation(pr, (run as RunView).repository?.id)));
    const ambiguous = !exact && (exactPullRequests.length > 1 || ((run as RunView).head_sha === bBaseSha && unavailableAssociation));
    if (!exact && !ambiguous) continue;
    const runAttemptCount = Number((run as RunView).run_attempt);
    if (!Number.isSafeInteger((run as RunView).id) || ((run as RunView).id as number) < 1 || !Number.isSafeInteger(runAttemptCount) || runAttemptCount < 1) {
      fail('protected producer workflow run identity is malformed.');
    }
    candidates.push({ run, runAttemptCount, associationAmbiguous: ambiguous, createdAtMs: runCreatedAtMs });
  }
  candidates.sort((left, right) => right.createdAtMs - left.createdAtMs || ((right.run as RunView).id as number) - ((left.run as RunView).id as number));
  const attemptLookupCount = candidates.reduce((sum, candidate) => sum + candidate.runAttemptCount, 0);
  if (attemptLookupCount > MAX_ATTEMPT_LOOKUPS) fail('protected producer run attempts exceed the bounded inspection limit.');

  const signerAttempts: OwnerAmendmentSemanticSignerAttempt[] = [];
  let hasSuccessfulSignerBeforeQueue = false;
  let hasAmbiguousSuccessfulSignerBeforeQueue = false;
  let jobPageLookups = 0;
  for (const { run, runAttemptCount, associationAmbiguous } of candidates) {
    for (let runAttempt = runAttemptCount; runAttempt >= 1; runAttempt--) {
      const jobs: unknown[] = [];
      const seenJobIds = new Set<unknown>();
      let jobTotalCount: unknown;
      for (let page = 1; page <= MAX_JOB_PAGES; page++) {
        if (++jobPageLookups > MAX_TOTAL_JOB_PAGES) fail('protected producer job pagination exceeds the bounded inspection limit.');
        const jobsResponse = await listJobs({ repository, runId: (run as RunView).id, runAttempt: String(runAttempt), page, perPage: PAGE_SIZE });
        if (!jobsResponse || !Number.isSafeInteger((jobsResponse as JobsResponseView).total_count) || ((jobsResponse as JobsResponseView).total_count as number) < 0 ||
            !Array.isArray((jobsResponse as JobsResponseView).jobs) || ((jobsResponse as JobsResponseView).jobs as unknown[]).length > PAGE_SIZE) {
          fail('protected producer job listing is malformed or oversized.');
        }
        if (jobTotalCount === undefined) jobTotalCount = (jobsResponse as JobsResponseView).total_count;
        else if ((jobsResponse as JobsResponseView).total_count !== jobTotalCount) fail('protected producer job count changed during pagination.');
        for (const job of (jobsResponse as JobsResponseView).jobs as unknown[]) {
          if (!Number.isSafeInteger((job as JobView | null | undefined)?.id) || ((job as JobView).id as number) < 1 || seenJobIds.has((job as JobView).id) ||
              (job as JobView).run_id !== (run as RunView).id || ((job as JobView).run_attempt !== undefined && Number((job as JobView).run_attempt) !== runAttempt) ||
              !SHA1.test((((job as JobView).head_sha) ?? '') as string) || (job as JobView).head_sha !== (run as RunView).head_sha) {
            fail('protected producer job pagination contains an invalid, duplicate, or mismatched job identity.');
          }
          seenJobIds.add((job as JobView).id);
          jobs.push(job);
        }
        if (jobs.length === jobTotalCount) break;
        if (jobs.length > (jobTotalCount as number) || ((jobsResponse as JobsResponseView).jobs as unknown[]).length < PAGE_SIZE) {
          fail('protected producer job listing is truncated or inconsistent.');
        }
        if (page === MAX_JOB_PAGES) fail('protected producer job listing exceeds the bounded pagination limit.');
      }
      if (jobs.length !== jobTotalCount) fail('protected producer job listing is incomplete.');
      const matches = jobs.filter((job: unknown) => (job as JobView).name === 'architecture-gate / owner-amendment-semantic-eligibility-signer');
      if (matches.length > 1) fail('protected producer run attempt has duplicate semantic eligibility signer jobs.');
      if (!matches.length) continue;
      const job = matches[0];
      if ((job as JobView).status === 'completed' && (job as JobView).conclusion === 'skipped' &&
          (job as JobView).started_at === null && (job as JobView).completed_at === null) continue;
      const startedAtMs = time((job as JobView).started_at, 'semantic eligibility signer start time');
      const completedAtMs = (job as JobView).completed_at === null ? null : time((job as JobView).completed_at, 'semantic eligibility signer completion time');
      if ((job as JobView).status === 'completed' && completedAtMs === null) fail('completed semantic eligibility signer has no completion time.');
      if (completedAtMs !== null && completedAtMs < startedAtMs) fail('semantic eligibility signer completes before it starts.');
      if (!['queued', 'in_progress', 'completed'].includes((job as JobView).status as string) ||
          ((job as JobView).status === 'completed' && typeof (job as JobView).conclusion !== 'string') ||
          ((job as JobView).status !== 'completed' && (job as JobView).conclusion !== null)) {
        fail('semantic eligibility signer status or conclusion is malformed.');
      }
      const attempt = Object.freeze({ run, runAttempt: String(runAttempt), job, startedAtMs,
        completedAtMs, completedAtSort: completedAtMs ?? Number.POSITIVE_INFINITY });
      if ((job as JobView).status === 'completed' && (job as JobView).conclusion === 'success' && completedAtMs! < queueEnteredAtMs) {
        if (associationAmbiguous) hasAmbiguousSuccessfulSignerBeforeQueue = true;
        else hasSuccessfulSignerBeforeQueue = true;
      }
      if (!associationAmbiguous) signerAttempts.push(attempt);
    }
  }
  signerAttempts.sort(compareSignerAttempts);
  return Object.freeze({ attempts: Object.freeze(signerAttempts), latestSignerAttempt: signerAttempts[0] ?? null,
    hasSuccessfulSignerBeforeQueue, hasAmbiguousSuccessfulSignerBeforeQueue });
}
