import { createHash } from 'node:crypto';
import { TextDecoder } from 'node:util';
import { MAX_AUTHORITY_LIMITS, rejectDuplicateJsonKeys } from './authority-set.mjs';

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
 * trigger. The record binds the historical escalation by its exact ReviewRecord
 * digest without claiming it authenticates the owner's choice or identity.
 */
export function buildOwnerAmendmentOwnerDecisionAmendmentRecord({ reviewRecordBytes,
  attestationBundleBytes, repository, baseSha, bSha, authorityId, authorityPath,
  previousAuthorityBytes, amendedAuthorityBytes, authorityChanges, priorAuthoritySetDigest,
  resultingAuthoritySetDigest, purpose }) {
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
      trigger.decision?.decision !== 'OWNER_DECISION') {
    fail('trigger is not a completed protected OWNER_DECISION.');
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
  validatePreviousMembers(trigger.authority, repository, baseSha);
  const changes = validateChanges(authorityChanges, repository, baseSha);
  const target = changes.filter(change => change.path === authorityPath);
  if (target.length !== 1 || target[0].beforeSha256 !== digest(previousAuthorityBytes) ||
      target[0].afterSha256 !== digest(amendedAuthorityBytes)) {
    fail('complete authority changes do not bind the selected amendment target.');
  }
  const descriptors = trigger.authority.members.map(item => ({ id: item.id, repository: item.repository,
    resolvedCommit: item.resolvedCommit, path: item.path, byteLength: item.byteLength, sha256: item.sha256 }));
  const computedPriorDigest = digest(Buffer.from(JSON.stringify(descriptors), 'utf8'));
  const changesByPath = new Map(changes.map(change => [change.path, change]));
  for (const change of changes) {
    const descriptor = descriptors.find(item => item.repository === repository && item.resolvedCommit === baseSha &&
      item.path === change.path);
    if (!descriptor || descriptor.byteLength !== change.beforeByteLength || descriptor.sha256 !== change.beforeSha256) {
      fail(`changed authority ${change.path} does not bind its complete previous Authority Set member.`);
    }
  }
  const resultingDescriptors = descriptors.map(descriptor => {
    const change = changesByPath.get(descriptor.path);
    return change ? { ...descriptor, byteLength: change.afterByteLength, sha256: change.afterSha256 } : descriptor;
  });
  const resultingTotalBytes = resultingDescriptors.reduce((total, descriptor) => total + descriptor.byteLength, 0);
  if (resultingTotalBytes > MAX_AUTHORITY_LIMITS.maxTotalBytes) {
    fail('resulting Authority Set exceeds the runtime total-byte ceiling.');
  }
  const computedResultingDigest = digest(Buffer.from(JSON.stringify(resultingDescriptors), 'utf8'));
  if (trigger.authority.setDigest !== computedPriorDigest || priorAuthoritySetDigest !== computedPriorDigest ||
      resultingAuthoritySetDigest !== computedResultingDigest) {
    fail('prior or resulting Authority Set digest does not match the exact changed authority bytes.');
  }
  const record = Object.freeze({ version: 2, kind: 'owner-amendment-owner-decision-amendment-record',
    triggerProfile: 'completed-owner-decision-self-v1', repository, baseSha, headSha: bSha,
    policyRevision: baseSha, authority: Object.freeze({ id: authorityId, path: authorityPath,
      previousSha256: digest(previousAuthorityBytes), newSha256: digest(amendedAuthorityBytes) }),
    changes: Object.freeze(changes.map(({ path: changedPath, beforeSha256, afterSha256 }) =>
      Object.freeze({ path: changedPath, beforeSha256, afterSha256 }))),
    priorAuthoritySetDigest: computedPriorDigest, resultingAuthoritySetDigest: computedResultingDigest,
    triggeringReviewSha256: digest(reviewRecordBytes), attestationBundleSha256: digest(attestationBundleBytes), purpose });
  const bytes = Buffer.from(`${JSON.stringify(record)}\n`, 'utf8');
  if (bytes.length > 8_192) fail('AmendmentRecord exceeds its byte limit.');
  return Object.freeze({ record, bytes });
}

function validateChanges(authorityChanges, repository, baseSha) {
  if (!Array.isArray(authorityChanges) || authorityChanges.length < 1 || authorityChanges.length > 32) {
    fail('complete changed authority bytes are absent or exceed the supported member limit.');
  }
  let previousPath = '';
  return authorityChanges.map(change => {
    exact(change, ['path', 'beforeBytes', 'afterBytes'], 'changed authority');
    if (typeof change.path !== 'string' || !/^(?:[A-Za-z0-9._-]+\/)*[A-Za-z0-9._-]+\.md$/.test(change.path) ||
        change.path.length > 240 || change.path.split('/').some(part => part === '.' || part === '..') ||
        (previousPath && previousPath >= change.path) || !Buffer.isBuffer(change.beforeBytes) || !change.beforeBytes.length ||
        change.beforeBytes.length > MAX_AUTHORITY_LIMITS.maxFileBytes || !Buffer.isBuffer(change.afterBytes) || !change.afterBytes.length ||
        change.afterBytes.length > MAX_AUTHORITY_LIMITS.maxFileBytes || change.beforeBytes.equals(change.afterBytes)) {
      fail('changed authority bytes must be unique, sorted, bounded, and modified.');
    }
    previousPath = change.path;
    return Object.freeze({ path: change.path, beforeBytes: Buffer.from(change.beforeBytes),
      afterBytes: Buffer.from(change.afterBytes), beforeSha256: digest(change.beforeBytes),
      afterSha256: digest(change.afterBytes), beforeByteLength: change.beforeBytes.length,
      afterByteLength: change.afterBytes.length });
  });
}

