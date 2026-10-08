import test from 'node:test';
import assert from 'node:assert/strict';
import { selectOwnerAmendmentHandoffPrRunContext } from '../dist/owner-amendment-handoff-pr-run-context.mjs';

const repository = 'flair-agency/architecture-gatekeeper';
const baseSha = 'a'.repeat(40);
const bHeadSha = 'b'.repeat(40);
const aHeadSha = 'c'.repeat(40);
const input = Object.freeze({ repository, bPrNumber: 201, aPrNumber: 199, runId: '36315628115', runAttempt: '1' });

function fixture() {
  const repo = { id: 1379218762, full_name: repository };
  const bPr = { number: 201, state: 'open', draft: false,
    base: { ref: 'main', sha: baseSha, repo }, head: { sha: bHeadSha, repo } };
  const aPr = { number: 199, state: 'closed', draft: false, merged: false, merged_at: null,
    base: { ref: 'main', sha: baseSha, repo }, head: { sha: aHeadSha, repo } };
  const run = { id: 36315628115, run_attempt: 1, status: 'completed', event: 'pull_request_target',
    path: '.github/workflows/self-architecture-gate.yml@refs/heads/main',
    repository: repo, head_repository: repo, head_sha: aHeadSha, pull_requests: [] };
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    if (url.endsWith('/pulls/201')) return { ok: true, json: async () => bPr };
    if (url.endsWith('/pulls/199')) return { ok: true, json: async () => aPr };
    if (url.endsWith('/actions/runs/36315628115/attempts/1')) return { ok: true, json: async () => run };
    throw new Error(`unexpected request ${url}`);
  };
  return { repo, bPr, aPr, run, calls, fetchImpl };
}

async function select(f = fixture(), overrides = {}) {
  return selectOwnerAmendmentHandoffPrRunContext({ input: { ...input, ...overrides.input }, token: 'fixture-token',
    fetchImpl: f.fetchImpl });
}

test('selects exact same-repository B and A PRs plus completed self workflow attempt', async () => {
  const f = fixture();
  const result = await select(f);
  assert.deepEqual(result, {
    status: 'SELECTED_OWNER_AMENDMENT_HANDOFF_PR_RUN_CONTEXT', repository,
    repositoryId: 1379218762, baseSha, bPrNumber: '201', bHeadSha,
    aPrNumber: '199', aHeadSha, runId: '36315628115', runAttempt: '1',
    workflowPath: '.github/workflows/self-architecture-gate.yml', runHeadSha: aHeadSha,
    runRepositoryId: 1379218762,
  });
  assert.equal(f.calls.length, 3);
  for (const { options } of f.calls) {
    assert.equal(options.headers.authorization, 'Bearer fixture-token');
    assert.equal(options.redirect, 'error');
  }
});

test('does not depend on run.pull_requests to associate the A head', async () => {
  const f = fixture();
  f.run.pull_requests = [];
  const result = await select(f);
  assert.equal(result.status, 'SELECTED_OWNER_AMENDMENT_HANDOFF_PR_RUN_CONTEXT');
  assert.equal(result.aHeadSha, aHeadSha);
});

test('rejects malformed or untrusted request inputs before making requests', async t => {
  const cases = [
    ['unknown input field', { extra: true }],
    ['same A and B PR', { aPrNumber: '201' }],
    ['invalid run attempt', { runAttempt: '0' }],
    ['invalid repository', { repository: 'owner/repo/path' }],
  ];
  for (const [name, changed] of cases) await t.test(name, async () => {
    const f = fixture();
    const result = await select(f, { input: changed });
    assert.equal(result.status, 'INCOMPLETE');
    assert.equal(f.calls.length, 0);
  });
});

test('fails closed for invalid PR and run identities', async t => {
  const cases = [
    ['B closed', f => { f.bPr.state = 'closed'; }],
    ['B draft', f => { f.bPr.draft = true; }],
    ['B non-main base', f => { f.bPr.base.ref = 'release'; }],
    ['A non-main base', f => { f.aPr.base.ref = 'release'; }],
    ['A already merged', f => { f.aPr.merged = true; f.aPr.merged_at = '2026-09-27T00:00:00Z'; }],
    ['A base revision differs', f => { f.aPr.base.sha = 'd'.repeat(40); }],
    ['B head from fork', f => { f.bPr.head.repo = { id: 987, full_name: 'fork/architecture-gatekeeper' }; }],
    ['A head from fork', f => { f.aPr.head.repo = { id: 987, full_name: 'fork/architecture-gatekeeper' }; }],
    ['run not completed', f => { f.run.status = 'in_progress'; }],
    ['wrong run event', f => { f.run.event = 'workflow_dispatch'; }],
    ['wrong exact attempt', f => { f.run.run_attempt = 2; }],
    ['wrong workflow path', f => { f.run.path = '.github/workflows/architecture-gate.yml@refs/heads/main'; }],
    ['unrelated run head', f => { f.run.head_sha = 'd'.repeat(40); }],
    ['missing run PR association list', f => { delete f.run.pull_requests; }],
    ['mixed run PR associations', f => { f.run.pull_requests = [
      { number: 199, base: { ref: 'main', sha: baseSha, repo: f.repo }, head: { sha: aHeadSha, repo: f.repo } },
      { number: 198, base: { ref: 'main', sha: baseSha, repo: f.repo }, head: { sha: aHeadSha, repo: f.repo } },
    ]; }],
    ['duplicate exact run PR associations', f => { const exact = { number: 199,
      base: { ref: 'main', sha: baseSha, repo: f.repo }, head: { sha: aHeadSha, repo: f.repo } };
      f.run.pull_requests = [exact, structuredClone(exact)]; }],
    ['wrong run repository', f => { f.run.repository = { id: 1, full_name: 'someone/else' }; }],
    ['missing run repository id', f => { delete f.run.repository.id; }],
    ['wrong run head repository', f => { f.run.head_repository = { id: 1, full_name: 'fork/architecture-gatekeeper' }; }],
  ];
  for (const [name, mutate] of cases) await t.test(name, async () => {
    const f = fixture(); mutate(f);
    const result = await select(f);
    assert.equal(result.status, 'INCOMPLETE');
    assert.match(result.reason, /Owner amendment handoff PR\/run context:/);
  });
});

