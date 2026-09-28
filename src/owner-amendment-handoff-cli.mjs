import { execFileSync } from 'node:child_process';
import { selectOwnerAmendmentHandoffPrRunContext } from './owner-amendment-handoff-pr-run-context.mjs';
import { resolveOwnerAmendmentHandoffGitContext } from './owner-amendment-handoff-git-context.mjs';
import { orchestrateOwnerAmendmentBlockHandoff } from './owner-amendment-block-handoff-orchestrator.mjs';

const API = 'https://api.github.com';
const RULESET_ID = 24072482;
const fail = message => { throw new Error(`Owner amendment handoff caller: ${message}`); };

function positive(value) { return typeof value === 'string' && /^[1-9]\d*$/.test(value); }
function requestInput(env) {
  const repository = env.GITHUB_REPOSITORY;
  const bPrNumber = env.B_PR_NUMBER;
  const aPrNumber = env.A_PR_NUMBER;
  const runId = env.BLOCK_RUN_ID;
  const runAttempt = env.BLOCK_RUN_ATTEMPT;
  if (repository !== 'flair-agency/architecture-gatekeeper' ||
      ![bPrNumber, aPrNumber, runId, runAttempt].every(positive) || bPrNumber === aPrNumber) {
    fail('repository and positive, distinct B/A PR and completed BLOCK run inputs are required.');
  }
  return { repository, bPrNumber, aPrNumber, runId, runAttempt };
}

async function getJson(fetchImpl, token, path) {
  const response = await fetchImpl(`${API}${path}`, { headers: {
    accept: 'application/vnd.github+json', authorization: `Bearer ${token}`,
    'x-github-api-version': '2022-11-28',
  }, redirect: 'error' });
  if (!response?.ok) fail(`GitHub API request failed (${response?.status ?? 'no response'}).`);
  return response.json();
}

function gitReader(runGit) {
  return args => runGit('git', args, { maxBuffer: 1_048_577,
    stdio: ['ignore', 'pipe', 'pipe'] });
}

/** Execute the complete protected BLOCK-to-tag handoff with injectable boundaries. */
export async function runOwnerAmendmentHandoff({ env = process.env, fetchImpl = fetch,
  runGit = execFileSync, runGh = execFileSync, selectContext = selectOwnerAmendmentHandoffPrRunContext,
  resolveGitContext = resolveOwnerAmendmentHandoffGitContext,
  orchestrate = orchestrateOwnerAmendmentBlockHandoff, now = () => new Date() } = {}) {
  try {
    if (env.GITHUB_REF !== 'refs/heads/main' || env.GITHUB_EVENT_NAME !== 'repository_dispatch' ||
        env.GITHUB_EVENT_ACTION !== 'owner-amendment-block-handoff-v1') {
      fail('handoff must execute from a default-branch repository_dispatch run on protected main.');
    }
    const input = requestInput(env);
    const token = env.GH_TOKEN;
    if (typeof token !== 'string' || !token) fail('GH_TOKEN is required.');
    const selected = await selectContext({ input, token, fetchImpl });
    if (selected.status !== 'SELECTED_OWNER_AMENDMENT_HANDOFF_PR_RUN_CONTEXT') fail(selected.reason ?? 'PR/run selection is incomplete.');

    const protectedHead = runGit('git', ['rev-parse', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
    if (protectedHead !== selected.baseSha) fail('checked out protected main does not equal the selected previous base.');
    // GitHub advertises the PR head ref; fetching an arbitrary SHA is not a
    // portable way to obtain an object and must not silently select a new B.
    runGit('git', ['fetch', '--no-tags', 'origin', `refs/pull/${selected.bPrNumber}/head`],
      { encoding: 'buffer', maxBuffer: 1_048_577, stdio: ['ignore', 'pipe', 'pipe'] });
    const fetchedHead = runGit('git', ['rev-parse', 'FETCH_HEAD'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
    if (fetchedHead !== selected.bHeadSha) fail('fetched B PR ref no longer matches the selected exact head.');
    const gitContext = resolveGitContext({ repository: selected.repository, baseSha: selected.baseSha,
      headSha: selected.bHeadSha, runGit: gitReader(runGit) });

    // The selector authenticated the exact pull_request_target attempt and A
    // head. The attestation verifier below binds its signer and caller to the
    // protected-base workflow revision and main ref.
    const workflowRef = 'refs/heads/main';
    const blockRun = { runId: selected.runId, runAttempt: selected.runAttempt,
      headSha: selected.aHeadSha, aPrNumber: Number(selected.aPrNumber),
      workflowPath: '.github/workflows/self-architecture-gate.yml', workflowRef, workflowSha: selected.baseSha };
    const tagger = { name: 'Architecture Gatekeeper', email: 'architecture-gatekeeper@users.noreply.github.com',
      date: now().toISOString() };
    const assertCurrentBContext = async () => {
      const currentB = await getJson(fetchImpl, token,
        `/repos/${encodeURIComponent(selected.repository.split('/')[0])}/${encodeURIComponent(selected.repository.split('/')[1])}/pulls/${selected.bPrNumber}`);
      if (currentB.state !== 'open' || currentB.draft !== false || currentB.head?.sha !== selected.bHeadSha ||
          currentB.base?.sha !== selected.baseSha || currentB.base?.ref !== 'main') {
        fail('B PR head or protected previous base changed during tag handoff.');
      }
    };
    const guardedFetch = async (url, options = {}) => {
      if (options.method === 'POST' && /\/git\/(?:tags|refs)$/.test(new URL(url).pathname)) {
        await assertCurrentBContext();
      }
      return fetchImpl(url, options);
    };
    const result = await orchestrate({ repository: selected.repository, policy: gitContext.policy,
      manifest: gitContext.manifest, baseSha: selected.baseSha, bSha: selected.bHeadSha,
      changedFiles: gitContext.changedFiles, baseAuthorityBytes: gitContext.authorityBytes.base,
      headAuthorityBytes: gitContext.authorityBytes.head, blockRun,
      purpose: 'Amend canonical architecture authority under the previous protected main policy.',
      token, runGh, rulesetId: RULESET_ID, tagger, fetchImpl: guardedFetch });
    if (result.status !== 'TAG_TRANSPORTED_AND_READ_BACK') fail(result.reason ?? 'tag handoff did not complete.');
    // An existing exact tag takes a GET-only path and may never reach the
    // mutation guard above. Revalidate the selected B and previous-base pair
    // before accepting either transport outcome.
    await assertCurrentBContext();
    return result;
  } catch (error) {
    return Object.freeze({ status: 'INCOMPLETE', reason: error.message });
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runOwnerAmendmentHandoff().then(result => {
    process.stdout.write(`${JSON.stringify(result)}\n`);
    if (result.status !== 'TAG_TRANSPORTED_AND_READ_BACK') process.exitCode = 1;
  });
}
