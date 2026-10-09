const API = 'https://api.github.com';
const SHA1 = /^[a-f0-9]{40}$/;
const REPOSITORY = /^[A-Za-z0-9][A-Za-z0-9-]{0,38}\/[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/;
const ACTIVE_QUEUE_STATES = new Set(['AWAITING_CHECKS', 'LOCKED', 'MERGEABLE', 'QUEUED']);

export interface OwnerAmendmentWorkflowRunMergeGroupContextInput {
  readonly event?: unknown;
  readonly token?: unknown;
  readonly expected?: unknown;
  readonly fetchImpl?: OwnerAmendmentContextFetch;
}

export interface OwnerAmendmentContextExpected {
  readonly repository: unknown;
  readonly repositoryId: unknown;
  readonly workflowId: unknown;
  readonly workflowPath: unknown;
  readonly targetBranch: unknown;
}

export interface OwnerAmendmentContextRequestOptions {
  readonly method?: string;
  readonly headers?: Record<string, string>;
  readonly body?: string;
  readonly redirect?: 'error' | 'follow' | 'manual';
}

export interface OwnerAmendmentContextResponse {
  readonly status: unknown;
  readonly redirected?: unknown;
  readonly url?: unknown;
  json(): unknown | PromiseLike<unknown>;
}

export type OwnerAmendmentContextFetch = (
  url: string,
  options?: OwnerAmendmentContextRequestOptions,
) => OwnerAmendmentContextResponse | PromiseLike<OwnerAmendmentContextResponse>;

export interface SelectedOwnerAmendmentWorkflowRunMergeGroupContext {
  readonly status: 'SELECTED_OWNER_AMENDMENT_WORKFLOW_RUN_MERGE_GROUP_CONTEXT';
  readonly repository: unknown;
  readonly repositoryId: unknown;
  readonly workflowId: unknown;
  readonly workflowPath: unknown;
  readonly runId: number;
  readonly runAttempt: number;
  readonly workflowRunHeadSha: unknown;
  readonly observedQueueBranch: unknown;
  readonly observedQueueRefSha: unknown;
  readonly currentMainSha: unknown;
  readonly bPrNumber: string;
  readonly bHeadSha: unknown;
  readonly queueEntryState: unknown;
  readonly queueEntryEnqueuedAt: unknown;
  readonly assurance: 'context selection only; no policy, evidence, eligibility, or acceptance claim';
}

export interface IncompleteOwnerAmendmentWorkflowRunMergeGroupContext {
  readonly status: 'INCOMPLETE';
  readonly reason: string;
  readonly repository?: never;
  readonly repositoryId?: never;
  readonly workflowId?: never;
  readonly workflowPath?: never;
  readonly runId?: never;
  readonly runAttempt?: never;
  readonly workflowRunHeadSha?: never;
  readonly observedQueueBranch?: never;
  readonly observedQueueRefSha?: never;
  readonly currentMainSha?: never;
  readonly bPrNumber?: never;
  readonly bHeadSha?: never;
  readonly queueEntryState?: never;
  readonly queueEntryEnqueuedAt?: never;
  readonly assurance?: never;
}

export type OwnerAmendmentWorkflowRunMergeGroupContextResult =
  | SelectedOwnerAmendmentWorkflowRunMergeGroupContext
  | IncompleteOwnerAmendmentWorkflowRunMergeGroupContext;

// These access views describe existing property reads, not authenticated or stable observations.
type RepositoryView = { id?: unknown; full_name?: unknown };
type RunView = { id?: unknown; run_attempt?: unknown; repository?: RepositoryView; workflow_id?: unknown; path?: unknown; event?: unknown; status?: unknown; head_sha?: unknown; head_branch?: unknown };
type RefView = { ref?: unknown; object?: { type?: unknown; sha?: unknown } };
type ParentView = { sha?: unknown };
type CommitView = { sha?: unknown; tree?: { sha?: unknown }; parents?: unknown };
type PullRequestView = { number?: unknown; state?: unknown; draft?: unknown; base?: { ref?: unknown; sha?: unknown; repo?: RepositoryView }; head?: { sha?: unknown; repo?: RepositoryView } };
type QueueEntryView = { state?: unknown; baseCommit?: { oid?: unknown }; headCommit?: { oid?: unknown }; pullRequest?: { number?: unknown }; enqueuedAt?: unknown };
type GraphRepositoryView = { id?: unknown; nameWithOwner?: unknown; pullRequest?: { number?: unknown; state?: unknown; isDraft?: unknown; baseRefName?: unknown; baseRefOid?: unknown; headRefOid?: unknown; baseRepository?: { id?: unknown; nameWithOwner?: unknown }; headRepository?: { id?: unknown; nameWithOwner?: unknown }; mergeQueueEntry?: QueueEntryView } };
type GraphView = { errors?: unknown; data?: { repository?: GraphRepositoryView } };
type SelectorPair = { runId: number; attempt: number };

function fail(message: string): never { throw new Error(`Owner amendment workflow-run context: ${message}`); }

function validNumericId(value: unknown): value is number { return Number.isSafeInteger(value) && (value as number) > 0; }

function validSha(value: unknown): value is string { return typeof value === 'string' && SHA1.test(value); }

function validBranchName(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 255 && /^[A-Za-z0-9._/-]+$/.test(value) &&
    !value.startsWith('/') && !value.endsWith('/') && !value.includes('//') &&
    value.split('/').every(part => part && part !== '.' && part !== '..');
}

function queueBranchPath(branch: unknown): string {
  return (branch as string).split('/').map(encodeURIComponent).join('/');
}

async function request(fetchImpl: OwnerAmendmentContextFetch, token: string, url: string, options: OwnerAmendmentContextRequestOptions = {}): Promise<unknown> {
  let response: OwnerAmendmentContextResponse | undefined;
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

function validateExpected(expected: OwnerAmendmentContextExpected | undefined): void {
  if (!expected || !REPOSITORY.test((expected.repository ?? '') as string) || !validNumericId(expected.repositoryId) ||
      !validNumericId(expected.workflowId) || typeof expected.workflowPath !== 'string' ||
      !/^\.github\/workflows\/[A-Za-z0-9._-]+\.ya?ml$/.test(expected.workflowPath) ||
      expected.targetBranch !== 'main') {
    fail('fixed repository, workflow, or protected-branch identity is invalid.');
  }
}

function validateWakeup(event: unknown): SelectorPair {
  const runId = (event as { workflow_run?: { id?: unknown; run_attempt?: unknown } } | null)?.workflow_run?.id;
  const attempt = (event as { workflow_run?: { id?: unknown; run_attempt?: unknown } } | null)?.workflow_run?.run_attempt;
  if (!validNumericId(runId) || !validNumericId(attempt)) fail('workflow-run wake-up selectors are invalid.');
  return { runId, attempt };
}

function validateAttempt(run: RunView, selectors: SelectorPair, expected: OwnerAmendmentContextExpected): { headSha: unknown; headBranch: unknown } {
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

function validateRef(ref: RefView, expectedName: string): unknown {
  if (ref?.ref !== expectedName || ref?.object?.type !== 'commit' || !validSha(ref?.object?.sha)) {
    fail('live Git reference is missing or malformed.');
  }
  return (ref.object as NonNullable<RefView["object"]>).sha;
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

async function associatedPullRequests(fetchImpl: OwnerAmendmentContextFetch, token: string, root: string, bHeadSha: unknown): Promise<unknown[]> {
  const matches: unknown[] = [];
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
}: OwnerAmendmentWorkflowRunMergeGroupContextInput = {}): Promise<OwnerAmendmentWorkflowRunMergeGroupContextResult> {
  try {
    if (typeof token !== 'string' || !token.trim() || token.length > 4_096 || /[\r\n]/.test(token) ||
        typeof fetchImpl !== 'function') fail('authenticated API access is required.');
    validateExpected(expected as OwnerAmendmentContextExpected);
    const selectors = validateWakeup(event);
    const [owner, name] = ((expected as OwnerAmendmentContextExpected).repository as string).split('/');
    const root = `${API}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`;
    const attemptUrl = `${root}/actions/runs/${selectors.runId}/attempts/${selectors.attempt}`;
    const run = await request(fetchImpl, token, attemptUrl);
    const { headSha, headBranch } = validateAttempt(run as RunView, selectors, expected as OwnerAmendmentContextExpected);

    const queueRefName = `refs/heads/${headBranch}`;
    const queueRef = await request(fetchImpl, token,
      `${root}/git/ref/heads/${queueBranchPath(headBranch)}`);
    const queueRefSha = validateRef(queueRef as RefView, queueRefName);
    if (queueRefSha !== headSha) fail('live queue ref does not identify the exact workflow-run head.');

    const [repo, mainRef] = await Promise.all([
      request(fetchImpl, token, root),
      request(fetchImpl, token, `${root}/git/ref/heads/${encodeURIComponent((expected as OwnerAmendmentContextExpected).targetBranch as string)}`),
    ]);
    const currentMainSha = validateRef(mainRef as RefView, 'refs/heads/main');
    if ((repo as RepositoryView | null)?.id !== (expected as OwnerAmendmentContextExpected).repositoryId || (repo as RepositoryView | null)?.full_name !== (expected as OwnerAmendmentContextExpected).repository) {
      fail('repository API identity does not match the fixed self-repository.');
    }

    const groupCommit = await request(fetchImpl, token, `${root}/git/commits/${headSha}`) as CommitView;
    if (groupCommit?.sha !== headSha || !validSha(groupCommit?.tree?.sha) ||
        !Array.isArray(groupCommit.parents) || groupCommit.parents.length !== 2 ||
        (groupCommit.parents[0] as ParentView | undefined)?.sha !== currentMainSha || !validSha((groupCommit.parents[1] as ParentView | undefined)?.sha)) {
      fail('live queue group is not an exact two-parent commit on current main.');
    }
    const bHeadSha = ((groupCommit.parents as unknown[])[1] as ParentView).sha;
    const bCommit = await request(fetchImpl, token, `${root}/git/commits/${bHeadSha}`) as CommitView;
    if (bCommit?.sha !== bHeadSha || !validSha(bCommit?.tree?.sha) || bCommit.tree.sha !== groupCommit.tree.sha) {
      fail('live queue group tree does not match its exact B parent.');
    }

    const associated = await associatedPullRequests(fetchImpl, token, root, bHeadSha) as PullRequestView[];
    const exactCandidates = associated.filter(candidate => Number.isSafeInteger(candidate?.number) && (candidate.number as number) > 0 &&
      candidate.state === 'open' && candidate.draft === false && candidate.base?.ref === 'main' &&
      candidate.base?.sha === currentMainSha && candidate.head?.sha === bHeadSha &&
      candidate.base?.repo?.id === (expected as OwnerAmendmentContextExpected).repositoryId && candidate.head?.repo?.id === (expected as OwnerAmendmentContextExpected).repositoryId &&
      candidate.base?.repo?.full_name === (expected as OwnerAmendmentContextExpected).repository && candidate.head?.repo?.full_name === (expected as OwnerAmendmentContextExpected).repository);
    if (exactCandidates.length !== 1) fail('B has no unique exact open same-repository main pull request.');
    const candidate = exactCandidates[0];

    const graph = await request(fetchImpl, token, `${API}/graphql`, { method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query: MERGE_QUEUE_QUERY, variables: { owner, name, number: candidate.number } }) }) as GraphView;
    if (graph !== null && typeof graph === 'object' && Object.hasOwn(graph, 'errors') && !Array.isArray(graph.errors)) {
      fail('merge-queue API returned a malformed GraphQL errors field.');
    }
    if (Array.isArray(graph?.errors) && graph.errors.length) fail('merge-queue API returned GraphQL errors.');
    const graphRepo = graph?.data?.repository;
    const queued = graphRepo?.pullRequest;
    const entry = queued?.mergeQueueEntry;
    if (typeof graphRepo?.id !== 'string' || !graphRepo.id || graphRepo?.nameWithOwner !== (expected as OwnerAmendmentContextExpected).repository ||
        queued?.number !== candidate.number || queued?.state !== 'OPEN' || queued?.isDraft !== false ||
        queued?.baseRefName !== 'main' || queued?.baseRefOid !== currentMainSha || queued?.headRefOid !== bHeadSha ||
        queued?.baseRepository?.id !== graphRepo.id || queued?.baseRepository?.nameWithOwner !== (expected as OwnerAmendmentContextExpected).repository ||
        queued?.headRepository?.id !== graphRepo.id || queued?.headRepository?.nameWithOwner !== (expected as OwnerAmendmentContextExpected).repository ||
        !entry || !ACTIVE_QUEUE_STATES.has(entry.state as string) || entry.baseCommit?.oid !== currentMainSha ||
        entry.headCommit?.oid !== bHeadSha || entry.pullRequest?.number !== candidate.number ||
        typeof entry.enqueuedAt !== 'string' || !Number.isFinite(Date.parse(entry.enqueuedAt))) {
      fail('live merge-queue entry does not bind this exact main base, B head, and PR.');
    }

    const [finalQueueRef, finalMainRef] = await Promise.all([
      request(fetchImpl, token, `${root}/git/ref/heads/${queueBranchPath(headBranch)}`),
      request(fetchImpl, token, `${root}/git/ref/heads/${encodeURIComponent((expected as OwnerAmendmentContextExpected).targetBranch as string)}`),
    ]);
    if (validateRef(finalQueueRef as RefView, queueRefName) !== headSha) {
      fail('live queue ref changed or disappeared during context resolution.');
    }
    if (validateRef(finalMainRef as RefView, 'refs/heads/main') !== currentMainSha) {
      fail('protected main ref changed during context resolution.');
    }

    return Object.freeze({ status: 'SELECTED_OWNER_AMENDMENT_WORKFLOW_RUN_MERGE_GROUP_CONTEXT',
      repository: (expected as OwnerAmendmentContextExpected).repository, repositoryId: (expected as OwnerAmendmentContextExpected).repositoryId,
      workflowId: (expected as OwnerAmendmentContextExpected).workflowId, workflowPath: (expected as OwnerAmendmentContextExpected).workflowPath,
      runId: selectors.runId, runAttempt: selectors.attempt,
      workflowRunHeadSha: headSha, observedQueueBranch: headBranch, observedQueueRefSha: queueRefSha,
      currentMainSha, bPrNumber: String(candidate.number), bHeadSha,
      queueEntryState: entry.state, queueEntryEnqueuedAt: entry.enqueuedAt,
      assurance: 'context selection only; no policy, evidence, eligibility, or acceptance claim' });
  } catch (error) {
    return Object.freeze({ status: 'INCOMPLETE', reason: error instanceof Error ? error.message : 'context resolution failed.' });
  }
}
