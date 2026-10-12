import { createHash } from 'node:crypto';
const SHA = /^[a-f0-9]{40}$|^[a-f0-9]{64}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const MAX_REVIEW_RECORD_BYTES = 131_072;
const MAX_BUNDLE_BYTES = 65_536;
const MAX_AMENDMENT_BYTES = 8_192;
const MAX_TAG_MESSAGE_BYTES = 262_144;
const digest = (bytes: Buffer): string => createHash('sha256').update(bytes).digest('hex');
const canonical = (value: unknown): unknown => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical((value as Record<string, unknown>)[key])])) : value;
function fail(message: string): never { throw new Error(`Owner amendment BLOCK handoff: ${message}`); }

type ReviewDecisionView = { decision?: unknown; authorityIds?: unknown };
type ParsedReviewRecordView = {
  version?: unknown; kind?: unknown; repository?: unknown; workflowSha?: unknown; workflowPath?: unknown;
  runId?: unknown; runAttempt?: unknown; baseSha?: unknown; headSha?: unknown;
  decision?: ReviewDecisionView | null; decisionBytesBase64?: unknown; decisionSha256?: unknown;
  authority?: { members?: unknown } | null;
};
type ParsedDecisionView = { decision?: unknown };
type ParsedAmendmentRecordView = {
  version?: unknown; repository?: unknown; baseSha?: unknown; headSha?: unknown; policyRevision?: unknown;
  authority?: unknown; triggeringReviewSha256?: unknown; attestationBundleSha256?: unknown; purpose?: unknown;
};
type PriorAuthorityMemberView = { id?: unknown; repository?: unknown; resolvedCommit?: unknown; path?: unknown; sha256?: unknown };
type ProvenanceView = { status?: unknown; recordSha256?: unknown; reason?: unknown };

export interface OwnerAmendmentBlockHandoffExpected {
  repository: unknown;
  workflowSha: unknown;
  workflowPath: unknown;
  runId: unknown;
  runAttempt: unknown;
}
export interface OwnerAmendmentBlockHandoffInput<B = unknown, P = unknown> {
  recordBytes: unknown;
  bundleBytes: unknown;
  amendmentRecordBytes: unknown;
  expected: OwnerAmendmentBlockHandoffExpected;
  bSha: B;
  provenanceResult: P;
}
export interface OwnerAmendmentBlockHandoffEnvelope<B> {
  version: 2;
  profile: 'self-g0';
  bSha: B;
  reviewRecordBase64: unknown;
  reviewRecordSha256: string;
  attestationBundleBase64: unknown;
  attestationBundleSha256: string;
  amendmentRecordBase64: unknown;
  amendmentRecordSha256: string;
}
export type PreparedOwnerAmendmentBlockHandoff<B = unknown, P = unknown> = Readonly<{
  status: 'PREPARED_BLOCK_HANDOFF_TAG_MESSAGE';
  bSha: B;
  envelope: OwnerAmendmentBlockHandoffEnvelope<B>;
  tagMessage: string;
  reviewRecordSha256: string;
  amendmentRecordSha256: string;
  attestationBundleSha256: string;
  provenance: P;
}>;

function parseJson(bytes: Buffer, label: string): unknown {
  let value: unknown;
  try { value = JSON.parse(new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes)); }
  catch { fail(`${label} is not valid UTF-8 JSON.`); }
  return value;
}
function exactKeys(value: unknown, keys: readonly string[]): unknown {
  return value && typeof value === 'object' && !Array.isArray(value) &&
    Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
}

function validateBlockRecord(bytes: Buffer, expected: OwnerAmendmentBlockHandoffExpected): ParsedReviewRecordView {
  // Parsed JSON is unchecked; this view preserves the existing local property reads.
  const record = parseJson(bytes, 'ReviewRecord') as ParsedReviewRecordView;
  if (!record || record.version !== 1 || record.kind !== 'owner-amendment-block-review-record' ||
      record.repository !== expected.repository || record.workflowSha !== expected.workflowSha ||
      record.workflowPath !== expected.workflowPath || record.runId !== expected.runId || record.runAttempt !== expected.runAttempt ||
      record.baseSha !== expected.workflowSha || !SHA.test(record.baseSha as string) || !SHA.test(record.headSha as string) ||
      record.decision?.decision !== 'BLOCK' || !record.decision || !Array.isArray(record.decision.authorityIds) ||
      typeof record.decisionBytesBase64 !== 'string' || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(record.decisionBytesBase64) ||
      !SHA256.test((record.decisionSha256 ?? '') as string)) fail('ReviewRecord is not a completed BLOCK from the trusted protected producer.');
  const decisionBytes = Buffer.from(record.decisionBytesBase64, 'base64');
  if (!decisionBytes.length || decisionBytes.toString('base64') !== record.decisionBytesBase64 || digest(decisionBytes) !== record.decisionSha256) {
    fail('ReviewRecord decision bytes or digest are invalid.');
  }
  const decision = parseJson(decisionBytes, 'exact BLOCK decision') as ParsedDecisionView;
  if (decision.decision !== 'BLOCK' || JSON.stringify(canonical(decision)) !== JSON.stringify(canonical(record.decision))) {
    fail('ReviewRecord decision differs from its exact BLOCK decision bytes.');
  }
  return record;
}

