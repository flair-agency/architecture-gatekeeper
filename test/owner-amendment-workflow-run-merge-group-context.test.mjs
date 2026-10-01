import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveOwnerAmendmentWorkflowRunMergeGroupContext } from '../src/owner-amendment-workflow-run-merge-group-context.mjs';

const repository = 'flair-agency/architecture-gatekeeper';
const repositoryId = 1379218762;
const workflowId = 123456789;
const workflowPath = '.github/workflows/candidate-amendment.yml';
const runId = 99887766, attempt = 2;
const mainSha = 'a'.repeat(40), bSha = 'b'.repeat(40), groupSha = 'c'.repeat(40);
const queueBranch = 'gh-readonly-queue/main/pr-216-abcdef0123456789';
const graphRepoId = 'R_kgDOChD4VA';
const root = 'https://api.github.com/repos/flair-agency/architecture-gatekeeper';
const expected = { repository, repositoryId, workflowId, workflowPath, targetBranch: 'main' };
const wakeup = { action: 'completed', workflow_run: { id: runId, run_attempt: attempt,
  // These untrusted wake-up claims are intentionally ignored by the resolver.
  head_sha: 'd'.repeat(40), head_branch: 'gh-readonly-queue/main/fake' } };

const response = body => ({ status: 200, ok: true, json: async () => body });

function fixture(overrides = {}) {
  const calls = [];
  const state = {
    repo: { id: repositoryId, full_name: repository },
    attempt: { id: runId, run_attempt: attempt, repository: { id: repositoryId, full_name: repository },
      workflow_id: workflowId, path: workflowPath, event: 'merge_group', status: 'completed',
      conclusion: 'failure', head_sha: groupSha, head_branch: queueBranch },
    queueRef: { ref: `refs/heads/${queueBranch}`, object: { type: 'commit', sha: groupSha } },
    queueRefReadResponses: [], queueRefReadCount: 0,
    mainRef: { ref: 'refs/heads/main', object: { type: 'commit', sha: mainSha } },
    mainRefReadResponses: [], mainRefReadCount: 0,
    groupCommit: { sha: groupSha, tree: { sha: 'e'.repeat(40) },
      parents: [{ sha: mainSha }, { sha: bSha }] },
    bCommit: { sha: bSha, tree: { sha: 'e'.repeat(40) } },
    pr: { number: 216, state: 'open', draft: false, created_at: '2026-09-30T00:30:00Z',
      base: { ref: 'main', sha: mainSha, repo: { id: repositoryId, full_name: repository } },
      head: { sha: bSha, repo: { id: repositoryId, full_name: repository } } },
    graph: { data: { repository: { id: graphRepoId, nameWithOwner: repository,
      pullRequest: { number: 216, state: 'OPEN', isDraft: false, baseRefName: 'main',
        baseRefOid: mainSha, headRefOid: bSha,
        baseRepository: { id: graphRepoId, nameWithOwner: repository },
        headRepository: { id: graphRepoId, nameWithOwner: repository },
        mergeQueueEntry: { state: 'AWAITING_CHECKS', baseCommit: { oid: mainSha },
          headCommit: { oid: bSha }, pullRequest: { number: 216 },
          enqueuedAt: '2026-09-30T01:00:00Z' },
      } } } },
    ...overrides,
  };
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url, options });
    if (url === `${root}/actions/runs/${runId}/attempts/${attempt}`) return response(state.attempt);
    if (url === `${root}/git/ref/heads/${queueBranch}`) {
      const index = state.queueRefReadCount++;
      return response(index < state.queueRefReadResponses.length ? state.queueRefReadResponses[index] : state.queueRef);
    }
    if (url === root) return response(state.repo);
    if (url === `${root}/git/ref/heads/main`) {
      const index = state.mainRefReadCount++;
      return response(index < state.mainRefReadResponses.length ? state.mainRefReadResponses[index] : state.mainRef);
    }
    if (url === `${root}/git/commits/${groupSha}`) return response(state.groupCommit);
    if (url === `${root}/git/commits/${bSha}`) return response(state.bCommit);
    const pullListPrefix = `${root}/commits/${bSha}/pulls?per_page=100&page=`;
    if (url.startsWith(pullListPrefix)) {
      const page = Number(url.slice(pullListPrefix.length));
      if (Array.isArray(state.associatedPages)) return response(state.associatedPages[page - 1] ?? []);
      if (page === 1) return response(state.associated ?? [state.pr]);
      return response([]);
    }
    if (url === 'https://api.github.com/graphql') {
      const payload = JSON.parse(options.body);
      const projected = structuredClone(state.graph);
      if (!payload.query.includes('enqueuedAt')) {
        delete projected.data?.repository?.pullRequest?.mergeQueueEntry?.enqueuedAt;
      }
      return response(projected);
    }
    throw new Error('unexpected test request');
  };
  return { state, calls, fetchImpl,
    resolve: (event = wakeup, overridesExpected = expected, token = 'fixture-token') =>
      resolveOwnerAmendmentWorkflowRunMergeGroupContext({ event, token, expected: overridesExpected, fetchImpl }) };
}

