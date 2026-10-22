import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { runSelfQueueAcceptance } from '../scripts/self-queue-acceptance.mjs';
import { selectOwnerAmendmentMergeGroupBContext } from '../dist/owner-amendment-merge-group-b-context.mjs';
import { parse } from 'yaml';

const repository = 'flair-agency/architecture-gatekeeper';
const repositoryId = 1379218762;
const workflowId = '123456789';
const workflowPath = '.github/workflows/self-queue-relay.yml';
const workflowRef = 'flair-agency/architecture-gatekeeper/.github/workflows/self-queue-acceptance.yml@refs/heads/main';
const groupSha = 'c'.repeat(40), bSha = 'b'.repeat(40);
const queueBranch = 'gh-readonly-queue/main/pr-216-abcdef0123456789';
const treeSha = 'e'.repeat(40), runId = 99887766, attempt = 2;
const apiRoot = 'https://api.github.com/repos/flair-agency/architecture-gatekeeper';

function makeRepository() {
  const root = mkdtempSync(join(tmpdir(), 'self-queue-acceptance-git-'));
  execFileSync('git', ['init', '-q', root]);
  execFileSync('git', ['-C', root, 'config', 'user.email', 'queue-test@example.invalid']);
  execFileSync('git', ['-C', root, 'config', 'user.name', 'Queue Test']);
  writeFileSync(join(root, 'tracked.txt'), 'protected runtime fixture\n');
  execFileSync('git', ['-C', root, 'add', 'tracked.txt']);
  execFileSync('git', ['-C', root, 'commit', '-qm', 'protected runtime fixture']);
  const mainSha = execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  return { root, mainSha };
}

function fixture(mainSha, overrides = {}) {
  const event = { action: 'completed', repository: { full_name: repository, id: repositoryId },
    workflow_run: { id: runId, run_attempt: attempt, workflow_id: 999, head_sha: 'd'.repeat(40) } };
  const graphRepositoryId = 'R_kgDOChD4VA';
  const pr = { number: 216, state: 'open', draft: false, created_at: '2026-10-19T00:00:00Z',
    base: { ref: 'main', sha: mainSha, repo: { id: repositoryId, full_name: repository } },
    head: { sha: bSha, repo: { id: repositoryId, full_name: repository } } };
  const state = {
    repo: { id: repositoryId, full_name: repository },
    attemptData: { id: runId, run_attempt: attempt, repository: { id: repositoryId, full_name: repository },
      workflow_id: Number(workflowId), path: workflowPath, event: 'merge_group', status: 'completed',
      head_sha: groupSha, head_branch: queueBranch },
    queueRef: { ref: `refs/heads/${queueBranch}`, object: { type: 'commit', sha: groupSha } },
    mainRef: { ref: 'refs/heads/main', object: { type: 'commit', sha: mainSha } },
    groupCommit: { sha: groupSha, tree: { sha: treeSha }, commit: { tree: { sha: treeSha } }, parents: [{ sha: mainSha }, { sha: bSha }] },
    bCommit: { sha: bSha, tree: { sha: treeSha }, commit: { tree: { sha: treeSha } } },
    graph: { data: { repository: { id: graphRepositoryId, nameWithOwner: repository, pullRequest: {
      number: 216, state: 'OPEN', isDraft: false, baseRefName: 'main', baseRefOid: mainSha, headRefOid: bSha,
      baseRepository: { id: graphRepositoryId, nameWithOwner: repository },
      headRepository: { id: graphRepositoryId, nameWithOwner: repository },
      mergeQueueEntry: { state: 'AWAITING_CHECKS', enqueuedAt: '2026-10-20T01:00:00Z',
        baseCommit: { oid: mainSha }, headCommit: { oid: bSha }, pullRequest: { number: 216 } },
    } } } },
    ...overrides,
  };
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    if (url === `${apiRoot}/actions/runs/${runId}/attempts/${attempt}`) return new Response(JSON.stringify(state.attemptData), { status: 200 });
    if (url === `${apiRoot}/git/ref/heads/${queueBranch}`) return new Response(JSON.stringify(state.queueRef), { status: 200 });
    if (url === apiRoot) return new Response(JSON.stringify(state.repo), { status: 200 });
    if (url === `${apiRoot}/git/ref/heads/main`) return new Response(JSON.stringify(state.mainRef), { status: 200 });
    if (url === `${apiRoot}/git/commits/${groupSha}`) return new Response(JSON.stringify(state.groupCommit), { status: 200 });
    if (url === `${apiRoot}/git/commits/${bSha}`) return new Response(JSON.stringify(state.bCommit), { status: 200 });
    if (url === `${apiRoot}/commits/${groupSha}`) return new Response(JSON.stringify(state.groupCommit), { status: 200 });
    if (url === `${apiRoot}/commits/${bSha}`) return new Response(JSON.stringify(state.bCommit), { status: 200 });
    const pullPrefix = `${apiRoot}/commits/${bSha}/pulls?per_page=100&page=`;
    if (url.startsWith(pullPrefix)) return new Response(url.endsWith('page=1') ? JSON.stringify([pr]) : '[]', { status: 200 });
    if (url === 'https://api.github.com/graphql') return new Response(JSON.stringify(state.graph), { status: 200 });
    throw new Error(`Unexpected API URL ${url}`);
  };
  return { event, state, calls, fetchImpl };
}

