const API = 'https://api.github.com';
const SHA1 = /^[a-f0-9]{40}$/;
const UTC_TIMESTAMP = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,9})?Z$/;
const REPOSITORY = /^[A-Za-z0-9][A-Za-z0-9-]{0,38}\/[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/;
const ACTIVE_QUEUE_STATES = new Set(['AWAITING_CHECKS', 'LOCKED', 'MERGEABLE', 'QUEUED']);

function fail(message) { throw new Error(`Owner amendment workflow-run context: ${message}`); }

function validNumericId(value) { return Number.isSafeInteger(value) && value > 0; }

function validSha(value) { return typeof value === 'string' && SHA1.test(value); }

function validUtcTimestamp(value) { return typeof value === 'string' && UTC_TIMESTAMP.test(value) && Number.isFinite(Date.parse(value)); }

function validBranchName(value) {
  return typeof value === 'string' && value.length <= 255 && /^[A-Za-z0-9._/-]+$/.test(value) &&
    !value.startsWith('/') && !value.endsWith('/') && !value.includes('//') &&
    value.split('/').every(part => part && part !== '.' && part !== '..');
}

function queueBranchPath(branch) {
  return branch.split('/').map(encodeURIComponent).join('/');
}

async function request(fetchImpl, token, url, options = {}) {
  let response;
  try {
    response = await fetchImpl(url, {
      ...options,
      headers: { accept: 'application/vnd.github+json', authorization: `Bearer ${token}`,
        'x-github-api-version': '2022-11-28', ...(options.headers ?? {}) },
      redirect: 'error',
    });
  } catch {
    fail('GitHub API request failed.');
  }
  if (!response || response.status !== 200 || response.redirected || (response.url && response.url !== url)) {
    fail('GitHub API response is unavailable or redirected.');
  }
  try { return await response.json(); } catch { fail('GitHub API returned invalid JSON.'); }
}

function validateExpected(expected) {
  if (!expected || !REPOSITORY.test(expected.repository ?? '') || !validNumericId(expected.repositoryId) ||
      !validNumericId(expected.workflowId) || typeof expected.workflowPath !== 'string' ||
      !/^\.github\/workflows\/[A-Za-z0-9._-]+\.ya?ml$/.test(expected.workflowPath) ||
      expected.targetBranch !== 'main') {
    fail('fixed repository, workflow, or protected-branch identity is invalid.');
  }
}

function validateWakeup(event) {
  const runId = event?.workflow_run?.id;
  const attempt = event?.workflow_run?.run_attempt;
  if (!validNumericId(runId) || !validNumericId(attempt)) fail('workflow-run wake-up selectors are invalid.');
  return { runId, attempt };
}

function validateAttempt(run, selectors, expected) {
  if (run?.id !== selectors.runId || run?.run_attempt !== selectors.attempt ||
      run?.repository?.id !== expected.repositoryId || run?.repository?.full_name !== expected.repository ||
      run?.workflow_id !== expected.workflowId || run?.path !== expected.workflowPath || run?.event !== 'merge_group' ||
      run?.status !== 'completed' || !validSha(run?.head_sha) ||
      typeof run?.head_branch !== 'string' || !run.head_branch.startsWith('gh-readonly-queue/main/') ||
      !validBranchName(run.head_branch)) {
    fail('exact workflow-run attempt identity or queue head is invalid.');
  }
  return { headSha: run.head_sha, headBranch: run.head_branch };
}

function validateRef(ref, expectedName) {
  if (ref?.ref !== expectedName || ref?.object?.type !== 'commit' || !validSha(ref?.object?.sha)) {
    fail('live Git reference is missing or malformed.');
  }
  return ref.object.sha;
}

const MERGE_QUEUE_QUERY = `query($owner: String!, $name: String!, $number: Int!) {
  repository(owner: $owner, name: $name) {
    id nameWithOwner
    pullRequest(number: $number) {
      number state isDraft baseRefName baseRefOid headRefOid
      baseRepository { id nameWithOwner }
      headRepository { id nameWithOwner }
      mergeQueueEntry { state baseCommit { oid } headCommit { oid } pullRequest { number } enqueuedAt }
    }
  }
}`;

async function associatedPullRequests(fetchImpl, token, root, bHeadSha) {
  const matches = [];
  for (let page = 1; page <= 100; page += 1) {
    const result = await request(fetchImpl, token,
      `${root}/commits/${bHeadSha}/pulls?per_page=100&page=${page}`);
    if (!Array.isArray(result) || result.length > 100) fail('associated pull-request response is malformed.');
    matches.push(...result);
    if (result.length < 100) return matches;
  }
  fail('associated pull-request listing exceeds the page limit.');
}

/**
 * Resolve a completed merge_group wake-up to its currently live queue group,
 * protected main base, and unique exact B pull request. This returns context
 * only; it does not verify policy/evidence or make an acceptance claim.
 */
export async function resolveOwnerAmendmentWorkflowRunMergeGroupContext({
  event, token, expected, fetchImpl = globalThis.fetch,
} = {}) {
  try {
    if (typeof token !== 'string' || !token.trim() || token.length > 4_096 || /[\r\n]/.test(token) ||
        typeof fetchImpl !== 'function') fail('authenticated API access is required.');
    validateExpected(expected);
    const selectors = validateWakeup(event);
    const [owner, name] = expected.repository.split('/');
    const root = `${API}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`;
    const attemptUrl = `${root}/actions/runs/${selectors.runId}/attempts/${selectors.attempt}`;
    const run = await request(fetchImpl, token, attemptUrl);
    const { headSha, headBranch } = validateAttempt(run, selectors, expected);

    const queueRefName = `refs/heads/${headBranch}`;
    const queueRef = await request(fetchImpl, token,
      `${root}/git/ref/heads/${queueBranchPath(headBranch)}`);
    const queueRefSha = validateRef(queueRef, queueRefName);
    if (queueRefSha !== headSha) fail('live queue ref does not identify the exact workflow-run head.');

    const [repo, mainRef] = await Promise.all([
      request(fetchImpl, token, root),
      request(fetchImpl, token, `${root}/git/ref/heads/${encodeURIComponent(expected.targetBranch)}`),
    ]);
    const currentMainSha = validateRef(mainRef, 'refs/heads/main');
    if (repo?.id !== expected.repositoryId || repo?.full_name !== expected.repository) {
      fail('repository API identity does not match the fixed self-repository.');
    }

    const groupCommit = await request(fetchImpl, token, `${root}/git/commits/${headSha}`);
    if (groupCommit?.sha !== headSha || !validSha(groupCommit?.tree?.sha) ||
        !Array.isArray(groupCommit.parents) || groupCommit.parents.length !== 2 ||
        groupCommit.parents[0]?.sha !== currentMainSha || !validSha(groupCommit.parents[1]?.sha)) {
      fail('live queue group is not an exact two-parent commit on current main.');
    }
    const bHeadSha = groupCommit.parents[1].sha;
    const bCommit = await request(fetchImpl, token, `${root}/git/commits/${bHeadSha}`);
    if (bCommit?.sha !== bHeadSha || !validSha(bCommit?.tree?.sha) || bCommit.tree.sha !== groupCommit.tree.sha) {
      fail('live queue group tree does not match its exact B parent.');
    }

    const associated = await associatedPullRequests(fetchImpl, token, root, bHeadSha);
    const exactCandidates = associated.filter(candidate => Number.isSafeInteger(candidate?.number) && candidate.number > 0 &&
      candidate.state === 'open' && candidate.draft === false && candidate.base?.ref === 'main' &&
      candidate.base?.sha === currentMainSha && candidate.head?.sha === bHeadSha &&
      candidate.base?.repo?.id === expected.repositoryId && candidate.head?.repo?.id === expected.repositoryId &&
      candidate.base?.repo?.full_name === expected.repository && candidate.head?.repo?.full_name === expected.repository &&
      validUtcTimestamp(candidate.created_at));
    if (exactCandidates.length !== 1) fail('B has no unique exact open same-repository main pull request.');
    const candidate = exactCandidates[0];

    const graph = await request(fetchImpl, token, `${API}/graphql`, { method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query: MERGE_QUEUE_QUERY, variables: { owner, name, number: candidate.number } }) });
    if (graph !== null && typeof graph === 'object' && Object.hasOwn(graph, 'errors') && !Array.isArray(graph.errors)) {
      fail('merge-queue API returned a malformed GraphQL errors field.');
    }
    if (Array.isArray(graph?.errors) && graph.errors.length) fail('merge-queue API returned GraphQL errors.');
    const graphRepo = graph?.data?.repository;
    const queued = graphRepo?.pullRequest;
    const entry = queued?.mergeQueueEntry;
    if (typeof graphRepo?.id !== 'string' || !graphRepo.id || graphRepo?.nameWithOwner !== expected.repository ||
        queued?.number !== candidate.number || queued?.state !== 'OPEN' || queued?.isDraft !== false ||
        queued?.baseRefName !== 'main' || queued?.baseRefOid !== currentMainSha || queued?.headRefOid !== bHeadSha ||
        queued?.baseRepository?.id !== graphRepo.id || queued?.baseRepository?.nameWithOwner !== expected.repository ||
        queued?.headRepository?.id !== graphRepo.id || queued?.headRepository?.nameWithOwner !== expected.repository ||
        !entry || !ACTIVE_QUEUE_STATES.has(entry.state) || entry.baseCommit?.oid !== currentMainSha ||
        entry.headCommit?.oid !== bHeadSha || entry.pullRequest?.number !== candidate.number ||
        typeof entry.enqueuedAt !== 'string' || !Number.isFinite(Date.parse(entry.enqueuedAt))) {
      fail('live merge-queue entry does not bind this exact main base, B head, and PR.');
    }
    if (Date.parse(candidate.created_at) > Date.parse(entry.enqueuedAt)) {
      fail('exact B pull request was created after merge queue entry.');
    }

    const [finalQueueRef, finalMainRef] = await Promise.all([
      request(fetchImpl, token, `${root}/git/ref/heads/${queueBranchPath(headBranch)}`),
      request(fetchImpl, token, `${root}/git/ref/heads/${encodeURIComponent(expected.targetBranch)}`),
    ]);
    if (validateRef(finalQueueRef, queueRefName) !== headSha) {
      fail('live queue ref changed or disappeared during context resolution.');
    }
    if (validateRef(finalMainRef, 'refs/heads/main') !== currentMainSha) {
      fail('protected main ref changed during context resolution.');
    }

    return Object.freeze({ status: 'SELECTED_OWNER_AMENDMENT_WORKFLOW_RUN_MERGE_GROUP_CONTEXT',
      repository: expected.repository, repositoryId: expected.repositoryId,
      workflowId: expected.workflowId, workflowPath: expected.workflowPath,
      runId: selectors.runId, runAttempt: selectors.attempt,
      workflowRunHeadSha: headSha, observedQueueBranch: headBranch, observedQueueRefSha: queueRefSha,
      currentMainSha, bPrNumber: String(candidate.number), bHeadSha, bPullRequestCreatedAt: candidate.created_at,
      queueEntryState: entry.state, queueEntryEnqueuedAt: entry.enqueuedAt,
      assurance: 'context selection only; no policy, evidence, eligibility, or acceptance claim' });
  } catch (error) {
    return Object.freeze({ status: 'INCOMPLETE', reason: error instanceof Error ? error.message : 'context resolution failed.' });
  }
}
