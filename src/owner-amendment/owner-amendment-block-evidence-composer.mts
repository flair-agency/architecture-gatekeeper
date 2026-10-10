import { createHash } from 'node:crypto';
import { TextDecoder } from 'node:util';
import { verifyOwnerAmendmentBlockEvidence, type OwnerAmendmentGhRunner } from './owner-amendment-attestation.mts';
import { verifyOwnerAmendmentBlockContext } from '../owner-amendment-block-context-verifier.mjs';

const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
const SHA = /^[a-f0-9]{40}$/;
const fail = (message: unknown): never => { throw new Error(`Owner amendment BLOCK evidence: ${message}`); };

type ProducerContext = {
  readonly repository: unknown;
  readonly workflowPath: unknown;
  readonly workflowSha: unknown;
  readonly workflowRef: unknown;
  readonly runId: unknown;
  readonly runAttempt: unknown;
};
export type OwnerAmendmentBlockEvidenceTrustedContext = Readonly<{
  repository: unknown;
  baseSha: unknown;
  bSha: unknown;
  policyRevision: unknown;
  policy: unknown;
  authority: unknown;
}>;
export type OwnerAmendmentBlockEvidenceTagEnvelope = Readonly<{
  reviewRecordBytes: unknown;
  attestationBundleBytes: unknown;
}>;
export type OwnerAmendmentBlockEvidenceInput = Readonly<{
  trustedContext: OwnerAmendmentBlockEvidenceTrustedContext;
  producerContext: ProducerContext;
  tagEnvelope: OwnerAmendmentBlockEvidenceTagEnvelope;
  runGh?: OwnerAmendmentGhRunner;
}>;
type BlockContextResult = {
  repository: unknown;
  baseSha: unknown;
  bSha: unknown;
  policyRevision: unknown;
  authorityId: unknown;
  reviewRecordSha256: string;
  amendmentRecordSha256: string;
  tagObjectOid: unknown;
};
export type OwnerAmendmentBlockEvidenceResult =
  | Readonly<{
      status: 'VERIFIED_OWNER_AMENDMENT_BLOCK_EVIDENCE';
      repository: unknown;
      baseSha: unknown;
      bSha: unknown;
      policyRevision: unknown;
      authorityId: unknown;
      reviewRecordSha256: string;
      amendmentRecordSha256: string;
      attestationBundleSha256: string;
      tagObjectOid: unknown;
      producerRunId: unknown;
      producerRunAttempt: unknown;
    }>
  | Readonly<{ status: 'INCOMPLETE'; reason: unknown }>;

function parseReviewRecord(bytes: unknown): Record<string, unknown> {
  if (!Buffer.isBuffer(bytes) || !bytes.length || bytes.length > 131_072) fail('exact tag-bound ReviewRecord bytes are missing or oversized.');
  let record: unknown;
  try { record = JSON.parse(decoder.decode(bytes as Uint8Array)); } catch { fail('tag-bound ReviewRecord bytes are invalid UTF-8 JSON.'); }
  if (!record || typeof record !== 'object' || Array.isArray(record)) fail('tag-bound ReviewRecord is malformed.');
  return record as Record<string, unknown>;
}

function validateProducerContext(producerContext: ProducerContext, trustedContext: OwnerAmendmentBlockEvidenceTrustedContext,
  record: Record<string, unknown>): void {
  const keys = ['repository', 'workflowPath', 'workflowSha', 'workflowRef', 'runId', 'runAttempt'];
  if (!producerContext || typeof producerContext !== 'object' || Array.isArray(producerContext) ||
      Object.keys(producerContext).sort().join(',') !== [...keys].sort().join(',')) fail('trusted producer context has missing or unknown fields.');
  if (producerContext.repository !== trustedContext.repository ||
      producerContext.workflowSha !== trustedContext.baseSha ||
      producerContext.workflowPath !== '.github/workflows/self-architecture-gate.yml' ||
      producerContext.workflowRef !== 'refs/heads/main' ||
      // This coercion cast preserves RegExp.test's existing runtime conversion of unknown values.
      !SHA.test(producerContext.workflowSha as string) ||
      ![producerContext.runId, producerContext.runAttempt].every(value => typeof value === 'string' && /^[1-9]\d*$/.test(value))) {
    fail('trusted producer context is not the selected protected self workflow run.');
  }
  for (const field of ['repository', 'workflowPath', 'workflowSha', 'runId', 'runAttempt']) {
    if (record[field] !== producerContext[field as keyof ProducerContext]) fail(`ReviewRecord ${field} differs from trusted producer context.`);
  }
}

/**
 * Compose deterministic BLOCK context checks with GitHub attestation
 * verification over the exact tag-embedded bytes. The caller supplies
 * protected Git/host facts; this module does not establish their provenance,
 * transition freshness, or an OWNER_AMENDMENT acceptance result.
 */
export function verifyOwnerAmendmentBlockEvidenceBundle({ trustedContext, producerContext,
  tagEnvelope, runGh }: OwnerAmendmentBlockEvidenceInput): OwnerAmendmentBlockEvidenceResult {
  try {
    const contextResult = verifyOwnerAmendmentBlockContext({ trustedContext, tagEnvelope }) as BlockContextResult;
    const record = parseReviewRecord(tagEnvelope?.reviewRecordBytes);
    validateProducerContext(producerContext, trustedContext, record);
    const evidence = verifyOwnerAmendmentBlockEvidence({
      recordBytes: tagEnvelope.reviewRecordBytes,
      bundleBytes: tagEnvelope.attestationBundleBytes,
      expected: producerContext,
      runGh,
    });
    if (evidence.status !== 'VERIFIED_PRODUCER_ATTESTATION') fail(evidence.reason ?? 'producer attestation did not verify.');
    return Object.freeze({ status: 'VERIFIED_OWNER_AMENDMENT_BLOCK_EVIDENCE',
      repository: contextResult.repository, baseSha: contextResult.baseSha, bSha: contextResult.bSha,
      policyRevision: contextResult.policyRevision, authorityId: contextResult.authorityId,
      reviewRecordSha256: evidence.recordSha256 as string,
      amendmentRecordSha256: contextResult.amendmentRecordSha256,
      attestationBundleSha256: createHash('sha256').update(tagEnvelope.attestationBundleBytes as Uint8Array).digest('hex'),
      tagObjectOid: contextResult.tagObjectOid, producerRunId: producerContext.runId,
      producerRunAttempt: producerContext.runAttempt });
  } catch (error) {
    // Preserve the original message-property access, including its behavior for thrown non-Error values.
    return Object.freeze({ status: 'INCOMPLETE', reason: (error as { message: unknown }).message });
  }
}