test('accepts protected-base pull_request_target metadata while binding the exact A PR head', async () => {
  const f = fixture();
  f.run.head_sha = baseSha;
  f.run.pull_requests = [];
  const result = await select(f);
  assert.equal(result.status, 'SELECTED_OWNER_AMENDMENT_HANDOFF_PR_RUN_CONTEXT', result.reason);
  assert.equal(result.aHeadSha, aHeadSha);
  assert.equal(result.runHeadSha, baseSha);
});

test('accepts a single exact PR association when protected-base run metadata is present', async () => {
  const f = fixture();
  f.run.head_sha = baseSha;
  f.run.pull_requests = [{ number: 199,
    base: { ref: 'main', sha: baseSha, repo: f.repo }, head: { sha: aHeadSha, repo: f.repo } }];
  const result = await select(f);
  assert.equal(result.status, 'SELECTED_OWNER_AMENDMENT_HANDOFF_PR_RUN_CONTEXT', result.reason);
  assert.equal(result.aHeadSha, aHeadSha);
  assert.equal(result.runHeadSha, baseSha);
});

test('accepts compact associated-repository metadata when exact id, name, and API URL match', async () => {
  const f = fixture();
  f.run.head_sha = baseSha;
  const compact = { id: 1379218762, name: 'architecture-gatekeeper',
    url: 'https://api.github.com/repos/flair-agency/architecture-gatekeeper' };
  f.run.pull_requests = [{ number: 199,
    base: { ref: 'main', sha: baseSha, repo: structuredClone(compact) },
    head: { sha: aHeadSha, repo: structuredClone(compact) } }];
  const result = await select(f);
  assert.equal(result.status, 'SELECTED_OWNER_AMENDMENT_HANDOFF_PR_RUN_CONTEXT', result.reason);
});

test('retains full_name association matching when compact fields are absent', async () => {
  const f = fixture();
  f.run.pull_requests = [{ number: 199,
    base: { ref: 'main', sha: baseSha, repo: { full_name: repository } },
    head: { sha: aHeadSha, repo: { full_name: repository } } }];
  const result = await select(f);
  assert.equal(result.status, 'SELECTED_OWNER_AMENDMENT_HANDOFF_PR_RUN_CONTEXT', result.reason);
});

test('rejects invalid compact associated-repository metadata on either side', async t => {
  const mutations = [
    ['base wrong id', pr => { pr.base.repo.id++; }],
    ['head wrong id', pr => { pr.head.repo.id++; }],
    ['base wrong name', pr => { pr.base.repo.name = 'other'; }],
    ['head wrong name', pr => { pr.head.repo.name = 'other'; }],
    ['base wrong URL', pr => { pr.base.repo.url = 'https://api.github.com/repos/other/architecture-gatekeeper'; }],
    ['head wrong URL', pr => { pr.head.repo.url = 'https://api.github.com/repos/flair-agency/other'; }],
    ['base missing name', pr => { delete pr.base.repo.name; }],
    ['head missing URL', pr => { delete pr.head.repo.url; }],
    ['base malformed URL', pr => { pr.base.repo.url = 'https://api.github.com/repos/flair-agency/architecture-gatekeeper/'; }],
    ['head foreign host', pr => { pr.head.repo.url = 'https://evil.example/repos/flair-agency/architecture-gatekeeper'; }],
    ['base conflicting full name', pr => { pr.base.repo.full_name = 'other/repo'; }],
    ['head conflicting full name', pr => { pr.head.repo.full_name = 'other/repo'; }],
  ];
  for (const [name, mutate] of mutations) await t.test(name, async () => {
    const f = fixture();
    f.run.head_sha = baseSha;
    const compact = { id: 1379218762, name: 'architecture-gatekeeper',
      url: 'https://api.github.com/repos/flair-agency/architecture-gatekeeper' };
    const pr = { number: 199,
      base: { ref: 'main', sha: baseSha, repo: structuredClone(compact) },
      head: { sha: aHeadSha, repo: structuredClone(compact) } };
    mutate(pr);
    f.run.pull_requests = [pr];
    const result = await select(f);
    assert.equal(result.status, 'INCOMPLETE');
  });
});

test('rejects a non-empty run PR association that does not match exact A', async () => {
  const f = fixture();
  f.run.head_sha = baseSha;
  f.run.pull_requests = [{ number: 198, base: { ref: 'main', sha: baseSha,
    repo: f.repo }, head: { sha: aHeadSha, repo: f.repo } }];
  const result = await select(f);
  assert.equal(result.status, 'INCOMPLETE');
  assert.match(result.reason, /PR association/);
});

test('reports API failures as incomplete without acceptance claims', async () => {
  const f = fixture();
  f.fetchImpl = async () => ({ ok: false, status: 404 });
  const result = await select(f);
  assert.equal(result.status, 'INCOMPLETE');
  assert.match(result.reason, /404/);
  assert.equal('eligible' in result, false);
  assert.equal('accepted' in result, false);
});
