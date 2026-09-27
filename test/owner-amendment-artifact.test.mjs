import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { fetchOwnerAmendmentBlockArtifact, OWNER_AMENDMENT_ARTIFACT_LIMITS } from '../src/owner-amendment-artifact.mjs';

const expected = { repository: 'flair-agency/example', artifactId: '88', runId: '42', runAttempt: '2', baseSha: 'a'.repeat(40), headSha: 'b'.repeat(40) };
const digest = bytes => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;

function fixture({ attempt = 2, latestAttempt = attempt } = {}) {
  const zip = Buffer.from('offline zip fixture bytes');
  const repo = { id: 7, full_name: expected.repository };
  const headRepo = { id: 7, full_name: expected.repository };
  const run = { id: 42, event: 'pull_request_target', run_attempt: attempt, repository: repo, head_repository: headRepo,
    head_sha: expected.headSha, pull_requests: [] };
  const latestRun = { ...run, run_attempt: latestAttempt };
  const artifact = { id: 88, name: `owner-amendment-block-${expected.baseSha}-${expected.headSha}-42-${attempt}`, expired: false,
    size_in_bytes: zip.length, digest: digest(zip), workflow_run: { id: 42, repository_id: 7, head_repository_id: 7, head_sha: expected.headSha } };
  const fetchImpl = async url => {
    assert.match(url, /\/repos\/flair-agency\/example\//);
    assert.doesNotMatch(url, /flair-agency%2Fexample/);
    if (url.endsWith(`/actions/runs/42/attempts/${attempt}`)) return { ok: true, json: async () => run };
    if (url.endsWith('/actions/runs/42')) return { ok: true, json: async () => latestRun };
    if (url.endsWith('/actions/artifacts/88')) return { ok: true, json: async () => artifact };
    if (url.endsWith('/actions/artifacts/88/zip')) return new Response(zip);
    throw new Error(`unexpected URL ${url}`);
  };
  return { run, latestRun, artifact, zip, fetchImpl };
}

async function retrieve(f = fixture(), values = {}) {
  return fetchOwnerAmendmentBlockArtifact({ expected: { ...expected, ...values.expected }, token: 'fixture-token',
    fetchImpl: f.fetchImpl });
}

test('retrieves bounded zip bytes from the expected artifact and run', async () => {
  const f = fixture();
  const requests = [];
  const originalFetch = f.fetchImpl;
  f.fetchImpl = async (url, options) => { requests.push({ url, options }); return originalFetch(url, options); };
  const result = await retrieve(f);
  assert.equal(result.status, 'FETCHED_OWNER_AMENDMENT_BLOCK_ARTIFACT');
  assert.deepEqual(result.zipBytes, f.zip);
  assert.equal(result.artifactId, '88');
  assert.deepEqual(OWNER_AMENDMENT_ARTIFACT_LIMITS, { maxZipBytes: 2 * 1024 * 1024 });
  assert.equal(requests.find(request => request.url.endsWith('/actions/artifacts/88/zip')).options.redirect, 'follow');
});

test('rejects wrong run context, metadata, expiration, and digest', async t => {
  const cases = [
    ['wrong head', f => { f.run.head_sha = 'c'.repeat(40); }],
    ['wrong event', f => { f.run.event = 'workflow_dispatch'; }],
    ['wrong attempt', f => { f.run.run_attempt = 1; }],
    ['missing attempt', f => { delete f.run.run_attempt; }],
    ['wrong artifact ID', f => { f.artifact.id = 89; }],
    ['wrong name', f => { f.artifact.name = 'other'; }],
    ['expired artifact', f => { f.artifact.expired = true; }],
    ['wrong artifact run', f => { f.artifact.workflow_run.id = 41; }],
    ['wrong digest', f => { f.artifact.digest = digest(Buffer.from('other')); }],
  ];
  for (const [name, mutate] of cases) await t.test(name, async () => {
    const f = fixture(); mutate(f);
    const result = await retrieve(f);
    assert.equal(result.status, 'INCOMPLETE');
  });
});

test('uses the selected historical run attempt instead of the latest attempt', async () => {
  const f = fixture({ attempt: 1, latestAttempt: 2 });
  const urls = [];
  const originalFetch = f.fetchImpl;
  f.fetchImpl = async (url, options) => { urls.push({ url, options }); return originalFetch(url, options); };
  const result = await retrieve(f, { expected: { runAttempt: '1' } });
  assert.equal(result.status, 'FETCHED_OWNER_AMENDMENT_BLOCK_ARTIFACT');
  assert.equal(result.runAttempt, '1');
  assert.ok(urls.some(({ url }) => url.endsWith('/actions/runs/42/attempts/1')));
  assert.ok(urls.every(({ url }) => !url.endsWith('/actions/runs/42')));
});

test('fetches the trusted artifact ID directly and rejects ID or name mismatch', async t => {
  for (const [name, mutate] of [
    ['mismatched returned artifact ID', f => { f.artifact.id = 89; }],
    ['mismatched returned artifact name', f => { f.artifact.name = 'other'; }],
  ]) await t.test(name, async () => {
    const f = fixture(); mutate(f);
    assert.equal((await retrieve(f)).status, 'INCOMPLETE');
  });
  const f = fixture();
  const urls = [];
  const originalFetch = f.fetchImpl;
  f.fetchImpl = async (url, options) => { urls.push(url); return originalFetch(url, options); };
  assert.equal((await retrieve(f)).status, 'FETCHED_OWNER_AMENDMENT_BLOCK_ARTIFACT');
  assert.ok(urls.some(url => url.endsWith('/actions/artifacts/88')));
  assert.ok(urls.every(url => !url.includes('/artifacts?')));
});

test('requires a caller-supplied authenticated fetch', async () => {
  const result = await fetchOwnerAmendmentBlockArtifact({ expected, token: 'x', fetchImpl: async () => {} });
  assert.equal(result.status, 'INCOMPLETE');
});

test('stops reading when the download exceeds its declared size', async () => {
  const f = fixture();
  const original = f.fetchImpl;
  f.fetchImpl = async url => url.endsWith('/actions/artifacts/88/zip')
    ? new Response(Buffer.alloc(f.zip.length + 1, 1)) : original(url);
  const result = await retrieve(f);
  assert.equal(result.status, 'INCOMPLETE');
  assert.match(result.reason, /exceeds its declared or maximum size/);
});
