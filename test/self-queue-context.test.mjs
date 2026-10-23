import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { selectOwnerAmendmentMergeGroupBContext } from '../dist/owner-amendment-merge-group-b-context.mjs';
import { createBoundedSelfQueueApiFetch, prepareSelfQueueContext } from '../scripts/self-queue-context.mjs';

const repository = 'flair-agency/architecture-gatekeeper';
const repositoryId = 1379218762;
const workflowId = '123456789';
const workflowPath = '.github/workflows/merge-group-relay.yml';
const mainSha = 'a'.repeat(40), groupSha = 'c'.repeat(40), bSha = 'b'.repeat(40);
const wakeup = { action: 'completed', repository: { full_name: repository, id: repositoryId },
  workflow_run: { id: 99887766, run_attempt: 2, workflow_id: 999, head_sha: 'd'.repeat(40) } };

function selected(overrides = {}) {
  return { status: 'SELECTED_OWNER_AMENDMENT_WORKFLOW_RUN_MERGE_GROUP_CONTEXT',
    repository, repositoryId, workflowId: Number(workflowId), workflowPath,
    runId: wakeup.workflow_run.id, runAttempt: wakeup.workflow_run.run_attempt,
    workflowRunHeadSha: groupSha, observedQueueBranch: 'gh-readonly-queue/main/pr-216-abcdef0123456789',
    observedQueueRefSha: groupSha, currentMainSha: mainSha, bPrNumber: '216', bHeadSha: bSha,
    queueEntryState: 'AWAITING_CHECKS', queueEntryEnqueuedAt: '2026-10-20T01:00:00Z',
    assurance: 'context selection only; no policy, evidence, eligibility, or acceptance claim', ...overrides };
}
function input(overrides = {}) {
  const captured = { events: [], outputs: [], expected: null };
  return { captured, args: { event: wakeup, eventName: 'workflow_run', repository, repositoryId,
    workflowId, workflowPath, runtimeRevision: mainSha, token: 'fixture-token',
    resolveContext: async value => { captured.expected = value.expected; return selected(); },
    writeEvent: async value => captured.events.push(value),
    emitOutput: async value => captured.outputs.push(value), ...overrides } };
}

test('builds downstream merge-group event from exact live queue context and current protected main', async () => {
  const f = input();
  const result = await prepareSelfQueueContext(f.args);
  assert.equal(result.status, 'PROTECTED_QUEUE_CONTEXT_READY');
  assert.deepEqual(f.captured.expected, { repository, repositoryId, workflowId: Number(workflowId), workflowPath, targetBranch: 'main' });
  assert.equal(f.captured.events.length, 1);
  assert.deepEqual(f.captured.events[0], { action: 'checks_requested', repository: { full_name: repository, id: repositoryId },
    merge_group: { base_ref: 'refs/heads/main', base_sha: mainSha, head_sha: groupSha } });
  assert.deepEqual(result.outputs, { base_sha: mainSha, group_sha: groupSha, pr_number: '216', b_sha: bSha });
  assert.equal(f.captured.outputs[0], `base_sha=${mainSha}\ngroup_sha=${groupSha}\npr_number=216\nb_sha=${bSha}\n`);
  assert.match(result.assurance, /no policy, evidence, eligibility, or acceptance claim/);
});

test('does not persist or emit when protected runtime is stale or live queue selection mismatches', async t => {
  for (const [label, overrides] of [
    ['runtime revision differs from current main', { runtimeRevision: 'd'.repeat(40) }],
    ['resolver is incomplete', { resolveContext: async () => ({ status: 'INCOMPLETE', reason: 'stale queue' }) }],
    ['wrong current main', { resolveContext: async () => selected({ currentMainSha: 'd'.repeat(40) }) }],
    ['wrong workflow binding', { resolveContext: async () => selected({ workflowPath: '.github/workflows/untrusted.yml' }) }],
    ['wrong queue ref SHA', { resolveContext: async () => selected({ observedQueueRefSha: 'd'.repeat(40) }) }],
    ['wrong run ID', { resolveContext: async () => selected({ runId: wakeup.workflow_run.id + 1 }) }],
    ['wrong run attempt', { resolveContext: async () => selected({ runAttempt: wakeup.workflow_run.run_attempt + 1 }) }],
    ['invalid PR number', { resolveContext: async () => selected({ bPrNumber: '0' }) }],
  ]) await t.test(label, async () => {
    const f = input(overrides);
    await assert.rejects(prepareSelfQueueContext(f.args), /protected runtime revision|live queue resolver/);
    assert.deepEqual(f.captured.events, []);
    assert.deepEqual(f.captured.outputs, []);
  });
});

