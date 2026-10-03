import test from 'node:test';
import assert from 'node:assert/strict';
import { discoverOwnerAmendmentBlockArtifact, OWNER_AMENDMENT_ARTIFACT_DISCOVERY_LIMITS } from '../src/owner-amendment-artifact-discovery.mjs';

const expected = Object.freeze({ repository: 'flair-agency/example', runId: '42', runAttempt: '2',
  baseSha: 'a'.repeat(40), headSha: 'b'.repeat(40) });
const name = `owner-amendment-block-${expected.baseSha}-${expected.headSha}-${expected.runId}-${expected.runAttempt}`;
const expiresAt = new Date(Date.now() + 60_000).toISOString();
const run = Object.freeze({ id: 42, status: 'completed', event: 'pull_request_target', run_attempt: 2,
  repository: { id: 7, full_name: expected.repository }, head_repository: { id: 7, full_name: expected.repository },
  head_sha: expected.headSha, pull_requests: [{ number: 12,
    base: { ref: 'main', sha: expected.baseSha, repo: { full_name: expected.repository } },
    head: { sha: expected.headSha, repo: { full_name: expected.repository } } }] });
const artifact = (id = 88) => ({ id, name, expired: false, expires_at: expiresAt,
  workflow_run: { id: 42, repository_id: 7, head_repository_id: 7, head_sha: expected.headSha } });

function fetchFor({ pages = [[artifact()]], runValue = run } = {}) {
  const requests = [];
  const fetchImpl = async (url, options) => {
    requests.push({ url, options });
    if (url.endsWith('/actions/runs/42/attempts/2')) return { ok: true, json: async () => runValue };
    const match = url.match(/\/actions\/runs\/42\/artifacts\?per_page=100&page=(\d+)$/);
    if (match) {
      const page = Number(match[1]);
      const artifacts = pages[page - 1] ?? [];
      return { ok: true, json: async () => ({ total_count: pages.flat().length, artifacts }) };
    }
    throw new Error(`unexpected URL ${url}`);
  };
  return { fetchImpl, requests };
}

test('discovers the unique artifact from an exact trusted run attempt', async () => {
  const { fetchImpl, requests } = fetchFor();
  const result = await discoverOwnerAmendmentBlockArtifact({ expected, token: 'fixture-token', fetchImpl });
  assert.deepEqual(result, { status: 'DISCOVERED_OWNER_AMENDMENT_BLOCK_ARTIFACT', artifactId: '88', artifactName: name,
    runId: '42', runAttempt: '2', baseSha: expected.baseSha, headSha: expected.headSha, expiresAt });
  assert.equal(requests.length, 2);
  assert.match(requests[0].url, /actions\/runs\/42\/attempts\/2$/);
  assert.match(requests[1].url, /actions\/runs\/42\/artifacts\?per_page=100&page=1$/);
  assert.ok(requests.every(request => request.options.redirect === 'error'));
  assert.ok(requests.every(request => request.options.headers.authorization === 'Bearer fixture-token'));
  assert.deepEqual(OWNER_AMENDMENT_ARTIFACT_DISCOVERY_LIMITS, { pageSize: 100, maxPages: 100 });
});

test('supports captured empty PR associations while naming the exact trusted base/B/run artifact', async () => {
  const exactArtifact = artifact();
  exactArtifact.workflow_run.head_sha = expected.baseSha;
  const { fetchImpl } = fetchFor({ pages: [[exactArtifact]], runValue: { ...run, head_sha: expected.baseSha, pull_requests: [] } });
  const result = await discoverOwnerAmendmentBlockArtifact({ expected, token: 'fixture-token', fetchImpl });
  assert.equal(result.status, 'DISCOVERED_OWNER_AMENDMENT_BLOCK_ARTIFACT', result.reason);
  assert.equal(result.artifactName, name);
  assert.equal(result.baseSha, expected.baseSha);
  assert.equal(result.headSha, expected.headSha);
});

test('discovers compact associated-PR metadata and rejects a mismatched numeric identity', async () => {
  const compactRun = structuredClone(run);
  for (const side of ['base', 'head']) compactRun.pull_requests[0][side].repo = {
    id: 7, name: 'example', url: `https://api.github.com/repos/${expected.repository}` };
  const discover = () => discoverOwnerAmendmentBlockArtifact({ expected, token: 'fixture-token',
    fetchImpl: fetchFor({ runValue: compactRun }).fetchImpl });
  assert.equal((await discover()).status, 'DISCOVERED_OWNER_AMENDMENT_BLOCK_ARTIFACT');
  compactRun.pull_requests[0].head.repo.id = 8;
  assert.equal((await discover()).status, 'INCOMPLETE');
});

