import { createHash } from 'node:crypto';
import { TextDecoder } from 'node:util';
import { rejectDuplicateJsonKeys } from './authority-set.mjs';

const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
const SHA1 = /^[a-f0-9]{40}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const REPOSITORY = /^[A-Za-z0-9][A-Za-z0-9-]{0,38}\/[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/;
const MAX_REVIEW_RECORD_BYTES = 131_072;
const MAX_AMENDMENT_RECORD_BYTES = 8_192;

function fail(message) { throw new Error(`Owner amendment record: ${message}`); }
function digest(bytes) { return createHash('sha256').update(bytes).digest('hex'); }
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  }
  return value;
}
function isRecord(value) { return value && typeof value === 'object' && !Array.isArray(value); }
function exactKeys(value, keys, label) {
  if (!isRecord(value) || Object.keys(value).length !== keys.length || keys.some(key => !Object.hasOwn(value, key))) {
    fail(`${label} has missing or unknown fields.`);
  }
}

function validateScope(scope) {
  exactKeys(scope, ['baseSha', 'headSha', 'authorityId', 'authorityPath', 'previousSha256', 'newSha256'], 'inspected self scope');
  if (!SHA1.test(scope.baseSha) || !SHA1.test(scope.headSha) || scope.baseSha === scope.headSha ||
      typeof scope.authorityId !== 'string' || !/^[a-z][a-z0-9-]{0,63}$/.test(scope.authorityId) ||
      typeof scope.authorityPath !== 'string' || !/^(?:[A-Za-z0-9._-]+\/)*[A-Za-z0-9._-]+\.md$/.test(scope.authorityPath) ||
      scope.authorityPath.length > 240 || scope.authorityPath.split('/').some(part => part === '.' || part === '..') ||
      !SHA256.test(scope.previousSha256) || !SHA256.test(scope.newSha256) || scope.previousSha256 === scope.newSha256) {
    fail('inspected self scope is invalid.');
  }
}

function parseVerifiedBlock(reviewRecordBytes) {
  if (!Buffer.isBuffer(reviewRecordBytes) || !reviewRecordBytes.length || reviewRecordBytes.length > MAX_REVIEW_RECORD_BYTES) {
    fail('exact verified BLOCK ReviewRecord bytes are missing or oversized.');
  }
  let source;
  try { source = decoder.decode(reviewRecordBytes); } catch { fail('ReviewRecord is not UTF-8.'); }
  let review;
  try {
    rejectDuplicateJsonKeys(source, 'owner amendment ReviewRecord');
    review = JSON.parse(source);
  } catch (error) { fail(`ReviewRecord JSON is invalid: ${error.message}`); }
  const keys = ['version', 'kind', 'repository', 'prNumber', 'baseSha', 'headSha', 'mergeSha', 'workflowSha',
    'workflowPath', 'runId', 'runAttempt', 'authority', 'inputDigests', 'decisionSha256', 'decisionBytesBase64', 'decision'];
  exactKeys(review, keys, 'ReviewRecord');
  if (review.version !== 1 || review.kind !== 'owner-amendment-block-review-record' ||
      typeof review.repository !== 'string' || !REPOSITORY.test(review.repository) ||
      !Number.isSafeInteger(review.prNumber) || review.prNumber < 1 ||
      ![review.baseSha, review.headSha, review.mergeSha, review.workflowSha].every(value => SHA1.test(value)) ||
      typeof review.workflowPath !== 'string' || !/^\.github\/workflows\/[A-Za-z0-9._-]+\.yml$/.test(review.workflowPath) ||
      ![review.runId, review.runAttempt].every(value => typeof value === 'string' && /^[1-9]\d*$/.test(value)) ||
      !SHA256.test(review.decisionSha256) || typeof review.decisionBytesBase64 !== 'string' ||
      !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(review.decisionBytesBase64)) {
    fail('ReviewRecord fields are invalid.');
  }
  if (!isRecord(review.decision) || review.decision.decision !== 'BLOCK' ||
      !Array.isArray(review.decision.authorityIds) || review.decision.authorityIds.length !== 1 ||
      typeof review.authority?.selfRepository !== 'string' || !Array.isArray(review.authority?.members) ||
      review.authority.members.length !== 1) {
    fail('ReviewRecord is not a completed single-authority BLOCK.');
  }
  const decisionBytes = Buffer.from(review.decisionBytesBase64, 'base64');
  if (!decisionBytes.length || decisionBytes.toString('base64') !== review.decisionBytesBase64 ||
      digest(decisionBytes) !== review.decisionSha256) fail('ReviewRecord decision bytes or digest are invalid.');
  let decisionFromBytes;
  try {
    const text = decoder.decode(decisionBytes);
    rejectDuplicateJsonKeys(text, 'BLOCK decision');
    decisionFromBytes = JSON.parse(text);
  } catch (error) { fail(`ReviewRecord decision bytes are invalid: ${error.message}`); }
  if (JSON.stringify(canonical(decisionFromBytes)) !== JSON.stringify(canonical(review.decision))) {
    fail('ReviewRecord decision differs from its exact decision bytes.');
  }
  return review;
}