function validatePreviousMembers(authority, repository, baseSha) {
  exact(authority, ['version','selfRepository','authorityRevision','manifestSha256','setDigest','members'], 'trigger Authority Set');
  if (authority.version !== 1 || authority.selfRepository !== repository || authority.authorityRevision !== baseSha ||
      !Array.isArray(authority.members) || !authority.members.length || authority.members.length > 32 ||
      !SHA256.test(authority.manifestSha256 ?? '') || !SHA256.test(authority.setDigest ?? '')) {
    fail('trigger does not contain a complete previous self Authority Set.');
  }
  const ids = new Set();
  const paths = new Set();
  let totalBytes = 0;
  for (const member of authority.members) {
    exact(member, ['id','repository','resolvedCommit','path','byteLength','sha256'], 'trigger Authority Set member');
    if (typeof member.id !== 'string' || !/^[a-z][a-z0-9-]{0,63}$/.test(member.id) || ids.has(member.id) ||
        member.repository !== repository || member.resolvedCommit !== baseSha ||
        typeof member.path !== 'string' || !/^(?:[A-Za-z0-9._-]+\/)*[A-Za-z0-9._-]+\.md$/.test(member.path) ||
        member.path.length > 240 || member.path.split('/').some(part => part === '.' || part === '..') || paths.has(member.path) ||
        !Number.isSafeInteger(member.byteLength) || member.byteLength < 1 ||
        member.byteLength > MAX_AUTHORITY_LIMITS.maxFileBytes || !SHA256.test(member.sha256 ?? '')) {
      fail('trigger Authority Set member is invalid, external, or duplicated.');
    }
    ids.add(member.id); paths.add(member.path); totalBytes += member.byteLength;
    if (totalBytes > MAX_AUTHORITY_LIMITS.maxTotalBytes) fail('trigger Authority Set exceeds the runtime total-byte ceiling.');
  }
}

/** Deterministically check fields required by the semantic producer/receipt. */
export function validateOwnerAmendmentOwnerDecisionAmendmentRecord({ bytes, expected } = {}) {
  try {
    const value = json(bytes, 'AmendmentRecord', 8_192);
    exact(value, ['version', 'kind', 'triggerProfile', 'repository', 'baseSha', 'headSha', 'policyRevision',
      'authority', 'changes', 'priorAuthoritySetDigest', 'resultingAuthoritySetDigest',
      'triggeringReviewSha256', 'attestationBundleSha256', 'purpose'], 'AmendmentRecord');
    exact(expected, ['repository', 'baseSha', 'bSha', 'policyRevision', 'triggerProfile', 'triggerReviewRecordSha256',
      'authoritySetDigest', 'resultingAuthoritySetDigest', 'authorityId', 'authorityPath', 'changes'], 'expected protected AmendmentRecord bindings');
    exact(value.authority, ['id', 'path', 'previousSha256', 'newSha256'], 'AmendmentRecord authority');
    if (value.version !== 2 || value.kind !== 'owner-amendment-owner-decision-amendment-record' ||
        value.triggerProfile !== 'completed-owner-decision-self-v1' || value.repository !== expected.repository ||
        value.baseSha !== expected.baseSha || value.headSha !== expected.bSha || value.policyRevision !== expected.policyRevision ||
        expected.triggerProfile !== value.triggerProfile || value.triggeringReviewSha256 !== expected.triggerReviewRecordSha256 ||
        !SHA256.test(value.authority.previousSha256 ?? '') || !SHA256.test(value.authority.newSha256 ?? '') ||
        value.authority.previousSha256 === value.authority.newSha256 || !SHA256.test(value.attestationBundleSha256 ?? '') ||
        !SHA256.test(value.priorAuthoritySetDigest ?? '') || !SHA256.test(value.resultingAuthoritySetDigest ?? '') ||
        value.priorAuthoritySetDigest !== expected.authoritySetDigest ||
        value.resultingAuthoritySetDigest !== expected.resultingAuthoritySetDigest ||
        value.authority.id !== expected.authorityId || value.authority.path !== expected.authorityPath ||
        typeof value.purpose !== 'string' || !value.purpose.trim() || value.purpose.length > 500) fail('AmendmentRecord does not bind protected OWNER_DECISION inputs.');
    if (!Array.isArray(expected.changes) || !Array.isArray(value.changes) ||
        JSON.stringify(value.changes) !== JSON.stringify(expected.changes)) {
      fail('AmendmentRecord does not bind every exact changed authority path and before/after digest.');
    }
    const target = value.changes.filter(change => change.path === value.authority.path);
    if (target.length !== 1 || target[0].beforeSha256 !== value.authority.previousSha256 ||
        target[0].afterSha256 !== value.authority.newSha256) {
      fail('AmendmentRecord selected target does not match its complete changed-authority list.');
    }
    const canonical = `${JSON.stringify(value)}\n`;
    if (!bytes.equals(Buffer.from(canonical))) fail('AmendmentRecord bytes are not canonical producer bytes.');
    return Object.freeze({ status: 'VERIFIED_OWNER_AMENDMENT_RECORD', repository: value.repository,
      baseSha: value.baseSha, bSha: value.headSha, policyRevision: value.policyRevision,
      triggerProfile: value.triggerProfile, triggerReviewRecordSha256: value.triggeringReviewSha256,
      priorAuthoritySetDigest: expected.authoritySetDigest, resultingAuthoritySetDigest: expected.resultingAuthoritySetDigest,
      authorityId: value.authority.id, authorityPath: value.authority.path,
      changes: Object.freeze(value.changes.map(change => Object.freeze({ ...change }))),
      targetValidated: true, purpose: value.purpose });
  } catch (error) { return Object.freeze({ status: 'INCOMPLETE', reason: error.message }); }
}