function envFor(root) {
  const runtimeSha = execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  return { GITHUB_EVENT_NAME: 'workflow_run', GITHUB_REPOSITORY: repository,
    GITHUB_REPOSITORY_ID: String(repositoryId), GITHUB_WORKSPACE: root,
    GITHUB_WORKFLOW_REF: workflowRef, GITHUB_WORKFLOW_SHA: runtimeSha,
    SELF_QUEUE_RELAY_WORKFLOW_ID: workflowId, SELF_QUEUE_RELAY_WORKFLOW_PATH: workflowPath,
    GH_TOKEN: 'test-token' };
}

test('protected preflight runs actual resolver with mocked GitHub APIs and real protected Git HEAD', async t => {
  const repo = makeRepository(); t.after(() => rmSync(repo.root, { recursive: true, force: true }));
  const f = fixture(repo.mainSha);
  const captured = { events: [], outputs: [] };
  const result = await runSelfQueueAcceptance({ args: ['preflight'], env: envFor(repo.root), event: f.event,
    fetchImpl: f.fetchImpl, writeEvent: async value => captured.events.push(value),
    emitOutput: async value => captured.outputs.push(value) });
  assert.equal(result.status, 'PROTECTED_QUEUE_CONTEXT_READY');
  assert.deepEqual(captured.events, [{ action: 'checks_requested', repository: { full_name: repository, id: repositoryId },
    merge_group: { base_ref: 'refs/heads/main', base_sha: repo.mainSha, head_sha: groupSha } }]);
  assert.ok(f.calls.every(call => call.options.headers.authorization === 'Bearer test-token'));
  assert.ok(f.calls.every(call => call.options.signal instanceof AbortSignal));
  const gateSelection = await selectOwnerAmendmentMergeGroupBContext({ event: captured.events[0], token: 'test-token', fetchImpl: f.fetchImpl });
  assert.equal(gateSelection.status, 'SELECTED_OWNER_AMENDMENT_MERGE_GROUP_B_CONTEXT');
  assert.equal(gateSelection.bHeadSha, bSha);
  assert.equal(captured.outputs[0], `base_sha=${repo.mainSha}\ngroup_sha=${groupSha}\npr_number=216\nb_sha=${bSha}\n`);
  assert.deepEqual(captured.outputs[0].trim().split('\n').map(line => line.slice(0, line.indexOf('='))),
    ['base_sha', 'group_sha', 'pr_number', 'b_sha']);
  assert.equal(f.calls[0].url, `${apiRoot}/actions/runs/${runId}/attempts/${attempt}`);
});

