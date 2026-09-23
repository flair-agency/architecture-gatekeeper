import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { createGitHubAuthoritySource } from '../src/github-authority-source.mjs';

const repository = 'flair-agency/private-authority';
const revision = 'a'.repeat(40);
const rootTree = 'b'.repeat(40);
const docsTree = 'c'.repeat(40);
const path = 'docs/policy.md';
const root = `https://api.github.com/repos/${repository}`;
const content = Buffer.from('# Private authority\n', 'utf8');
const blobSha = createHash('sha1').update(`blob ${content.length}\0`).update(content).digest('hex');
const args = { repository, revision, path, maxBytes: 1024 };

function fixture() {
  return new Map([
    [root, { full_name: repository, private: true }],
    [`${root}/git/commits/${revision}`, { sha: revision, tree: { sha: rootTree } }],
    [`${root}/git/trees/${rootTree}`, { sha: rootTree, truncated: false, tree: [
      { path: 'docs', mode: '040000', type: 'tree', sha: docsTree },
    ] }],
    [`${root}/git/trees/${docsTree}`, { sha: docsTree, truncated: false, tree: [
      { path: 'policy.md', mode: '100644', type: 'blob', sha: blobSha, size: content.length },
    ] }],
    [`${root}/git/blobs/${blobSha}`, { sha: blobSha, size: content.length, encoding: 'base64', content: `${content.toString('base64')}\n` }],
  ]);
}

function source(routes, calls = []) {
  return createGitHubAuthoritySource({ token: 'private-test-token', fetchImpl: async (url, options) => {
    calls.push({ url, options });
    const value = routes.get(url);
    if (value instanceof Response) return value;
    return new Response(JSON.stringify(value ?? { message: 'Not Found' }), {
      status: value === undefined ? 404 : 200,
      headers: { 'content-type': 'application/json' },
    });
  } });
}

test('fetches a private pinned regular file through exact Git objects', async () => {
  const calls = [];
  const result = await source(fixture(), calls)(args);
  assert.deepEqual(result, { repository, resolvedCommit: revision, path, type: 'file', content });
  assert.deepEqual(calls.map(call => call.url), [
    root, `${root}/git/commits/${revision}`, `${root}/git/trees/${rootTree}`,
    `${root}/git/trees/${docsTree}`, `${root}/git/blobs/${blobSha}`,
  ]);
  for (const { options } of calls) {
    assert.equal(options.redirect, 'manual');
    assert.equal(options.headers.Authorization, 'Bearer private-test-token');
    assert.ok(options.signal);
  }
  assert.ok(!JSON.stringify(result).includes('private-test-token'));
});

test('fails closed on missing or rejected private credentials', async () => {
  assert.throws(() => createGitHubAuthoritySource({ token: '' }), /could not be verified/);
  const routes = fixture();
  routes.set(root, new Response('{}', { status: 401 }));
  await assert.rejects(source(routes)(args), /could not be verified/);
  await assert.rejects(createGitHubAuthoritySource({ token: 'private-test-token', fetchImpl: async () => {
    throw new Error('secret network detail');
  } })(args), error => !error.message.includes('secret network detail'));
});

test('rejects redirects, repository substitution and commit substitution', async () => {
  for (const [url, value] of [
    [root, new Response(null, { status: 302, headers: { location: 'https://other.example/' } })],
    [root, { full_name: 'other/private-authority' }],
    [`${root}/git/commits/${revision}`, { sha: 'd'.repeat(40), tree: { sha: rootTree } }],
  ]) {
    const routes = fixture();
    routes.set(url, value);
    await assert.rejects(source(routes)(args), /could not be verified/);
  }
  await assert.rejects(source(fixture())({ ...args, revision: 'main' }), /could not be verified/);
});

test('rejects a path mismatch, missing entry, ambiguous entry or truncated tree', async () => {
  for (const tree of [
    { sha: docsTree, truncated: false, tree: [{ path: 'other.md', mode: '100644', type: 'blob', sha: blobSha }] },
    { sha: docsTree, truncated: false, tree: [] },
    { sha: docsTree, truncated: false, tree: Array(2).fill({ path: 'policy.md', mode: '100644', type: 'blob', sha: blobSha }) },
    { sha: docsTree, truncated: true, tree: [{ path: 'policy.md', mode: '100644', type: 'blob', sha: blobSha }] },
  ]) {
    const routes = fixture();
    routes.set(`${root}/git/trees/${docsTree}`, tree);
    await assert.rejects(source(routes)(args), /could not be verified/);
  }
});

