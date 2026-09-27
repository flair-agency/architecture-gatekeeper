import { createHash } from 'node:crypto';
const SHA = /^[a-f0-9]{40}$|^[a-f0-9]{64}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const MAX_REVIEW_RECORD_BYTES = 131_072;
const MAX_BUNDLE_BYTES = 65_536;
const MAX_AMENDMENT_BYTES = 8_192;
const MAX_TAG_MESSAGE_BYTES = 262_144;
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
function fail(message) { throw new Error(`Owner amendment BLOCK handoff: ${message}`); }

function parseJson(bytes, label) {
  let value;
  try { value = JSON.parse(new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes)); }
  catch { fail(`${label} is not valid UTF-8 JSON.`); }
  return value;
}
function exactKeys(value, keys) {
  return value && typeof value === 'object' && !Array.isArray(value) &&
    Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
}

function validateBlockRecord(bytes, expected) {
  const record = parseJson(bytes, 'ReviewRecord');
  if (!record || record.version !== 1 || record.kind !== 'owner-amendment-block-review-record' ||
      record.repository !== expected.repository || record.workflowSha !== expected.workflowSha ||
      record.workflowPath !== expected.workflowPath || record.runId !== expected.runId || record.runAttempt !== expected.runAttempt ||
      record.baseSha !== expected.workflowSha || !SHA.test(record.baseSha) || !SHA.test(record.headSha) ||
      record.decision?.decision !== 'BLOCK' || !record.decision || !Array.isArray(record.decision.authorityIds) ||
      typeof record.decisionBytesBase64 !== 'string' || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(record.decisionBytesBase64) ||
      !SHA256.test(record.decisionSha256 ?? '')) fail('ReviewRecord is not a completed BLOCK from the trusted protected producer.');
  const decisionBytes = Buffer.from(record.decisionBytesBase64, 'base64');
  if (!decisionBytes.length || decisionBytes.toString('base64') !== record.decisionBytesBase64 || digest(decisionBytes) !== record.decisionSha256) {
    fail('ReviewRecord decision bytes or digest are invalid.');
  }
  const decision = parseJson(decisionBytes, 'exact BLOCK decision');
  if (decision.decision !== 'BLOCK' || JSON.stringify(canonical(decision)) !== JSON.stringify(canonical(record.decision))) {
    fail('ReviewRecord decision differs from its exact BLOCK decision bytes.');
  }
  return record;
}

/** Verify the attested historical BLOCK and prepare the exact v2 tag message for B. */
export function prepareOwnerAmendmentBlockHandoff({ recordBytes, bundleBytes, amendmentRecordBytes, expected, bSha, provenanceResult }) {
  if (!Buffer.isBuffer(recordBytes) || !recordBytes.length || recordBytes.length > MAX_REVIEW_RECORD_BYTES ||
      !Buffer.isBuffer(bundleBytes) || !bundleBytes.length || bundleBytes.length > MAX_BUNDLE_BYTES ||
      !Buffer.isBuffer(amendmentRecordBytes) || !amendmentRecordBytes.length || amendmentRecordBytes.length > MAX_AMENDMENT_BYTES) {
    fail('ReviewRecord, attestation bundle, or AmendmentRecord bytes are absent or oversized.');
  }
  if (!SHA.test(bSha ?? '')) fail('exact B commit is invalid.');
  const reviewRecord = validateBlockRecord(recordBytes, expected);
  const provenance = provenanceResult;
  if (provenance?.status !== 'VERIFIED_PRODUCER_ATTESTATION' || provenance.recordSha256 !== digest(recordBytes)) {
    fail(provenance?.reason ?? 'verified attestation for these exact record bytes is required.');
  }
  const amendmentRecord = parseJson(amendmentRecordBytes, 'AmendmentRecord');
  const prior = reviewRecord.authority?.members;
  const authority = amendmentRecord?.authority;
  if (!exactKeys(amendmentRecord, ['version', 'repository', 'baseSha', 'headSha', 'policyRevision',
    'authority', 'triggeringReviewSha256', 'purpose']) || amendmentRecord.version !== 1 ||
      amendmentRecord.headSha !== bSha || amendmentRecord.repository !== reviewRecord.repository ||
      amendmentRecord.baseSha !== reviewRecord.baseSha || amendmentRecord.policyRevision !== reviewRecord.baseSha ||
      amendmentRecord.triggeringReviewSha256 !== digest(recordBytes) ||
      !Array.isArray(prior) || prior.length !== 1 || prior[0]?.repository !== reviewRecord.repository ||
      prior[0]?.resolvedCommit !== reviewRecord.baseSha ||
      !exactKeys(authority, ['id', 'path', 'previousSha256', 'newSha256']) ||
      authority.id !== prior[0].id || authority.path !== prior[0].path ||
      authority.previousSha256 !== prior[0].sha256 || !SHA256.test(authority.newSha256 ?? '') ||
      authority.previousSha256 === authority.newSha256 ||
      typeof amendmentRecord.purpose !== 'string' || amendmentRecord.purpose.length < 1 ||
      amendmentRecord.purpose.length > 500 || !/^[\x20-\x7e]+$/.test(amendmentRecord.purpose) ||
      !amendmentRecord.purpose.trim()) {
    fail('AmendmentRecord does not bind this exact BLOCK ReviewRecord and B.');
  }
  const envelope = {
    version: 2,
    profile: 'self-g0',
    bSha,
    reviewRecordBase64: recordBytes.toString('base64'),
    reviewRecordSha256: digest(recordBytes),
    attestationBundleBase64: bundleBytes.toString('base64'),
    attestationBundleSha256: digest(bundleBytes),
    amendmentRecordBase64: amendmentRecordBytes.toString('base64'),
    amendmentRecordSha256: digest(amendmentRecordBytes),
  };
  const tagMessage = `${JSON.stringify(canonical(envelope))}\n`;
  if (Buffer.byteLength(tagMessage, 'utf8') > MAX_TAG_MESSAGE_BYTES) fail('versioned tag envelope exceeds its byte limit.');
  return Object.freeze({ status: 'PREPARED_BLOCK_HANDOFF_TAG_MESSAGE', bSha, envelope, tagMessage,
    reviewRecordSha256: envelope.reviewRecordSha256, amendmentRecordSha256: envelope.amendmentRecordSha256,
    attestationBundleSha256: envelope.attestationBundleSha256, provenance });
}
