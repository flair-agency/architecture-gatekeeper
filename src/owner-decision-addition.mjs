import { createHash } from 'node:crypto';
import { TextDecoder } from 'node:util';
import { validateMultiAuthorityProvenance } from './multi-authority-provenance.mjs';

const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
const REPOSITORY = /^[A-Za-z0-9][A-Za-z0-9-]{0,38}\/[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/;
const ID = /^[a-z][a-z0-9-]{0,63}$/;
const PATH = /^(?:[A-Za-z0-9._-]+\/)*[A-Za-z0-9._-]+\.md$/;
const SHA256 = /^[a-f0-9]{64}$/;
const TAG_REF_PREFIX = 'refs/tags/architecture-owner-addition/';
const ADDITION_TAG_REF = /^refs\/tags\/architecture-owner-addition\/[a-f0-9]{40}(?:[a-f0-9]{24})?$/;

function fail(message) { throw new Error(`Owner decision addition: ${message}`); }
function record(value, keys, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      Object.keys(value).length !== keys.length || keys.some(key => !Object.hasOwn(value, key))) {
    fail(`${label} has missing or unknown fields.`);
  }
}
function requireMatch(value, regex, label) {
  if (typeof value !== 'string' || !regex.test(value)) fail(`${label} is invalid.`);
}
function requireCommit(value, label, length) {
  if (typeof value !== 'string' || value.length !== length || !/^[a-f0-9]+$/.test(value)) fail(`${label} is invalid.`);
}
function requirePurpose(value) {
  if (typeof value !== 'string' || value.length < 1 || value.length > 500 ||
      !/^[\x20-\x7e]+$/.test(value) || !value.trim()) fail('purpose is invalid.');
}
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  }
  return value;
}

/** Stable digest for versioned owner-decision addition records. */
export function digestOwnerDecisionAddition(value) {
  return createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
}

function checkAuthority(value, label) {
  record(value, ['id', 'path', 'sha256'], label);
  requireMatch(value.id, ID, `${label} ID`);
  requireMatch(value.path, PATH, `${label} path`);
  if (value.path.length > 240 || value.path.split('/').some(part => part === '.' || part === '..')) fail(`${label} path is invalid.`);
  requireMatch(value.sha256, SHA256, `${label} SHA-256`);
}

function validatePolicy(policy) {
  record(policy, ['version', 'repository', 'revision', 'ownerAddition'], 'previous protected policy');
  if (policy.version !== 1) fail('unsupported previous protected policy version.');
  requireMatch(policy.repository, REPOSITORY, 'policy repository');
  if (typeof policy.revision !== 'string' || ![40, 64].includes(policy.revision.length) || !/^[a-f0-9]+$/.test(policy.revision)) {
    fail('policy revision is invalid.');
  }
  record(policy.ownerAddition, ['grade', 'authorityPath'], 'protected owner-addition policy');
  if (policy.ownerAddition.grade !== 'G0') {
    fail('previous protected policy does not select G0 missing-decision additions.');
  }
  requireMatch(policy.ownerAddition.authorityPath, PATH, 'protected addition authority path');
  if (policy.ownerAddition.authorityPath.length > 240 ||
      policy.ownerAddition.authorityPath.split('/').some(part => part === '.' || part === '..')) fail('protected authority path is invalid.');
}

function validateCurrent(current, policy) {
  record(current, ['repository', 'baseSha', 'headSha', 'policyRevision', 'baseAuthority', 'headAuthority', 'changedFiles', 'tagRefOid'], 'current state');
  if (current.repository !== policy.repository) fail('current repository differs from previous protected policy.');
  const length = policy.revision.length;
  for (const key of ['baseSha', 'headSha', 'policyRevision', 'tagRefOid']) requireCommit(current[key], `current ${key}`, length);
  if (current.baseSha === current.headSha || current.policyRevision !== policy.revision || current.policyRevision !== current.baseSha) {
    fail('current base, head or previous protected policy revision changed.');
  }
  checkAuthority(current.baseAuthority, 'base authority');
  checkAuthority(current.headAuthority, 'head authority');
  if (current.baseAuthority.id !== current.headAuthority.id || current.baseAuthority.path !== current.headAuthority.path ||
      current.baseAuthority.sha256 === current.headAuthority.sha256) fail('authority identity or bytes are unchanged.');
  if (policy.ownerAddition.authorityPath !== current.baseAuthority.path) {
    fail('previous protected policy does not authorize the affected authority.');
  }
  if (!Array.isArray(current.changedFiles) || current.changedFiles.length !== 1) fail('addition must change exactly one authority file.');
  record(current.changedFiles[0], ['path', 'status'], 'changed file');
  if (current.changedFiles[0].path !== current.baseAuthority.path || current.changedFiles[0].status !== 'modified') {
    fail('addition includes a non-authority, added, deleted or renamed file.');
  }
}