test('accepts only completed workflow_run wakeups for fixed self repository identity', async t => {
  for (const [label, edit] of [
    ['wrong event name', args => { args.eventName = 'merge_group'; }],
    ['wrong action', args => { args.event = { ...wakeup, action: 'requested' }; }],
    ['wrong repository name', args => { args.event = { ...wakeup, repository: { ...wakeup.repository, full_name: 'attacker/repo' } }; }],
    ['wrong event repository ID', args => { args.event = { ...wakeup, repository: { ...wakeup.repository, id: repositoryId + 1 } }; }],
    ['wrong caller repository', args => { args.repository = 'attacker/repo'; }],
    ['wrong caller repository ID', args => { args.repositoryId = String(repositoryId + 1); }],
    ['malformed relay ID', args => { args.workflowId = '1.5'; }],
    ['malformed relay path', args => { args.workflowPath = 'candidate.yml'; }],
    ['missing run selector', args => { args.event = { ...wakeup, workflow_run: { id: 0, run_attempt: 1 } }; }],
  ]) await t.test(label, async () => {
    const f = input(); edit(f.args);
    await assert.rejects(prepareSelfQueueContext(f.args));
    assert.equal(f.captured.expected, null);
    assert.deepEqual(f.captured.events, []);
  });
});

test('minimal reconstructed event is accepted by the existing exact-B resolver against mocked live GitHub APIs', async () => {
  const captured = { event: null, outputs: [] };
  const result = await prepareSelfQueueContext({ event: wakeup, eventName: 'workflow_run', repository, repositoryId,
    workflowId, workflowPath, runtimeRevision: mainSha, token: 'fixture-token',
    resolveContext: async () => selected(),
    writeEvent: async value => { captured.event = value; },
    emitOutput: async value => captured.outputs.push(value),
  });
  assert.equal(result.status, 'PROTECTED_QUEUE_CONTEXT_READY');
  assert.deepEqual(captured.event, result.mergeGroupEvent);

  const treeSha = 'e'.repeat(40);
  const graphRepositoryId = 'R_kgDOChD4VA';
  const apiRoot = 'https://api.github.com/repos/flair-agency/architecture-gatekeeper';
  const pr = { number: 216, state: 'open', draft: false, created_at: '2026-10-19T00:00:00Z',
    base: { ref: 'main', sha: mainSha, repo: { id: repositoryId, full_name: repository } },
    head: { sha: bSha, repo: { id: repositoryId, full_name: repository } } };
  const graph = { data: { repository: { id: graphRepositoryId, nameWithOwner: repository, pullRequest: {
    number: 216, state: 'OPEN', isDraft: false, baseRefName: 'main', baseRefOid: mainSha, headRefOid: bSha,
    baseRepository: { id: graphRepositoryId, nameWithOwner: repository },
    headRepository: { id: graphRepositoryId, nameWithOwner: repository },
    mergeQueueEntry: { state: 'AWAITING_CHECKS', enqueuedAt: '2026-10-20T01:00:00Z',
      baseCommit: { oid: mainSha }, headCommit: { oid: bSha }, pullRequest: { number: 216 } },
  } } } };
  const fetchImpl = async (url, options = {}) => {
    if (url === apiRoot) return new Response(JSON.stringify({ id: repositoryId, full_name: repository }), { status: 200 });
    if (url === `${apiRoot}/commits/${groupSha}`) return new Response(JSON.stringify({ sha: groupSha,
      parents: [{ sha: mainSha }, { sha: bSha }], commit: { tree: { sha: treeSha } } }), { status: 200 });
    if (url === `${apiRoot}/commits/${bSha}`) return new Response(JSON.stringify({ sha: bSha, commit: { tree: { sha: treeSha } } }), { status: 200 });
    if (url === `${apiRoot}/commits/${bSha}/pulls?per_page=100&page=1`) return new Response(JSON.stringify([pr]), { status: 200 });
    if (url === `${apiRoot}/commits/${bSha}/pulls?per_page=100&page=2`) return new Response('[]', { status: 200 });
    if (url === 'https://api.github.com/graphql') {
      assert.equal(options.method, 'POST');
      return new Response(JSON.stringify(graph), { status: 200 });
    }
    throw new Error(`Unexpected mock URL ${url}`);
  };
  const boundedFetch = createBoundedSelfQueueApiFetch(fetchImpl);
  let selectedB;
  try { selectedB = await selectOwnerAmendmentMergeGroupBContext({ event: captured.event, token: 'fixture-token', fetchImpl: boundedFetch }); }
  finally { boundedFetch.dispose(); }
  assert.equal(selectedB.status, 'SELECTED_OWNER_AMENDMENT_MERGE_GROUP_B_CONTEXT', selectedB.reason);
  assert.equal(selectedB.repository, repository);
  assert.equal(selectedB.mergeGroupBaseSha, mainSha);
  assert.equal(selectedB.mergeGroupHeadSha, groupSha);
  assert.equal(selectedB.bPrNumber, '216');
  assert.equal(selectedB.bBaseSha, mainSha);
  assert.equal(selectedB.bHeadSha, bSha);
  assert.equal(selectedB.queueEntryState, 'AWAITING_CHECKS');
  assert.equal(captured.outputs[0], `base_sha=${mainSha}\ngroup_sha=${groupSha}\npr_number=216\nb_sha=${bSha}\n`);
});

