import { createHash } from 'node:crypto';
import { TextDecoder } from 'node:util';

const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
const REPOSITORY = /^[A-Za-z0-9][A-Za-z0-9-]{0,38}\/[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/;
const ID = /^[a-z][a-z0-9-]{0,63}$/;
const PATH = /^(?:[A-Za-z0-9._-]+\/)*[A-Za-z0-9._-]+\.md$/;
const SHA256 = /^[a-f0-9]{64}$/;
const TAG_REF = /^refs\/tags\/architecture-gatekeeper\/amendments\/[a-z0-9][a-z0-9._-]{0,63}$/;

function fail(message) { throw new Error(`Owner amendment: ${message}`); }
function record(value, keys, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      Object.keys(value).length !== keys.length || keys.some(key => !Object.hasOwn(value, key))) {
    fail(`${label} has missing or unknown fields.`);
  }
}
function requireMatch(value, regex, label) {
  if (typeof value !== 'string' || !regex.test(value)) fail(`${label} is invalid.`);
}
function requireSha(value, label, length) {
  if (typeof value !== 'string' || ![40, 64].includes(value.length) ||
      !/^[a-f0-9]+$/.test(value) || (length && value.length !== length)) fail(`${label} is invalid.`);
}
function requirePurpose(value) {
  if (typeof value !== 'string' || value.length < 1 || value.length > 500 ||
      !/^[\x20-\x7e]+$/.test(value) || !value.trim()) fail('amendment purpose is invalid.');
}
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  }
  return value;
}

/** Stable identity of a validated structured record, independent of JSON key order. */
export function digestOwnerAmendmentRecord(value) {
  return createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
}

function checkAuthority(value, label, withChange = false) {
  record(value, withChange ? ['id', 'path', 'previousSha256', 'newSha256'] : ['id', 'path', 'sha256'], label);
  requireMatch(value.id, ID, `${label} ID`);
  requireMatch(value.path, PATH, `${label} path`);
  if (value.path.length > 240 || value.path.split('/').some(part => part === '.' || part === '..')) fail(`${label} path is invalid.`);
  for (const field of withChange ? ['previousSha256', 'newSha256'] : ['sha256']) {
    requireMatch(value[field], SHA256, `${label} ${field}`);
  }
}

function validatePolicy(policy) {
  record(policy, ['version', 'repository', 'revision', 'ownerAmendment'], 'protected policy');
  if (policy.version !== 1) fail('unsupported protected policy version.');
  requireMatch(policy.repository, REPOSITORY, 'protected repository');
  requireSha(policy.revision, 'protected policy revision');
  record(policy.ownerAmendment, ['grade', 'scope', 'authorities'], 'protected amendment policy');
  if (policy.ownerAmendment.grade !== 'G0' || policy.ownerAmendment.scope !== 'authority-only') {
    fail('protected policy does not select G0 authority-only amendments.');
  }
  const authorities = policy.ownerAmendment.authorities;
  if (!Array.isArray(authorities) || !authorities.length || authorities.length > 32) fail('protected amendment authority list is invalid.');
  const ids = new Set();
  const paths = new Set();
  for (const authority of authorities) {
    record(authority, ['id', 'path'], 'allowed authority');
    requireMatch(authority.id, ID, 'allowed authority ID');
    requireMatch(authority.path, PATH, 'allowed authority path');
    if (authority.path.length > 240 || authority.path.split('/').some(part => part === '.' || part === '..') ||
        ids.has(authority.id) || paths.has(authority.path)) fail('allowed authority is invalid or duplicated.');
    ids.add(authority.id);
    paths.add(authority.path);
  }
}

