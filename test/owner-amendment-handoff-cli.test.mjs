import test from 'node:test';
import assert from 'node:assert/strict';
import { runOwnerAmendmentHandoff } from '../src/owner-amendment-handoff-cli.mjs';

const baseSha = 'a'.repeat(40), bHeadSha = 'b'.repeat(40), aHeadSha = 'c'.repeat(40);
const selected = { status: 'SELECTED_OWNER_AMENDMENT_HANDOFF_PR_RUN_CONTEXT',
  repository: 'flair-agency/architecture-gatekeeper', baseSha, bPrNumber: '201', bHeadSha,
  aPrNumber: '199', aHeadSha, runId: '55', runAttempt: '2' };
const env = { GITHUB_REPOSITORY: selected.repository, GITHUB_REF: 'refs/heads/main',
  GITHUB_EVENT_NAME: 'workflow_dispatch', B_PR_NUMBER: '201', A_PR_NUMBER: '199',
  BLOCK_RUN_ID: '55', BLOCK_RUN_ATTEMPT: '2', GH_TOKEN: 'token' };

function fixture(overrides = {}) {
  const calls = [];
  let currentBHead = bHeadSha;
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url, options });
    if (url.endsWith('/actions/runs/55/attempts/2')) return { ok: true, json: async () => ({
      head_sha: baseSha, head_branch: 'main', path: '.github/workflows/self-architecture-gate.yml@refs/heads/main',
    }) };
    if (url.endsWith('/pulls/201')) return { ok: true, json: async () => ({ state: 'open', draft: false,
      head: { sha: currentBHead }, base: { sha: baseSha, ref: 'main' } }) };
    if (options.method === 'POST') {
      if (url.endsWith('/git/tags') && overrides.moveAfterTag) currentBHead = 'e'.repeat(40);
      return { ok: true };
    }
    throw new Error(`Unexpected request ${url}`);
  };
  const runGit = (binary, args, options) => {
    calls.push({ binary, args });
    if (args[0] === 'rev-parse') return args[1] === 'FETCH_HEAD' ? bHeadSha : baseSha;
    return Buffer.alloc(0);
  };
  const selectContext = async input => { calls.push({ select: input }); return selected; };
  const resolveGitContext = input => {
    calls.push({ resolve: input });
    input.runGit(['--no-replace-objects', 'rev-parse', 'HEAD']);
    return { policy: { ownerAmendmentTagNamespace: 'refs/tags/example' }, manifest: {}, changedFiles: [],
      authorityBytes: { base: Buffer.from('base'), head: Buffer.from('head') } };
  };
  const orchestrate = async input => {
    calls.push({ orchestrate: input });
    await input.fetchImpl('https://api.github.com/repos/flair-agency/architecture-gatekeeper/git/tags',
      { method: 'POST' });
    await input.fetchImpl('https://api.github.com/repos/flair-agency/architecture-gatekeeper/git/refs',
      { method: 'POST' });
    return { status: 'TAG_TRANSPORTED_AND_READ_BACK', tagObjectSha: 'd'.repeat(40) };
  };
  return { calls, fetchImpl, runGit, selectContext, resolveGitContext, orchestrate,
    run: changes => runOwnerAmendmentHandoff({ env: { ...env, ...changes }, fetchImpl, runGit,
      selectContext, resolveGitContext, orchestrate, runGh: () => '', now: () => new Date('2026-09-27T00:00:00.000Z') }),
    changeBHead: value => { currentBHead = value; } };
}

test('runs protected exact-base handoff and re-reads B immediately before tag creation', async () => {
  const f = fixture();
  const result = await f.run();
  assert.equal(result.status, 'TAG_TRANSPORTED_AND_READ_BACK');
  assert.equal(f.calls.filter(call => call.url?.endsWith('/pulls/201')).length, 2);
  assert.equal(f.calls.findIndex(call => call.url?.endsWith('/pulls/201')) <
    f.calls.findIndex(call => call.url?.endsWith('/git/tags')), true);
  const orchestrated = f.calls.find(call => call.orchestrate).orchestrate;
  assert.equal(orchestrated.blockRun.workflowSha, baseSha);
  assert.equal(orchestrated.blockRun.headSha, aHeadSha);
  assert.equal(orchestrated.rulesetId, 24072482);
  assert.equal(f.calls.some(call => call.binary === 'git' &&
    call.args.join(' ') === '--no-replace-objects rev-parse HEAD'), true);
  assert.equal(f.calls.some(call => call.binary === 'git' &&
    call.args.join(' ') === 'fetch --no-tags origin refs/pull/201/head'), true);
});

test('fails closed if the candidate B head changes before tag creation', async () => {
  const f = fixture();
  f.changeBHead('e'.repeat(40));
  const result = await f.run();
  assert.equal(result.status, 'INCOMPLETE');
  assert.match(result.reason, /immediately before tag mutation/);
  assert.equal(f.calls.some(call => call.url?.endsWith('/git/tags')), false);
});

test('fails closed if B changes between tag object and protected ref creation', async () => {
  const f = fixture({ moveAfterTag: true });
  const result = await f.run();
  assert.equal(result.status, 'INCOMPLETE');
  assert.match(result.reason, /immediately before tag mutation/);
  assert.equal(f.calls.some(call => call.url?.endsWith('/git/refs')), false);
});

test('requires protected workflow_dispatch context and GH_TOKEN', async t => {
  for (const [label, changes] of [
    ['pull request context', { GITHUB_REF: 'refs/pull/201/merge' }],
    ['missing token', { GH_TOKEN: '' }],
    ['wrong repository', { GITHUB_REPOSITORY: 'fork/repo' }],
  ]) await t.test(label, async () => {
    const f = fixture();
    const result = await f.run(changes);
    assert.equal(result.status, 'INCOMPLETE');
    assert.equal(f.calls.some(call => call.select), false);
  });
});

test('fails closed when checked out main is not the API-selected B base', async () => {
  const f = fixture();
  const runGit = (binary, args) => args[0] === 'rev-parse' ? 'f'.repeat(40) : Buffer.alloc(0);
  const result = await runOwnerAmendmentHandoff({ env, fetchImpl: f.fetchImpl, runGit,
    selectContext: async () => selected, resolveGitContext: f.resolveGitContext, orchestrate: f.orchestrate });
  assert.equal(result.status, 'INCOMPLETE');
  assert.match(result.reason, /does not equal the selected previous base/);
});

test('fails closed when the fetched PR ref differs from the selected exact B', async () => {
  const f = fixture();
  const runGit = (binary, args) => args[0] === 'rev-parse'
    ? (args[1] === 'FETCH_HEAD' ? 'f'.repeat(40) : baseSha) : Buffer.alloc(0);
  const result = await runOwnerAmendmentHandoff({ env, fetchImpl: f.fetchImpl, runGit,
    selectContext: f.selectContext, resolveGitContext: f.resolveGitContext, orchestrate: f.orchestrate });
  assert.equal(result.status, 'INCOMPLETE');
  assert.match(result.reason, /fetched B PR ref no longer matches/);
  assert.equal(f.calls.some(call => call.orchestrate), false);
});
