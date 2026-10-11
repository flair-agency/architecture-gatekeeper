import { readLocalRulesetReadback } from '../github-ruleset-readback.mjs';
import { execFileSync } from 'node:child_process';
import { discoverOwnerAmendmentBlockArtifact } from './owner-amendment-artifact-discovery.mts';
import type { OwnerAmendmentGhRunner } from './owner-amendment-attestation.mts';
import { selectOwnerAmendmentHandoffPrRunContext } from './owner-amendment-handoff-pr-run-context.mts';
import { resolveOwnerAmendmentHandoffGitContext } from './owner-amendment-handoff-git-context.mts';
import { handoffOwnerAmendmentOwnerDecision, type OwnerAmendmentOwnerDecisionHandoffResult } from './owner-amendment-owner-decision-handoff.mts';
import type { OwnerAmendmentOwnerDecisionHandoffFetch } from './owner-amendment-owner-decision-handoff.mts';

const fail: (message: unknown) => never = message => { throw new Error(`Owner amendment OWNER_DECISION handoff caller: ${message}`); };
const positive = (value: unknown) => typeof value === 'string' && /^[1-9]\d*$/.test(value);

type CliEnvironment = Readonly<Record<string, unknown>>;
type CliFetch = OwnerAmendmentOwnerDecisionHandoffFetch;
type CliStdio = ['ignore', 'pipe', 'pipe'];
type CliRunGit = {
  (file: string, args: readonly string[], options: { encoding: 'utf8'; stdio: CliStdio }): string;
  (file: string, args: readonly string[], options: { encoding: 'buffer'; maxBuffer: number; stdio: CliStdio }): Buffer;
  (file: string, args: readonly string[], options: { maxBuffer: number; stdio: CliStdio }): Buffer;
};
type Awaitable<T> = T | PromiseLike<T>;
type CliSelectContext = (input: Parameters<typeof selectOwnerAmendmentHandoffPrRunContext>[0]) => Awaitable<Awaited<ReturnType<typeof selectOwnerAmendmentHandoffPrRunContext>>>;
type CliResolveGitContext = typeof resolveOwnerAmendmentHandoffGitContext;
type CliRunGh = OwnerAmendmentGhRunner;
type CliDiscoverArtifact = (input: Parameters<typeof discoverOwnerAmendmentBlockArtifact>[0]) => Awaitable<Awaited<ReturnType<typeof discoverOwnerAmendmentBlockArtifact>>>;
type CliHandoff = (input: Parameters<typeof handoffOwnerAmendmentOwnerDecision>[0]) => Awaitable<Awaited<ReturnType<typeof handoffOwnerAmendmentOwnerDecision>>>;

export type OwnerAmendmentOwnerDecisionHandoffCliInput = Readonly<{
  env?: CliEnvironment;
  fetchImpl?: CliFetch;
  runGit?: CliRunGit;
  runGh?: CliRunGh;
  selectContext?: CliSelectContext;
  resolveGitContext?: CliResolveGitContext;
  discoverArtifact?: CliDiscoverArtifact;
  handoff?: CliHandoff;
  now?: () => Date;
}>;

export type OwnerAmendmentOwnerDecisionHandoffCliResult = OwnerAmendmentOwnerDecisionHandoffResult;

