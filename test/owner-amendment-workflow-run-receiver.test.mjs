import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, mkdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createOwnerAmendmentMergeGroupAcceptanceVerifier } from '../src/owner-amendment-merge-group-acceptance.mjs';
import { inspectOwnerAmendmentSemanticProducerAttempts } from '../src/owner-amendment-semantic-producer-attempts.mjs';
import { runnerEvent } from '../scripts/owner-amendment-workflow-run-receiver.mjs';
import { adaptVerifiedWorkflowRunContext, protectedCheckConclusion,
  resolveProtectedOwnerAmendmentWorkflowRunContext, sameVerifiedWorkflowRunContext,
  syntheticVerifiedMergeGroupEvent, prepareVerifiedCheckReport } from '../src/owner-amendment-workflow-run-receiver.mjs';

const repository = 'flair-agency/architecture-gatekeeper';
const repositoryId = 1379218762, workflowId = 363378101, runId = 99887766, attempt = 2;
const workflowPath = '.github/workflows/self-architecture-gate.yml';
const mainSha = 'a'.repeat(40), bSha = 'b'.repeat(40), groupSha = 'c'.repeat(40);
const queueBranch = 'gh-readonly-queue/main/pr-216-abcdef0123456789';
const root = 'https://api.github.com/repos/flair-agency/architecture-gatekeeper';
const wakeup = { action: 'completed', workflow_run: { id: runId, run_attempt: attempt,
  // All claims other than run ID and attempt must be ignored.
  event: 'pull_request', head_sha: 'd'.repeat(40), head_branch: 'refs/heads/main', conclusion: 'success' } };
const response = body => ({ status: 200, ok: true, json: async () => body });

function withRunnerEvent(fn) {
  const rootDir = mkdtempSync(join(tmpdir(), 'agk-workflow-run-event-'));
  const runnerTemp = join(rootDir, 'runner-temp');
  const eventDirectory = join(runnerTemp, '_github_workflow');
  mkdirSync(eventDirectory, { recursive: true });
  const eventFile = join(realpathSync(runnerTemp), '_github_workflow', 'event.json');
  writeFileSync(eventFile, JSON.stringify(wakeup));
  const oldCwd = process.cwd(), oldRunnerTemp = process.env.RUNNER_TEMP;
  const oldEventPath = process.env.GITHUB_EVENT_PATH, oldEventName = process.env.GITHUB_EVENT_NAME;
  try {
    process.chdir(runnerTemp);
    process.env.RUNNER_TEMP = realpathSync(runnerTemp);
    process.env.GITHUB_EVENT_PATH = eventFile;
    process.env.GITHUB_EVENT_NAME = 'workflow_run';
    fn({ rootDir, eventFile });
  } finally {
    process.chdir(oldCwd);
    if (oldRunnerTemp === undefined) delete process.env.RUNNER_TEMP; else process.env.RUNNER_TEMP = oldRunnerTemp;
    if (oldEventPath === undefined) delete process.env.GITHUB_EVENT_PATH; else process.env.GITHUB_EVENT_PATH = oldEventPath;
    if (oldEventName === undefined) delete process.env.GITHUB_EVENT_NAME; else process.env.GITHUB_EVENT_NAME = oldEventName;
    rmSync(rootDir, { recursive: true, force: true });
  }
}

