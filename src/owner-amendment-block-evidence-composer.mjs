import { createHash } from 'node:crypto';
import { TextDecoder } from 'node:util';
import { verifyOwnerAmendmentBlockEvidence } from './owner-amendment-attestation.mjs';
import { verifyOwnerAmendmentBlockContext } from './owner-amendment-block-context-verifier.mjs';

const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
const SHA = /^[a-f0-9]{40}$/;
const fail = message => { throw new Error(`Owner amendment BLOCK evidence: ${message}`); };

function parseReviewRecord(bytes) {
  if (!Buffer.isBuffer(bytes) || !bytes.length || bytes.length > 131_072) fail('exact tag-bound ReviewRecord bytes are missing or oversized.');
  let record;
  try { record = JSON.parse(decoder.decode(bytes)); } catch { fail('tag-bound ReviewRecord bytes are invalid UTF-8 JSON.'); }
  if (!record || typeof record !== 'object' || Array.isArray(record)) fail('tag-bound ReviewRecord is malformed.');
  return record;
}

function validateProducerContext(producerContext, trustedContext, record) {
  const keys = ['repository', 'workflowPath', 'workflowSha', 'workflowRef', 'runId', 'runAttempt'];
  if (!producerContext || typeof producerContext !== 'object' || Array.isArray(producerContext) ||
      Object.keys(producerContext).sort().join(',') !== [...keys].sort().join(',')) fail('trusted producer context has missing or unknown fields.');
  if (producerContext.repository !== trustedContext.repository || producerContext.workflowSha !== trustedContext.baseSha ||
      producerContext.workflowPath !== '.github/workflows/self-architecture-gate.yml' ||
      producerContext.workflowRef !== 'refs/heads/main' || !SHA.test(producerContext.workflowSha) ||
      ![producerContext.runId, producerContext.runAttempt].every(value => typeof value === 'string' && /^[1-9]\d*$/.test(value))) {
    fail('trusted producer context is not the selected protected self workflow run.');
  }
  for (const field of ['repository', 'workflowPath', 'workflowSha', 'runId', 'runAttempt']) {
    if (record[field] !== producerContext[field]) fail(`ReviewRecord ${field} differs from trusted producer context.`);
  }
}

/**
 * Compose deterministic BLOCK context checks with GitHub attestation
 * verification over the exact tag-embedded bytes. The caller supplies
 * protected Git/host facts; this module does not establish their provenance,
 * transition freshness, or an OWNER_AMENDMENT acceptance result.
 */
export function verifyOwnerAmendmentBlockEvidenceBundle({ trustedContext, producerContext,
  tagEnvelope, runGh }) {
  try {
    const contextResult = verifyOwnerAmendmentBlockContext({ trustedContext, tagEnvelope });
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
      reviewRecordSha256: evidence.recordSha256,
      amendmentRecordSha256: contextResult.amendmentRecordSha256,
      attestationBundleSha256: createHash('sha256').update(tagEnvelope.attestationBundleBytes).digest('hex'),
      tagObjectOid: contextResult.tagObjectOid, producerRunId: producerContext.runId,
      producerRunAttempt: producerContext.runAttempt });
  } catch (error) {
    return Object.freeze({ status: 'INCOMPLETE', reason: error.message });
  }
}