/** Execute the protected-main OWNER_DECISION artifact-to-tag transport route. */
export async function runOwnerAmendmentOwnerDecisionHandoff({ env = process.env, fetchImpl = fetch,
  runGit = execFileSync as CliRunGit, runGh = execFileSync as CliRunGh, selectContext = selectOwnerAmendmentHandoffPrRunContext,
  resolveGitContext = resolveOwnerAmendmentHandoffGitContext, discoverArtifact = discoverOwnerAmendmentBlockArtifact,
  handoff = handoffOwnerAmendmentOwnerDecision, now = () => new Date() }: OwnerAmendmentOwnerDecisionHandoffCliInput = {}): Promise<OwnerAmendmentOwnerDecisionHandoffCliResult> {
  try {
    if (env.GITHUB_REF !== 'refs/heads/main' || env.GITHUB_EVENT_NAME !== 'repository_dispatch' ||
        env.GITHUB_EVENT_ACTION !== 'owner-amendment-owner-decision-handoff-v1') fail('handoff must execute from protected main via the exact repository_dispatch action.');
    const input = { repository: env.GITHUB_REPOSITORY, bPrNumber: env.B_PR_NUMBER,
      aPrNumber: env.A_PR_NUMBER, runId: env.OWNER_DECISION_RUN_ID, runAttempt: env.OWNER_DECISION_RUN_ATTEMPT };
    if (input.repository !== 'flair-agency/architecture-gatekeeper' ||
        ![input.bPrNumber, input.aPrNumber, input.runId, input.runAttempt].every(positive) || input.bPrNumber === input.aPrNumber) {
      fail('self repository, distinct B/A PRs, and exact trigger run attempt are required.');
    }
    const token = env.GH_TOKEN;
    if (typeof token !== 'string' || !token) fail('GH_TOKEN is required.');
    // These operation views match the selectors' existing JSON-reading fetch
    // contracts; they do not validate a callback response at this layer.
    const selected = await selectContext({ input, token,
      fetchImpl: fetchImpl as NonNullable<Parameters<typeof selectOwnerAmendmentHandoffPrRunContext>[0]['fetchImpl']> });
    if (selected.status !== 'SELECTED_OWNER_AMENDMENT_HANDOFF_PR_RUN_CONTEXT') fail(selected.reason ?? 'exact PR/run context selection failed.');
    const protectedHead = runGit('git', ['rev-parse', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
    if (protectedHead !== selected.baseSha) fail('checked-out protected main differs from the exact previous base.');
    runGit('git', ['fetch', '--no-tags', 'origin', `refs/pull/${selected.bPrNumber}/head`],
      { encoding: 'buffer', maxBuffer: 1_048_577, stdio: ['ignore', 'pipe', 'pipe'] });
    const fetched = runGit('git', ['rev-parse', 'FETCH_HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
    if (fetched !== selected.bHeadSha) fail('fetched B head differs from exact selected PR head.');
    const gitReader = (args: string[]) => runGit('git', args, { maxBuffer: 1_048_577, stdio: ['ignore', 'pipe', 'pipe'] });
    // The existing Git resolver declares string selectors. These assertions
    // only describe that downstream signature; the injected selector's values
    // remain untouched at runtime and are not promoted in the result type.
    const git = resolveGitContext({ repository: selected.repository as string, baseSha: selected.baseSha as string,
      headSha: selected.bHeadSha as string, runGit: gitReader });
    if (git.policy.ownerAmendmentTriggerProfile !== 'completed-owner-decision-self-v1') fail('previous protected policy did not opt into this trigger profile.');
    const artifact = await discoverArtifact({ expected: { repository: selected.repository, runId: selected.runId,
      runAttempt: selected.runAttempt, baseSha: selected.baseSha, headSha: selected.aHeadSha, profile: 'ownerDecision' },
    token, fetchImpl: fetchImpl as NonNullable<Parameters<typeof discoverOwnerAmendmentBlockArtifact>[0]['fetchImpl']> });
    if (artifact.status !== 'DISCOVERED_OWNER_AMENDMENT_OWNER_DECISION_ARTIFACT') fail(artifact.reason ?? 'exact OWNER_DECISION artifact discovery failed.');
    // The existing local-readback consumer declares string selectors. These
    // erased assertions leave collaborator values and runtime rereads intact.
    const rulesetReadback = env.OWNER_AMENDMENT_RULESET_READBACK_FILE ? readLocalRulesetReadback(
      env.OWNER_AMENDMENT_RULESET_READBACK_FILE, env, { baseSha: selected.baseSha as string,
        rulesetId: Number(env.OWNER_AMENDMENT_TAG_RULESET_ID), tagNamespace: git.policy.ownerAmendmentTagNamespace as string }) : undefined;
    const tagger = { name: 'Architecture Gatekeeper', email: 'architecture-gatekeeper@users.noreply.github.com', date: now().toISOString() };
    const result = await handoff({ repository: selected.repository, policy: git.policy, manifest: git.manifest,
      baseSha: selected.baseSha, bSha: selected.bHeadSha, changedFiles: git.changedFiles,
      baseAuthorityBytes: git.authorityBytes.base, headAuthorityBytes: git.authorityBytes.head,
      authorityChanges: git.authorityChanges,
      priorAuthoritySetDigest: git.priorAuthoritySetDigest,
      resultingAuthoritySetDigest: git.resultingAuthoritySetDigest,
      triggerRun: { runId: selected.runId, runAttempt: selected.runAttempt, prNumber: Number(selected.aPrNumber),
        headSha: selected.aHeadSha, workflowPath: selected.workflowPath, workflowRef: 'refs/heads/main',
        workflowSha: selected.baseSha, event: 'pull_request_target', artifactId: artifact.artifactId },
      authorityId: git.scope.authorityId, authorityPath: git.scope.authorityPath,
      purpose: env.AMENDMENT_PURPOSE, tagNamespace: git.policy.ownerAmendmentTagNamespace,
      rulesetId: Number(env.OWNER_AMENDMENT_TAG_RULESET_ID), token, tagger, rulesetReadback, fetchImpl, runGh });
    if (result.status !== 'OWNER_DECISION_TAG_TRANSPORTED_AND_READ_BACK') fail(result.reason ?? 'OWNER_DECISION handoff did not complete.');
    return result;
  } catch (error) { return Object.freeze({ status: 'INCOMPLETE', reason: (error as { message: unknown }).message }); }
}