function fixture({ attemptOverrides = {}, workflowOverrides = {}, repoOverrides = {}, queueSha = groupSha,
  mainRefSha = mainSha } = {}) {
  const calls = [];
  const graphRepoId = 'R_kgDOChD4VA';
  const api = async (url, options = {}) => {
    calls.push({ url, options });
    if (url === root) return response({ id: repositoryId, full_name: repository, ...repoOverrides });
    if (url === `${root}/actions/workflows/self-architecture-gate.yml`) return response({ id: workflowId,
      path: workflowPath, state: 'active', ...workflowOverrides });
    if (url === `${root}/actions/runs/${runId}/attempts/${attempt}`) return response({ id: runId, run_attempt: attempt,
      repository: { id: repositoryId, full_name: repository }, workflow_id: workflowId, path: workflowPath,
      event: 'merge_group', status: 'completed', head_sha: groupSha, head_branch: queueBranch, ...attemptOverrides });
    if (url === `${root}/git/ref/heads/${queueBranch}`) return response({ ref: `refs/heads/${queueBranch}`,
      object: { type: 'commit', sha: queueSha } });
    if (url === `${root}/git/ref/heads/main`) return response({ ref: 'refs/heads/main',
      object: { type: 'commit', sha: mainRefSha } });
    if (url === `${root}/git/commits/${groupSha}`) return response({ sha: groupSha, tree: { sha: 'e'.repeat(40) },
      parents: [{ sha: mainSha }, { sha: bSha }] });
    if (url === `${root}/git/commits/${bSha}`) return response({ sha: bSha, tree: { sha: 'e'.repeat(40) } });
    if (url === `${root}/commits/${bSha}/pulls?per_page=100&page=1`) return response([{ number: 216,
      state: 'open', draft: false, created_at: '2026-09-30T00:30:00Z', base: { ref: 'main', sha: mainSha,
        repo: { id: repositoryId, full_name: repository } }, head: { sha: bSha,
        repo: { id: repositoryId, full_name: repository } } }]);
    if (url === `${root}/commits/${bSha}/pulls?per_page=100&page=2`) return response([]);
    if (url === 'https://api.github.com/graphql') return response({ data: { repository: { id: graphRepoId,
      nameWithOwner: repository, pullRequest: { number: 216, state: 'OPEN', isDraft: false,
        baseRefName: 'main', baseRefOid: mainSha, headRefOid: bSha,
        baseRepository: { id: graphRepoId, nameWithOwner: repository },
        headRepository: { id: graphRepoId, nameWithOwner: repository },
        mergeQueueEntry: { state: 'AWAITING_CHECKS', baseCommit: { oid: mainSha }, headCommit: { oid: bSha },
          pullRequest: { number: 216 }, enqueuedAt: '2026-09-30T01:00:00Z' } } } } });
    throw new Error('unexpected API call');
  };
  const fetchImpl = async (url, options = {}) => {
    if (url.startsWith('https://api.github.com/repos/') || url === 'https://api.github.com/graphql') return api(url, options);
    throw new Error('unexpected API origin');
  };
  return { calls, fetchImpl, resolve: (event = wakeup) => resolveProtectedOwnerAmendmentWorkflowRunContext({
    event, token: 'test-token', fetchImpl }) };
}

test('discovers fixed protected workflow identity and independently binds only wake-up run ID/attempt', async () => {
  const f = fixture();
  const result = await f.resolve();
  assert.equal(result.status, 'SELECTED_OWNER_AMENDMENT_WORKFLOW_RUN_MERGE_GROUP_CONTEXT', result.reason);
  assert.equal(result.repositoryId, repositoryId);
  assert.equal(result.workflowId, workflowId);
  assert.equal(result.workflowRunHeadSha, groupSha);
  assert.equal(result.currentMainSha, mainSha);
  assert.equal(result.bHeadSha, bSha);
  assert.equal(result.assurance, 'context selection only; no policy, evidence, eligibility, or acceptance claim');
  assert.equal(f.calls[0].url, root);
  assert.equal(f.calls[1].url, `${root}/actions/workflows/self-architecture-gate.yml`);
  assert.ok(f.calls.some(call => call.url === `${root}/actions/runs/${runId}/attempts/${attempt}`));
  for (const call of f.calls) {
    assert.equal(call.options.headers.authorization, 'Bearer test-token');
    assert.equal(call.options.redirect, 'error');
  }
});