function validateAdditionRecord(addition, current) {
  record(addition, ['version', 'repository', 'baseSha', 'headSha', 'policyRevision', 'authority', 'missingDecision', 'purpose'], 'AdditionRecord');
  if (addition.version !== 1 || addition.repository !== current.repository || addition.baseSha !== current.baseSha ||
      addition.headSha !== current.headSha || addition.policyRevision !== current.policyRevision) {
    fail('AdditionRecord is stale or belongs to another change.');
  }
  record(addition.authority, ['id', 'path', 'previousSha256', 'newSha256'], 'AdditionRecord authority');
  requireMatch(addition.authority.id, ID, 'AdditionRecord authority ID');
  requireMatch(addition.authority.path, PATH, 'AdditionRecord authority path');
  requireMatch(addition.authority.previousSha256, SHA256, 'AdditionRecord previous authority SHA-256');
  requireMatch(addition.authority.newSha256, SHA256, 'AdditionRecord new authority SHA-256');
  if (addition.authority.id !== current.baseAuthority.id || addition.authority.path !== current.baseAuthority.path ||
      addition.authority.previousSha256 !== current.baseAuthority.sha256 || addition.authority.newSha256 !== current.headAuthority.sha256) {
    fail('AdditionRecord authority binding differs from current state.');
  }
  record(addition.missingDecision, ['id', 'summary'], 'AdditionRecord missing decision');
  if (typeof addition.missingDecision.id !== 'string' || !/^[a-z0-9][a-z0-9._-]{0,99}$/.test(addition.missingDecision.id)) {
    fail('AdditionRecord missing decision ID is invalid.');
  }
  if (typeof addition.missingDecision.summary !== 'string' || addition.missingDecision.summary.length < 1 ||
      addition.missingDecision.summary.length > 2_000 || !addition.missingDecision.summary.trim()) {
    fail('AdditionRecord missing decision summary is invalid.');
  }
  requirePurpose(addition.purpose);
}

function validateTag(tag, current, validateRecord = validateAdditionRecord) {
  record(tag, ['ref', 'objectOid', 'objectBytes'], 'annotated tag');
  requireMatch(tag.ref, ADDITION_TAG_REF, 'annotated tag ref');
  requireCommit(tag.objectOid, 'annotated tag OID', current.headSha.length);
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
      headers[2] !== `tag ${tag.ref.slice('refs/tags/'.length)}` || tag.ref !== `${TAG_REF_PREFIX}${current.headSha}` ||
      !/^tagger [^\n<>]+ <[^\n<>]+> [0-9]+ [+-][0-9]{4}$/.test(headers[3])) {
    fail('annotated tag header does not bind the exact addition commit and tag ref.');
  }
  let addition;
  try { addition = JSON.parse(source.slice(separator + 2)); } catch { fail('tag annotation does not contain valid AdditionRecord JSON.'); }
  validateRecord(addition, current);
  const expectedMessage = `${JSON.stringify(canonical(addition))}\n`;
  if (source.slice(separator + 2) !== expectedMessage) fail('tag annotation is not the canonical AdditionRecord encoding.');
  return addition;
}

/**
 * Validate only the deterministic G0 artifact procedure, not semantic
 * eligibility or an acceptance decision. The caller must supply the previous
 * protected policy, exact base/head authority snapshots, changed-file list,
 * immutable tag bytes, and observed tag-ref OID. This function cannot
 * determine from authority text whether B adds a missing choice, contradicts
 * an existing rule, or asserts completed work; a separate protected eligibility
 * review must establish those conditions. It does not authenticate the tagger.
 */
