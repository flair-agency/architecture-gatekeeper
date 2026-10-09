import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { fetchOwnerAmendmentBlockArtifact, OWNER_AMENDMENT_ARTIFACT_LIMITS } from '../dist/owner-amendment-artifact.mjs';

const expected = { repository: 'flair-agency/example', artifactId: '88', runId: '42', runAttempt: '2', baseSha: 'a'.repeat(40), headSha: 'b'.repeat(40) };
const digest = bytes => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;

function fixture({ attempt = 2, latestAttempt = attempt } = {}) {
  const zip = Buffer.from('offline zip fixture bytes');
  const repo = { id: 7, full_name: expected.repository };
  const headRepo = { id: 7, full_name: expected.repository };
  const run = { id: 42, event: 'pull_request_target', run_attempt: attempt, repository: repo, head_repository: headRepo,
    head_sha: expected.headSha, pull_requests: [{ number: 12,
      base: { ref: 'main', sha: expected.baseSha, repo: { full_name: expected.repository } },
      head: { sha: expected.headSha, repo: { full_name: expected.repository } } }] };
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

function capturedSelfBlockFixture() {
  // Captured from GitHub REST for run 36315628115, attempt 1, artifact
  // 10930004669. The archive itself is synthetic but padded to the captured
  // 10,596-byte size; its digest is computed from these bytes so this remains
  // an offline transport test. Run, artifact, repository, and SHA metadata
  // match the live API response.
  const captured = {
    repository: 'flair-agency/architecture-gatekeeper',
    artifactId: '10930004669',
    runId: '36315628115',
    runAttempt: '1',
    baseSha: 'a21d1e9b92d58d93f5ea5c63fb405a68730519db',
    headSha: '33737066fdf228e5913ac57e43c8153d074333ba',
  };
  const zip = Buffer.alloc(10596, 0x5a);
  const run = {
    id: 36315628115,
    event: 'pull_request_target',
    run_attempt: 1,
    repository: { id: 1379218762, full_name: captured.repository },
    head_repository: { id: 1379218762, full_name: captured.repository },
    head_sha: captured.headSha,
    // The captured protected-base Actions response legitimately omitted PR associations.
    // The exact artifact name and later authenticated ReviewRecord bind expected B.
    pull_requests: [],
  };
  const artifact = {
    id: 10930004669,
    name: `owner-amendment-block-${captured.baseSha}-${captured.headSha}-${captured.runId}-${captured.runAttempt}`,
    expired: false,
    size_in_bytes: 10596,
    digest: digest(zip),
    workflow_run: {
      id: 36315628115,
      repository_id: 1379218762,
      head_repository_id: 1379218762,
      head_sha: captured.headSha,
    },
  };
  const fetchImpl = async url => {
    if (url.endsWith(`/actions/runs/${captured.runId}/attempts/${captured.runAttempt}`)) {
      return { ok: true, json: async () => run };
    }
    if (url.endsWith(`/actions/artifacts/${captured.artifactId}`)) {
      return { ok: true, json: async () => artifact };
    }
    if (url.endsWith(`/actions/artifacts/${captured.artifactId}/zip`)) return new Response(zip);
    throw new Error(`unexpected URL ${url}`);
  };
  return { captured, run, artifact, zip, fetchImpl };
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

test('fetches compact associated-PR metadata and rejects a mismatched numeric identity', async () => {
  const f = fixture();
  for (const side of ['base', 'head']) f.run.pull_requests[0][side].repo = {
    id: 7, name: 'example', url: `https://api.github.com/repos/${expected.repository}` };
  assert.equal((await retrieve(f)).status, 'FETCHED_OWNER_AMENDMENT_BLOCK_ARTIFACT');
  f.run.pull_requests[0].base.repo.id = 8;
  assert.equal((await retrieve(f)).status, 'INCOMPLETE');
});

test('supports captured empty PR associations and protected trigger metadata for later exact-record binding', async () => {
  const f = capturedSelfBlockFixture();
  const result = await retrieve(f, { expected: f.captured });
  assert.equal(result.status, 'FETCHED_OWNER_AMENDMENT_BLOCK_ARTIFACT');
  assert.equal(result.baseSha, f.captured.baseSha);
  assert.equal(result.headSha, f.captured.headSha);
  assert.deepEqual(result.zipBytes, f.zip);

  const triggerRevision = capturedSelfBlockFixture();
  triggerRevision.run.head_sha = triggerRevision.captured.baseSha;
  triggerRevision.artifact.workflow_run.head_sha = triggerRevision.captured.baseSha;
  const triggerBound = await retrieve(triggerRevision, { expected: triggerRevision.captured });
  assert.equal(triggerBound.status, 'FETCHED_OWNER_AMENDMENT_BLOCK_ARTIFACT');

  const wrongAssociation = capturedSelfBlockFixture();
  wrongAssociation.run.pull_requests = [{ number: 12,
    base: { ref: 'main', sha: wrongAssociation.captured.baseSha, repo: { full_name: wrongAssociation.captured.repository } },
    head: { sha: wrongAssociation.captured.headSha, repo: { full_name: wrongAssociation.captured.repository } } }];
  wrongAssociation.run.pull_requests[0].head.sha = 'c'.repeat(40);
  const wrongHead = await retrieve(wrongAssociation, { expected: wrongAssociation.captured });
  assert.equal(wrongHead.status, 'INCOMPLETE');
  assert.match(wrongHead.reason, /head, attempt, or run ID differs/);
});

test('rejects wrong run context, metadata, expiration, and digest', async t => {
  const cases = [
    ['wrong head', f => { f.run.head_sha = 'c'.repeat(40); }],
    ['wrong event', f => { f.run.event = 'workflow_dispatch'; }],
    ['wrong attempt', f => { f.run.run_attempt = 1; }],
    ['missing attempt', f => { delete f.run.run_attempt; }],
    ['missing run repository ID', f => { delete f.run.repository.id; }],
    ['malformed run repository ID', f => { f.run.repository.id = '7'; }],
    ['missing run head repository ID', f => { delete f.run.head_repository.id; }],
    ['malformed run head repository ID', f => { f.run.head_repository.id = 0; }],
    ['missing artifact repository ID', f => { delete f.artifact.workflow_run.repository_id; }],
    ['malformed artifact repository ID', f => { f.artifact.workflow_run.repository_id = '7'; }],
    ['missing artifact head repository ID', f => { delete f.artifact.workflow_run.head_repository_id; }],
    ['malformed artifact head repository ID', f => { f.artifact.workflow_run.head_repository_id = 7.5; }],
    ['both run and artifact repository IDs missing', f => {
      delete f.run.repository.id;
      delete f.run.head_repository.id;
      delete f.artifact.workflow_run.repository_id;
      delete f.artifact.workflow_run.head_repository_id;
    }],
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


test('cancels a failed artifact stream and releases its reader after cancellation settles', async () => {
  const f = fixture();
  const lifecycle = [];
  f.fetchImpl = async url => {
    if (url.endsWith('/actions/runs/42/attempts/2')) return { ok: true, json: async () => f.run };
    if (url.endsWith('/actions/artifacts/88')) return { ok: true, json: async () => f.artifact };
    if (url.endsWith('/actions/artifacts/88/zip')) return { ok: true, body: { getReader: () => ({
      read: async () => { lifecycle.push('read'); throw new Error('stream read failed'); },
      cancel: () => { lifecycle.push('cancel'); return Promise.resolve().then(() => { lifecycle.push('cancel-settled'); throw new Error('cancel failed'); }); },
      releaseLock: () => lifecycle.push('release'),
    }) } };
    throw new Error(`unexpected URL ${url}`);
  };
  const result = await retrieve(f);
  assert.equal(result.status, 'INCOMPLETE');
  assert.match(result.reason, /stream read failed/);
  assert.deepEqual(lifecycle, ['read', 'cancel', 'cancel-settled', 'release']);
});


test('awaits synchronous and thenable fetch/JSON/stream callbacks without changing bytes', async () => {
  const f = fixture();
  const thenable = value => ({ then(resolve) { resolve(value); } });
  let reads = 0;
  f.fetchImpl = url => {
    if (url.endsWith('/actions/runs/42/attempts/2')) return { ok: true, json: () => f.run };
    if (url.endsWith('/actions/artifacts/88')) return thenable({ ok: true, json: () => thenable(f.artifact) });
    if (url.endsWith('/actions/artifacts/88/zip')) return thenable({ ok: true, body: { getReader: () => ({
      read: () => thenable(reads++ === 0 ? { done: false, value: new Uint8Array(f.zip) } : { done: true }),
      cancel: () => Promise.resolve(), releaseLock() {},
    }) } });
    throw new Error(`unexpected URL ${url}`);
  };
  const result = await retrieve(f);
  assert.equal(result.status, 'FETCHED_OWNER_AMENDMENT_BLOCK_ARTIFACT');
  assert.deepEqual(result.zipBytes, f.zip);
  assert.notEqual(result.zipBytes, f.zip);
  assert.equal(reads, 2);
});

test('preserves unknown repeated metadata readbacks and primitive transport errors', async () => {
  const f = fixture();
  const name = f.artifact.name;
  let nameReads = 0;
  Object.defineProperty(f.artifact, 'name', { get: () => nameReads++ === 0 ? name : 17 });
  const result = await retrieve(f);
  assert.equal(result.status, 'FETCHED_OWNER_AMENDMENT_BLOCK_ARTIFACT');
  assert.equal(result.artifactName, 17);
  assert.equal(nameReads, 2);
  const failed = await fetchOwnerAmendmentBlockArtifact({ expected, token: 'fixture-token', fetchImpl: () => { throw 'primitive'; } });
  assert.deepEqual(failed, { status: 'INCOMPLETE', reason: undefined });
  await assert.rejects(fetchOwnerAmendmentBlockArtifact({ expected, token: 'fixture-token', fetchImpl: () => { throw null; } }), TypeError);
});
