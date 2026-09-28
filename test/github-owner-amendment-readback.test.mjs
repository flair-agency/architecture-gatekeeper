import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { verifyGitHubOwnerAmendmentReadback } from '../src/github-owner-amendment-readback.mjs';

const repository = 'flair-agency/example';
const root = `https://api.github.com/repos/${repository}`;
const oid = digit => digit.repeat(40);
const authorityPath = 'docs/architecture.md';
const bytes = Buffer.from('# Updated canonical rule\n');
const digest = createHash('sha256').update(bytes).digest('hex');
const blobSha = createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');

function setup() {
  const baseSha = oid('1'); const bSha = oid('2'); const mergeSha = oid('3'); const targetSha = oid('4');
  const calls = [];
  const pr = { number: 12, state: 'closed', merged: true, merged_at: '2026-09-28T01:02:03Z',
    head: { sha: bSha }, base: { ref: 'main', repo: { full_name: repository } }, merge_commit_sha: mergeSha };
  const responses = new Map([
    [`${root}/pulls/12`, pr],
    [`${root}/git/commits/${mergeSha}`, { sha: mergeSha, tree: { sha: oid('a') }, parents: [{ sha: baseSha }, { sha: bSha }] }],
    [`${root}/compare/${mergeSha}...${targetSha}`, { status: 'ahead', base_commit: { sha: mergeSha },
      merge_base_commit: { sha: mergeSha }, commits: [] }],
    [`${root}/git/ref/heads/main`, { ref: 'refs/heads/main', object: { type: 'commit', sha: targetSha } }],
    [root, { full_name: repository }],
  ]);
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    let value = responses.get(url);
    if (!value) {
      const commitMatch = url.match(/\/git\/commits\/([a-f0-9]{40})$/);
      const treeMatch = url.match(/\/git\/trees\/([a-f0-9]{40})$/);
      const blobMatch = url.match(/\/git\/blobs\/([a-f0-9]{40})$/);
      if (commitMatch) value = { sha: commitMatch[1], tree: { sha: oid('a') } };
      if (treeMatch && treeMatch[1] === oid('a')) value = { sha: oid('a'), truncated: false,
        tree: [{ path: 'docs', mode: '040000', type: 'tree', sha: oid('b') }] };
      if (treeMatch && treeMatch[1] === oid('b')) value = { sha: oid('b'), truncated: false,
        tree: [{ path: 'architecture.md', mode: '100644', type: 'blob', sha: blobSha, size: bytes.length }] };
      if (blobMatch && blobMatch[1] === blobSha) value = { sha: blobSha, size: bytes.length,
        encoding: 'base64', content: bytes.toString('base64') };
    }
    return new Response(JSON.stringify(value ?? { message: 'Not Found' }), {
      status: value === undefined ? 404 : 200, headers: { 'content-type': 'application/json' },
    });
  };
  return { input: { token: 'test-token', repository, pullRequestNumber: 12, bSha, previousBaseSha: baseSha,
    authorityPath, authorityDigest: digest, fetchImpl }, calls, responses, baseSha, bSha, mergeSha, targetSha };
}

test('verifies merged exact-B merge commit, ancestry, and authority bytes at merge and current main', async () => {
  const f = setup();
  const result = await verifyGitHubOwnerAmendmentReadback(f.input);
  assert.equal(result.status, 'VERIFIED_OWNER_AMENDMENT_CANONICAL_READBACK');
  assert.equal(result.mergeSha, f.mergeSha);
  assert.equal(result.targetSha, f.targetSha);
  assert.match(result.assurance, /does not establish OWNER_AMENDMENT acceptance/);
  assert.ok(f.calls.every(call => call.options.method === 'GET' && call.options.redirect === 'manual'));
});

test('rejects unmerged, stale, and wrong PR identity', async () => {
  for (const mutate of [p => { p.state = 'open'; }, p => { p.head.sha = oid('5'); }, p => { p.base.ref = 'release'; }]) {
    const f = setup(); mutate(f.responses.get(`${root}/pulls/12`));
    await assert.rejects(verifyGitHubOwnerAmendmentReadback(f.input), /pull request is stale/);
  }
});

test('rejects squash/rebase and wrong previous-base parent', async () => {
  for (const parents of [[{ sha: oid('1') }], [{ sha: oid('1') }, { sha: oid('5') }],
    [{ sha: oid('5') }, { sha: oid('2') }]]) {
    const f = setup(); f.responses.get(`${root}/git/commits/${f.mergeSha}`).parents = parents;
    await assert.rejects(verifyGitHubOwnerAmendmentReadback(f.input), /two-parent merge commit/);
  }
});

test('rejects absent ancestry, changing target ref, or wrong canonical bytes', async () => {
  const ancestry = setup();
  ancestry.responses.get(`${root}/compare/${ancestry.mergeSha}...${ancestry.targetSha}`).merge_base_commit.sha = oid('5');
  await assert.rejects(verifyGitHubOwnerAmendmentReadback(ancestry.input), /does not prove/);

  const wrong = setup(); wrong.input.authorityDigest = 'f'.repeat(64);
  await assert.rejects(verifyGitHubOwnerAmendmentReadback(wrong.input), /authority bytes .* differ/);
});

test('rejects target branch movement during canonical readback', async () => {
  const f = setup();
  const originalFetch = f.input.fetchImpl;
  let refReads = 0;
  f.input.fetchImpl = async (url, options) => {
    if (url === `${root}/git/ref/heads/main` && ++refReads === 2) {
      f.calls.push({ url, options });
      return new Response(JSON.stringify({ ref: 'refs/heads/main', object: { type: 'commit', sha: oid('5') } }), { status: 200 });
    }
    return originalFetch(url, options);
  };
  await assert.rejects(verifyGitHubOwnerAmendmentReadback(f.input), /target ref moved/);
});
