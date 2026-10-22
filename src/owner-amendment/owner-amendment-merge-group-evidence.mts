import { createHash } from 'node:crypto';
import { TextDecoder } from 'node:util';
import { rejectDuplicateJsonKeys } from '../authority-set.mjs';
import { resolveOwnerAmendmentHandoffGitContext } from './owner-amendment-handoff-git-context.mts';
import { readOwnerAmendmentTagForMergeGroup, type OwnerAmendmentTagReadbackInput } from './owner-amendment-tag-readback.mts';
import { verifyOwnerAmendmentBlockEvidenceBundle } from './owner-amendment-block-evidence-composer.mts';
import { verifyOwnerAmendmentOwnerDecisionContext } from './owner-amendment-owner-decision-context-verifier.mts';
import { verifyOwnerAmendmentBlockEvidence, type OwnerAmendmentGhRunner } from './owner-amendment-attestation.mts';
import { deriveOwnerAmendmentGitChanges, type DeriveOwnerAmendmentGitChangesInput, type SynchronousGitCommand } from './owner-amendment-git-changes.mts';

const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
const SHA1 = /^[a-f0-9]{40}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const hash = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');
const fail: (message: unknown) => never = message => { throw new Error(`Owner amendment merge-group evidence: ${message}`); };

type Awaitable<T> = T | PromiseLike<T>;
type JsonRecord = Record<string, unknown>;
type EvidenceTagView = { objectOid?: unknown; objectBytes?: unknown };
type TagReadbackView = { status?: unknown; repository?: unknown; bSha?: unknown; tagRef?: unknown;
  observedTagRefOid?: unknown; tag?: EvidenceTagView };
type ContextPolicyView = { ownerAmendmentGrade?: unknown; ownerAmendmentScope?: unknown;
  ownerAmendmentTriggerProfile?: unknown };
type GitContextView = { repository?: unknown; baseSha?: unknown; headSha?: unknown; policyBytes?: unknown;
  policy?: ContextPolicyView; scope?: { authorityId?: unknown; authorityPath?: unknown;
    authorityMembers?: readonly { id: string; repository: string; revision: string; path: string }[] };
  authorityBytes?: { base?: unknown; head?: unknown }; priorAuthoritySetDigest?: unknown;
  resultingAuthoritySetDigest?: unknown; changedFiles?: unknown; authorityChanges?: unknown };
type VerifiedChangeView = { path?: unknown; beforeBytes?: unknown; afterBytes?: unknown };
type TrustedPolicyView = { grade?: unknown; scope?: unknown; triggerProfile?: unknown; authorities?: unknown };
type TrustedAuthorityView = { id?: unknown; path?: unknown; previousSha256?: unknown; newSha256?: unknown };
type TrustedContextView = { repository?: unknown; baseSha?: unknown; bSha?: unknown; policyRevision?: unknown;
  policy?: TrustedPolicyView; authority?: TrustedAuthorityView; policySha256?: unknown };
type TagEnvelopeView = { triggerProfile?: unknown; headSha?: unknown; tag?: EvidenceTagView; tagRef?: unknown;
  observedTagRefOid?: unknown; reviewRecordBytes?: unknown; attestationBundleBytes?: unknown; amendmentRecordBytes?: unknown };
type ProducerContextView = { repository?: unknown; workflowPath?: unknown; workflowSha?: unknown;
  workflowRef?: unknown; runId?: unknown; runAttempt?: unknown };
type RecordView = { repository?: unknown; baseSha?: unknown; workflowSha?: unknown; workflowPath?: unknown;
  runId?: unknown; runAttempt?: unknown; inputDigests?: { policy?: unknown }; authority?: { setDigest?: unknown } };
type EvidenceView = { status?: unknown; reason?: unknown; repository?: unknown; baseSha?: unknown; bSha?: unknown;
  policyRevision?: unknown; tagObjectOid?: unknown; authorityId?: unknown; previousAuthoritySha256?: unknown;
  proposedAuthoritySha256?: unknown; purpose?: unknown; priorAuthoritySetDigest?: unknown;
  resultingAuthoritySetDigest?: unknown; changes?: unknown; reviewRecordSha256?: unknown;
  amendmentRecordSha256?: unknown; attestationBundleSha256?: unknown };