function validateCurrent(current, policy) {
  record(current, ['repository', 'baseSha', 'headSha', 'policyRevision', 'baseAuthority', 'headAuthority', 'changedFiles', 'tagRefOid'], 'current state');
  if (current.repository !== policy.repository) fail('current repository differs from protected policy.');
  const length = policy.revision.length;
  for (const key of ['baseSha', 'headSha', 'policyRevision', 'tagRefOid']) requireSha(current[key], `current ${key}`, length);
  if (current.baseSha === current.headSha || current.policyRevision !== policy.revision || current.policyRevision !== current.baseSha) {
    fail('current base, head or previous protected policy revision changed.');
  }
  checkAuthority(current.baseAuthority, 'base authority');
  checkAuthority(current.headAuthority, 'head authority');
  if (current.baseAuthority.id !== current.headAuthority.id || current.baseAuthority.path !== current.headAuthority.path ||
      current.baseAuthority.sha256 === current.headAuthority.sha256) fail('current authority identities or bytes are unchanged.');
  if (!policy.ownerAmendment.authorities.some(item => item.id === current.baseAuthority.id && item.path === current.baseAuthority.path)) {
    fail('protected policy does not authorize the affected authority.');
  }
  if (!Array.isArray(current.changedFiles) || current.changedFiles.length !== 1) fail('amendment must change exactly one authority file.');
  record(current.changedFiles[0], ['path', 'status'], 'changed file');
  if (current.changedFiles[0].path !== current.baseAuthority.path || current.changedFiles[0].status !== 'modified') {
    fail('amendment contains a non-authority, added, deleted or renamed file.');
  }
}

function validateReviewRecord(review, current) {
  record(review, ['version', 'repository', 'baseSha', 'headSha', 'policyRevision', 'authority', 'reviewInputSha256', 'gatekeeperIdentity', 'decision', 'decisionSha256'], 'ReviewRecord');
  if (review.version !== 1 || review.repository !== current.repository) fail('ReviewRecord version or repository is invalid.');
  for (const key of ['baseSha', 'headSha', 'policyRevision']) requireSha(review[key], `ReviewRecord ${key}`, current.baseSha.length);
  if (review.baseSha !== current.baseSha || review.policyRevision !== current.policyRevision) {
    fail('ReviewRecord is stale for the current protected base or policy.');
  }
  if (review.baseSha === review.headSha || review.headSha === current.headSha) fail('ReviewRecord does not identify a separate historical change.');
  requireMatch(review.reviewInputSha256, SHA256, 'ReviewRecord review input digest');
  if (typeof review.gatekeeperIdentity !== 'string' || !/^[A-Za-z0-9@._/-]{1,160}$/.test(review.gatekeeperIdentity)) fail('ReviewRecord Gatekeeper identity is invalid.');
  checkAuthority(review.authority, 'ReviewRecord authority');
  if (review.authority.id !== current.baseAuthority.id || review.authority.path !== current.baseAuthority.path ||
      review.authority.sha256 !== current.baseAuthority.sha256) fail('ReviewRecord was not against the previous authority.');
  record(review.decision, ['decision', 'authorityIds'], 'ReviewRecord decision');
  if (review.decision.decision !== 'BLOCK' || !Array.isArray(review.decision.authorityIds) ||
      review.decision.authorityIds.length !== 1 || review.decision.authorityIds[0] !== review.authority.id) {
    fail('ReviewRecord must contain the exact completed BLOCK decision for the affected authority.');
  }
  requireMatch(review.decisionSha256, SHA256, 'ReviewRecord decision digest');
  if (review.decisionSha256 !== digestOwnerAmendmentRecord(review.decision)) fail('ReviewRecord decision digest differs from its decision.');
}

function validateAmendmentRecord(amendment, reviewDigest, current) {
  record(amendment, ['version', 'repository', 'baseSha', 'headSha', 'policyRevision', 'authority', 'triggeringReviewSha256', 'purpose'], 'AmendmentRecord');
  if (amendment.version !== 1 || amendment.repository !== current.repository ||
      amendment.baseSha !== current.baseSha || amendment.headSha !== current.headSha ||
      amendment.policyRevision !== current.policyRevision) fail('AmendmentRecord is stale or belongs to another change.');
  checkAuthority(amendment.authority, 'AmendmentRecord authority', true);
  if (amendment.authority.id !== current.baseAuthority.id || amendment.authority.path !== current.baseAuthority.path ||
      amendment.authority.previousSha256 !== current.baseAuthority.sha256 ||
      amendment.authority.newSha256 !== current.headAuthority.sha256) fail('AmendmentRecord authority binding differs from current state.');
  if (amendment.triggeringReviewSha256 !== reviewDigest) fail('AmendmentRecord does not bind the exact BLOCK ReviewRecord.');
  requirePurpose(amendment.purpose);
}

