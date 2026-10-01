import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { prepareSelfPullRequestAppCheck, publishSelfPullRequestAppCheck,
  verifySelfPullRequestMerge } from '../src/self-pr-app-check.mjs';

const SELF = 'flair-agency/architecture-gatekeeper';
const WORKFLOW_REF = `${SELF}/.github/workflows/self-architecture-gate.yml@refs/heads/main`;
const sha = n => n.toString(16).padStart(40, '0');
const baseSha = sha(1), headSha = sha(2), reviewedSha = sha(3), repoId = 123;
const goodParents = [baseSha, headSha];

function workflowTuple(overrides = {}) {
  return { repository: SELF, eventName: 'pull_request_target', workflowRef: WORKFLOW_REF, baseRef: 'main',
    baseSha, headSha, reviewedSha, actualHeadSha: reviewedSha, parents: goodParents, ...overrides };
}

function liveValues(overrides = {}) {
  return {
    pr: { number: 42, state: 'open', draft: false,
      base: { ref: 'main', sha: baseSha, repo: { full_name: SELF, id: repoId } },
      head: { sha: headSha, repo: { full_name: 'contributor/fork' } } },
    main: { ref: 'refs/heads/main', object: { type: 'commit', sha: baseSha } },
    ...overrides,
  };
}

function response(value, url) {
  return { status: 200, redirected: false, url, json: async () => value };
}

function reportInput(overrides = {}) {
  return { repository: SELF, eventName: 'pull_request_target', workflowRef: WORKFLOW_REF, baseRef: 'main',
    draft: false, prNumber: 42, baseSha, headSha, reviewedSha, policyResult: 'success', reviewResult: 'success',
    reportResult: 'success', acceptResult: 'success', token: 'read-only-token', ...overrides };
}

function fakeFetch(values, calls = []) {
  return async (url, init) => {
    calls.push({ url, init });
    if (url.endsWith('/pulls/42')) return response(values.pr, url);
    if (url.endsWith('/git/ref/heads/main')) return response(values.main, url);
    throw new Error('unexpected URL');
  };
}

test('protected review merge must have exactly the ordered event base and head parents', () => {
  assert.deepEqual(verifySelfPullRequestMerge(workflowTuple()), { baseSha, headSha, reviewedSha });
  for (const invalid of [
    { parents: [headSha, baseSha] },
    { parents: [baseSha] },
    { parents: [baseSha, headSha, sha(4)] },
    { actualHeadSha: sha(5) },
    { reviewedSha: sha(5) },
    { repository: 'attacker/repo' },
    { eventName: 'workflow_dispatch' },
    { workflowRef: `${SELF}/.github/workflows/self-architecture-gate.yml@refs/heads/candidate` },
    { baseRef: 'release' },
  ]) assert.throws(() => verifySelfPullRequestMerge(workflowTuple(invalid)), /exact self pull-request base\/head tuple/);
});

test('live self PR and current main bind the App diagnostic to exact reviewed SHA; fork heads are not precluded', async () => {
  const calls = [];
  const values = liveValues();
  let publication;
  const result = await publishSelfPullRequestAppCheck({ app: { appId: 15368, installationId: 88 },
    input: reportInput({ decision: 'OWNER_DECISION' }), fetchImpl: fakeFetch(values, calls),
    publisher: async args => { publication = args; return { id: 9, ...args.result }; } });
  assert.equal(calls.length, 2);
  assert.ok(calls.every(call => call.init.headers.authorization === 'Bearer read-only-token'));
  assert.deepEqual(publication.result, { headSha, conclusion: 'success' });
  assert.equal(publication.app.repositoryId, repoId);
  assert.equal(result.headSha, headSha);
  assert.equal(result.conclusion, 'success');
  assert.equal(values.pr.head.repo.full_name, 'contributor/fork');
});

test('completed rejected acceptance maps to App failure without taking semantic decision as input', async () => {
  const values = liveValues();
  let published;
  const result = await publishSelfPullRequestAppCheck({ app: {}, input: reportInput({ acceptResult: 'failure',
    decision: 'BLOCK' }), fetchImpl: fakeFetch(values), publisher: async args => {
    published = args.result; return { id: 10, ...args.result };
  } });
  assert.deepEqual(published, { headSha, conclusion: 'failure' });
  assert.equal(result.conclusion, 'failure');
  assert.equal(result.headSha, headSha);
});

test('stale, mismatched or unavailable live tuple never reaches the App publisher', async t => {
  const cases = [
    ['wrong PR number', { pr: { ...liveValues().pr, number: 43 } }],
    ['closed PR', { pr: { ...liveValues().pr, state: 'closed' } }],
    ['draft PR', { pr: { ...liveValues().pr, draft: true } }],
    ['wrong base repository', { pr: { ...liveValues().pr, base: { ...liveValues().pr.base,
      repo: { full_name: 'other/repo', id: repoId } } } }],
    ['wrong target ref', { pr: { ...liveValues().pr, base: { ...liveValues().pr.base, ref: 'release' } } }],
    ['stale PR base', { pr: { ...liveValues().pr, base: { ...liveValues().pr.base, sha: sha(5) } } }],
    ['stale PR head', { pr: { ...liveValues().pr, head: { sha: sha(6) } } }],
    ['stale main', { main: { ref: 'refs/heads/main', object: { type: 'commit', sha: sha(7) } } }],
    ['malformed main ref', { main: { ref: 'refs/heads/main', object: { type: 'tree', sha: baseSha } } }],
    ['missing PR tuple', { pr: { number: 42, state: 'open', draft: false } }],
    ['malformed PR SHA type', { pr: { ...liveValues().pr, head: { sha: 17 } } }],
    ['malformed main SHA type', { main: { ref: 'refs/heads/main', object: { type: 'commit', sha: 17 } } }],
  ];
  for (const [label, overrides] of cases) await t.test(label, async () => {
    let publishCount = 0;
    await assert.rejects(publishSelfPullRequestAppCheck({ app: {}, input: reportInput(),
      fetchImpl: fakeFetch(liveValues(overrides)), publisher: async () => { publishCount += 1; } }));
    assert.equal(publishCount, 0);
  });
});