type AttestationResultView = { status?: unknown; reason?: unknown; recordSha256?: unknown };
type ErrorMessageView = { message: unknown };

export type OwnerAmendmentMergeGroupEvidenceResult =
  | Readonly<{
      status: 'VERIFIED_OWNER_AMENDMENT_MERGE_GROUP_EVIDENCE';
      repository: unknown; baseSha: unknown; bSha: unknown; policyRevision: unknown; policySha256: string;
      triggerProfile: unknown; triggerDecision: 'OWNER_DECISION' | 'BLOCK'; authorityId: unknown;
      previousAuthoritySha256: unknown; proposedAuthoritySha256: unknown; purpose: unknown; targetValidated: true;
      priorAuthoritySetDigest: unknown; resultingAuthoritySetDigest: unknown; changes: unknown;
      reviewRecordSha256: unknown; amendmentRecordSha256: unknown; attestationBundleSha256: unknown;
      tagObjectOid: unknown; observedTagRefOid: unknown; producerRunId: unknown; producerRunAttempt: unknown;
      reason?: never;
    }>
  | Readonly<{
      status: 'INCOMPLETE'; reason: unknown;
      repository?: never; baseSha?: never; bSha?: never; policyRevision?: never; policySha256?: never;
      triggerProfile?: never; triggerDecision?: never; authorityId?: never; previousAuthoritySha256?: never;
      proposedAuthoritySha256?: never; purpose?: never; targetValidated?: never; priorAuthoritySetDigest?: never;
      resultingAuthoritySetDigest?: never; changes?: never; reviewRecordSha256?: never; amendmentRecordSha256?: never;
      attestationBundleSha256?: never; tagObjectOid?: never; observedTagRefOid?: never;
      producerRunId?: never; producerRunAttempt?: never;
    }>;

export type OwnerAmendmentMergeGroupEvidenceFetchResponse = Readonly<{
  ok?: unknown; status?: unknown; json?: () => unknown | PromiseLike<unknown>; body?: unknown;
}>;
export type OwnerAmendmentMergeGroupEvidenceFetch = (
  input: string,
  options: { headers: Record<string, string>; redirect: 'error'; method?: string; body?: string },
) => OwnerAmendmentMergeGroupEvidenceFetchResponse | PromiseLike<OwnerAmendmentMergeGroupEvidenceFetchResponse>;

type ResolveGitContextInput = Readonly<{ repository: unknown; baseSha: unknown; headSha: unknown; runGit: SynchronousGitCommand | undefined }>;
type ResolveGitContextOperation = (input: ResolveGitContextInput) => GitContextView;
type ReadTagInput = Readonly<{
  repository: unknown; bSha: unknown; tagNamespace: unknown; tagRef: unknown; rulesetId: unknown; token: unknown;
  fetchImpl: OwnerAmendmentMergeGroupEvidenceFetch | undefined;
  readTagObject: OwnerAmendmentTagReadbackInput['readTagObject'];
}>;
type ReadTagOperation = (input: ReadTagInput) => Awaitable<unknown>;
type VerifyEvidenceInput = Readonly<{ trustedContext: unknown; producerContext: unknown; tagEnvelope: unknown; runGh: OwnerAmendmentGhRunner | undefined }>;
type VerifyEvidenceCallbackResult = { status: unknown; reason?: unknown; repository?: unknown; baseSha?: unknown;
  bSha?: unknown; policyRevision?: unknown; tagObjectOid?: unknown; authorityId?: unknown;
  previousAuthoritySha256?: unknown; proposedAuthoritySha256?: unknown; purpose?: unknown;
  priorAuthoritySetDigest?: unknown; resultingAuthoritySetDigest?: unknown; changes?: unknown;
  reviewRecordSha256?: unknown; amendmentRecordSha256?: unknown; attestationBundleSha256?: unknown };
