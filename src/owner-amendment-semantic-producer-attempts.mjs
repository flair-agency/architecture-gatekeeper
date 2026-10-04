import { matchesGitHubAssociatedRepository } from './github-associated-repository.mjs';
const SELF_REPOSITORY = 'flair-agency/architecture-gatekeeper';
const WORKFLOW_PATH = /^\.github\/workflows\/self-architecture-gate\.yml(?:@(?:refs\/heads\/main|main))?$/;
const SHA1 = /^[a-f0-9]{40}$/;
const PAGE_SIZE = 100;
const MAX_RUN_PAGES = 10;
const MAX_ATTEMPT_LOOKUPS = 1_000;
const MAX_JOB_PAGES = 10;
const MAX_TOTAL_JOB_PAGES = 1_000;
const fail = message => { throw new Error(`OWNER_AMENDMENT semantic producer attempts: ${message}`); };

function time(value, label) {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) fail(`${label} is invalid.`);
  return Date.parse(value);
}

function searchDateTime(milliseconds) {
  return new Date(milliseconds).toISOString().replace(/\.000Z$/, 'Z');
}

function compareSignerAttempts(left, right) {
  return right.startedAtMs - left.startedAtMs || right.completedAtSort - left.completedAtSort ||
    right.run.id - left.run.id || Number(right.runAttempt) - Number(left.runAttempt);
}

function completePullRequestAssociation(pr, repositoryId) {
  return Number.isSafeInteger(pr?.number) && pr.number > 0 &&
    typeof pr?.base?.ref === 'string' && typeof pr.base.sha === 'string' && SHA1.test(pr.base.sha) &&
    (typeof pr.base.repo?.full_name === 'string' || matchesGitHubAssociatedRepository(pr.base.repo,
      { repository: SELF_REPOSITORY, repositoryId })) && typeof pr?.head?.sha === 'string' && SHA1.test(pr.head.sha) &&
    (typeof pr.head.repo?.full_name === 'string' || matchesGitHubAssociatedRepository(pr.head.repo,
      { repository: SELF_REPOSITORY, repositoryId }));
}

/** Refuse to treat a missing tag as ordinary when a protected signer ran before queue entry. */
export function assertMissingOwnerAmendmentTagHasNoSuccessfulSigner(attempts) {
  if (!attempts || typeof attempts !== 'object') fail('protected producer attempts are unavailable.');
  if (attempts.hasSuccessfulSignerBeforeQueue) {
    fail('exact B has a successful pre-queue semantic eligibility signer result but no protected amendment tag.');
  }
  if (attempts.hasAmbiguousSuccessfulSignerBeforeQueue) {
    fail('a protected-base semantic eligibility signer completed before queue entry without a unique exact pull-request association, and no protected amendment tag exists.');
  }
}

/**
 * Inspect exact-B protected-base workflow attempts once for both tag absence
 * classification and eligibility artifact selection. Successful signers with
 * unavailable PR association are tracked separately and never select evidence.
 */
