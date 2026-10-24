import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { materializeAuthoritySet } from '../authority-set.mjs';
import { resolveOwnerAmendmentHandoffGitContext } from './owner-amendment-handoff-git-context.mts';
import { buildOwnerAmendmentOwnerInitiatedAmendmentRecord } from './owner-amendment-owner-initiated-record.mts';
import { createAndReadOwnerAmendmentTag, type OwnerAmendmentTagFetch } from './owner-amendment-tag-adapter.mts';

type Input = Readonly<{
  repository: string; selfRoot: string; baseSha: string; bSha: string;
  purpose: string; rulesetId: number; token: string;
  tagger: Readonly<{name: string; email: string; date: string}>;
  fetchImpl?: OwnerAmendmentTagFetch;
}>;
const sha = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
const fail = (message: string): never => { throw new Error(`Owner initiated handoff: ${message}`); };

/** Explicit operator evidence creation. Neither tagger metadata nor this result
 * authenticates an owner, establishes semantic eligibility, or grants acceptance.
 * No host/workflow is enabled by this callable helper.
 */
export async function handoffOwnerAmendmentOwnerInitiated({ repository, selfRoot,
  baseSha, bSha, purpose, rulesetId, token, tagger, fetchImpl = fetch }: Input) {
  try {
    if (repository !== 'flair-agency/architecture-gatekeeper' || typeof selfRoot !== 'string' || !selfRoot ||
        typeof token !== 'string' || !token.trim()) fail('fixed self repository, checkout root and token are required.');
    const runGit = (args: string[]) => execFileSync('git', ['-C', selfRoot, ...args], {
      encoding: 'buffer', maxBuffer: 1_048_577, timeout: 10_000, stdio: ['ignore', 'pipe', 'pipe'],
      env: {...process.env, GIT_NO_REPLACE_OBJECTS: '1'},
    });
    const context = resolveOwnerAmendmentHandoffGitContext({repository, baseSha, headSha: bSha, runGit});
    if (context.policy.ownerAmendmentTriggerProfile !== 'owner-initiated-self-v1') fail('previous protected policy did not select owner-initiated-self-v1.');
    const materialized = await materializeAuthoritySet({manifestBytes: context.manifestBytes,
      limits: context.limits, selfRepository: repository, selfRoot, authorityRevision: baseSha,
      profile:(context.policy.authorityProfile ?? 'v1') as string});
    const authority = {version:1, selfRepository: repository, authorityRevision: baseSha,
      manifestSha256: materialized.manifestSha256, setDigest: materialized.setDigest,
      members: materialized.members.map(({content: _content,...descriptor})=>descriptor)};
    const built = buildOwnerAmendmentOwnerInitiatedAmendmentRecord({authority, repository, baseSha, bSha,
      authorityId: context.scope.authorityId, authorityPath: context.scope.authorityPath,
      previousAuthorityBytes: context.authorityBytes.base, amendedAuthorityBytes: context.authorityBytes.head,
      authorityChanges: context.authorityChanges, priorAuthoritySetDigest: context.priorAuthoritySetDigest,
      resultingAuthoritySetDigest: context.resultingAuthoritySetDigest, purpose});
    const envelope = {amendmentRecordBase64: built.bytes.toString('base64'), amendmentRecordSha256: sha(built.bytes),
      bSha, historicalTrigger: 'none', profile: 'self-g0', triggerProfile: 'owner-initiated-self-v1', version:4};
    const tagMessage = `${JSON.stringify(envelope)}\n`;
    // Check the live fixed protected branch before any tag mutation. This is a
    // point-in-time observation, not a lock through the canonical transition.
    const mainRequest = {
      method: 'GET', redirect: 'error' as const,
      headers: { accept: 'application/vnd.github+json', authorization: `Bearer ${token}`,
        'x-github-api-version': '2022-11-28' },
    };
    const response = await fetchImpl('https://api.github.com/repos/flair-agency/architecture-gatekeeper/git/ref/heads/main', mainRequest);
    if (!response.ok) fail('protected main readback failed.');
    const main = await response.json() as {ref?: unknown;object?: {type?: unknown;sha?: unknown}};
    if (main?.ref !== 'refs/heads/main' || main.object?.type !== 'commit' || main.object.sha !== baseSha) fail('live protected main differs from the selected previous base.');
    const tagNamespace = context.policy.ownerAmendmentTagNamespace as string;
    const tagRef = `${tagNamespace}/${bSha}`;
    const transported = await createAndReadOwnerAmendmentTag({repository, tagRef, bSha, tagMessage, tagNamespace,
      rulesetId, token, tagger, fetchImpl});
    return Object.freeze({status: 'OWNER_INITIATED_TAG_TRANSPORTED_AND_READ_BACK' as const,
      repository, baseSha, bSha, triggerProfile: 'owner-initiated-self-v1' as const, historicalTrigger: 'none' as const,
      tagRef, tagObjectSha:(transported.tagReadback as {sha: unknown}).sha,
      amendmentRecordSha256: envelope.amendmentRecordSha256, principalAuthentication: 'not_verified' as const,
      exactClaimAuthorization: 'not_verified' as const});
  } catch (error) { return Object.freeze({status: 'INCOMPLETE' as const, reason:(error as Error).message}); }
}
