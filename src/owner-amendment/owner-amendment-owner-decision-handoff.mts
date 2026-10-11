import { createHash } from 'node:crypto';
import { fetchOwnerAmendmentBlockArtifact, type OwnerAmendmentArtifactFetch } from './owner-amendment-artifact.mts';
import { extractOwnerAmendmentBlockArtifactZip, type OwnerAmendmentArtifactZipResult } from './owner-amendment-artifact-zip.mts';
import { verifyOwnerAmendmentBlockEvidence, type OwnerAmendmentAttestationResult, type OwnerAmendmentGhRunner } from './owner-amendment-attestation.mts';
import { buildOwnerAmendmentOwnerDecisionAmendmentRecord } from '../owner-amendment-owner-decision-amendment-record.mjs';
import { inspectOwnerAmendmentSelfScope } from './owner-amendment-scope.mts';
import { createAndReadOwnerAmendmentTag, type OwnerAmendmentTagRequestOptions } from './owner-amendment-tag-adapter.mts';

export type OwnerAmendmentAwaitable<T> = T | PromiseLike<T>;
export type OwnerAmendmentOwnerDecisionChangedFile = Readonly<{ path: unknown; status: unknown }>;
export type OwnerAmendmentOwnerDecisionAuthorityChange = Readonly<{ path: unknown; beforeBytes: unknown; afterBytes: unknown }>;
type HandoffFetchResponse = Readonly<{
  ok?: unknown; status?: unknown; json?: () => unknown | PromiseLike<unknown>; body?: unknown;
}>;
export type OwnerAmendmentOwnerDecisionHandoffFetch = (
  input: string,
  init: Parameters<OwnerAmendmentArtifactFetch>[1] | OwnerAmendmentTagRequestOptions,
) => HandoffFetchResponse | PromiseLike<HandoffFetchResponse>;
export type OwnerAmendmentOwnerDecisionArtifactResult =
  | Readonly<{ status: 'FETCHED_OWNER_AMENDMENT_BLOCK_ARTIFACT'; zipBytes: Buffer; reason?: never }>
  | Readonly<{ status: 'INCOMPLETE'; reason: unknown; zipBytes?: never }>;
export type OwnerAmendmentOwnerDecisionTagResult = Readonly<{ tagReadback: unknown }>;
export type OwnerAmendmentOwnerDecisionExpectedArtifact = Readonly<{
  repository: unknown;
  artifactId: unknown;
  runId: string;
  runAttempt: string;
  baseSha: unknown;
  headSha: unknown;
  profile: 'ownerDecision';
}>;
export type OwnerAmendmentOwnerDecisionTriggerRun = Readonly<{
  runId: unknown;
  runAttempt: unknown;
  prNumber: unknown;
  headSha: unknown;
  workflowPath: unknown;
  workflowRef: unknown;
  workflowSha: unknown;
  event: unknown;
  artifactId: unknown;
}>;
export type OwnerAmendmentOwnerDecisionHandoffInput = Readonly<{
  repository: unknown;
  policy: unknown;
  manifest: unknown;
  baseSha: unknown;
  bSha: unknown;
  changedFiles: unknown;
  baseAuthorityBytes: unknown;
  headAuthorityBytes: unknown;
  authorityChanges: unknown;
  priorAuthoritySetDigest: unknown;
  resultingAuthoritySetDigest: unknown;
  triggerRun: OwnerAmendmentOwnerDecisionTriggerRun;
  authorityId: unknown;
  authorityPath: unknown;
  purpose: unknown;
  tagNamespace: unknown;
  rulesetId: unknown;
  token: unknown;
  tagger: unknown;
  rulesetReadback?: unknown;
  fetchImpl?: OwnerAmendmentOwnerDecisionHandoffFetch;
  runGh: OwnerAmendmentGhRunner;
  fetchArtifact?: (input: Readonly<{ expected: OwnerAmendmentOwnerDecisionExpectedArtifact; token: string; fetchImpl: OwnerAmendmentOwnerDecisionHandoffFetch }>) => OwnerAmendmentAwaitable<OwnerAmendmentOwnerDecisionArtifactResult>;
  extractArtifact?: (zipBytes: unknown) => OwnerAmendmentArtifactZipResult;
  verifyEvidence?: (input: Parameters<typeof verifyOwnerAmendmentBlockEvidence>[0]) => OwnerAmendmentAttestationResult;
  createTag?: (input: Readonly<{
    repository: unknown; tagRef: string; bSha: unknown; tagMessage: string; tagNamespace: unknown;
    rulesetId: unknown; token: unknown; tagger: unknown; rulesetReadback?: unknown; fetchImpl: OwnerAmendmentOwnerDecisionHandoffFetch;
  }>) => OwnerAmendmentAwaitable<OwnerAmendmentOwnerDecisionTagResult>;
}>;