test('bounded queue API adapter rejects endpoint escapes, redirects, and oversized JSON responses', async () => {
  let calls = 0;
  const bounded = createBoundedSelfQueueApiFetch(async url => {
    calls += 1;
    assert.equal(url, 'https://api.github.com/repos/flair-agency/architecture-gatekeeper/metadata');
    return new Response('{"ok":true}', { status: 200 });
  });
  try {
    const result = await bounded('https://api.github.com/repos/flair-agency/architecture-gatekeeper/metadata', { redirect: 'error' });
    assert.deepEqual(await result.json(), { ok: true });
    await assert.rejects(bounded('https://attacker.invalid/repos/flair-agency/architecture-gatekeeper/metadata', { redirect: 'error' }));
  } finally { bounded.dispose(); }
  assert.equal(calls, 1);

  const oversized = createBoundedSelfQueueApiFetch(async () => new Response('x'.repeat(262_145), { status: 200 }));
  try { await assert.rejects(oversized('https://api.github.com/repos/flair-agency/architecture-gatekeeper/oversized', { redirect: 'error' }), /bound/); }
  finally { oversized.dispose(); }

  const redirected = createBoundedSelfQueueApiFetch(async () => new Response('{}', { status: 302 }));
  try { await assert.rejects(redirected('https://api.github.com/repos/flair-agency/architecture-gatekeeper/redirect', { redirect: 'error' }), /unavailable, redirected/); }
  finally { redirected.dispose(); }
});

test('actual context CLI derives event path from runner temp and uses trusted workspace accessor', t => {
  const runnerTemp = realpathSync(mkdtempSync(join(tmpdir(), 'self-queue-context-runner-temp-')));
  const workspace = mkdtempSync(join(tmpdir(), 'self-queue-context-workspace-'));
  t.after(() => { rmSync(runnerTemp, { recursive: true, force: true }); rmSync(workspace, { recursive: true, force: true }); });
  execFileSync('git', ['init', '-q', workspace]);
  execFileSync('git', ['-C', workspace, 'config', 'user.email', 'queue-test@example.invalid']);
  execFileSync('git', ['-C', workspace, 'config', 'user.name', 'Queue Test']);
  writeFileSync(join(workspace, 'tracked.txt'), 'protected runtime fixture\n');
  execFileSync('git', ['-C', workspace, 'add', 'tracked.txt']);
  execFileSync('git', ['-C', workspace, 'commit', '-qm', 'protected runtime fixture']);
  const runtimeSha = execFileSync('git', ['-C', workspace, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  mkdirSync(join(runnerTemp, '_github_workflow'));
  const eventPath = join(runnerTemp, '_github_workflow', 'event.json');
  writeFileSync(eventPath, JSON.stringify(wakeup));
  const env = { ...process.env, RUNNER_TEMP: runnerTemp, GITHUB_EVENT_PATH: eventPath, GITHUB_WORKSPACE: workspace,
    GITHUB_EVENT_NAME: 'workflow_run', GITHUB_REPOSITORY: repository, GITHUB_REPOSITORY_ID: String(repositoryId),
    SELF_QUEUE_RELAY_WORKFLOW_ID: 'invalid', SELF_QUEUE_RELAY_WORKFLOW_PATH: workflowPath, GH_TOKEN: 'fixture-token' };
  const script = new URL('../scripts/self-queue-context.mjs', import.meta.url).pathname;
  const validPath = spawnSync(process.execPath, [script], { cwd: runnerTemp, encoding: 'utf8', env });
  assert.equal(validPath.status, 1);
  assert.match(validPath.stderr, /protected relay workflow ID is invalid/);

  const outsidePath = join(runnerTemp, 'outside-event.json');
  writeFileSync(outsidePath, JSON.stringify(wakeup));
  const mismatchedPath = spawnSync(process.execPath, [script], { cwd: runnerTemp, encoding: 'utf8', env: { ...env, GITHUB_EVENT_PATH: outsidePath } });
  assert.equal(mismatchedPath.status, 1);
  assert.match(mismatchedPath.stderr, /GitHub event path is unavailable/);
});
