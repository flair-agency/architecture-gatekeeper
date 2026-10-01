import { resolveOwnerAmendmentWorkflowRunMergeGroupContext } from './owner-amendment-workflow-run-merge-group-context.mjs';

const API = 'https://api.github.com';
const REPOSITORY = 'flair-agency/architecture-gatekeeper';
const WORKFLOW_PATH = '.github/workflows/self-architecture-gate.yml';
const FAIL = message => { throw new Error(`Owner amendment workflow-run receiver: ${message}`); };
const SHA = /^[a-f0-9]{40}$/;
const UTC_TIMESTAMP = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,9})?Z$/;
const POSITIVE = value => Number.isSafeInteger(value) && value > 0;
const CONTEXT_FIELDS = ['assurance', 'bHeadSha', 'bPrNumber', 'currentMainSha', 'observedQueueBranch',
  'bPullRequestCreatedAt', 'observedQueueRefSha', 'queueEntryEnqueuedAt', 'queueEntryState', 'repository', 'repositoryId',
  'runAttempt', 'runId', 'status', 'workflowId', 'workflowPath', 'workflowRunHeadSha'];

async function getJson(fetchImpl, token, url) {
  let response;
  try {
    response = await fetchImpl(url, { headers: { accept: 'application/vnd.github+json',
      authorization: `Bearer ${token}`, 'x-github-api-version': '2022-11-28' }, redirect: 'error' });
  } catch { FAIL('protected identity lookup failed.'); }
  if (!response || response.status !== 200 || response.redirected || (response.url && response.url !== url)) {
    FAIL('protected identity lookup is unavailable or redirected.');
  }
  try { return await response.json(); } catch { FAIL('protected identity response is invalid JSON.'); }
}

/** Resolve IDs only from fixed protected API identities; never from wake-up fields. */
export async function resolveProtectedSelfWorkflowIdentity({ token, fetchImpl = globalThis.fetch } = {}) {
  if (typeof token !== 'string' || !token.trim() || token.length > 4_096 || /[\r\n]/.test(token) ||
      typeof fetchImpl !== 'function') FAIL('authenticated protected API access is required.');
  const [repoOwner, repoName] = REPOSITORY.split('/');
  const repoUrl = `${API}/repos/${repoOwner}/${repoName}`;
  const workflowUrl = `${repoUrl}/actions/workflows/${encodeURIComponent(WORKFLOW_PATH.split('/').at(-1))}`;
  const [repo, workflow] = await Promise.all([getJson(fetchImpl, token, repoUrl), getJson(fetchImpl, token, workflowUrl)]);
  if (repo?.full_name !== REPOSITORY || !POSITIVE(repo?.id) || workflow?.path !== WORKFLOW_PATH ||
      !POSITIVE(workflow?.id) || workflow?.state !== 'active') {
    FAIL('protected self repository or workflow identity does not match the fixed receiver contract.');
  }
  return Object.freeze({ repository: REPOSITORY, repositoryId: repo.id, workflowId: workflow.id,
    workflowPath: WORKFLOW_PATH, targetBranch: 'main' });
}

/** Resolve wake-up selectors through live APIs; all other payload claims are ignored. */
export async function resolveProtectedOwnerAmendmentWorkflowRunContext({ event, token,
  fetchImpl = globalThis.fetch } = {}) {
  try {
    if (!POSITIVE(event?.workflow_run?.id) || !POSITIVE(event?.workflow_run?.run_attempt)) {
      FAIL('wake-up run ID and attempt selectors are invalid.');
    }
    const expected = await resolveProtectedSelfWorkflowIdentity({ token, fetchImpl });
    return await resolveOwnerAmendmentWorkflowRunMergeGroupContext({ event, token, expected, fetchImpl });
  } catch (error) {
    return Object.freeze({ status: 'INCOMPLETE', reason: error instanceof Error ? error.message : 'protected identity is unavailable.' });
  }
}

const ACTIVE_QUEUE_STATES = new Set(['AWAITING_CHECKS', 'LOCKED', 'MERGEABLE', 'QUEUED']);

