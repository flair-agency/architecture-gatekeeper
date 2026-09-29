import { createHash } from 'node:crypto';
import { TextDecoder } from 'node:util';
import { rejectDuplicateJsonKeys } from './authority-set.mjs';

const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
const SHA1 = /^[a-f0-9]{40}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const fail = message => { throw new Error(`Owner amendment OWNER_DECISION AmendmentRecord: ${message}`); };

function exact(value, keys, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== keys.length ||
      keys.some(key => !Object.hasOwn(value, key))) fail(`${label} has missing or unknown fields.`);
}

function json(bytes, label, max = 131_072) {
  if (!Buffer.isBuffer(bytes) || !bytes.length || bytes.length > max) fail(`${label} bytes are missing or oversized.`);
  let source;
  try { source = decoder.decode(bytes); } catch { fail(`${label} is not UTF-8.`); }
  let value;
  try { rejectDuplicateJsonKeys(source, label); value = JSON.parse(source); } catch (error) { fail(`${label} JSON is invalid: ${error.message}`); }
  return value;
}

/**
 * Build a closed AmendmentRecord for the completed-owner-decision-self-v1
 * trigger. The record binds the historical escalation and exact ownerDecisionId
 * without claiming it authenticates the owner's choice or identity.
 */
export function buildOwnerAmendmentOwnerDecisionAmendmentRecord({ reviewRecordBytes,
  attestationBundleBytes, repository, baseSha, bSha, authorityId, authorityPath,
  previousAuthorityBytes, amendedAuthorityBytes, purpose }) {
  if (typeof repository !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9-]{0,38}\/[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(repository) ||
      !SHA1.test(baseSha ?? '') || !SHA1.test(bSha ?? '') || baseSha === bSha) fail('repository, previous base, or exact B is invalid.');
  if (!Buffer.isBuffer(attestationBundleBytes) || !attestationBundleBytes.length || attestationBundleBytes.length > 65_536) {
    fail('exact trigger attestation bundle bytes are missing or oversized.');
  }
  if (!Buffer.isBuffer(previousAuthorityBytes) || !previousAuthorityBytes.length || previousAuthorityBytes.length > 262_144 ||
      !Buffer.isBuffer(amendedAuthorityBytes) || !amendedAuthorityBytes.length || amendedAuthorityBytes.length > 262_144 ||
      digest(previousAuthorityBytes) === digest(amendedAuthorityBytes)) fail('exact changed authority bytes are invalid or unchanged.');
  if (typeof authorityId !== 'string' || !/^[a-z][a-z0-9-]{0,63}$/.test(authorityId) ||
      typeof authorityPath !== 'string' || !/^(?:[A-Za-z0-9._-]+\/)*[A-Za-z0-9._-]+\.md$/.test(authorityPath) ||
      authorityPath.length > 240 || authorityPath.split('/').some(part => part === '.' || part === '..')) fail('target authority identity is invalid.');
  if (typeof purpose !== 'string' || !purpose.trim() || purpose.length > 500 || !/^[\x20-\x7e]+$/.test(purpose)) fail('purpose is invalid.');

  const trigger = json(reviewRecordBytes, 'OWNER_DECISION ReviewRecord');
  exact(trigger, ['version', 'kind', 'repository', 'prNumber', 'baseSha', 'headSha', 'mergeSha', 'workflowSha',
    'workflowPath', 'runId', 'runAttempt', 'authority', 'inputDigests', 'decisionSha256', 'decisionBytesBase64', 'decision'], 'OWNER_DECISION ReviewRecord');
  if (trigger.version !== 1 || trigger.kind !== 'owner-amendment-owner-decision-review-record' ||
      trigger.repository !== repository || trigger.baseSha !== baseSha || trigger.workflowSha !== baseSha ||
      !Number.isSafeInteger(trigger.prNumber) || trigger.prNumber < 1 || !SHA1.test(trigger.headSha ?? '') ||
      trigger.headSha === baseSha || trigger.headSha === bSha || !SHA1.test(trigger.mergeSha ?? '') ||
      !/^\.github\/workflows\/[A-Za-z0-9._-]+\.yml$/.test(trigger.workflowPath ?? '') ||
      ![trigger.runId, trigger.runAttempt].every(value => typeof value === 'string' && /^[1-9]\d*$/.test(value)) ||
      trigger.decision?.decision !== 'OWNER_DECISION' || typeof trigger.decision.ownerDecisionId !== 'string' ||
      !trigger.decision.ownerDecisionId.trim() || trigger.decision.ownerDecisionId.length > 160) {
    fail('trigger is not a completed protected OWNER_DECISION or lacks its structured decision ID.');
  }
  const decisionBytes = Buffer.from(trigger.decisionBytesBase64 ?? '', 'base64');
  if (!decisionBytes.length || decisionBytes.toString('base64') !== trigger.decisionBytesBase64 ||
      digest(decisionBytes) !== trigger.decisionSha256 ||
      JSON.stringify(json(decisionBytes, 'exact OWNER_DECISION bytes', 65_536)) !== JSON.stringify(trigger.decision)) {
    fail('trigger exact decision bytes and decision digest do not agree.');
  }
  const member = trigger.authority?.members?.find(item => item.id === authorityId && item.path === authorityPath &&
    item.repository === repository && item.resolvedCommit === baseSha);
  if (!member || trigger.authority.authorityRevision !== baseSha || trigger.authority.selfRepository !== repository ||
      !SHA256.test(member.sha256 ?? '') || member.sha256 !== digest(previousAuthorityBytes)) {
    fail('trigger Authority Set does not bind the target authority bytes at the exact previous base.');
  }
  const record = Object.freeze({ version: 1, kind: 'owner-amendment-owner-decision-amendment-record',
    triggerProfile: 'completed-owner-decision-self-v1', repository, baseSha, headSha: bSha,
    policyRevision: baseSha, authority: Object.freeze({ id: authorityId, path: authorityPath,
      previousSha256: digest(previousAuthorityBytes), newSha256: digest(amendedAuthorityBytes) }),
    ownerDecisionId: trigger.decision.ownerDecisionId,
    triggeringReviewSha256: digest(reviewRecordBytes), attestationBundleSha256: digest(attestationBundleBytes), purpose });
  const bytes = Buffer.from(`${JSON.stringify(record)}\n`, 'utf8');
  if (bytes.length > 8_192) fail('AmendmentRecord exceeds its byte limit.');
  return Object.freeze({ record, bytes });
}