type VerifyEvidenceOperation = (input: VerifyEvidenceInput) => VerifyEvidenceCallbackResult;
export type ComposeOwnerAmendmentMergeGroupEvidenceInput = Readonly<{
  repository?: unknown; baseSha?: unknown; bSha?: unknown; runGit?: SynchronousGitCommand;
  tagNamespace?: unknown; tagRef?: unknown; rulesetId?: unknown; token?: unknown;
  fetchImpl?: OwnerAmendmentMergeGroupEvidenceFetch; readTagObject?: OwnerAmendmentTagReadbackInput['readTagObject'];
  runGh?: OwnerAmendmentGhRunner;
  resolveGitContext?: ResolveGitContextOperation;
  readTag?: ReadTagOperation;
  verifyEvidence?: VerifyEvidenceOperation;
}>;

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical((value as JsonRecord)[key])]));
  return value;
}

function parseTagEnvelope(tag: unknown, bSha: unknown): {
  triggerProfile: unknown; reviewRecordBytes: Buffer; attestationBundleBytes: Buffer; amendmentRecordBytes: Buffer;
} {
  const bytes = (tag as TagReadbackView | null | undefined)?.tag?.objectBytes;
  if (!Buffer.isBuffer(bytes) || bytes.length > 262_144) fail('exact protected tag bytes are absent or oversized.');
  let source: string;
  try { source = decoder.decode(bytes); } catch { fail('protected tag bytes are not UTF-8.'); }
  const separator = source.indexOf('\n\n');
  if (separator < 0) fail('protected tag object has no message.');
  const message = source.slice(separator + 2);
  if (!message.endsWith('\n') || message.slice(0, -1).includes('\n')) fail('tag envelope must be one newline-terminated JSON line.');
  const json = message.slice(0, -1);
  let envelope: unknown;
  try { rejectDuplicateJsonKeys(json, 'tag evidence envelope'); envelope = JSON.parse(json) as unknown; }
  catch { fail('tag evidence envelope JSON is invalid.'); }
  const block = (envelope as JsonRecord | null | undefined)?.version === 2 && (envelope as JsonRecord | null | undefined)?.triggerProfile === undefined;
  const ownerDecision = (envelope as JsonRecord | null | undefined)?.version === 3 && (envelope as JsonRecord | null | undefined)?.triggerProfile === 'completed-owner-decision-self-v1';
  const keys = block
    ? ['version', 'profile', 'bSha', 'reviewRecordBase64', 'reviewRecordSha256', 'attestationBundleBase64', 'attestationBundleSha256', 'amendmentRecordBase64', 'amendmentRecordSha256']
    : ['version', 'profile', 'triggerProfile', 'bSha', 'reviewRecordBase64', 'reviewRecordSha256', 'attestationBundleBase64', 'attestationBundleSha256', 'amendmentRecordBase64', 'amendmentRecordSha256'];
  if (!envelope || typeof envelope !== 'object' || Array.isArray(envelope) || Object.keys(envelope).length !== keys.length ||
      keys.some(key => !Object.hasOwn(envelope as object, key)) || JSON.stringify(canonical(envelope)) !== json ||
      (!block && !ownerDecision) || (envelope as JsonRecord).profile !== 'self-g0' || (envelope as JsonRecord).bSha !== bSha) {
    fail('tag evidence envelope is noncanonical or does not identify exact B.');
  }
  const decode = (encoded: unknown, digest: unknown, label: string, maximum: number): Buffer => {
    if (typeof encoded !== 'string' || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded)) fail(`${label} encoding is malformed.`);
    const data = Buffer.from(encoded, 'base64');
    if (!data.length || data.length > maximum || data.toString('base64') !== encoded || !SHA256.test((digest ?? '') as string) || hash(data) !== digest) fail(`${label} bytes or digest are invalid.`);
    return data;
  };
  return { triggerProfile: block ? 'completed-block-v1' : (envelope as JsonRecord).triggerProfile,
    reviewRecordBytes: decode((envelope as JsonRecord).reviewRecordBase64, (envelope as JsonRecord).reviewRecordSha256, 'ReviewRecord', 131_072),
    attestationBundleBytes: decode((envelope as JsonRecord).attestationBundleBase64, (envelope as JsonRecord).attestationBundleSha256, 'attestation bundle', 65_536),
    amendmentRecordBytes: decode((envelope as JsonRecord).amendmentRecordBase64, (envelope as JsonRecord).amendmentRecordSha256, 'AmendmentRecord', 8_192) };
}

