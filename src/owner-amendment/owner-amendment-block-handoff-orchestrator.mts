// Run the protected self BLOCK-to-tag transport sequence. This reports tag
// transport only; a later protected merge-group/canonical verifier decides
// eligibility and acceptance.
import { buildOwnerAmendmentRecord } from '../owner-amendment-record-builder.mjs';
import { discoverOwnerAmendmentBlockArtifact, type OwnerAmendmentArtifactDiscoveryFetch } from './owner-amendment-artifact-discovery.mts';
import { inspectOwnerAmendmentSelfScope } from './owner-amendment-scope.mts';
import { composeOwnerAmendmentBlockHandoff } from './owner-amendment-block-handoff-compose.mts';
import { createAndReadOwnerAmendmentTag, type OwnerAmendmentTagFetch, type OwnerAmendmentTagRequestOptions } from './owner-amendment-tag-adapter.mts';
import type { OwnerAmendmentArtifactFetch } from './owner-amendment-artifact.mts';
import type { OwnerAmendmentGhRunner } from './owner-amendment-attestation.mts';

const SHA = /^[a-f0-9]{40}$/;
const fail: (message: unknown) => never = message => { throw new Error(`Owner amendment BLOCK handoff orchestration: ${message}`); };

type RunContextView = Readonly<Record<string, unknown>>;
// Requests are the existing artifact-read or tag-write operation shape;
// a callback may return a JSON response or the body-only ZIP response.
type HandoffFetchResponse = Readonly<{
  ok?: unknown; status?: unknown; json?: () => unknown | PromiseLike<unknown>; body?: unknown;
}>;
export type OwnerAmendmentBlockHandoffFetch = (
  input: string,
  init: Parameters<OwnerAmendmentArtifactFetch>[1] | OwnerAmendmentTagRequestOptions,
) => HandoffFetchResponse | PromiseLike<HandoffFetchResponse>;
export type OwnerAmendmentBlockHandoffInput<B = unknown> = Readonly<{
  repository: unknown;
  policy: unknown;
  manifest: unknown;
  baseSha: unknown;
  bSha: B;
  changedFiles: unknown;
  baseAuthorityBytes: unknown;
  headAuthorityBytes: unknown;
  blockRun: unknown;
  purpose: unknown;
  token: unknown;
  runGh: OwnerAmendmentGhRunner;
  rulesetId: unknown;
  tagger: unknown;
  rulesetReadback?: unknown;
  fetchImpl?: OwnerAmendmentBlockHandoffFetch;
}>;
type IncompleteResult<B> = Readonly<{
  status: 'INCOMPLETE';
  reason: unknown;
  bSha?: never;
}>;
type TransportedResult<B> = Readonly<{
  status: 'TAG_TRANSPORTED_AND_READ_BACK';
  transportStatus: 'ALREADY_PRESENT_AND_READ_BACK' | 'CREATED_AND_READ_BACK';
  repository: string;
  tagRef: string;
  bSha: B;
  tagObjectSha: unknown;
  reviewRecordSha256: string;
  attestationBundleSha256: string;
  amendmentRecordSha256: string;
}>;
export type OwnerAmendmentBlockHandoffResult<B = unknown> = IncompleteResult<B> | TransportedResult<B>;

function validateRunContext(context: unknown, repository: unknown, baseSha: unknown, bSha: unknown): unknown {
  const keys = ['runId', 'runAttempt', 'headSha', 'aPrNumber', 'workflowPath', 'workflowRef', 'workflowSha'];
  if (!context || typeof context !== 'object' || Array.isArray(context) ||
      Object.keys(context as object).sort().join(',') !== [...keys].sort().join(',')) fail('trusted BLOCK run context is incomplete or has unknown fields.');
  if (![(context as RunContextView).runId, (context as RunContextView).runAttempt].every(value =>
    (typeof value === 'string' && /^[1-9]\d*$/.test(value)) || (Number.isSafeInteger(value) && (value as number) > 0)) ||
      !SHA.test(((context as RunContextView).headSha ?? '') as string) || !SHA.test(((context as RunContextView).workflowSha ?? '') as string) || (context as RunContextView).workflowSha !== baseSha ||
      !Number.isSafeInteger((context as RunContextView).aPrNumber) || ((context as RunContextView).aPrNumber as number) < 1 ||
      (context as RunContextView).headSha === baseSha || (context as RunContextView).headSha === bSha ||
      typeof (context as RunContextView).workflowPath !== 'string' || !/^\.github\/workflows\/[A-Za-z0-9._-]+\.yml$/.test((context as RunContextView).workflowPath as string) ||
      typeof (context as RunContextView).workflowRef !== 'string' || !/^refs\/heads\/[A-Za-z0-9._/-]+$/.test((context as RunContextView).workflowRef as string)) {
    fail('trusted BLOCK run does not bind the expected base, historical A head, and protected producer workflow.');
  }
  return context;
}