export function validateOwnerDecisionAdditionG0Procedure({ policy, current, tag }) {
  validatePolicy(policy);
  validateCurrent(current, policy);
  const additionRecord = validateTag(tag, current);
  const additionDigest = digestOwnerDecisionAddition(additionRecord);
  return Object.freeze({
    procedure: 'VALID_G0_OWNER_ADDITION', grade: 'G0',
    repository: current.repository, baseSha: current.baseSha, headSha: current.headSha,
    policyRevision: policy.revision, authorityId: current.baseAuthority.id,
    authorityPath: additionRecord.authority.path,
    previousAuthoritySha256: additionRecord.authority.previousSha256,
    newAuthoritySha256: additionRecord.authority.newSha256,
    missingDecisionId: additionRecord.missingDecision.id,
    additionRecordSha256: additionDigest,
    tagRef: tag.ref, tagObjectOid: tag.objectOid, principalAuthentication: 'not_verified',
    semanticEligibility: 'requires_separate_protected_review',
  });
}

/** Version 2 extends the binding without reinterpreting any v1 tag or policy. */
export function validateMultiAuthorityAdditionG0Procedure({ policy, current, tag }) {
  record(policy, ['version', 'repository', 'revision', 'sha256', 'ownerAddition'], 'v2 policy');
  record(policy.ownerAddition, ['grade', 'authorityId', 'authorityPath'], 'v2 owner-addition policy');
  if (policy.version !== 2) fail('unsupported multi-document policy descriptor version.');
  requireMatch(policy.sha256, SHA256, 'v2 policy digest');
  requireMatch(policy.ownerAddition.authorityId, ID, 'affected authority ID');
  const legacyPolicy = { version: 1, repository: policy.repository, revision: policy.revision,
    ownerAddition: { grade: policy.ownerAddition.grade, authorityPath: policy.ownerAddition.authorityPath } };
  validatePolicy(legacyPolicy);
  record(current, ['repository', 'baseSha', 'headSha', 'policyRevision', 'baseAuthority', 'headAuthority', 'changedFiles', 'tagRefOid', 'authoritySet'], 'v2 current state');
  const { authoritySet, ...legacyCurrent } = current;
  validateCurrent(legacyCurrent, legacyPolicy);
  validateMultiAuthorityProvenance(authoritySet);
  const affected = authoritySet.members.filter(member => member.repository === current.repository && member.path === current.baseAuthority.path);
  if (authoritySet.selfRepository !== current.repository || authoritySet.authorityRevision !== current.baseSha ||
      affected.length !== 1 || affected[0].id !== policy.ownerAddition.authorityId ||
      affected[0].id !== current.baseAuthority.id || affected[0].sha256 !== current.baseAuthority.sha256) {
    fail('complete selected set does not bind exactly the affected self authority.');
  }
  const addition = validateTag(tag, current, candidate => {
    record(candidate, ['version', 'repository', 'baseSha', 'headSha', 'policyRevision', 'policySha256', 'authoritySet', 'authority', 'missingDecision', 'purpose'], 'v2 AdditionRecord');
    record(candidate.authoritySet, ['manifestSha256', 'setDigest'], 'v2 AdditionRecord Authority Set');
    if (candidate.version !== 2 || candidate.policySha256 !== policy.sha256 ||
        candidate.authoritySet.manifestSha256 !== authoritySet.manifestSha256 ||
        candidate.authoritySet.setDigest !== authoritySet.setDigest) fail('v2 AdditionRecord policy or Authority Set binding differs.');
    const { policySha256, authoritySet: selectedSet, ...legacy } = candidate;
    validateAdditionRecord({ ...legacy, version: 1 }, legacyCurrent);
  });
  return Object.freeze({ version: 2, procedure: 'VALID_G0_OWNER_ADDITION', grade: 'G0',
    repository: current.repository, baseSha: current.baseSha, headSha: current.headSha,
    policyRevision: policy.revision, policySha256: policy.sha256, authoritySet,
    authorityId: current.baseAuthority.id, authorityPath: current.baseAuthority.path,
    previousAuthoritySha256: current.baseAuthority.sha256, newAuthoritySha256: current.headAuthority.sha256,
    missingDecisionId: addition.missingDecision.id, additionRecordSha256: digestOwnerDecisionAddition(addition),
    tagRef: tag.ref, tagObjectOid: tag.objectOid, principalAuthentication: 'not_verified',
    semanticEligibility: 'requires_separate_protected_review' });
}
