import test from 'node:test';
import assert from 'node:assert/strict';
const { selectSelfPrContext } = await import('../dist/self-pr-context.mjs');

const repository = 'flair-agency/architecture-gatekeeper';
const repoId = 1379218762;
const base = 'a'.repeat(40), head = 'b'.repeat(40), merge = 'c'.repeat(40);
const event = () => ({ action: 'synchronize', repository: { full_name: repository, id: repoId }, pull_request: {
  number: 42, state: 'open', draft: false, base: { ref: 'main', sha: base, repo: { full_name: repository, id: repoId } },
  head: { sha: head, repo: { full_name: repository, id: repoId } },
} });
function fixture() {
  const values = {
    '/git/ref/heads/main': { ref: 'refs/heads/main', object: { type: 'commit', sha: base } },
    '/pulls/42': { ...event().pull_request, merge_commit_sha: merge },
    [`/commits/refs/pull/42/merge`]: { sha: merge, parents: [{ sha: base }, { sha: head }] },
  };
  const calls = [];
  let responseOverride, finalMutation;
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    const path = new URL(url).pathname.replace('/repos/flair-agency/architecture-gatekeeper', '');
    if (!(path in values)) throw new Error(`unexpected request ${path}`);
    if (calls.length === 4 && finalMutation) finalMutation(values);
    const response = new Response(JSON.stringify(values[path]), { status: 200, headers: { 'content-type': 'application/json' } });
    Object.defineProperty(response, 'url', { value: responseOverride?.url ?? url });
    if (responseOverride?.redirected !== undefined) Object.defineProperty(response, 'redirected', { value: responseOverride.redirected });
    if (responseOverride?.body !== undefined) Object.defineProperty(response, 'body', { value: responseOverride.body });
    if (responseOverride?.status !== undefined) Object.defineProperty(response, 'status', { value: responseOverride.status });
    return response;
  };
  return { values, calls, fetchImpl, setResponseOverride: value => { responseOverride = value; }, setFinalMutation: value => { finalMutation = value; } };
}
async function select(f, changes = {}) {
  return selectSelfPrContext({ eventName: 'pull_request_target', event: event(), sourceBaseSha: base, runtimeBaseSha: base, token: 'app-installation-token', fetchImpl: f.fetchImpl, ...changes });
}

test('selects fresh same-repository PR context and exact test-merge subject', async () => {
  const f = fixture();
  const result = await select(f);
  assert.deepEqual(result, { status: 'SELECTED_SELF_PR_CONTEXT', repository, repositoryId: repoId,
    prNumber: '42', baseSha: base, headSha: head, subjectSha: merge });
  assert.equal(f.calls.length, 5);
  for (const { options } of f.calls) { assert.equal(options.redirect, 'manual'); assert.equal(options.headers.authorization, 'Bearer app-installation-token'); assert.ok(options.signal instanceof AbortSignal); }
});

test('requires the protected pull_request_target invocation and admitted open-PR actions', async t => {
  for (const changes of [{ eventName: 'pull_request' }, { eventName: 'workflow_dispatch' }, { event: { ...event(), action: 'closed' } },
    { event: { ...event(), action: 'edited' } }]) await t.test(JSON.stringify(changes), async () => {
    const f = fixture(); assert.equal((await select(f, changes)).status, 'INCOMPLETE'); assert.equal(f.calls.length, 0);
  });
});

test('rejects stale source or runtime protected-base binding', async t => {
  for (const changes of [{ sourceBaseSha: 'd'.repeat(40) }, { runtimeBaseSha: 'd'.repeat(40) }]) await t.test(JSON.stringify(changes), async () => {
    const f = fixture(); assert.equal((await select(f, changes)).status, 'INCOMPLETE');
  });
});

test('rejects wrong event repository identity and fork heads', async t => {
  for (const mutate of [e => { e.repository.id++; }, e => { e.repository.full_name = 'someone/else'; },
    e => { e.pull_request.head.repo = { full_name: 'fork/architecture-gatekeeper', id: 88 }; }]) await t.test('identity mismatch', async () => {
    const f = fixture(), e = event(); mutate(e);
    assert.equal((await select(f, { event: e })).status, 'INCOMPLETE');
  });
});

test('rejects a wrong or missing numeric repository identity in the live PR', async t => {
  for (const mutate of [f => { f.values['/pulls/42'].base.repo.id++; }, f => { delete f.values['/pulls/42'].head.repo.id; },
    f => { f.values['/pulls/42'].head.repo.full_name = 'fork/architecture-gatekeeper'; }]) await t.test('live repo mismatch', async () => {
    const f = fixture(); mutate(f); assert.equal((await select(f)).status, 'INCOMPLETE');
  });
});

test('rejects event/live PR tuple mismatch and closed PR', async t => {
  for (const mutate of [f => { f.values['/pulls/42'].head.sha = 'd'.repeat(40); }, f => { f.values['/pulls/42'].state = 'closed'; },
    f => { f.values['/pulls/42'].base.sha = 'd'.repeat(40); }]) await t.test('live PR mismatch', async () => {
    const f = fixture(); mutate(f); assert.equal((await select(f)).status, 'INCOMPLETE');
  });
});

test('rejects main, PR tuple, or repository identity changes during context selection', async t => {
  for (const mutate of [values => { values['/git/ref/heads/main'].object.sha = 'd'.repeat(40); },
    values => { values['/pulls/42'].head.sha = 'd'.repeat(40); },
    values => { values['/pulls/42'].merge_commit_sha = 'd'.repeat(40); },
    values => { values['/pulls/42'].base.repo.id++; },
    values => { values['/pulls/42'].base.repo.full_name = 'elsewhere/repo'; },
    values => { values['/pulls/42'].head.repo.id++; },
    values => { values['/pulls/42'].head.repo.full_name = 'elsewhere/repo'; }]) await t.test('final readback moved', async () => {
    const f = fixture(); f.setFinalMutation(mutate); assert.equal((await select(f)).status, 'INCOMPLETE');
  });
});

test('rejects missing, stale, or incorrectly parented test-merge refs', async t => {
  for (const mutate of [f => { delete f.values['/pulls/42'].merge_commit_sha; },
    f => { f.values['/pulls/42'].merge_commit_sha = 'd'.repeat(40); },
    f => { f.values[`/commits/refs/pull/42/merge`].sha = null; },
    f => { f.values[`/commits/refs/pull/42/merge`].parents = [{ sha: head }, { sha: base }]; },
    f => { f.values[`/commits/refs/pull/42/merge`].parents[1].sha = 'd'.repeat(40); }]) await t.test('merge tuple mismatch', async () => {
    const f = fixture(); mutate(f); assert.equal((await select(f)).status, 'INCOMPLETE');
  });
});

test('rejects API redirects, wrong final URLs, and oversized bodies', async t => {
  const cases = [
    ['redirect', { redirected: true }],
    ['wrong final URL', { url: 'https://api.github.com/unexpected' }],
    ['oversized body', { body: new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(64 * 1024 + 1)); controller.close(); } }) }],
  ];
  for (const [name, override] of cases) await t.test(name, async () => {
    const f = fixture(); f.setResponseOverride(override);
    assert.equal((await select(f)).status, 'INCOMPLETE');
  });
});