function trustedContextFromGit(context: unknown, verifiedChanges: unknown): unknown {
  const bytes = (context as GitContextView | null | undefined)?.authorityBytes;
  if (!Buffer.isBuffer((context as GitContextView | null | undefined)?.policyBytes) || !Buffer.isBuffer(bytes?.base) || !Buffer.isBuffer(bytes?.head)) fail('resolved Git context lacks exact policy or authority bytes.');
  const decision = (context as GitContextView).policy!.ownerAmendmentTriggerProfile === 'completed-owner-decision-self-v1';
  const changes = decision ? (verifiedChanges as { map: (callback: (change: VerifiedChangeView) => unknown) => unknown } | null | undefined)?.map(change => Object.freeze({ path: change.path,
    beforeSha256: hash(change.beforeBytes as Uint8Array), afterSha256: hash(change.afterBytes as Uint8Array) })) : undefined;
  return Object.freeze({ repository: (context as GitContextView).repository, baseSha: (context as GitContextView).baseSha, bSha: (context as GitContextView).headSha,
    policyRevision: (context as GitContextView).baseSha,
    policy: Object.freeze({ grade: (context as GitContextView).policy!.ownerAmendmentGrade, scope: (context as GitContextView).policy!.ownerAmendmentScope,
      triggerProfile: (context as GitContextView).policy!.ownerAmendmentTriggerProfile,
      authorities: Object.freeze([{ id: (context as GitContextView).scope!.authorityId, path: (context as GitContextView).scope!.authorityPath }]) }),
    authority: Object.freeze({ id: (context as GitContextView).scope!.authorityId, path: (context as GitContextView).scope!.authorityPath,
      previousSha256: hash(bytes.base as Uint8Array), newSha256: hash(bytes.head as Uint8Array) }),
    ...(!decision && (context as GitContextView).scope!.authorityMembers
      ? { authorityMembers: Object.freeze((context as GitContextView).scope!.authorityMembers!.map(member => Object.freeze({
        id: member.id, path: member.path, repository: member.repository, revision: member.revision,
      }))) } : {}),
    ...(decision ? { changes, priorAuthoritySetDigest: (context as GitContextView).priorAuthoritySetDigest,
      resultingAuthoritySetDigest: (context as GitContextView).resultingAuthoritySetDigest } : {}) });
}

function producerFromRecord(recordBytes: Buffer, trusted: unknown): unknown {
  let record: unknown;
  try { record = JSON.parse(decoder.decode(recordBytes)) as unknown; } catch { fail('ReviewRecord is not valid UTF-8 JSON.'); }
  if (!record || typeof record !== 'object' || Array.isArray(record) || (record as RecordView).repository !== (trusted as TrustedContextView).repository ||
      (record as RecordView).baseSha !== (trusted as TrustedContextView).baseSha || (record as RecordView).workflowSha !== (trusted as TrustedContextView).baseSha ||
      (record as RecordView).workflowPath !== '.github/workflows/self-architecture-gate.yml' ||
      typeof (record as RecordView).runId !== 'string' || !/^[1-9]\d*$/.test((record as RecordView).runId as string) ||
      typeof (record as RecordView).runAttempt !== 'string' || !/^[1-9]\d*$/.test((record as RecordView).runAttempt as string) ||
      (record as RecordView).inputDigests?.policy !== (trusted as TrustedContextView).policySha256) fail('ReviewRecord producer, previous policy digest, or run identity is not bound to protected Git context.');
  return Object.freeze({ repository: (trusted as TrustedContextView).repository, workflowPath: (record as RecordView).workflowPath,
    workflowSha: (trusted as TrustedContextView).baseSha, workflowRef: 'refs/heads/main', runId: (record as RecordView).runId, runAttempt: (record as RecordView).runAttempt });
}