test('reads only the canonical bounded regular runner event file', () => withRunnerEvent(({ rootDir, eventFile }) => {
  assert.deepEqual(runnerEvent(), wakeup);
  process.env.GITHUB_EVENT_PATH = join(rootDir, 'outside.json');
  writeFileSync(process.env.GITHUB_EVENT_PATH, JSON.stringify(wakeup));
  assert.throws(() => runnerEvent(), /canonical runner event file/);

  process.env.GITHUB_EVENT_PATH = eventFile;
  rmSync(eventFile); symlinkSync(join(rootDir, 'outside.json'), eventFile);
  assert.throws(() => runnerEvent(), /unavailable or outside its bounded runner path/);
  rmSync(eventFile); writeFileSync(eventFile, 'x'.repeat(262_145));
  assert.throws(() => runnerEvent(), /not a bounded regular file/);
}));

test('fails closed if fixed repository or workflow API identity is not exact', async t => {
  for (const [name, options] of [
    ['wrong repository identity', { repoOverrides: { full_name: 'other/repo' } }],
    ['wrong repository id', { repoOverrides: { id: repositoryId + 1 } }],
    ['wrong workflow path', { workflowOverrides: { path: '.github/workflows/candidate.yml' } }],
    ['inactive workflow', { workflowOverrides: { state: 'disabled_manually' } }],
    ['wrong workflow id', { workflowOverrides: { id: workflowId + 1 } }],
  ]) await t.test(name, async () => {
    const f = fixture(options);
    assert.equal((await f.resolve()).status, 'INCOMPLETE');
    assert.ok(f.calls.length <= 3, 'does not resolve queue refs or candidate evidence under an unverified identity');
  });
});

test('malformed wake-up selectors do not cause repository or workflow API requests', async () => {
  const f = fixture();
  const result = await f.resolve({ workflow_run: { id: '99887766', run_attempt: attempt,
    head_sha: groupSha, conclusion: 'success' } });
  assert.equal(result.status, 'INCOMPLETE');
  assert.equal(f.calls.length, 0);
});

test('adapter creates only the existing exact B selection and synthetic event from verified context', async () => {
  const result = await fixture().resolve();
  assert.equal(result.status, 'SELECTED_OWNER_AMENDMENT_WORKFLOW_RUN_MERGE_GROUP_CONTEXT', result.reason);
  const selection = adaptVerifiedWorkflowRunContext(result);
  assert.deepEqual(selection, { status: 'SELECTED_OWNER_AMENDMENT_MERGE_GROUP_B_CONTEXT', repository,
    repositoryId, mergeGroupBaseSha: mainSha, mergeGroupHeadSha: groupSha, bPrNumber: '216',
    bBaseSha: mainSha, bHeadSha: bSha, bPullRequestCreatedAt: '2026-09-30T00:30:00Z',
    queueEntryState: 'AWAITING_CHECKS', queueEnteredAt: '2026-09-30T01:00:00Z' });
  assert.deepEqual(syntheticVerifiedMergeGroupEvent(result), { action: 'checks_requested', repository: { full_name: repository },
    merge_group: { base_ref: 'refs/heads/main', base_sha: mainSha, head_sha: groupSha } });
  assert.equal(sameVerifiedWorkflowRunContext(result, structuredClone(result)), true);
  assert.equal(sameVerifiedWorkflowRunContext(result, { ...result, currentMainSha: 'f'.repeat(40) }), false);
  assert.equal(sameVerifiedWorkflowRunContext(result, { ...result, bPullRequestCreatedAt: '2026-09-30T00:31:00Z' }), false);
  assert.throws(() => adaptVerifiedWorkflowRunContext({ ...result, unrecognized: true }), /malformed/);
  const { bPullRequestCreatedAt, ...withoutCreatedAt } = result;
  assert.throws(() => adaptVerifiedWorkflowRunContext(withoutCreatedAt), /malformed/);
  assert.throws(() => adaptVerifiedWorkflowRunContext({ ...result, bPullRequestCreatedAt: 'invalid' }), /malformed/);

  const acceptance = createOwnerAmendmentMergeGroupAcceptanceVerifier({
    runtime: { repository, revision: mainSha }, selectBContext: async () => selection,
    resolveProtectedPolicy: async () => { throw new Error('stop after validated exact-B selection'); },
    verifyTrigger: async () => { throw new Error('must not reach trigger'); },
    verifyTag: async () => { throw new Error('must not reach tag'); },
    resolveEligibilityReviewInputs: async () => { throw new Error('must not reach review inputs'); },
    verifyEligibility: async () => { throw new Error('must not reach eligibility'); },
  });
  const accepted = await acceptance.verify(syntheticVerifiedMergeGroupEvent(result));
  assert.match(accepted.reason, /stop after validated exact-B selection/);

  let runWindow;
  const inspected = await inspectOwnerAmendmentSemanticProducerAttempts({ repository,
    bBaseSha: selection.bBaseSha, bHeadSha: selection.bHeadSha,
    bPullRequestCreatedAt: selection.bPullRequestCreatedAt, queueEnteredAt: selection.queueEnteredAt,
    listRuns: async args => { runWindow = args; return { total_count: 0, workflow_runs: [] }; },
    listJobs: async () => ({ total_count: 0, jobs: [] }),
  });
  assert.deepEqual(runWindow, { repository, bBaseSha: mainSha,
    createdFrom: '2026-09-30T00:30:00Z', createdTo: '2026-09-30T01:00:00Z', page: 1, perPage: 100 });
  assert.equal(inspected.hasSuccessfulSignerBeforeQueue, false);
});