type IncompleteOwnerAmendmentOwnerDecisionHandoff = Readonly<{
  status: 'INCOMPLETE';
  reason: unknown;
  repository?: never;
  baseSha?: never;
  bSha?: never;
  triggerProfile?: never;
  tagRef?: never;
  tagObjectSha?: never;
  reviewRecordSha256?: never;
  attestationBundleSha256?: never;
  amendmentRecordSha256?: never;
  principalAuthentication?: never;
  exactClaimAuthorization?: never;
}>;
type TransportedOwnerAmendmentOwnerDecisionHandoff = Readonly<{
  status: 'OWNER_DECISION_TAG_TRANSPORTED_AND_READ_BACK';
  repository: string;
  baseSha: unknown;
  bSha: unknown;
  triggerProfile: 'completed-owner-decision-self-v1';
  tagRef: string;
  tagObjectSha: unknown;
  reviewRecordSha256: string;
  attestationBundleSha256: string;
  amendmentRecordSha256: string;
  principalAuthentication: 'not_verified';
  exactClaimAuthorization: 'not_verified';
  reason?: never;
}>;
export type OwnerAmendmentOwnerDecisionHandoffResult =
  | IncompleteOwnerAmendmentOwnerDecisionHandoff
  | TransportedOwnerAmendmentOwnerDecisionHandoff;

const sha = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
const fail = (message: unknown): never => { throw new Error(`Owner amendment OWNER_DECISION handoff: ${message}`); };
const canonical = (value: unknown): unknown => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical((value as Record<string, unknown>)[key])])) : value;

// These views describe only the existing runtime property reads. Parsed JSON
// and adapter observations stay unknown; assertions do not validate them.
type ReviewView = {
  kind?: unknown; decision?: { decision?: unknown } | null; repository?: unknown; prNumber?: unknown;
  baseSha?: unknown; headSha?: unknown; workflowSha?: unknown; workflowPath?: unknown;
  runId?: unknown; runAttempt?: unknown;
};
type TagReadbackView = { tagReadback: { sha: unknown } };
type ErrorMessageView = { message: unknown };

/**
 * Verify an exact completed OWNER_DECISION run, bind it into a distinct
 * authority-only Change B record, then transport/read back the exact-B tag.
 * This is procedure/evidence handling only: it neither authenticates owner
 * identity nor declares semantic eligibility or acceptance.
 */