test('binds exact attempt, live queue ref, current main, exact B, and active queue entry', async () => {
  const f = fixture();
  const result = await f.resolve();
  assert.deepEqual(result, {
    status: 'SELECTED_OWNER_AMENDMENT_WORKFLOW_RUN_MERGE_GROUP_CONTEXT',
    repository, repositoryId, workflowId, workflowPath, runId, runAttempt: attempt,
    workflowRunHeadSha: groupSha, observedQueueBranch: queueBranch, observedQueueRefSha: groupSha,
    currentMainSha: mainSha, bPrNumber: '216', bHeadSha: bSha, bPullRequestCreatedAt: '2026-09-30T00:30:00Z',
    queueEntryState: 'AWAITING_CHECKS', queueEntryEnqueuedAt: '2026-09-30T01:00:00Z',
    assurance: 'context selection only; no policy, evidence, eligibility, or acceptance claim',
  });
  assert.equal(f.calls.length, 10);
  assert.equal(f.calls[0].url, `${root}/actions/runs/${runId}/attempts/${attempt}`);
  assert.equal(f.calls[1].url, `${root}/git/ref/heads/${queueBranch}`);
  assert.equal(f.calls.at(-2).url, `${root}/git/ref/heads/${queueBranch}`);
  assert.equal(f.calls.at(-1).url, `${root}/git/ref/heads/main`);
  for (const call of f.calls) {
    assert.equal(call.options.headers.authorization, 'Bearer fixture-token');
    assert.equal(call.options.redirect, 'error');
  }
  assert.equal(f.calls.at(-3).options.method, 'POST');
  const graphQuery = JSON.parse(f.calls.at(-3).options.body).query;
  assert.match(graphQuery, /mergeQueueEntry \{ state baseCommit \{ oid \} headCommit \{ oid \} pullRequest \{ number \} enqueuedAt \}/);
});

test('uses only wake-up ID/attempt selectors and exact API-attempt identity', async t => {
  for (const [name, edit] of [
    ['wrong run ID', run => { run.id += 1; }],
    ['wrong attempt', run => { run.run_attempt += 1; }],
    ['wrong repository', run => { run.repository.full_name = 'attacker/repo'; }],
    ['wrong repository ID', run => { run.repository.id += 1; }],
    ['wrong workflow ID', run => { run.workflow_id += 1; }],
    ['wrong workflow path', run => { run.path = '.github/workflows/untrusted.yml@refs/heads/main'; }],
    ['annotated workflow path is not the REST metadata form', run => { run.path = `${workflowPath}@refs/heads/main`; }],
    ['wrong event', run => { run.event = 'pull_request'; }],
    ['not completed', run => { run.status = 'in_progress'; }],
    ['malformed run head', run => { run.head_sha = 'bad'; }],
    ['wrong queue prefix', run => { run.head_branch = 'refs/heads/main'; }],
    ['malformed queue branch', run => { run.head_branch = 'gh-readonly-queue/main/../main'; }],
  ]) await t.test(name, async () => {
    const f = fixture(); edit(f.state.attempt);
    assert.equal((await f.resolve()).status, 'INCOMPLETE');
  });
  for (const event of [ {}, { workflow_run: { id: 0, run_attempt: 1 } },
    { workflow_run: { id: runId, run_attempt: 1.2 } } ]) {
    const f = fixture();
    assert.equal((await f.resolve(event)).status, 'INCOMPLETE');
    assert.equal(f.calls.length, 0);
  }
});

test('rejects stale completed run after the same base, B, and queue entry rebuild at a new group SHA', async () => {
  const f = fixture();
  f.state.queueRef.object.sha = 'f'.repeat(40);
  const result = await f.resolve();
  assert.equal(result.status, 'INCOMPLETE');
  assert.match(result.reason, /live queue ref/);
  assert.equal(f.calls.length, 2);
});