test('only independent protected verifier outcomes can publish success; failures bind no success', () => {
  assert.equal(protectedCheckConclusion({ verificationOutcome: 'success', route: 'amendment' }), 'success');
  assert.equal(protectedCheckConclusion({ verificationOutcome: 'success', route: 'ordinary', ordinaryValidationOutcome: 'success' }), 'success');
  for (const value of [
    { verificationOutcome: 'failure', route: 'amendment' },
    { verificationOutcome: 'failure', route: 'ordinary', ordinaryValidationOutcome: 'success' },
    { verificationOutcome: 'success', route: 'ordinary', ordinaryValidationOutcome: 'failure' },
    { verificationOutcome: 'success', route: 'not-applicable', ordinaryValidationOutcome: 'success' },
    { verificationOutcome: 'success', route: 'candidate-supplied', ordinaryValidationOutcome: 'success' },
  ]) assert.equal(protectedCheckConclusion(value), 'failure');
});

test('publication needs identical live context reread; protected validation failure can bind only failure to that queue SHA', async () => {
  const context = await fixture().resolve();
  const missing = prepareVerifiedCheckReport({ initialContext: null, finalContext: context,
    verificationOutcome: 'success', route: 'amendment' });
  assert.equal(missing.status, 'INCOMPLETE');
  assert.equal(Object.hasOwn(missing, 'headSha'), false);

  const changed = prepareVerifiedCheckReport({ initialContext: context,
    finalContext: { ...context, workflowRunHeadSha: 'f'.repeat(40) },
    verificationOutcome: 'success', route: 'amendment' });
  assert.equal(changed.status, 'INCOMPLETE');
  assert.equal(Object.hasOwn(changed, 'headSha'), false);

  const evidenceFailure = prepareVerifiedCheckReport({ initialContext: context, finalContext: structuredClone(context),
    verificationOutcome: 'failure', route: undefined });
  assert.deepEqual(evidenceFailure, { status: 'PREPARED_PROTECTED_QUEUE_CHECK', headSha: groupSha,
    conclusion: 'failure', assurance: 'outcome is bound to the same live queue context reread immediately before App publication' });
  const ordinaryFailure = prepareVerifiedCheckReport({ initialContext: context, finalContext: structuredClone(context),
    verificationOutcome: 'success', route: 'ordinary', ordinaryValidationOutcome: 'failure' });
  assert.equal(ordinaryFailure.headSha, groupSha);
  assert.equal(ordinaryFailure.conclusion, 'failure');
});