export async function handoffOwnerAmendmentOwnerDecision({ repository, policy, manifest, baseSha, bSha,
  changedFiles, baseAuthorityBytes, headAuthorityBytes, authorityChanges, priorAuthoritySetDigest,
  resultingAuthoritySetDigest, triggerRun, authorityId, authorityPath, purpose,
  tagNamespace, rulesetId, token, tagger, rulesetReadback, fetchImpl = fetch, runGh,
  fetchArtifact = fetchOwnerAmendmentBlockArtifact as NonNullable<OwnerAmendmentOwnerDecisionHandoffInput['fetchArtifact']>, extractArtifact = extractOwnerAmendmentBlockArtifactZip,
  verifyEvidence = verifyOwnerAmendmentBlockEvidence, createTag = createAndReadOwnerAmendmentTag as NonNullable<OwnerAmendmentOwnerDecisionHandoffInput['createTag']>
}: OwnerAmendmentOwnerDecisionHandoffInput): Promise<OwnerAmendmentOwnerDecisionHandoffResult> {
  try {
    if (repository !== 'flair-agency/architecture-gatekeeper' ||
        (policy as { ownerAmendmentTriggerProfile?: unknown } | null | undefined)?.ownerAmendmentTriggerProfile !== 'completed-owner-decision-self-v1') {
      fail('previous protected policy did not select the OWNER_DECISION self profile.');
    }
    if (typeof token !== 'string' || !token || typeof runGh !== 'function') fail('GitHub token and attestation verifier are required.');
    if (!triggerRun || !/^[1-9]\d*$/.test(String(triggerRun.runId)) || !/^[1-9]\d*$/.test(String(triggerRun.runAttempt)) ||
        !Number.isSafeInteger(triggerRun.prNumber) || (triggerRun.prNumber as number) < 1 || !/^[a-f0-9]{40}$/.test((triggerRun.headSha ?? '') as string) ||
        triggerRun.workflowPath !== '.github/workflows/self-architecture-gate.yml' || triggerRun.workflowRef !== 'refs/heads/main' ||
        triggerRun.workflowSha !== baseSha || triggerRun.event !== 'pull_request_target') {
      fail('trusted completed OWNER_DECISION producer run does not bind the previous protected base and historical change.');
    }
    const scope = inspectOwnerAmendmentSelfScope({ policy, manifest, baseSha, headSha: bSha,
      changedFiles, baseAuthorityBytes, headAuthorityBytes });
    if (!Array.isArray(changedFiles) || !Array.isArray(authorityChanges) ||
        (changedFiles as OwnerAmendmentOwnerDecisionChangedFile[]).some(file => file?.status !== 'modified') ||
        (changedFiles as OwnerAmendmentOwnerDecisionChangedFile[]).map(file => file.path).sort().join('\0') !==
          (authorityChanges as OwnerAmendmentOwnerDecisionAuthorityChange[]).map(change => change?.path).sort().join('\0') ||
        new Set((authorityChanges as OwnerAmendmentOwnerDecisionAuthorityChange[]).map(change => change?.path)).size !== (authorityChanges as OwnerAmendmentOwnerDecisionAuthorityChange[]).length) {
      fail('complete OWNER_DECISION authority bytes do not exactly cover every changed B path.');
    }
    const expected = { repository, artifactId: triggerRun.artifactId, runId: String(triggerRun.runId),
      runAttempt: String(triggerRun.runAttempt), baseSha, headSha: triggerRun.headSha, profile: 'ownerDecision' as const };
    const fetched = await fetchArtifact({ expected, token: token as string, fetchImpl });
    if (fetched.status !== 'FETCHED_OWNER_AMENDMENT_BLOCK_ARTIFACT') fail((fetched as { reason?: unknown }).reason ?? 'exact OWNER_DECISION artifact could not be fetched.');
    const extracted = extractArtifact((fetched as { zipBytes: Buffer }).zipBytes);
    if (extracted.status !== 'EXTRACTED_OWNER_AMENDMENT_BLOCK_ARTIFACT') fail((extracted as { reason?: unknown }).reason ?? 'exact trigger artifact could not be extracted.');

    let review: unknown;
    try { review = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode((extracted as { reviewRecordBytes: Buffer }).reviewRecordBytes)) as unknown; }
    catch { fail('OWNER_DECISION ReviewRecord is invalid UTF-8 JSON.'); }
    if ((review as ReviewView).kind !== 'owner-amendment-owner-decision-review-record' || (review as ReviewView).decision?.decision !== 'OWNER_DECISION' ||
        (review as ReviewView).repository !== repository || (review as ReviewView).prNumber !== triggerRun.prNumber || (review as ReviewView).baseSha !== baseSha ||
        (review as ReviewView).headSha !== triggerRun.headSha || (review as ReviewView).workflowSha !== triggerRun.workflowSha ||
        (review as ReviewView).workflowPath !== triggerRun.workflowPath || String((review as ReviewView).runId) !== String(triggerRun.runId) ||
        String((review as ReviewView).runAttempt) !== String(triggerRun.runAttempt)) {
      fail('ReviewRecord is not the exact completed OWNER_DECISION selected by the protected run context.');
    }
    const producer = { repository, workflowPath: triggerRun.workflowPath, workflowSha: baseSha,
      workflowRef: triggerRun.workflowRef, runId: String(triggerRun.runId), runAttempt: String(triggerRun.runAttempt) };
    const provenance = verifyEvidence({ recordBytes: (extracted as { reviewRecordBytes: Buffer }).reviewRecordBytes,
      bundleBytes: (extracted as { attestationBundleBytes: Buffer }).attestationBundleBytes, expected: producer, runGh });
    if (provenance.status !== 'VERIFIED_PRODUCER_ATTESTATION' || provenance.recordSha256 !== sha((extracted as { reviewRecordBytes: Buffer }).reviewRecordBytes)) {
      fail((provenance as { reason?: unknown }).reason ?? 'OWNER_DECISION producer provenance is not verified.');
    }
    const built = buildOwnerAmendmentOwnerDecisionAmendmentRecord({ reviewRecordBytes: (extracted as { reviewRecordBytes: Buffer }).reviewRecordBytes,
      attestationBundleBytes: (extracted as { attestationBundleBytes: Buffer }).attestationBundleBytes, repository, baseSha, bSha,
      authorityId: scope.authorityId, authorityPath: scope.authorityPath,
      previousAuthorityBytes: baseAuthorityBytes, amendedAuthorityBytes: headAuthorityBytes,
      authorityChanges, priorAuthoritySetDigest, resultingAuthoritySetDigest, purpose });
    const envelope = { version: 3, profile: 'self-g0', triggerProfile: 'completed-owner-decision-self-v1', bSha,
      reviewRecordBase64: (extracted as { reviewRecordBytes: Buffer }).reviewRecordBytes.toString('base64'), reviewRecordSha256: sha((extracted as { reviewRecordBytes: Buffer }).reviewRecordBytes),
      attestationBundleBase64: (extracted as { attestationBundleBytes: Buffer }).attestationBundleBytes.toString('base64'), attestationBundleSha256: sha((extracted as { attestationBundleBytes: Buffer }).attestationBundleBytes),
      amendmentRecordBase64: built.bytes.toString('base64'), amendmentRecordSha256: sha(built.bytes) };
    const tagMessage = `${JSON.stringify(canonical(envelope))}\n`;
    if (Buffer.byteLength(tagMessage) > 262_144) fail('profiled tag envelope exceeds its byte limit.');
    const tagRef = `${tagNamespace}/${bSha}`;
    const tag = await createTag({ repository, tagRef, bSha, tagMessage,
      tagNamespace, rulesetId, token, tagger, rulesetReadback, fetchImpl });
    return Object.freeze({ status: 'OWNER_DECISION_TAG_TRANSPORTED_AND_READ_BACK', repository: repository as string, baseSha, bSha,
      triggerProfile: envelope.triggerProfile as 'completed-owner-decision-self-v1', tagRef,
      tagObjectSha: (tag as unknown as TagReadbackView).tagReadback.sha, reviewRecordSha256: envelope.reviewRecordSha256,
      attestationBundleSha256: envelope.attestationBundleSha256, amendmentRecordSha256: envelope.amendmentRecordSha256,
      principalAuthentication: 'not_verified' as const, exactClaimAuthorization: 'not_verified' as const });
  } catch (error) {
    return Object.freeze({ status: 'INCOMPLETE', reason: (error as ErrorMessageView).message });
  }
}
