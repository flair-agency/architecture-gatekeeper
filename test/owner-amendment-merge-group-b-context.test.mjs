import test from 'node:test';
import assert from 'node:assert/strict';
import { selectOwnerAmendmentMergeGroupBContext } from '../src/owner-amendment-merge-group-b-context.mjs';

const repository = 'flair-agency/architecture-gatekeeper';
const baseSha = 'a'.repeat(40), bHeadSha = 'b'.repeat(40), groupHeadSha = 'c'.repeat(40);
const repoId = 1379218762, graphRepoId = 'R_kgDOChD4VA';
const event = { action: 'checks_requested', repository: { full_name: repository }, merge_group: {
  base_ref: 'refs/heads/main', base_sha: baseSha, head_sha: groupHeadSha,
} };

function fixture(overrides = {}) {
  const calls = [];
  const repo = { id: repoId, full_name: repository };
  const mergeCommit = { sha: groupHeadSha, parents: [{ sha: baseSha }, { sha: bHeadSha }] };
  const pr = { number: 204, state: 'open', draft: false,
    base: { ref: 'main', sha: baseSha, repo }, head: { sha: bHeadSha, repo } };
  const graph = { data: { repository: { id: graphRepoId, nameWithOwner: repository,
    pullRequest: { number: 204, state: 'OPEN', isDraft: false, baseRefName: 'main',
      baseRefOid: baseSha, headRefOid: bHeadSha,
      baseRepository: { id: graphRepoId, nameWithOwner: repository },
      headRepository: { id: graphRepoId, nameWithOwner: repository },
      mergeQueueEntry: { state: 'AWAITING_CHECKS', baseCommit: { oid: baseSha },
        headCommit: { oid: bHeadSha }, pullRequest: { number: 204 } },
    } } } };
  const state = { repo, mergeCommit, pr, graph, associated: [pr], ...overrides };
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url, options });
    if (url === 'https://api.github.com/repos/flair-agency/architecture-gatekeeper') return response(state.repo);
    if (url.endsWith(`/commits/${groupHeadSha}`)) return response(state.mergeCommit);
    if (url.endsWith(`/commits/${bHeadSha}/pulls?per_page=100&page=1`)) return response(state.associated);
    if (url === 'https://api.github.com/graphql') return response(state.graph);
    if (url.includes('/commits/') && url.includes('/pulls?')) return response([]);
    throw new Error(`Unexpected request ${url}`);
  };
  return { state, calls, fetchImpl,
    select: (eventValue = event, token = 'fixture-token') => selectOwnerAmendmentMergeGroupBContext({
      event: eventValue, token, fetchImpl,
    }) };
}

const response = body => ({ ok: true, json: async () => body });

test('selects one exact open same-repository B bound by merge commit and queue entry', async () => {
  const f = fixture();
  const result = await f.select();
  assert.deepEqual(result, { status: 'SELECTED_OWNER_AMENDMENT_MERGE_GROUP_B_CONTEXT',
    repository, repositoryId: repoId, mergeGroupBaseSha: baseSha, mergeGroupHeadSha: groupHeadSha,
    bPrNumber: '204', bBaseSha: baseSha, bHeadSha, queueEntryState: 'AWAITING_CHECKS' });
  assert.equal(f.calls.length, 4);
  for (const call of f.calls) {
    assert.equal(call.options.headers.authorization, 'Bearer fixture-token');
    assert.equal(call.options.redirect, 'error');
  }
  assert.equal(f.calls.at(-1).options.method, 'POST');
});

test('rejects malformed or non-main merge-group event before API access', async t => {
  for (const [name, edit] of [
    ['wrong action', e => { e.action = 'completed'; }],
    ['wrong base ref', e => { e.merge_group.base_ref = 'refs/heads/release'; }],
    ['wrong repository', e => { e.repository.full_name = 'fork/repo'; }],
    ['malformed SHA', e => { e.merge_group.head_sha = 'not-a-sha'; }],
  ]) await t.test(name, async () => {
    const f = fixture(), changed = structuredClone(event); edit(changed);
    const result = await f.select(changed);
    assert.equal(result.status, 'INCOMPLETE');
    if (name !== 'wrong repository') assert.equal(f.calls.length, 0);
  });
});

