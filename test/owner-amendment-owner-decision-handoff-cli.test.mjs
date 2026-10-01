import test from 'node:test';
import assert from 'node:assert/strict';
import { runOwnerAmendmentOwnerDecisionHandoff } from '../src/owner-amendment-owner-decision-handoff-cli.mjs';

const repository = 'flair-agency/architecture-gatekeeper';
const baseSha = 'a'.repeat(40), bHeadSha = 'b'.repeat(40), aHeadSha = 'c'.repeat(40);

test('default OWNER_DECISION handoff selector composes protected-base run metadata through exact B fetch', async () => {
  const repo = { id: 1379218762, full_name: repository };
  const bPr = { number: 201, state: 'open', draft: false,
    base: { ref: 'main', sha: baseSha, repo }, head: { sha: bHeadSha, repo } };
  const aPr = { number: 199, state: 'closed', draft: false, merged: false, merged_at: null,
    base: { ref: 'main', sha: baseSha, repo }, head: { sha: aHeadSha, repo } };
  const run = { id: 55, run_attempt: 2, status: 'completed', event: 'pull_request_target',
    path: '.github/workflows/self-architecture-gate.yml@refs/heads/main',
    repository: repo, head_repository: repo, head_sha: baseSha, pull_requests: [] };
  const calls = [];
  const fetchImpl = async url => {
    calls.push(String(url));
    const body = String(url).endsWith('/pulls/201') ? bPr
      : String(url).endsWith('/pulls/199') ? aPr : run;
    return { ok: true, json: async () => body };
  };
  const gitCalls = [];
  const runGit = (_binary, args) => {
    gitCalls.push(args.join(' '));
    if (args[0] === 'rev-parse' && args[1] === 'HEAD') return `${baseSha}\n`;
    if (args[0] === 'fetch') return Buffer.alloc(0);
    if (args[0] === 'rev-parse' && args[1] === 'FETCH_HEAD') return `${bHeadSha}\n`;
    throw new Error(`unexpected git request ${args.join(' ')}`);
  };
  const result = await runOwnerAmendmentOwnerDecisionHandoff({
    env: { GITHUB_REPOSITORY: repository, GITHUB_REF: 'refs/heads/main',
      GITHUB_EVENT_NAME: 'repository_dispatch', GITHUB_EVENT_ACTION: 'owner-amendment-owner-decision-handoff-v1',
      B_PR_NUMBER: '201', A_PR_NUMBER: '199', OWNER_DECISION_RUN_ID: '55',
      OWNER_DECISION_RUN_ATTEMPT: '2', GH_TOKEN: 'fixture-token' },
    fetchImpl, runGit,
    resolveGitContext: ({ baseSha: selectedBase, headSha: selectedB }) => {
      assert.equal(selectedBase, baseSha);
      assert.equal(selectedB, bHeadSha);
      throw new Error('stop at unconfigured protected Git-context boundary');
    },
  });
  assert.equal(result.status, 'INCOMPLETE');
  assert.match(result.reason, /stop at unconfigured protected Git-context boundary/);
  assert.deepEqual(calls, [
    `https://api.github.com/repos/${repository}/pulls/201`,
    `https://api.github.com/repos/${repository}/pulls/199`,
    `https://api.github.com/repos/${repository}/actions/runs/55/attempts/2`,
  ]);
  assert.deepEqual(gitCalls, ['rev-parse HEAD', 'fetch --no-tags origin refs/pull/201/head', 'rev-parse FETCH_HEAD']);
});