function validateTag(tag, current, amendment, reviewDigest, amendmentDigest) {
  record(tag, ['ref', 'objectOid', 'objectBytes'], 'annotated tag');
  requireMatch(tag.ref, TAG_REF, 'annotated tag ref');
  requireSha(tag.objectOid, 'annotated tag OID', current.headSha.length);
  if (tag.objectOid !== current.tagRefOid) fail('annotated tag ref has changed.');
  if (!Buffer.isBuffer(tag.objectBytes) || !tag.objectBytes.length || tag.objectBytes.length > 8_192) fail('annotated tag object bytes are missing or oversized.');
  const algorithm = current.headSha.length === 40 ? 'sha1' : 'sha256';
  const computedOid = createHash(algorithm).update(Buffer.from(`tag ${tag.objectBytes.length}\0`)).update(tag.objectBytes).digest('hex');
  if (computedOid !== tag.objectOid) fail('annotated tag object OID is invalid.');
  let source;
  try { source = decoder.decode(tag.objectBytes); } catch { fail('annotated tag object is not UTF-8.'); }
  const separator = source.indexOf('\n\n');
  if (separator < 0) fail('annotated tag object has no message.');
  const headers = source.slice(0, separator).split('\n');
  if (headers.length !== 4 || headers[0] !== `object ${current.headSha}` || headers[1] !== 'type commit' ||
      headers[2] !== `tag ${tag.ref.slice('refs/tags/'.length)}` ||
      !/^tagger [^\n<>]+ <[^\n<>]+> [0-9]+ [+-][0-9]{4}$/.test(headers[3])) {
    fail('annotated tag header does not bind the exact amendment commit and tag ref.');
  }
  const expectedMessage = `${JSON.stringify({ version: 1, purpose: amendment.purpose, reviewRecordSha256: reviewDigest, amendmentRecordSha256: amendmentDigest })}\n`;
  if (source.slice(separator + 2) !== expectedMessage) fail('annotated tag message does not bind the amendment purpose and records.');
}

/**
 * Verify the deterministic G0 procedure. This module's records are an internal,
 * narrow G0 format; they do not define the general Issue #20 evidence schema.
 * The caller must source policy from the
 * previous protected base, a historical ReviewRecord from trusted review
 * evidence (never author-supplied PR JSON), and current state/changedFiles and
 * tagRefOid from fresh exact-base/head and remote-tag reads. This pure function
 * does not authenticate the tagger or establish provenance for caller inputs.
 */
export function verifyOwnerAmendmentG0({ policy, current, reviewRecord, amendmentRecord, tag }) {
  validatePolicy(policy);
  validateCurrent(current, policy);
  validateReviewRecord(reviewRecord, current);
  const reviewDigest = digestOwnerAmendmentRecord(reviewRecord);
  validateAmendmentRecord(amendmentRecord, reviewDigest, current);
  const amendmentDigest = digestOwnerAmendmentRecord(amendmentRecord);
  validateTag(tag, current, amendmentRecord, reviewDigest, amendmentDigest);
  return Object.freeze({
    result: 'OWNER_AMENDMENT', grade: 'G0', label: 'OWNER_AMENDMENT / G0',
    repository: current.repository, baseSha: current.baseSha, headSha: current.headSha,
    policyRevision: policy.revision, authorityId: current.baseAuthority.id,
    reviewRecordSha256: reviewDigest, amendmentRecordSha256: amendmentDigest,
    tagObjectOid: tag.objectOid, principalAuthentication: 'not_verified',
  });
}