test('current queue, exact run selectors, relay identity, and protected HEAD failures emit nothing', async t => {
  const repo = makeRepository(); t.after(() => rmSync(repo.root, { recursive: true, force: true }));
  for (const [label, edit] of [
    ['stale workflow run ID', state => { state.attemptData.id += 1; }],
    ['stale workflow run attempt', state => { state.attemptData.run_attempt += 1; }],
    ['wrong relay workflow ID', state => { state.attemptData.workflow_id += 1; }],
    ['queue base changed', state => { state.mainRef.object.sha = 'f'.repeat(40); }],
  ]) await t.test(label, async () => {
    const f = fixture(repo.mainSha); edit(f.state);
    const captured = { events: [], outputs: [] };
    await assert.rejects(runSelfQueueAcceptance({ args: ['preflight'], env: envFor(repo.root), event: f.event,
      fetchImpl: f.fetchImpl, writeEvent: async value => captured.events.push(value),
      emitOutput: async value => captured.outputs.push(value) }));
    assert.deepEqual(captured.events, []);
    assert.deepEqual(captured.outputs, []);
  });
  const staleRuntime = fixture(repo.mainSha);
  const captured = { events: [], outputs: [] };
  await assert.rejects(runSelfQueueAcceptance({ args: ['preflight'], env: envFor(repo.root), event: staleRuntime.event,
    runGit: () => 'f'.repeat(40), fetchImpl: staleRuntime.fetchImpl,
    writeEvent: async value => captured.events.push(value), emitOutput: async value => captured.outputs.push(value) }));
  assert.deepEqual(captured.events, []);
  assert.deepEqual(captured.outputs, []);
  for (const [label, patchEnv] of [
    ['numeric repository ID changed', { GITHUB_REPOSITORY_ID: '1379218763' }],
    ['wrong receiver workflow ref', { GITHUB_WORKFLOW_REF: 'flair-agency/architecture-gatekeeper/.github/workflows/other.yml@refs/heads/main' }],
    ['workflow SHA differs from protected checkout', { GITHUB_WORKFLOW_SHA: 'a'.repeat(40) }],
  ]) await t.test(label, async () => {
    const f = fixture(repo.mainSha);
    const result = { events: [], outputs: [] };
    await assert.rejects(runSelfQueueAcceptance({ args: ['preflight'], env: { ...envFor(repo.root), ...patchEnv }, event: f.event,
      fetchImpl: f.fetchImpl, writeEvent: async value => result.events.push(value),
      emitOutput: async value => result.outputs.push(value) }));
    assert.deepEqual(result, { events: [], outputs: [] });
  });
});

test('mismatched earlier protected tuple fails before writing a reconstructed event or outputs', async t => {
  const repo = makeRepository(); t.after(() => rmSync(repo.root, { recursive: true, force: true }));
  const f = fixture(repo.mainSha);
  const captured = { events: [], outputs: [] };
  await assert.rejects(runSelfQueueAcceptance({ args: ['preflight'],
    env: { ...envFor(repo.root), SELF_QUEUE_EXPECTED_GROUP_SHA: 'a'.repeat(40) }, event: f.event,
    fetchImpl: f.fetchImpl, writeEvent: async value => captured.events.push(value),
    emitOutput: async value => captured.outputs.push(value) }), /differs from the earlier protected/);
  assert.deepEqual(captured, { events: [], outputs: [] });
});