test('rechecks live refs at the return boundary after queue-entry validation', async t => {
  const changedQueue = { ref: `refs/heads/${queueBranch}`, object: { type: 'commit', sha: 'f'.repeat(40) } };
  const changedMain = { ref: 'refs/heads/main', object: { type: 'commit', sha: 'd'.repeat(40) } };
  const malformedMain = { ref: 'refs/heads/main', object: { type: 'tag', sha: mainSha } };
  for (const [name, setLateRead] of [
    ['queue ref changed after initial match', f => {
      f.state.queueRefReadResponses = [structuredClone(f.state.queueRef), changedQueue];
    }],
    ['queue ref missing after initial match', f => {
      f.state.queueRefReadResponses = [structuredClone(f.state.queueRef), null];
    }],
    ['main ref changed after initial match', f => {
      f.state.mainRefReadResponses = [structuredClone(f.state.mainRef), changedMain];
    }],
    ['main ref malformed after initial match', f => {
      f.state.mainRefReadResponses = [structuredClone(f.state.mainRef), malformedMain];
    }],
  ]) await t.test(name, async () => {
    const f = fixture(); setLateRead(f);
    const result = await f.resolve();
    assert.equal(result.status, 'INCOMPLETE');
    assert.equal(f.state.queueRefReadCount, 2);
    assert.equal(f.state.mainRefReadCount, 2);
  });
  const stable = fixture();
  assert.equal((await stable.resolve()).status, 'SELECTED_OWNER_AMENDMENT_WORKFLOW_RUN_MERGE_GROUP_CONTEXT');
  assert.equal(stable.state.queueRefReadCount, 2);
  assert.equal(stable.state.mainRefReadCount, 2);
});

test('continues associated-PR pagination and selects the exact B found only on page 2', async () => {
  const f = fixture();
  const unrelatedPage = Array.from({ length: 100 }, (_, index) => ({
    ...structuredClone(f.state.pr), number: 300 + index, head: { ...f.state.pr.head, sha: 'd'.repeat(40) },
  }));
  f.state.associatedPages = [unrelatedPage, [f.state.pr]];
  const result = await f.resolve();
  assert.equal(result.status, 'SELECTED_OWNER_AMENDMENT_WORKFLOW_RUN_MERGE_GROUP_CONTEXT');
  assert.equal(result.bPrNumber, '216');
  assert.ok(f.calls.some(call => call.url.endsWith('/pulls?per_page=100&page=2')));
});

test('fails closed when associated-PR pagination remains full through its 100-page limit', async () => {
  const f = fixture();
  const fullPage = Array.from({ length: 100 }, (_, index) => ({
    ...structuredClone(f.state.pr), number: 400 + index, head: { ...f.state.pr.head, sha: 'd'.repeat(40) },
  }));
  f.state.associatedPages = Array.from({ length: 100 }, () => fullPage);
  const result = await f.resolve();
  assert.equal(result.status, 'INCOMPLETE');
  assert.match(result.reason, /exceeds the page limit/);
  assert.equal(f.calls.filter(call => call.url.includes('/pulls?per_page=100&page=')).length, 100);
  assert.equal(f.calls.some(call => call.url === 'https://api.github.com/graphql'), false);
});

test('requires exact live queue ref name, commit object type, and head SHA', async t => {
  for (const [name, edit] of [
    ['returned name mismatch', ref => { ref.ref = 'refs/heads/gh-readonly-queue/main/other'; }],
    ['deleted or malformed ref', ref => { ref.object = null; }],
    ['non-commit ref object', ref => { ref.object.type = 'tag'; }],
    ['malformed object SHA', ref => { ref.object.sha = 'bad'; }],
  ]) await t.test(name, async () => {
    const f = fixture(); edit(f.state.queueRef);
    assert.equal((await f.resolve()).status, 'INCOMPLETE');
  });
});

test('requires live main and a two-parent exact-B tree', async t => {
  for (const [name, edit] of [
    ['wrong main ref name', f => { f.state.mainRef.ref = 'refs/heads/release'; }],
    ['current main moved from group first parent', f => { f.state.mainRef.object.sha = 'd'.repeat(40); }],
    ['wrong group SHA response', f => { f.state.groupCommit.sha = 'd'.repeat(40); }],
    ['missing parent', f => { f.state.groupCommit.parents = [{ sha: mainSha }]; }],
    ['extra parent', f => { f.state.groupCommit.parents.push({ sha: 'd'.repeat(40) }); }],
    ['missing B SHA', f => { f.state.groupCommit.parents[1].sha = 'bad'; }],
    ['B commit response mismatch', f => { f.state.bCommit.sha = 'd'.repeat(40); }],
    ['tree differs from B', f => { f.state.bCommit.tree.sha = 'd'.repeat(40); }],
  ]) await t.test(name, async () => {
    const f = fixture(); edit(f);
    assert.equal((await f.resolve()).status, 'INCOMPLETE');
  });
});