/** Verify the attested historical BLOCK and prepare the exact v2 tag message for B. */
export function prepareOwnerAmendmentBlockHandoff<B = unknown, P = unknown>({
  recordBytes, bundleBytes, amendmentRecordBytes, expected, bSha, provenanceResult,
}: OwnerAmendmentBlockHandoffInput<B, P>): PreparedOwnerAmendmentBlockHandoff<B, P> {
  if (!Buffer.isBuffer(recordBytes) || !recordBytes.length || recordBytes.length > MAX_REVIEW_RECORD_BYTES ||
      !Buffer.isBuffer(bundleBytes) || !bundleBytes.length || bundleBytes.length > MAX_BUNDLE_BYTES ||
      !Buffer.isBuffer(amendmentRecordBytes) || !amendmentRecordBytes.length || amendmentRecordBytes.length > MAX_AMENDMENT_BYTES) {
    fail('ReviewRecord, attestation bundle, or AmendmentRecord bytes are absent or oversized.');
  }
  if (!SHA.test((bSha ?? '') as string)) fail('exact B commit is invalid.');
  const reviewRecord = validateBlockRecord(recordBytes, expected);
  const provenance = provenanceResult;
  if ((provenance as ProvenanceView)?.status !== 'VERIFIED_PRODUCER_ATTESTATION' ||
      (provenance as ProvenanceView).recordSha256 !== digest(recordBytes)) {
    fail((provenance as ProvenanceView)?.reason as string ?? 'verified attestation for these exact record bytes is required.');
  }
  // The parser output remains unchecked outside the existing exact-key/value checks.
  const amendmentRecord = parseJson(amendmentRecordBytes, 'AmendmentRecord') as ParsedAmendmentRecordView;
  const prior = reviewRecord.authority?.members;
  const authority = amendmentRecord?.authority;
  if (!exactKeys(amendmentRecord, ['version', 'repository', 'baseSha', 'headSha', 'policyRevision',
    'authority', 'triggeringReviewSha256', 'attestationBundleSha256', 'purpose']) || amendmentRecord.version !== 2 ||
      amendmentRecord.headSha !== bSha || amendmentRecord.repository !== reviewRecord.repository ||
      amendmentRecord.baseSha !== reviewRecord.baseSha || amendmentRecord.policyRevision !== reviewRecord.baseSha ||
      amendmentRecord.triggeringReviewSha256 !== digest(recordBytes) ||
      amendmentRecord.attestationBundleSha256 !== digest(bundleBytes) ||
      !Array.isArray(prior) || prior.length !== 1 || (prior[0] as PriorAuthorityMemberView)?.repository !== reviewRecord.repository ||
      (prior[0] as PriorAuthorityMemberView)?.resolvedCommit !== reviewRecord.baseSha ||
      !exactKeys(authority, ['id', 'path', 'previousSha256', 'newSha256']) ||
      (authority as Record<string, unknown>).id !== (prior[0] as PriorAuthorityMemberView).id ||
      (authority as Record<string, unknown>).path !== (prior[0] as PriorAuthorityMemberView).path ||
      (authority as Record<string, unknown>).previousSha256 !== (prior[0] as PriorAuthorityMemberView).sha256 ||
      !SHA256.test(((authority as Record<string, unknown>).newSha256 ?? '') as string) ||
      (authority as Record<string, unknown>).previousSha256 === (authority as Record<string, unknown>).newSha256 ||
      typeof amendmentRecord.purpose !== 'string' || amendmentRecord.purpose.length < 1 ||
      amendmentRecord.purpose.length > 500 || !/^[\x20-\x7e]+$/.test(amendmentRecord.purpose) ||
      !amendmentRecord.purpose.trim()) {
    fail('AmendmentRecord does not bind these exact BLOCK ReviewRecord and attestation bundle bytes and B.');
  }
  const envelope: OwnerAmendmentBlockHandoffEnvelope<B> = {
    version: 2,
    profile: 'self-g0',
    bSha,
    reviewRecordBase64: recordBytes.toString('base64') as unknown,
    reviewRecordSha256: digest(recordBytes),
    attestationBundleBase64: bundleBytes.toString('base64') as unknown,
    attestationBundleSha256: digest(bundleBytes),
    amendmentRecordBase64: amendmentRecordBytes.toString('base64') as unknown,
    amendmentRecordSha256: digest(amendmentRecordBytes),
  };
  const tagMessage = `${JSON.stringify(canonical(envelope))}\n`;
  if (Buffer.byteLength(tagMessage, 'utf8') > MAX_TAG_MESSAGE_BYTES) fail('versioned tag envelope exceeds its byte limit.');
  return Object.freeze<PreparedOwnerAmendmentBlockHandoff<B, P>>({ status: 'PREPARED_BLOCK_HANDOFF_TAG_MESSAGE', bSha, envelope, tagMessage,
    reviewRecordSha256: envelope.reviewRecordSha256, amendmentRecordSha256: envelope.amendmentRecordSha256,
    attestationBundleSha256: envelope.attestationBundleSha256, provenance });
}
