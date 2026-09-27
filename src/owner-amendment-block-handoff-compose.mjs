// Compose the bounded BLOCK artifact, provenance, and exact-B handoff checks.
// This prepares bytes for a tag; it does not write a ref or decide acceptance.
import { createHash } from 'node:crypto';
import { fetchOwnerAmendmentBlockArtifact } from './owner-amendment-artifact.mjs';
import { extractOwnerAmendmentBlockArtifactZip } from './owner-amendment-artifact-zip.mjs';
import { verifyOwnerAmendmentBlockEvidence } from './owner-amendment-attestation.mjs';
import { prepareOwnerAmendmentBlockHandoff } from './owner-amendment-block-handoff.mjs';

const SHA = /^[a-f0-9]{40}$/;
const fail = message => { throw new Error(`Owner amendment BLOCK handoff: ${message}`); };
const digest = bytes => createHash('sha256').update(bytes).digest('hex');

function validateContext(context) {
  const keys = ['repository', 'artifactId', 'runId', 'runAttempt', 'baseSha', 'headSha', 'aPrNumber', 'workflowPath', 'workflowRef', 'workflowSha', 'bSha'];
  if (!context || typeof context !== 'object' || Array.isArray(context) ||
      Object.keys(context).sort().join(',') !== [...keys].sort().join(',')) fail('trusted protected context is incomplete or contains unknown fields.');
  if (typeof context.repository !== 'string' ||
      !/^[A-Za-z0-9][A-Za-z0-9-]*\/[A-Za-z0-9][A-Za-z0-9._-]*$/.test(context.repository) ||
      ![context.artifactId, context.runId, context.runAttempt].every(value =>
        (typeof value === 'string' && /^[1-9]\d*$/.test(value)) || (Number.isSafeInteger(value) && value > 0)) ||
      !Number.isSafeInteger(context.aPrNumber) || context.aPrNumber < 1 ||
      ![context.baseSha, context.headSha, context.workflowSha, context.bSha].every(value => SHA.test(value)) ||
      context.baseSha !== context.workflowSha || context.baseSha === context.headSha || context.bSha === context.baseSha ||
      typeof context.workflowPath !== 'string' || !/^\.github\/workflows\/[A-Za-z0-9._-]+\.yml$/.test(context.workflowPath) ||
      typeof context.workflowRef !== 'string' || !/^refs\/heads\/[A-Za-z0-9._/-]+$/.test(context.workflowRef)) {
    fail('trusted protected context has invalid values or does not bind the producer workflow to A base.');
  }
  return context;
}

function crossBindReviewRecord(recordBytes, context) {
  let record;
  try { record = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(recordBytes)); }
  catch { fail('extracted ReviewRecord is not valid UTF-8 JSON.'); }
  const expected = {
    repository: context.repository,
    baseSha: context.baseSha,
    headSha: context.headSha,
    workflowSha: context.workflowSha,
    workflowPath: context.workflowPath,
    prNumber: context.aPrNumber,
    runId: String(context.runId),
    runAttempt: String(context.runAttempt),
  };
  for (const [field, value] of Object.entries(expected)) {
    if (record?.[field] !== value) fail(`ReviewRecord ${field} differs from trusted protected context.`);
  }
  if (record?.kind !== 'owner-amendment-block-review-record' || record?.decision?.decision !== 'BLOCK') {
    fail('ReviewRecord is not a completed BLOCK record.');
  }
}

/** Fetch and validate one historical BLOCK and prepare its exact-B tag message. */
export async function composeOwnerAmendmentBlockHandoff({ context, token, amendmentRecordBytes,
  buildAmendmentRecordBytes, fetchImpl = fetch, runGh }) {
  try {
    context = validateContext(context);
    if (typeof token !== 'string' || !token) fail('GitHub API token is required.');
    if (typeof fetchImpl !== 'function' || typeof runGh !== 'function') fail('fetch and attestation verifier helpers are required.');
    const hasBytes = amendmentRecordBytes !== undefined;
    const hasBuilder = buildAmendmentRecordBytes !== undefined;
    if (hasBytes === hasBuilder || (hasBytes && !Buffer.isBuffer(amendmentRecordBytes)) ||
        (hasBuilder && typeof buildAmendmentRecordBytes !== 'function')) {
      fail('provide either exact AmendmentRecord bytes or a protected AmendmentRecord builder.');
    }

    const fetched = await fetchOwnerAmendmentBlockArtifact({
      expected: { repository: context.repository, artifactId: context.artifactId, runId: context.runId,
        runAttempt: context.runAttempt, baseSha: context.baseSha, headSha: context.headSha }, token, fetchImpl,
    });
    if (fetched.status !== 'FETCHED_OWNER_AMENDMENT_BLOCK_ARTIFACT') fail(fetched.reason ?? 'trusted BLOCK artifact could not be fetched.');
    const extracted = extractOwnerAmendmentBlockArtifactZip(fetched.zipBytes);
    if (extracted.status !== 'EXTRACTED_OWNER_AMENDMENT_BLOCK_ARTIFACT') fail(extracted.reason ?? 'BLOCK artifact could not be safely extracted.');

    crossBindReviewRecord(extracted.reviewRecordBytes, context);
    const producerExpected = { repository: context.repository, workflowPath: context.workflowPath,
      workflowSha: context.workflowSha, workflowRef: context.workflowRef,
      runId: String(context.runId), runAttempt: String(context.runAttempt) };
    const provenance = verifyOwnerAmendmentBlockEvidence({ recordBytes: extracted.reviewRecordBytes,
      bundleBytes: extracted.attestationBundleBytes, expected: producerExpected, runGh });
    if (provenance.status !== 'VERIFIED_PRODUCER_ATTESTATION') fail(provenance.reason ?? 'BLOCK producer provenance is unverified.');

    // The builder form lets a protected caller bind the exact verified BLOCK
    // bytes into the AmendmentRecord without fetching the artifact twice.
    if (hasBuilder) amendmentRecordBytes = buildAmendmentRecordBytes(
      Buffer.from(extracted.reviewRecordBytes), Buffer.from(extracted.attestationBundleBytes));
    if (!Buffer.isBuffer(amendmentRecordBytes)) fail('AmendmentRecord builder did not return exact bytes.');

    const prepared = prepareOwnerAmendmentBlockHandoff({ recordBytes: extracted.reviewRecordBytes,
      bundleBytes: extracted.attestationBundleBytes, amendmentRecordBytes, expected: producerExpected,
      bSha: context.bSha, provenanceResult: provenance });
    if (prepared.status !== 'PREPARED_BLOCK_HANDOFF_TAG_MESSAGE') fail('BLOCK handoff preparation did not complete.');
    return Object.freeze({ status: prepared.status, bSha: prepared.bSha, tagMessage: prepared.tagMessage,
      reviewRecordSha256: digest(extracted.reviewRecordBytes), attestationBundleSha256: digest(extracted.attestationBundleBytes),
      amendmentRecordSha256: digest(amendmentRecordBytes) });
  } catch (error) {
    return Object.freeze({ status: 'INCOMPLETE', reason: error.message });
  }
}