export async function inspectOwnerAmendmentSemanticProducerAttempts({ repository, bBaseSha, bHeadSha,
  bPullRequestCreatedAt, queueEnteredAt, listRuns, listJobs } = {}) {
  if (repository !== SELF_REPOSITORY || !SHA1.test(bBaseSha ?? '') || !SHA1.test(bHeadSha ?? '') || bBaseSha === bHeadSha ||
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
  const runs = [];
  const seenRunIds = new Set();
  let totalCount;
  for (let page = 1; page <= MAX_RUN_PAGES; page++) {
    const response = await listRuns({ repository, bBaseSha, createdFrom, createdTo, page, perPage: PAGE_SIZE });
    if (!response || !Number.isSafeInteger(response.total_count) || response.total_count < 0 ||
        !Array.isArray(response.workflow_runs) || response.workflow_runs.length > PAGE_SIZE) {
      fail('protected producer workflow run listing is malformed or oversized.');
    }
    if (response.total_count >= maxRunResults) {
      fail('protected producer workflow run search reaches the 1,000-result completeness limit.');
    }
    if (totalCount === undefined) totalCount = response.total_count;
    else if (response.total_count !== totalCount) fail('protected producer workflow run count changed during pagination.');
    for (const run of response.workflow_runs) {
      if (!Number.isSafeInteger(run?.id) || run.id < 1 || seenRunIds.has(run.id)) {
        fail('protected producer workflow pagination contains an invalid or duplicate run ID.');
      }
      seenRunIds.add(run.id);
      runs.push(run);
    }
    if (runs.length === totalCount) break;
    if (runs.length > totalCount || response.workflow_runs.length < PAGE_SIZE) {
      fail('protected producer workflow run listing is truncated or inconsistent.');
    }
    if (page === MAX_RUN_PAGES) fail('protected producer workflow run listing exceeds the bounded pagination limit.');
  }
  if (runs.length !== totalCount) fail('protected producer workflow run listing is incomplete.');
  const candidates = [];
  for (const run of runs) {
    if (run?.repository?.full_name !== SELF_REPOSITORY || run?.head_repository?.full_name !== SELF_REPOSITORY ||
        run?.event !== 'pull_request_target' || !WORKFLOW_PATH.test(run?.path ?? '') ||
        run?.head_sha !== bBaseSha) continue;
    const runCreatedAtMs = time(run.created_at, 'producer workflow creation time');
    if (runCreatedAtMs < pullRequestCreatedAtMs || runCreatedAtMs > queueEnteredAtMs) continue;
    const associations = run.pull_requests;
    if (associations != null && !Array.isArray(associations)) {
      fail('protected producer pull-request association is malformed.');
    }
    const exactPullRequests = Array.isArray(associations) ? associations.filter(pr => pr?.base?.ref === 'main' &&
      pr?.base?.sha === bBaseSha && matchesGitHubAssociatedRepository(pr?.base?.repo,
        { repository: SELF_REPOSITORY, repositoryId: run.repository?.id }) && pr?.head?.sha === bHeadSha &&
      matchesGitHubAssociatedRepository(pr?.head?.repo, { repository: SELF_REPOSITORY, repositoryId: run.repository?.id })) : [];
    const exact = exactPullRequests.length === 1;
    const unavailableAssociation = associations == null || (Array.isArray(associations) && associations.length === 0) ||
      (Array.isArray(associations) && associations.some(pr => !completePullRequestAssociation(pr, run.repository?.id)));
    const ambiguous = !exact && (exactPullRequests.length > 1 || (run.head_sha === bBaseSha && unavailableAssociation));
    if (!exact && !ambiguous) continue;
    const runAttemptCount = Number(run.run_attempt);
    if (!Number.isSafeInteger(run.id) || run.id < 1 || !Number.isSafeInteger(runAttemptCount) || runAttemptCount < 1) {
      fail('protected producer workflow run identity is malformed.');
    }
    candidates.push({ run, runAttemptCount, associationAmbiguous: ambiguous, createdAtMs: runCreatedAtMs });
  }
  candidates.sort((left, right) => right.createdAtMs - left.createdAtMs || right.run.id - left.run.id);
  const attemptLookupCount = candidates.reduce((sum, candidate) => sum + candidate.runAttemptCount, 0);
  if (attemptLookupCount > MAX_ATTEMPT_LOOKUPS) fail('protected producer run attempts exceed the bounded inspection limit.');

  const signerAttempts = [];
  let hasSuccessfulSignerBeforeQueue = false;
  let hasAmbiguousSuccessfulSignerBeforeQueue = false;
  let jobPageLookups = 0;
  for (const { run, runAttemptCount, associationAmbiguous } of candidates) {
    for (let runAttempt = runAttemptCount; runAttempt >= 1; runAttempt--) {
      const jobs = [];
      const seenJobIds = new Set();
      let jobTotalCount;
      for (let page = 1; page <= MAX_JOB_PAGES; page++) {
        if (++jobPageLookups > MAX_TOTAL_JOB_PAGES) fail('protected producer job pagination exceeds the bounded inspection limit.');
        const jobsResponse = await listJobs({ repository, runId: run.id, runAttempt: String(runAttempt), page, perPage: PAGE_SIZE });
        if (!jobsResponse || !Number.isSafeInteger(jobsResponse.total_count) || jobsResponse.total_count < 0 ||
            !Array.isArray(jobsResponse.jobs) || jobsResponse.jobs.length > PAGE_SIZE) {
          fail('protected producer job listing is malformed or oversized.');
        }
        if (jobTotalCount === undefined) jobTotalCount = jobsResponse.total_count;
        else if (jobsResponse.total_count !== jobTotalCount) fail('protected producer job count changed during pagination.');
        for (const job of jobsResponse.jobs) {
          if (!Number.isSafeInteger(job?.id) || job.id < 1 || seenJobIds.has(job.id) ||
              job.run_id !== run.id || (job.run_attempt !== undefined && Number(job.run_attempt) !== runAttempt) ||
              !SHA1.test(job.head_sha ?? '') || job.head_sha !== run.head_sha) {
            fail('protected producer job pagination contains an invalid, duplicate, or mismatched job identity.');
          }
          seenJobIds.add(job.id);
          jobs.push(job);
        }
        if (jobs.length === jobTotalCount) break;
        if (jobs.length > jobTotalCount || jobsResponse.jobs.length < PAGE_SIZE) {
          fail('protected producer job listing is truncated or inconsistent.');
        }
        if (page === MAX_JOB_PAGES) fail('protected producer job listing exceeds the bounded pagination limit.');
      }
      if (jobs.length !== jobTotalCount) fail('protected producer job listing is incomplete.');
      const matches = jobs.filter(job => job.name === 'architecture-gate / owner-amendment-semantic-eligibility-signer');
      if (matches.length > 1) fail('protected producer run attempt has duplicate semantic eligibility signer jobs.');
      if (!matches.length) continue;
      const job = matches[0];
      if (job.status === 'completed' && job.conclusion === 'skipped' &&
          job.started_at === null && job.completed_at === null) continue;
      const startedAtMs = time(job.started_at, 'semantic eligibility signer start time');
      const completedAtMs = job.completed_at === null ? null : time(job.completed_at, 'semantic eligibility signer completion time');
      if (job.status === 'completed' && completedAtMs === null) fail('completed semantic eligibility signer has no completion time.');
      if (completedAtMs !== null && completedAtMs < startedAtMs) fail('semantic eligibility signer completes before it starts.');
      if (!['queued', 'in_progress', 'completed'].includes(job.status) ||
          (job.status === 'completed' && typeof job.conclusion !== 'string') ||
          (job.status !== 'completed' && job.conclusion !== null)) {
        fail('semantic eligibility signer status or conclusion is malformed.');
      }
      const attempt = Object.freeze({ run, runAttempt: String(runAttempt), job, startedAtMs,
        completedAtMs, completedAtSort: completedAtMs ?? Number.POSITIVE_INFINITY });
      if (job.status === 'completed' && job.conclusion === 'success' && completedAtMs < queueEnteredAtMs) {
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