test('requires one exact open same-repository main PR and active live queue entry', async t => {
  for (const [name, edit] of [
    ['no associated PR', f => { f.state.associated = []; }],
    ['ambiguous exact PRs', f => { f.state.associated = [f.state.pr, { ...structuredClone(f.state.pr), number: 217 }]; }],
    ['closed PR', f => { f.state.pr.state = 'closed'; }],
    ['draft PR', f => { f.state.pr.draft = true; }],
    ['fork PR', f => { f.state.pr.head.repo.id += 1; }],
    ['wrong PR base SHA', f => { f.state.pr.base.sha = 'd'.repeat(40); }],
    ['missing PR creation time', f => { delete f.state.pr.created_at; }],
    ['malformed PR creation time', f => { f.state.pr.created_at = 'not-a-time'; }],
    ['PR created after queue entry', f => { f.state.pr.created_at = '2026-09-30T01:00:01Z'; }],
    ['queue entry absent', f => { f.state.graph.data.repository.pullRequest.mergeQueueEntry = null; }],
    ['wrong queue base', f => { f.state.graph.data.repository.pullRequest.mergeQueueEntry.baseCommit.oid = 'd'.repeat(40); }],
    ['wrong queue B', f => { f.state.graph.data.repository.pullRequest.mergeQueueEntry.headCommit.oid = 'd'.repeat(40); }],
    ['wrong queued PR', f => { f.state.graph.data.repository.pullRequest.mergeQueueEntry.pullRequest.number = 999; }],
    ['inactive queue state', f => { f.state.graph.data.repository.pullRequest.mergeQueueEntry.state = 'UNMERGEABLE'; }],
    ['null repository queue readback', f => { f.state.graph.data.repository = null; }],
    ['GraphQL error', f => { f.state.graph.errors = [{ message: 'sensitive API text is not returned' }]; }],
    ['malformed GraphQL errors object', f => { f.state.graph.errors = { message: 'malformed' }; }],
    ['malformed GraphQL errors string', f => { f.state.graph.errors = 'malformed'; }],
    ['malformed GraphQL errors null', f => { f.state.graph.errors = null; }],
  ]) await t.test(name, async () => {
    const f = fixture(); edit(f);
    assert.equal((await f.resolve()).status, 'INCOMPLETE');
  });
  const noErrors = fixture();
  noErrors.state.graph.errors = [];
  assert.equal((await noErrors.resolve()).status, 'SELECTED_OWNER_AMENDMENT_WORKFLOW_RUN_MERGE_GROUP_CONTEXT');
});

test('fails closed on API, JSON, token, and fixed-identity failures without leaking details', async () => {
  const f = fixture();
  assert.equal((await f.resolve(wakeup, expected, '')).status, 'INCOMPLETE');
  const fetchFailure = await resolveOwnerAmendmentWorkflowRunMergeGroupContext({ event: wakeup,
    token: 'fixture-token', expected, fetchImpl: async () => { throw new Error('secret response body'); } });
  assert.equal(fetchFailure.status, 'INCOMPLETE');
  assert.doesNotMatch(fetchFailure.reason, /secret response body/);
  const malformedJson = await resolveOwnerAmendmentWorkflowRunMergeGroupContext({ event: wakeup,
    token: 'fixture-token', expected, fetchImpl: async () => ({ status: 200, json: async () => { throw new Error('body'); } }) });
  assert.equal(malformedJson.status, 'INCOMPLETE');
  assert.match(malformedJson.reason, /invalid JSON/);
  const wrongExpected = { ...expected, workflowId: 0 };
  assert.equal((await f.resolve(wakeup, wrongExpected)).status, 'INCOMPLETE');
  const annotatedExpectedPath = { ...expected, workflowPath: `${workflowPath}@refs/heads/main` };
  const wrongPath = fixture();
  assert.equal((await wrongPath.resolve(wakeup, annotatedExpectedPath)).status, 'INCOMPLETE');
  assert.equal(wrongPath.calls.length, 0);
});