test('walks every page before returning the uniquely matching artifact', async () => {
  const unrelated = Array.from({ length: 100 }, (_, index) => ({ id: index + 100, name: 'unrelated', expired: false }));
  const { fetchImpl, requests } = fetchFor({ pages: [unrelated, [artifact(501)]] });
  const result = await discoverOwnerAmendmentBlockArtifact({ expected, token: 'x', fetchImpl });
  assert.equal(result.status, 'DISCOVERED_OWNER_AMENDMENT_BLOCK_ARTIFACT');
  assert.equal(result.artifactId, '501');
  assert.equal(requests.length, 3);
  assert.match(requests[2].url, /page=2$/);
});

test('fails closed for absent or duplicate matching artifacts', async t => {
  for (const [title, pages] of [
    ['missing', [[]]],
    ['duplicate', [[artifact(88), artifact(89)]]],
  ]) await t.test(title, async () => {
    const { fetchImpl } = fetchFor({ pages });
    const result = await discoverOwnerAmendmentBlockArtifact({ expected, token: 'x', fetchImpl });
    assert.equal(result.status, 'INCOMPLETE');
    assert.match(result.reason, /exactly one matching/);
  });
});

test('rejects mismatched run identity, artifact association, and expired metadata', async t => {
  for (const [title, mutate] of [
    ['unfinished attempt', f => { f.runValue = { ...run, status: 'in_progress' }; }],
    ['wrong attempt', f => { f.runValue = { ...run, run_attempt: 1 }; }],
    ['wrong head', f => { f.runValue = { ...run, head_sha: 'c'.repeat(40) }; }],
    ['wrong repository', f => { f.runValue = { ...run, repository: { id: 7, full_name: 'other/repo' } }; }],
    ['wrong run association', f => { f.pages[0][0].workflow_run.id = 41; }],
    ['wrong repository association', f => { f.pages[0][0].workflow_run.repository_id = 8; }],
    ['expired flag', f => { f.pages[0][0].expired = true; }],
    ['expired timestamp', f => { f.pages[0][0].expires_at = new Date(Date.now() - 60_000).toISOString(); }],
    ['missing timestamp', f => { delete f.pages[0][0].expires_at; }],
    ['missing PR association field', f => { f.runValue = { ...f.runValue }; delete f.runValue.pull_requests; }],
  ]) await t.test(title, async () => {
    const f = { pages: [[artifact()]], runValue: run };
    mutate(f);
    const { fetchImpl } = fetchFor(f);
    const result = await discoverOwnerAmendmentBlockArtifact({ expected, token: 'x', fetchImpl });
    assert.equal(result.status, 'INCOMPLETE');
  });
  await t.test('uses exact pull-request tuple when workflow head metadata names protected trigger revision', async () => {
    const f = { pages: [[artifact()]], runValue: { ...run, head_sha: expected.baseSha } };
    f.pages[0][0].workflow_run.head_sha = expected.baseSha;
    const { fetchImpl } = fetchFor(f);
    const result = await discoverOwnerAmendmentBlockArtifact({ expected, token: 'x', fetchImpl });
    assert.equal(result.status, 'DISCOVERED_OWNER_AMENDMENT_BLOCK_ARTIFACT');
  });
  await t.test('rejects a run associated with a stale base even when head SHA matches', async () => {
    const f = { pages: [[artifact()]], runValue: { ...run, pull_requests: [{ ...run.pull_requests[0],
      base: { ...run.pull_requests[0].base, sha: 'c'.repeat(40) } }] } };
    const { fetchImpl } = fetchFor(f);
    const result = await discoverOwnerAmendmentBlockArtifact({ expected, token: 'x', fetchImpl });
    assert.equal(result.status, 'INCOMPLETE');
  });
});

test('fails closed on malformed/incomplete pagination and caller artifact IDs', async t => {
  await t.test('incomplete pages', async () => {
    const fetchImpl = async url => {
      if (url.endsWith('/attempts/2')) return { ok: true, json: async () => run };
      const page = Number(url.match(/page=(\d+)$/)?.[1]);
      return { ok: true, json: async () => ({ total_count: 2, artifacts: page === 1 ? [artifact()] : [] }) };
    };
    const result = await discoverOwnerAmendmentBlockArtifact({ expected, token: 'x', fetchImpl });
    assert.equal(result.status, 'INCOMPLETE');
    assert.match(result.reason, /ended before all declared/);
  });
  await t.test('unknown artifactId input', async () => {
    const { fetchImpl } = fetchFor();
    const result = await discoverOwnerAmendmentBlockArtifact({ expected: { ...expected, artifactId: '88' }, token: 'x', fetchImpl });
    assert.equal(result.status, 'INCOMPLETE');
    assert.match(result.reason, /unknown fields/);
  });
});

test('requires an authenticated API transport', async () => {
  const result = await discoverOwnerAmendmentBlockArtifact({ expected, token: '', fetchImpl: async () => {} });
  assert.equal(result.status, 'INCOMPLETE');
  assert.match(result.reason, /token is required/);
});
