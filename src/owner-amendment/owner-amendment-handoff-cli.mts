import { readLocalRulesetReadback } from '../github-ruleset-readback.mjs';
import { execFileSync } from 'node:child_process';
import { selectOwnerAmendmentHandoffPrRunContext, type OwnerAmendmentHandoffPrRunContextResult } from './owner-amendment-handoff-pr-run-context.mts';
import { resolveOwnerAmendmentHandoffGitContext, type OwnerAmendmentHandoffGitContext } from './owner-amendment-handoff-git-context.mts';
import { orchestrateOwnerAmendmentBlockHandoff, type OwnerAmendmentBlockHandoffFetch, type OwnerAmendmentBlockHandoffInput, type OwnerAmendmentBlockHandoffResult } from './owner-amendment-block-handoff-orchestrator.mts';
import type { OwnerAmendmentGhRunner } from './owner-amendment-attestation.mts';

const API = 'https://api.github.com';
const RULESET_ID = 24072482;
const fail: (message: unknown) => never = message => { throw new Error(`Owner amendment handoff caller: ${message}`); };

type HandoffEnvironment = Record<string, unknown>;
type GitRunner = {
  (file: string, args: string[], options: { encoding: 'utf8'; stdio: ['ignore', 'pipe', 'pipe'] }): string;
  (file: string, args: string[], options: { encoding: 'buffer'; maxBuffer: number; stdio: ['ignore', 'pipe', 'pipe'] }): Buffer;
  (file: string, args: string[], options: { maxBuffer: number; stdio: ['ignore', 'pipe', 'pipe'] }): Buffer;
};
type GhRunner = OwnerAmendmentGhRunner;
type CallbackFetchResponse = { ok?: unknown; status?: unknown; json?: () => unknown | PromiseLike<unknown>; body?: unknown };
type HandoffFetchOptions = Parameters<OwnerAmendmentBlockHandoffFetch>[1] | { headers: Record<string, string>; redirect: 'error' };
type FetchOperation = (url: string, options: HandoffFetchOptions) => CallbackFetchResponse | PromiseLike<CallbackFetchResponse>;
type GuardFetchOptions = Partial<HandoffFetchOptions> & { method?: string };
type Awaitable<T> = T | PromiseLike<T>;
type ContextFetch = NonNullable<Parameters<typeof selectOwnerAmendmentHandoffPrRunContext>[0]['fetchImpl']>;
type ContextSelector = (input: Parameters<typeof selectOwnerAmendmentHandoffPrRunContext>[0]) => Awaitable<OwnerAmendmentHandoffPrRunContextResult>;
type GitContextResolver = (input: Parameters<typeof resolveOwnerAmendmentHandoffGitContext>[0]) => OwnerAmendmentHandoffGitContext;
type HandoffOrchestrator = (input: OwnerAmendmentBlockHandoffInput) => Awaitable<OwnerAmendmentBlockHandoffResult>;
type HandoffOptions = Readonly<{
  env?: HandoffEnvironment;
  fetchImpl?: FetchOperation;
  runGit?: GitRunner;
  runGh?: GhRunner;
  selectContext?: ContextSelector;
  resolveGitContext?: GitContextResolver;
  orchestrate?: HandoffOrchestrator;
  now?: () => Date;
}>;