/** Deterministically check fields required by the semantic producer/receipt. */
export function validateOwnerAmendmentOwnerDecisionAmendmentRecord({ bytes, expected } = {}) {
  try {
    const value = json(bytes, 'AmendmentRecord', 8_192);
    exact(value, ['version', 'kind', 'triggerProfile', 'repository', 'baseSha', 'headSha', 'policyRevision',
      'authority', 'ownerDecisionId', 'triggeringReviewSha256', 'attestationBundleSha256', 'purpose'], 'AmendmentRecord');
    exact(expected, ['repository', 'baseSha', 'bSha', 'policyRevision', 'triggerProfile', 'triggerReviewRecordSha256',
      'authoritySetDigest', 'resultingAuthoritySetDigest', 'changes', 'ownerDecisionId'], 'expected protected AmendmentRecord bindings');
    exact(value.authority, ['id', 'path', 'previousSha256', 'newSha256'], 'AmendmentRecord authority');
    if (value.version !== 1 || value.kind !== 'owner-amendment-owner-decision-amendment-record' ||
        value.triggerProfile !== 'completed-owner-decision-self-v1' || value.repository !== expected.repository ||
        value.baseSha !== expected.baseSha || value.headSha !== expected.bSha || value.policyRevision !== expected.policyRevision ||
        expected.triggerProfile !== value.triggerProfile || value.triggeringReviewSha256 !== expected.triggerReviewRecordSha256 ||
        typeof expected.ownerDecisionId !== 'string' || !expected.ownerDecisionId.trim() ||
        value.ownerDecisionId !== expected.ownerDecisionId ||
        !SHA256.test(value.authority.previousSha256 ?? '') || !SHA256.test(value.authority.newSha256 ?? '') ||
        value.authority.previousSha256 === value.authority.newSha256 || typeof value.ownerDecisionId !== 'string' ||
        !value.ownerDecisionId.trim() || value.ownerDecisionId.length > 160 || !SHA256.test(value.attestationBundleSha256 ?? '') ||
        typeof value.purpose !== 'string' || !value.purpose.trim() || value.purpose.length > 500) fail('AmendmentRecord does not bind protected OWNER_DECISION inputs.');
    if (!Array.isArray(expected.changes) || expected.changes.length !== 1 || expected.changes[0].path !== value.authority.path ||
        expected.changes[0].beforeSha256 !== value.authority.previousSha256 || expected.changes[0].afterSha256 !== value.authority.newSha256) {
      fail('AmendmentRecord target does not match the exact protected before/after authority bytes.');
    }
    const canonical = `${JSON.stringify(value)}\n`;
    if (!bytes.equals(Buffer.from(canonical))) fail('AmendmentRecord bytes are not canonical producer bytes.');
    return Object.freeze({ status: 'VERIFIED_OWNER_AMENDMENT_RECORD', repository: value.repository,
      baseSha: value.baseSha, bSha: value.headSha, policyRevision: value.policyRevision,
      triggerProfile: value.triggerProfile, triggerReviewRecordSha256: value.triggeringReviewSha256,
      priorAuthoritySetDigest: expected.authoritySetDigest, resultingAuthoritySetDigest: expected.resultingAuthoritySetDigest,
      targetValidated: true, purpose: value.purpose, ownerDecisionId: value.ownerDecisionId });
  } catch (error) { return Object.freeze({ status: 'INCOMPLETE', reason: error.message }); }
}
