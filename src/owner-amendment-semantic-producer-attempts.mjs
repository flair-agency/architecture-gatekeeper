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

function compareSignerAttempts(left, right) {
  return right.startedAtMs - left.startedAtMs || right.completedAtSort - left.completedAtSort ||
    right.run.id - left.run.id || Number(right.runAttempt) - Number(left.runAttempt);
}

/**
 * Inspect exact-B protected-base workflow attempts once for both tag absence
 * classification and eligibility artifact selection. Only successful signer
 * jobs completed before queue entry establish that an amendment attempt exists.
 */
export async function inspectOwnerAmendmentSemanticProducerAttempts({ repository, bBaseSha, bHeadSha,
  queueEnteredAt, listRuns, listJobs } = {}) {
  if (repository !== SELF_REPOSITORY || !SHA1.test(bBaseSha ?? '') || !SHA1.test(bHeadSha ?? '') || bBaseSha === bHeadSha ||
      typeof listRuns !== 'function' || typeof listJobs !== 'function') {
    fail('protected repository, exact B SHA, and trusted run/job readers are required.');
  }
  const queueEnteredAtMs = time(queueEnteredAt, 'merge queue entry time');
  const runs = [];
  const seenRunIds = new Set();
  let totalCount;
  for (let page = 1; page <= MAX_RUN_PAGES; page++) {
    const response = await listRuns({ repository, bHeadSha, page, perPage: PAGE_SIZE });
    if (!response || !Number.isSafeInteger(response.total_count) || response.total_count < 0 ||
        !Array.isArray(response.workflow_runs) || response.workflow_runs.length > PAGE_SIZE) {
      fail('protected producer workflow run listing is malformed or oversized.');
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
  const candidates = runs.filter(run => {
    if (run?.repository?.full_name !== SELF_REPOSITORY || run?.head_repository?.full_name !== SELF_REPOSITORY ||
        run?.event !== 'pull_request_target' || !WORKFLOW_PATH.test(run?.path ?? '') || !SHA1.test(run?.head_sha ?? '') ||
        !Array.isArray(run?.pull_requests)) return false;
    const exactPullRequests = run.pull_requests.filter(pr => pr?.base?.ref === 'main' && pr?.base?.sha === bBaseSha &&
      pr?.base?.repo?.full_name === SELF_REPOSITORY && pr?.head?.sha === bHeadSha &&
      pr?.head?.repo?.full_name === SELF_REPOSITORY);
    return exactPullRequests.length === 1;
  })
    .map(run => {
      const runAttemptCount = Number(run.run_attempt);
      if (!Number.isSafeInteger(run.id) || run.id < 1 || !Number.isSafeInteger(runAttemptCount) || runAttemptCount < 1) {
        fail('protected producer workflow run identity is malformed.');
      }
      return { run, runAttemptCount, createdAtMs: time(run.created_at, 'producer workflow creation time') };
    })
    .sort((left, right) => right.createdAtMs - left.createdAtMs || right.run.id - left.run.id);
  const attemptLookupCount = candidates.reduce((sum, candidate) => sum + candidate.runAttemptCount, 0);
  if (attemptLookupCount > MAX_ATTEMPT_LOOKUPS) fail('protected producer run attempts exceed the bounded inspection limit.');

  const signerAttempts = [];
  let hasSuccessfulSignerBeforeQueue = false;
  let jobPageLookups = 0;
  for (const { run, runAttemptCount } of candidates) {
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
      signerAttempts.push(attempt);
      if (job.status === 'completed' && job.conclusion === 'success' && completedAtMs < queueEnteredAtMs) {
        hasSuccessfulSignerBeforeQueue = true;
      }
    }
  }
  signerAttempts.sort(compareSignerAttempts);
  return Object.freeze({ attempts: Object.freeze(signerAttempts), latestSignerAttempt: signerAttempts[0] ?? null,
    hasSuccessfulSignerBeforeQueue });
}