/** Accept only the resolver's closed result, then adapt it for existing protected validators. */
export function adaptVerifiedWorkflowRunContext(value) {
  const queueBranch = value?.observedQueueBranch;
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      Object.keys(value).length !== CONTEXT_FIELDS.length || CONTEXT_FIELDS.some(field => !Object.hasOwn(value, field)) ||
      value.status !== 'SELECTED_OWNER_AMENDMENT_WORKFLOW_RUN_MERGE_GROUP_CONTEXT' ||
      value.repository !== REPOSITORY || !POSITIVE(value.repositoryId) || !POSITIVE(value.workflowId) ||
      value.workflowPath !== WORKFLOW_PATH || !POSITIVE(value.runId) || !POSITIVE(value.runAttempt) ||
      !SHA.test(value.workflowRunHeadSha ?? '') || typeof queueBranch !== 'string' || queueBranch.length > 255 ||
      !/^gh-readonly-queue\/main\/[A-Za-z0-9._/-]+$/.test(queueBranch) || queueBranch.includes('//') ||
      queueBranch.split('/').some(part => !part || part === '.' || part === '..') ||
      !SHA.test(value.observedQueueRefSha ?? '') || value.observedQueueRefSha !== value.workflowRunHeadSha ||
      !SHA.test(value.currentMainSha ?? '') || !/^[1-9]\d*$/.test(value.bPrNumber ?? '') ||
      !SHA.test(value.bHeadSha ?? '') || !ACTIVE_QUEUE_STATES.has(value.queueEntryState) ||
      typeof value.bPullRequestCreatedAt !== 'string' || !UTC_TIMESTAMP.test(value.bPullRequestCreatedAt) ||
      !Number.isFinite(Date.parse(value.bPullRequestCreatedAt)) ||
      typeof value.queueEntryEnqueuedAt !== 'string' || !Number.isFinite(Date.parse(value.queueEntryEnqueuedAt)) ||
      value.assurance !== 'context selection only; no policy, evidence, eligibility, or acceptance claim') {
    FAIL('verified live workflow-run context is malformed.');
  }
  return Object.freeze({ status: 'SELECTED_OWNER_AMENDMENT_MERGE_GROUP_B_CONTEXT',
    repository: value.repository, repositoryId: value.repositoryId,
    mergeGroupBaseSha: value.currentMainSha, mergeGroupHeadSha: value.workflowRunHeadSha,
    bPrNumber: value.bPrNumber, bBaseSha: value.currentMainSha, bHeadSha: value.bHeadSha,
    bPullRequestCreatedAt: value.bPullRequestCreatedAt,
    queueEntryState: value.queueEntryState, queueEnteredAt: value.queueEntryEnqueuedAt,
  });
}

export function syntheticVerifiedMergeGroupEvent(value) {
  const selected = adaptVerifiedWorkflowRunContext(value);
  return Object.freeze({ action: 'checks_requested', repository: Object.freeze({ full_name: REPOSITORY }),
    merge_group: Object.freeze({ base_ref: 'refs/heads/main', base_sha: selected.bBaseSha,
      head_sha: selected.mergeGroupHeadSha }) });
}

export function sameVerifiedWorkflowRunContext(left, right) {
  try {
    adaptVerifiedWorkflowRunContext(left);
    adaptVerifiedWorkflowRunContext(right);
    return CONTEXT_FIELDS.every(key => left[key] === right[key]);
  } catch { return false; }
}

export function protectedCheckConclusion({ verificationOutcome, route, ordinaryValidationOutcome } = {}) {
  if (verificationOutcome === 'success' && route === 'amendment') return 'success';
  if (verificationOutcome === 'success' && route === 'ordinary' && ordinaryValidationOutcome === 'success') return 'success';
  return 'failure';
}

/** Build a publishable result only when the final protected readback matches the initial verified context. */
export function prepareVerifiedCheckReport({ initialContext, finalContext, verificationOutcome,
  route, ordinaryValidationOutcome } = {}) {
  if (!sameVerifiedWorkflowRunContext(initialContext, finalContext)) {
    return Object.freeze({ status: 'INCOMPLETE', assurance: 'no check result is bound to a verified current queue context' });
  }
  const selected = adaptVerifiedWorkflowRunContext(finalContext);
  return Object.freeze({ status: 'PREPARED_PROTECTED_QUEUE_CHECK', headSha: selected.mergeGroupHeadSha,
    conclusion: protectedCheckConclusion({ verificationOutcome, route, ordinaryValidationOutcome }),
    assurance: 'outcome is bound to the same live queue context reread immediately before App publication' });
}