function positive(value: unknown): value is string { return typeof value === 'string' && /^[1-9]\d*$/.test(value); }
function requestInput(env: HandoffEnvironment) {
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

async function getJson(fetchImpl: FetchOperation, token: string, path: string): Promise<unknown> {
  const response = await fetchImpl(`${API}${path}`, { headers: {
    accept: 'application/vnd.github+json', authorization: `Bearer ${token}`,
    'x-github-api-version': '2022-11-28',
  }, redirect: 'error' });
  if (!response?.ok) fail(`GitHub API request failed (${response?.status ?? 'no response'}).`);
  return (response as { json: () => unknown | PromiseLike<unknown> }).json();
}

function gitReader(runGit: GitRunner) {
  return (args: string[]) => runGit('git', args, { maxBuffer: 1_048_577,
    stdio: ['ignore', 'pipe', 'pipe'] });
}

/** Execute the complete protected BLOCK-to-tag handoff with injectable boundaries. */
export async function runOwnerAmendmentHandoff({ env = process.env, fetchImpl = fetch,
  runGit = execFileSync, runGh = execFileSync as GhRunner, selectContext = selectOwnerAmendmentHandoffPrRunContext,
  resolveGitContext = resolveOwnerAmendmentHandoffGitContext,
  orchestrate = orchestrateOwnerAmendmentBlockHandoff, now = () => new Date() }: HandoffOptions = {}): Promise<OwnerAmendmentBlockHandoffResult> {
  try {
    if (env.GITHUB_REF !== 'refs/heads/main' || env.GITHUB_EVENT_NAME !== 'repository_dispatch' ||
        env.GITHUB_EVENT_ACTION !== 'owner-amendment-block-handoff-v1') {
      fail('handoff must execute from a default-branch repository_dispatch run on protected main.');
    }
    const input = requestInput(env);
    const token = env.GH_TOKEN;
    if (typeof token !== 'string' || !token) fail('GH_TOKEN is required.');
    const selected = await selectContext({ input, token, fetchImpl: fetchImpl as ContextFetch });
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
    const gitContext = resolveGitContext({ repository: selected.repository as string, baseSha: selected.baseSha as string,
      headSha: selected.bHeadSha as string, runGit: gitReader(runGit) });

    // The selector authenticated the exact pull_request_target attempt and A
    // head. The attestation verifier below binds its signer and caller to the
    // protected-base workflow revision and main ref.
    const rulesetReadback = env.OWNER_AMENDMENT_RULESET_READBACK_FILE ? readLocalRulesetReadback(
      env.OWNER_AMENDMENT_RULESET_READBACK_FILE, env, { baseSha: selected.baseSha as string,
        rulesetId: RULESET_ID, tagNamespace: gitContext.policy.ownerAmendmentTagNamespace as string }) : undefined;
    const workflowRef = 'refs/heads/main';
    const blockRun = { runId: selected.runId, runAttempt: selected.runAttempt,
      headSha: selected.aHeadSha, aPrNumber: Number(selected.aPrNumber),
      workflowPath: '.github/workflows/self-architecture-gate.yml', workflowRef, workflowSha: selected.baseSha };
    const tagger = { name: 'Architecture Gatekeeper', email: 'architecture-gatekeeper@users.noreply.github.com',
      date: now().toISOString() };
    const assertCurrentBContext = async () => {
      const currentB = await getJson(fetchImpl, token,
        `/repos/${encodeURIComponent((selected.repository as string).split('/')[0])}/${encodeURIComponent((selected.repository as string).split('/')[1])}/pulls/${selected.bPrNumber}`);
      if ((currentB as { state: unknown }).state !== 'open' || (currentB as { draft: unknown }).draft !== false ||
          (currentB as { head?: { sha?: unknown } }).head?.sha !== selected.bHeadSha ||
          (currentB as { base?: { sha?: unknown } }).base?.sha !== selected.baseSha ||
          (currentB as { base?: { ref?: unknown } }).base?.ref !== 'main') {
        fail('B PR head or protected previous base changed during tag handoff.');
      }
    };
    const guardedFetch = async (url: string, options: GuardFetchOptions = {}) => {
      if (options.method === 'POST' && /\/git\/(?:tags|refs)$/.test(new URL(url).pathname)) {
        await assertCurrentBContext();
      }
      // Request option shapes are supplied by the existing artifact/tag helpers;
      // Node's standard fetch performs the same calls used by this CLI.
      return fetchImpl(url, options as HandoffFetchOptions);
    };
    const result = await orchestrate({ repository: selected.repository, policy: gitContext.policy,
      manifest: gitContext.manifest, baseSha: selected.baseSha, bSha: selected.bHeadSha,
      changedFiles: gitContext.changedFiles, baseAuthorityBytes: gitContext.authorityBytes.base,
      headAuthorityBytes: gitContext.authorityBytes.head, blockRun,
      purpose: 'Amend canonical architecture authority under the previous protected main policy.',
      token, runGh, rulesetId: RULESET_ID, tagger, rulesetReadback,
      fetchImpl: guardedFetch as OwnerAmendmentBlockHandoffFetch });
    if (result.status !== 'TAG_TRANSPORTED_AND_READ_BACK') fail(result.reason ?? 'tag handoff did not complete.');
    // An existing exact tag takes a GET-only path and may never reach the
    // mutation guard above. Revalidate the selected B and previous-base pair
    // before accepting either transport outcome.
    await assertCurrentBContext();
    return result;
  } catch (error: unknown) {
    return Object.freeze({ status: 'INCOMPLETE', reason: (error as { message: unknown }).message });
  }
}