test('rejects symlink, gitlink and non-tree intermediate entries', async () => {
  for (const mode of ['120000', '160000']) {
    const routes = fixture();
    routes.get(`${root}/git/trees/${docsTree}`).tree[0].mode = mode;
    await assert.rejects(source(routes)(args), /could not be verified/);
  }
  const routes = fixture();
  routes.get(`${root}/git/trees/${rootTree}`).tree[0].mode = '100644';
  await assert.rejects(source(routes)(args), /could not be verified/);
});

test('enforces per-file and HTTP response limits', async () => {
  await assert.rejects(source(fixture())({ ...args, maxBytes: content.length - 1 }), /could not be verified/);
  await assert.rejects(source(fixture())({ ...args, maxBytes: 1024 * 1024 + 1 }), /could not be verified/);
  const routes = fixture();
  routes.set(root, new Response(`{"padding":"${'x'.repeat(70_000)}"}`));
  await assert.rejects(source(routes)(args), /could not be verified/);
  routes.set(root, new Response(Buffer.from([0x7b, 0x22, 0xff, 0x22, 0x3a, 0x31, 0x7d])));
  await assert.rejects(source(routes)(args), /could not be verified/);
});

test('accepts a 1 MiB blob with GitHub-style wrapped base64', async () => {
  const bytes = Buffer.alloc(1024 * 1024, 0x61);
  const sha = createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
  const routes = fixture();
  routes.get(`${root}/git/trees/${docsTree}`).tree[0] = {
    path: 'policy.md', mode: '100644', type: 'blob', sha, size: bytes.length,
  };
  routes.delete(`${root}/git/blobs/${blobSha}`);
  const wrapped = bytes.toString('base64').match(/.{1,60}/g).join('\n');
  routes.set(`${root}/git/blobs/${sha}`, { sha, size: bytes.length, encoding: 'base64', content: `${wrapped}\n` });
  const result = await source(routes)({ ...args, maxBytes: bytes.length });
  assert.deepEqual(result.content, bytes);
});

test('bounds a transport that ignores the abort signal', async () => {
  const fetchExternal = createGitHubAuthoritySource({
    token: 'private-test-token',
    timeoutMs: 5,
    fetchImpl: () => new Promise(() => {}),
  });
  await assert.rejects(fetchExternal(args), /could not be verified/);
});

test('rejects excessive path depth before any HTTP request', async () => {
  let calls = 0;
  const fetchExternal = createGitHubAuthoritySource({
    token: 'private-test-token',
    fetchImpl: async () => { calls++; throw new Error('should not fetch'); },
  });
  const deepPath = `${Array(16).fill('a').join('/')}/policy.md`;
  await assert.rejects(fetchExternal({ ...args, path: deepPath }), /could not be verified/);
  assert.equal(calls, 0);
});

test('bounds the full member even when earlier requests finish quickly', async () => {
  const routes = fixture();
  let calls = 0;
  const fetchExternal = createGitHubAuthoritySource({
    token: 'private-test-token',
    timeoutMs: 1_000,
    memberTimeoutMs: 100,
    fetchImpl: async url => {
      calls++;
      if (calls === 3) return new Promise(() => {});
      return new Response(JSON.stringify(routes.get(url)));
    },
  });
  const started = performance.now();
  await assert.rejects(fetchExternal(args), /could not be verified/);
  assert.equal(calls, 3);
  assert.ok(performance.now() - started < 500);
});

test('rejects malformed, noncanonical or unverifiable blobs', async () => {
  const original = fixture().get(`${root}/git/blobs/${blobSha}`);
  for (const blob of [
    { ...original, content: 'not base64!' },
    { ...original, content: original.content.trim().split('').join('\n') },
    { ...original, content: 'YR==' },
    { ...original, size: content.length + 1 },
    { ...original, content: Buffer.from('forged').toString('base64'), size: 6 },
    { ...original, encoding: 'utf-8' },
    { ...original, sha: 'd'.repeat(40) },
  ]) {
    const routes = fixture();
    routes.set(`${root}/git/blobs/${blobSha}`, blob);
    await assert.rejects(source(routes)(args), /could not be verified/);
  }
});