test('requires merge-group commit to bind exact event base and one B parent', async t => {
  for (const [name, edit] of [
    ['wrong base parent', value => { value.state.mergeCommit.parents[0].sha = 'd'.repeat(40); }],
    ['missing B parent', value => { value.state.mergeCommit.parents = [{ sha: baseSha }]; }],
    ['multiple parents', value => { value.state.mergeCommit.parents.push({ sha: 'd'.repeat(40) }); }],
    ['invalid B parent', value => { value.state.mergeCommit.parents[1].sha = 'bad'; }],
  ]) await t.test(name, async () => {
    const f = fixture(); edit(f);
    const result = await f.select();
    assert.equal(result.status, 'INCOMPLETE');
  });
});

test('rejects missing or ambiguous pull request association', async t => {
  const other = structuredClone(fixture().state.pr);
  other.number = 205;
  other.head.sha = 'd'.repeat(40);
  for (const [name, associated] of [
    ['none', []],
    ['ambiguous exact PRs', [fixture().state.pr, { ...structuredClone(fixture().state.pr), number: 205 }]],
    ['no exact candidate', [other]],
  ]) await t.test(name, async () => {
    const f = fixture({ associated });
    const result = await f.select();
    assert.equal(result.status, 'INCOMPLETE');
    assert.match(result.reason, /pull request/);
  });
});

test('selects the unique exact B when the commit has unrelated PR associations', async () => {
  const f = fixture();
  const unrelated = structuredClone(f.state.pr);
  unrelated.number = 205;
  unrelated.head.sha = 'd'.repeat(40);
  f.state.associated = [unrelated, f.state.pr];
  const result = await f.select();
  assert.equal(result.status, 'SELECTED_OWNER_AMENDMENT_MERGE_GROUP_B_CONTEXT');
  assert.equal(result.bPrNumber, '204');
});

test('fails closed for fork, stale or ineligible B PRs', async t => {
  const cases = [
    ['closed', pr => { pr.state = 'closed'; }],
    ['draft', pr => { pr.draft = true; }],
    ['non-main base', pr => { pr.base.ref = 'release'; }],
    ['base SHA mismatch', pr => { pr.base.sha = 'd'.repeat(40); }],
    ['head SHA mismatch', pr => { pr.head.sha = 'd'.repeat(40); }],
    ['base fork', pr => { pr.base.repo.full_name = 'fork/architecture-gatekeeper'; }],
    ['head fork', pr => { pr.head.repo.full_name = 'fork/architecture-gatekeeper'; pr.head.repo.id = 999; }],
  ];
  for (const [name, mutate] of cases) await t.test(name, async () => {
    const f = fixture(); mutate(f.state.pr);
    const result = await f.select();
    assert.equal(result.status, 'INCOMPLETE');
  });
});

test('requires authenticated GraphQL merge-queue entry for the same base, head, and PR', async t => {
  const cases = [
    ['entry absent', graph => { graph.data.repository.pullRequest.mergeQueueEntry = null; }],
    ['entry wrong base', graph => { graph.data.repository.pullRequest.mergeQueueEntry.baseCommit.oid = 'd'.repeat(40); }],
    ['entry wrong head', graph => { graph.data.repository.pullRequest.mergeQueueEntry.headCommit.oid = 'd'.repeat(40); }],
    ['entry wrong PR', graph => { graph.data.repository.pullRequest.mergeQueueEntry.pullRequest.number = 999; }],
    ['GraphQL error', graph => { graph.errors = [{ message: 'unavailable' }]; }],
  ];
  for (const [name, mutate] of cases) await t.test(name, async () => {
    const f = fixture(); mutate(f.state.graph);
    const result = await f.select();
    assert.equal(result.status, 'INCOMPLETE');
  });
});

test('requires a token and fails closed on API errors', async () => {
  const f = fixture();
  assert.equal((await f.select(event, '')).status, 'INCOMPLETE');
  const failed = await selectOwnerAmendmentMergeGroupBContext({ event, token: 'token',
    fetchImpl: async () => ({ ok: false, status: 503 }) });
  assert.equal(failed.status, 'INCOMPLETE');
  assert.match(failed.reason, /503/);
});