/**
 * Inspect an exact self-authority B, discover and verify its triggering BLOCK
 * artifact, construct its AmendmentRecord from the verified bytes, then
 * transport/read back the exact-B annotated tag. All configuration and Git
 * objects passed here must have been resolved by a protected-base caller.
 */
export async function orchestrateOwnerAmendmentBlockHandoff<B = unknown>({
  repository, policy, manifest, baseSha, bSha, changedFiles,
  baseAuthorityBytes, headAuthorityBytes, blockRun, purpose,
  token, runGh, rulesetId, tagger, rulesetReadback, fetchImpl = fetch,
}: OwnerAmendmentBlockHandoffInput<B>): Promise<OwnerAmendmentBlockHandoffResult<B>> {
  try {
    if (typeof repository !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9-]*\/[A-Za-z0-9][A-Za-z0-9._-]*$/.test(repository)) {
      fail('trusted repository identity is invalid.');
    }
    if (!SHA.test((baseSha ?? '') as string) || !SHA.test((bSha ?? '') as string) || bSha === baseSha) fail('exact previous base and B commits are required.');
    if (!Buffer.isBuffer(baseAuthorityBytes) || !Buffer.isBuffer(headAuthorityBytes)) fail('exact authority Git object bytes are required.');
    if (typeof token !== 'string' || !token || typeof fetchImpl !== 'function' || typeof runGh !== 'function') {
      fail('authenticated GitHub and attestation verifier helpers are required.');
    }
    const scope = inspectOwnerAmendmentSelfScope({ policy, manifest, baseSha, headSha: bSha,
      changedFiles, baseAuthorityBytes, headAuthorityBytes });
    blockRun = validateRunContext(blockRun, repository, baseSha, bSha);

    const expectedRun = { repository, runId: (blockRun as RunContextView).runId, runAttempt: (blockRun as RunContextView).runAttempt,
      baseSha, headSha: (blockRun as RunContextView).headSha };
    // One callback serves JSON metadata and streamed ZIP requests. These erased
    // operation views retain the existing helpers' own response checks; they
    // do not certify that an arbitrary callback response has a JSON method.
    const discovered = await discoverOwnerAmendmentBlockArtifact({ expected: expectedRun, token,
      fetchImpl: fetchImpl as OwnerAmendmentArtifactDiscoveryFetch });
    if (discovered.status !== 'DISCOVERED_OWNER_AMENDMENT_BLOCK_ARTIFACT') fail(discovered.reason ?? 'BLOCK artifact discovery did not complete.');

    const context = { repository, artifactId: discovered.artifactId, runId: discovered.runId,
      runAttempt: discovered.runAttempt, baseSha, headSha: (blockRun as RunContextView).headSha,
      aPrNumber: (blockRun as RunContextView).aPrNumber,
      workflowPath: (blockRun as RunContextView).workflowPath, workflowRef: (blockRun as RunContextView).workflowRef,
      workflowSha: (blockRun as RunContextView).workflowSha, bSha };
    const composed = await composeOwnerAmendmentBlockHandoff({ context, token, fetchImpl,
      runGh,
      buildAmendmentRecordBytes: (reviewRecordBytes: Buffer, attestationBundleBytes: Buffer) => buildOwnerAmendmentRecord({
        scope, reviewRecordBytes, attestationBundleBytes, repository, purpose,
      }).bytes });
    if (composed.status !== 'PREPARED_BLOCK_HANDOFF_TAG_MESSAGE') fail(composed.reason ?? 'verified BLOCK handoff could not be prepared.');

    const tagNamespace: unknown = (policy as { ownerAmendmentTagNamespace: unknown }).ownerAmendmentTagNamespace;
    const tagRef = `${tagNamespace}/${bSha}`;
    const tag = await createAndReadOwnerAmendmentTag({ repository, tagRef, bSha: bSha as string,
      tagMessage: composed.tagMessage, tagNamespace: tagNamespace as string, rulesetId: rulesetId as number,
      token, tagger: tagger as { name: string; email: string; date: string }, rulesetReadback,
      fetchImpl: fetchImpl as OwnerAmendmentTagFetch });
    return Object.freeze({ status: 'TAG_TRANSPORTED_AND_READ_BACK', transportStatus: tag.transportStatus,
      repository, tagRef, bSha, tagObjectSha: (tag.tagReadback as { sha: unknown }).sha,
      reviewRecordSha256: composed.reviewRecordSha256,
      attestationBundleSha256: composed.attestationBundleSha256,
      amendmentRecordSha256: composed.amendmentRecordSha256 });
  } catch (error: unknown) {
    return Object.freeze({ status: 'INCOMPLETE', reason: (error as { message: unknown }).message });
  }
}