test('cancelled, skipped, missing, or incomplete protected outcomes remain incomplete without API reads', async t => {
  const cases = [
    ['accept cancelled', { acceptResult: 'cancelled' }],
    ['accept skipped', { acceptResult: 'skipped' }],
    ['accept absent', { acceptResult: '' }],
    ['policy failed', { policyResult: 'failure' }],
    ['review skipped', { reviewResult: 'skipped' }],
    ['report failed', { reportResult: 'failure' }],
  ];
  for (const [label, overrides] of cases) await t.test(label, async () => {
    let apiCount = 0, publishCount = 0;
    await assert.rejects(prepareSelfPullRequestAppCheck(reportInput({ ...overrides,
      fetchImpl: async () => { apiCount += 1; } })));
    assert.equal(apiCount, 0);
    await assert.rejects(publishSelfPullRequestAppCheck({ app: {}, input: reportInput(overrides),
      fetchImpl: async () => { apiCount += 1; }, publisher: async () => { publishCount += 1; } }));
    assert.equal(apiCount, 0);
    assert.equal(publishCount, 0);
  });
});

test('self App job is default-off, caller-fixed, read-only, environment-bound and does not rewrite generic acceptance', () => {
  const workflow = readFileSync(new URL('../.github/workflows/architecture-gate.yml', import.meta.url), 'utf8');
  const selfCaller = readFileSync(new URL('../.github/workflows/self-architecture-gate.yml', import.meta.url), 'utf8');
  assert.match(workflow, /verified_pr_base_sha: \$\{\{ steps\.self-pr-binding\.outputs\.base_sha \}\}/);
  assert.match(workflow, /verified_pr_head_sha: \$\{\{ steps\.self-pr-binding\.outputs\.head_sha \}\}/);
  assert.match(workflow, /Check out the pinned validation runtime[\s\S]*?repository: \$\{\{ job\.workflow_repository \}\}[\s\S]*?ref: \$\{\{ job\.workflow_sha \}\}/);
  assert.match(workflow, /Bind the self review merge commit to the exact PR base and head[\s\S]*?GITHUB_WORKFLOW_REF: \$\{\{ github\.workflow_ref \}\}[\s\S]*?node \.architecture-gatekeeper-validation-runtime\/src\/self-pr-app-check\.mjs verify-merge/);
  assert.match(workflow, /self-app-report:[\s\S]*?vars\.OWNER_AMENDMENT_SELF_APP_REPORT_ENABLED == 'true'[\s\S]*?needs\.accept\.result == 'success' \|\| needs\.accept\.result == 'failure'/);
  assert.match(workflow, /needs: \[policy, review, report, accept\][\s\S]*?permissions:\n      contents: read\n      pull-requests: read[\s\S]*?environment:\n      name: architecture-gate-self-protected/);
  assert.match(workflow, /OWNER_AMENDMENT_APP_PRIVATE_KEY: \$\{\{ secrets\.OWNER_AMENDMENT_APP_PRIVATE_KEY \}\}[\s\S]*?node \.architecture-gatekeeper-runtime\/src\/self-pr-app-check\.mjs publish-pr/);
  assert.match(workflow, /ACCEPT_RESULT: \$\{\{ needs\.accept\.result \}\}/);
  assert.doesNotMatch(workflow, /checks: write/);
  assert.doesNotMatch(workflow, /OWNER_AMENDMENT_SELF_APP_REPORT_ENABLED[^\n]*\|\| true/);
  const appJob = workflow.split('\n  self-app-report:')[1];
  assert.doesNotMatch(workflow.split('\n  self-app-report:')[0], /OWNER_AMENDMENT_APP_(?:ID|INSTALLATION_ID|PRIVATE_KEY)/);
  assert.doesNotMatch(appJob, /download-artifact|head_repo\.full_name|head\.repo\.full_name ==/);
  assert.doesNotMatch(workflow.slice(0, workflow.indexOf('concurrency:')), /environment:|self-app-report/);
  assert.match(selfCaller, /OPENAI_API_KEY: \$\{\{ secrets\.OPENAI_API_KEY \}\}/);
  assert.match(workflow, /Require model-backed PASS or verified G0 owner addition\/amendment/);
  assert.doesNotMatch(workflow, /expected-check-source|required-status-checks|OWNER_AMENDMENT_SELF_APP_REPORT_ENABLED: \$\{\{ inputs\./);
});