function validateBinding(review, { scope, repository }) {
  if (review.repository !== repository || review.authority.selfRepository !== repository ||
      review.baseSha !== scope.baseSha || review.workflowSha !== scope.baseSha ||
      review.headSha === scope.baseSha || review.headSha === scope.headSha) {
    fail('ReviewRecord repository, base or historical head does not bind this inspected B scope.');
  }
  const authority = review.authority;
  const member = authority.members[0];
  if (authority.authorityRevision !== scope.baseSha || member.id !== scope.authorityId ||
      member.repository !== repository || member.path !== scope.authorityPath ||
      member.resolvedCommit !== scope.baseSha || member.sha256 !== scope.previousSha256 ||
      review.decision.authorityIds[0] !== scope.authorityId) {
    fail('ReviewRecord authority does not match the inspected previous self authority.');
  }
}

function validatePurpose(purpose) {
  if (typeof purpose !== 'string' || purpose.length < 1 || purpose.length > 500 ||
      !/^[\x20-\x7e]+$/.test(purpose) || !purpose.trim()) {
    fail('purpose must be nonempty printable ASCII and no longer than 500 characters.');
  }
}

/** Build canonical AmendmentRecord v1 bytes from the inspected B scope and verified historical BLOCK evidence bytes. */
export function buildOwnerAmendmentRecord({ scope, reviewRecordBytes, attestationBundleBytes, repository, purpose }) {
  validateScope(scope);
  if (typeof repository !== 'string' || !REPOSITORY.test(repository)) fail('repository identity is invalid.');
  validatePurpose(purpose);
  if (!Buffer.isBuffer(attestationBundleBytes) || !attestationBundleBytes.length || attestationBundleBytes.length > 65_536) {
    fail('exact verified attestation bundle bytes are missing or oversized.');
  }
  const review = parseVerifiedBlock(reviewRecordBytes);
  validateBinding(review, { scope, repository });
  const amendment = {
    version: 1,
    repository,
    baseSha: scope.baseSha,
    headSha: scope.headSha,
    policyRevision: scope.baseSha,
    authority: {
      id: scope.authorityId,
      path: scope.authorityPath,
      previousSha256: scope.previousSha256,
      newSha256: scope.newSha256,
    },
    triggeringReviewSha256: digest(reviewRecordBytes),
    attestationBundleSha256: digest(attestationBundleBytes),
    purpose,
  };
  const bytes = Buffer.from(JSON.stringify(canonical(amendment)));
  if (bytes.length > MAX_AMENDMENT_RECORD_BYTES) fail('AmendmentRecord exceeds its byte limit.');
  return Object.freeze({ record: Object.freeze(amendment), bytes });
}