/**
 * Compose exact previous-base Git state, protected tag readback, and BLOCK
 * evidence verification for a merge-group candidate. The result contains only
 * verified eligibility inputs; this function never returns acceptance.
 */
export async function composeOwnerAmendmentMergeGroupEvidence({ repository, baseSha, bSha, runGit,
  tagNamespace, tagRef, rulesetId, token, fetchImpl, readTagObject, runGh,
  resolveGitContext = resolveOwnerAmendmentHandoffGitContext as ResolveGitContextOperation,
  readTag = readOwnerAmendmentTagForMergeGroup as ReadTagOperation,
  verifyEvidence = verifyOwnerAmendmentBlockEvidenceBundle as VerifyEvidenceOperation }:
  ComposeOwnerAmendmentMergeGroupEvidenceInput = {}): Promise<OwnerAmendmentMergeGroupEvidenceResult> {
  try {
    if (!SHA1.test((baseSha ?? '') as string) || !SHA1.test((bSha ?? '') as string) || baseSha === bSha) fail('exact protected base and B commits are required.');
    if (tagRef !== `${tagNamespace}/${bSha}`) fail('tag ref does not identify exact B.');
    const gitContext = resolveGitContext({ repository, baseSha, headSha: bSha, runGit });
    const verifiedGitChanges = (gitContext as GitContextView).policy?.ownerAmendmentTriggerProfile === 'completed-owner-decision-self-v1'
      ? deriveOwnerAmendmentGitChanges({ profile: (gitContext as GitContextView).policy!.ownerAmendmentTriggerProfile as DeriveOwnerAmendmentGitChangesInput['profile'], repository: repository as string, baseSha: baseSha as string, bSha: bSha as string,
        targetPath: (gitContext as GitContextView).scope?.authorityPath as string, selectedAuthorityBytes: (gitContext as GitContextView).authorityBytes,
        changedFiles: (gitContext as GitContextView).changedFiles, authorityChanges: (gitContext as GitContextView).authorityChanges, runGit: runGit as SynchronousGitCommand,
        readBlob: (revision, path) => (runGit as SynchronousGitCommand)(['--no-replace-objects', 'show', `${revision}:${path}`]) }).changes
      : undefined;
    const trustedContext = trustedContextFromGit(gitContext, verifiedGitChanges);
    const tag = await readTag({ repository, bSha, tagNamespace, tagRef, rulesetId, token, fetchImpl, readTagObject });
    if ((tag as TagReadbackView).status !== 'READ_BACK_OWNER_AMENDMENT_TAG' || (tag as TagReadbackView).repository !== repository || (tag as TagReadbackView).bSha !== bSha || (tag as TagReadbackView).tagRef !== tagRef) fail('protected tag readback does not bind this repository and exact B.');
    const tagEnvelope = { headSha: bSha, tag: (tag as TagReadbackView).tag, tagRef, observedTagRefOid: (tag as TagReadbackView).observedTagRefOid,
      ...parseTagEnvelope(tag, bSha) };
    const producerContext = producerFromRecord(tagEnvelope.reviewRecordBytes,
      { ...(trustedContext as object), policySha256: hash((gitContext as GitContextView).policyBytes as Uint8Array) });
    if ((tagEnvelope as TagEnvelopeView).triggerProfile !== (trustedContext as TrustedContextView).policy!.triggerProfile) fail('tag envelope trigger profile differs from previous protected policy.');
    if ((trustedContext as TrustedContextView).policy!.triggerProfile === 'completed-owner-decision-self-v1') {
      const provenance = verifyOwnerAmendmentBlockEvidence({ recordBytes: (tagEnvelope as TagEnvelopeView).reviewRecordBytes,
        bundleBytes: (tagEnvelope as TagEnvelopeView).attestationBundleBytes, expected: producerContext, runGh }) as AttestationResultView;
      if (provenance.status !== 'VERIFIED_PRODUCER_ATTESTATION' ||
          provenance.recordSha256 !== hash((tagEnvelope as TagEnvelopeView).reviewRecordBytes as Uint8Array)) fail(provenance.reason ?? 'OWNER_DECISION trigger producer provenance is unverified.');
    }
    const evidence = (trustedContext as TrustedContextView).policy!.triggerProfile === 'completed-owner-decision-self-v1'
      ? verifyOwnerAmendmentOwnerDecisionContext({ trustedContext, tagEnvelope })
      : verifyEvidence({ trustedContext, producerContext, tagEnvelope, runGh });
    const validStatus = (trustedContext as TrustedContextView).policy!.triggerProfile === 'completed-owner-decision-self-v1'
      ? 'VERIFIED_OWNER_DECISION_AMENDMENT_CONTEXT' : 'VERIFIED_OWNER_AMENDMENT_BLOCK_EVIDENCE';
    if ((evidence as EvidenceView | null | undefined)?.status !== validStatus || (evidence as EvidenceView).repository !== repository ||
        (evidence as EvidenceView).baseSha !== baseSha || (evidence as EvidenceView).bSha !== bSha || (evidence as EvidenceView).policyRevision !== baseSha ||
        (evidence as EvidenceView).tagObjectOid !== (tag as TagReadbackView).tag!.objectOid) fail((evidence as EvidenceView | null | undefined)?.reason ?? 'BLOCK evidence did not verify against exact Git and tag context.');
    const triggerRecord = JSON.parse(decoder.decode((tagEnvelope as TagEnvelopeView).reviewRecordBytes as Uint8Array)) as unknown;
    const amendmentRecord = JSON.parse(decoder.decode((tagEnvelope as TagEnvelopeView).amendmentRecordBytes as Uint8Array)) as unknown;
    return Object.freeze({ status: 'VERIFIED_OWNER_AMENDMENT_MERGE_GROUP_EVIDENCE', repository, baseSha, bSha,
      policyRevision: baseSha, policySha256: hash((gitContext as GitContextView).policyBytes as Uint8Array),
      triggerProfile: (trustedContext as TrustedContextView).policy!.triggerProfile, triggerDecision: (trustedContext as TrustedContextView).policy!.triggerProfile === 'completed-owner-decision-self-v1' ? 'OWNER_DECISION' : 'BLOCK',
      authorityId: (evidence as EvidenceView).authorityId ?? (trustedContext as TrustedContextView).authority!.id, previousAuthoritySha256: (evidence as EvidenceView).previousAuthoritySha256 ?? (trustedContext as TrustedContextView).authority!.previousSha256,
      proposedAuthoritySha256: (evidence as EvidenceView).proposedAuthoritySha256 ?? (trustedContext as TrustedContextView).authority!.newSha256,
      purpose: (evidence as EvidenceView).purpose ?? (amendmentRecord as JsonRecord).purpose, targetValidated: true,
      priorAuthoritySetDigest: (evidence as EvidenceView).priorAuthoritySetDigest ?? (triggerRecord as RecordView).authority?.setDigest,
      resultingAuthoritySetDigest: (evidence as EvidenceView).resultingAuthoritySetDigest, changes: (evidence as EvidenceView).changes,
      reviewRecordSha256: (evidence as EvidenceView).reviewRecordSha256, amendmentRecordSha256: (evidence as EvidenceView).amendmentRecordSha256,
      attestationBundleSha256: (evidence as EvidenceView).attestationBundleSha256, tagObjectOid: (evidence as EvidenceView).tagObjectOid,
      observedTagRefOid: (tag as TagReadbackView).observedTagRefOid, producerRunId: (producerContext as ProducerContextView).runId,
      producerRunAttempt: (producerContext as ProducerContextView).runAttempt });
  } catch (error: unknown) {
    return Object.freeze({ status: 'INCOMPLETE', reason: (error as ErrorMessageView).message });
  }
}