test('default-off relay and protected receiver isolate model and reporting credentials', () => {
  const relay = parse(readFileSync(new URL('../.github/workflows/self-queue-relay.yml', import.meta.url), 'utf8'));
  const receiver = parse(readFileSync(new URL('../.github/workflows/self-queue-acceptance.yml', import.meta.url), 'utf8'));
  assert.deepEqual(relay.on.merge_group.types, ['checks_requested']);
  assert.deepEqual(relay.permissions, {});
  assert.equal(relay.jobs.relay.if, "vars.ARCHITECTURE_GATE_SELF_APP_ENABLED == 'true'");
  assert.deepEqual(receiver.on.workflow_run.types, ['completed']);
  assert.equal(receiver.jobs['select-context'].if, "vars.ARCHITECTURE_GATE_SELF_APP_ENABLED == 'true'");
  assert.equal(receiver.jobs['select-route'].outputs.group_sha, '${{ steps.context.outputs.group_sha }}');
  assert.equal(receiver.jobs['select-route'].outputs.pr_number, '${{ steps.context.outputs.pr_number }}');
  assert.deepEqual(receiver.jobs['review-ordinary'].permissions, {});
  assert.equal(receiver.jobs['review-ordinary'].environment, 'architecture-gate-self-protected');
  assert.equal(receiver.jobs['review-ordinary'].steps.some(step => JSON.stringify(step).includes('GITHUB_TOKEN') || JSON.stringify(step).includes('GH_TOKEN')), false);
  const reviewer = JSON.stringify(receiver.jobs['review-ordinary']);
  assert.match(reviewer, /secrets\.OPENAI_API_KEY/);
  assert.doesNotMatch(reviewer, /OWNER_AMENDMENT_TAG_RULESET_ID|SELF_QUEUE_RELAY_WORKFLOW_ID|GITHUB_TOKEN|GH_TOKEN/);
  assert.equal(receiver.jobs['report-completeness'].permissions.checks, 'write');
  const finalizer = receiver.jobs['report-completeness'].steps.find(step => step.name === 'Finalize exact Actions completeness check');
  const reportContext = receiver.jobs['report-completeness'].steps.find(step => step.id === 'context');
  const reportGate = receiver.jobs['report-completeness'].steps.find(step => step.id === 'gate');
  assert.match(reportContext?.run ?? '', /\$GITHUB_WORKSPACE\/scripts\/self-queue-acceptance\.mjs"? preflight/);
  assert.match(reportGate?.run ?? '', /\$GITHUB_WORKSPACE\/scripts\/owner-amendment-merge-group-gate\.mjs"?/);
  assert.equal(receiver.jobs['report-completeness'].steps.find(step => step.id === 'binding').env.CURRENT_QUEUE_SHA,
    '${{ steps.context.outputs.group_sha }}');
  assert.equal(receiver.jobs['report-completeness'].steps.find(step => step.name === 'Validate live exact-Queue PR description completeness').env.SELF_PR_NUMBER,
    '${{ steps.context.outputs.pr_number }}');
  assert.doesNotMatch(JSON.stringify(receiver.jobs['report-completeness']), /steps\.gate\.outputs\.(group_sha|pr_number)/);
  assert.equal(finalizer.if, 'always()');
  assert.match(finalizer.run, /passed \? 'success' : 'failure'/);
  assert.doesNotMatch(finalizer.run, /conclusion[^\n]*neutral|conclusion[^\n]*skipped/);
  assert.equal(receiver.jobs['begin-completeness'].environment, 'architecture-gate-self-app-report');
  assert.equal(receiver.jobs['report-completeness'].environment, 'architecture-gate-self-app-report');
  assert.match(JSON.stringify(receiver.jobs['begin-completeness']), /ARCHITECTURE_GATE_SELF_APP_PRIVATE_KEY/);
  assert.match(JSON.stringify(receiver.jobs['report-completeness']), /ARCHITECTURE_GATE_SELF_APP_PRIVATE_KEY/);
  assert.match(JSON.stringify(receiver.jobs['report-completeness']), /finalizeSelfArchitectureCheck/);
  assert.match(JSON.stringify(receiver.jobs['report-completeness']), /finalizeSelfQueueCompletenessCheck/);
  assert.match(JSON.stringify(receiver.jobs['report-completeness']), /self-queue-completeness\.mjs/);
  for (const name of ['select-context', 'begin-completeness', 'select-route', 'prepare-ordinary-review', 'report-completeness']) {
    const job = receiver.jobs[name];
    const checkout = job.steps.find(step => step.uses?.startsWith('actions/checkout@'));
    assert.match(checkout.uses, /^actions\/checkout@[a-f0-9]{40}$/);
    assert.equal(checkout.with?.ref, '${{ github.workflow_sha }}');
    assert.ok(job.steps.some(step => typeof step.run === 'string' && step.run.includes('npm ci --ignore-scripts') && step.run.includes('npm run build')));
    for (const step of job.steps.filter(step => typeof step.run === 'string' && step.run.includes('self-queue-acceptance.mjs preflight'))) {
      assert.equal(step.env.GITHUB_WORKFLOW_REF, '${{ github.workflow_ref }}');
      assert.equal(step.env.GITHUB_WORKFLOW_SHA, '${{ github.workflow_sha }}');
      assert.equal(step['working-directory'], '${{ runner.temp }}');
      assert.match(step.run, /\$GITHUB_WORKSPACE\/scripts\/self-queue-acceptance\.mjs/);
    }
  }
  const ordinaryPrepare = receiver.jobs['prepare-ordinary-review'].steps.find(step => step.id === 'prepare');
  assert.equal(ordinaryPrepare['working-directory'], '${{ runner.temp }}');
  assert.match(ordinaryPrepare.run, /git -C "\$GITHUB_WORKSPACE" fetch/);
  assert.match(ordinaryPrepare.run, /\$GITHUB_WORKSPACE\/scripts\/owner-amendment-merge-group-ordinary-review\.mjs/);
  for (const name of ['select-route', 'report-completeness']) {
    const gate = receiver.jobs[name].steps.find(step => step.id === 'gate');
    assert.equal(gate['working-directory'], '${{ runner.temp }}');
    assert.match(gate.run, /\$GITHUB_WORKSPACE\/scripts\/owner-amendment-merge-group-gate\.mjs/);
  }
  const downloads = [receiver.jobs['review-ordinary'], receiver.jobs['report-completeness']]
    .flatMap(job => job.steps.filter(step => step.uses?.startsWith('actions/download-artifact@')));
  assert.equal(downloads.length, 3);
  for (const step of downloads) {
    assert.ok(step.with['artifact-ids']);
    assert.equal(step.with['run-id'], '${{ github.run_id }}');
    assert.equal(step.with.name, undefined);
  }
  assert.equal(receiver.jobs['prepare-ordinary-review'].outputs.input_artifact_id, '${{ steps.upload-inputs.outputs.artifact-id }}');
  assert.equal(receiver.jobs['review-ordinary'].outputs.decision_artifact_id, '${{ steps.upload-decision.outputs.artifact-id }}');
  assert.match(ordinaryPrepare.run, /git -C "\$GITHUB_WORKSPACE" fetch --no-tags origin/);
  assert.match(JSON.stringify(receiver.jobs['report-completeness']), /ordinary-context\.json/);
  assert.match(JSON.stringify(receiver.jobs['report-completeness']), /CONTEXT_JOB_RESULT/);
  assert.match(JSON.stringify(receiver.jobs['report-completeness']), /PREPARE_JOB_RESULT/);
});

test('actual CLI fails closed from runner temp on missing workflow_run file and never reports acceptance', t => {
  const runnerTemp = mkdtempSync(join(tmpdir(), 'self-queue-cli-runner-temp-'));
  t.after(() => rmSync(runnerTemp, { recursive: true, force: true }));
  const result = spawnSync(process.execPath, [new URL('../scripts/self-queue-acceptance.mjs', import.meta.url).pathname, 'preflight'], {
    cwd: runnerTemp, encoding: 'utf8', env: { ...process.env, GITHUB_EVENT_PATH: '', RUNNER_TEMP: runnerTemp, GITHUB_WORKSPACE: '' },
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /workflow_run event path is unavailable/);
  assert.doesNotMatch(result.stdout, /acceptance|success/i);
});
