import { createHash } from 'node:crypto';
import { validateAuthoritySetDecision } from './authority-set.mjs';

const SHA = /^[a-f0-9]{40}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const REPOSITORY = /^[A-Za-z0-9][A-Za-z0-9-]{0,38}\/[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/;
function fail() { throw new Error('Multi-document Authority Set provenance is invalid or mismatched.'); }
function keys(value, expected) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      Object.keys(value).length !== expected.length || expected.some(key => !Object.hasOwn(value, key))) fail();
}

/** Validate same-run snapshot metadata, not independent acceptance evidence. */
export function validateMultiAuthorityProvenance(value) {
  keys(value, ['version', 'selfRepository', 'authorityRevision', 'manifestSha256', 'setDigest', 'members']);
  if (value.version !== 2 || !REPOSITORY.test(value.selfRepository) || !SHA.test(value.authorityRevision) ||
      !DIGEST.test(value.manifestSha256) || !DIGEST.test(value.setDigest) ||
      !Array.isArray(value.members) || !value.members.length || value.members.length > 32) fail();
  const ids = new Set();
  let total = 0;
  const records = value.members.map(member => {
    keys(member, ['id', 'repository', 'resolvedCommit', 'path', 'byteLength', 'sha256']);
    if (typeof member.id !== 'string' || !/^[a-z][a-z0-9-]{0,63}$/.test(member.id) || ids.has(member.id) ||
        typeof member.repository !== 'string' || !REPOSITORY.test(member.repository) || !SHA.test(member.resolvedCommit) ||
        typeof member.path !== 'string' || member.path.length > 240 ||
        !/^(?:[A-Za-z0-9._-]+\/)*[A-Za-z0-9._-]+\.md$/.test(member.path) ||
        member.path.split('/').some(part => part === '.' || part === '..') || !DIGEST.test(member.sha256) ||
        !Number.isSafeInteger(member.byteLength) || member.byteLength < 1 || member.byteLength > 262_144 ||
        (member.repository === value.selfRepository && member.resolvedCommit !== value.authorityRevision)) fail();
    ids.add(member.id);
    total += member.byteLength;
    return { id: member.id, repository: member.repository, resolvedCommit: member.resolvedCommit,
      path: member.path, byteLength: member.byteLength, sha256: member.sha256 };
  });
  if (total > 524_288 || createHash('sha256').update(JSON.stringify(records)).digest('hex') !== value.setDigest) fail();
  return value;
}

export function assertSameMultiAuthorityProvenance(actual, expected) {
  validateMultiAuthorityProvenance(actual);
  validateMultiAuthorityProvenance(expected);
  for (const key of ['selfRepository', 'authorityRevision', 'manifestSha256', 'setDigest']) {
    if (actual[key] !== expected[key]) fail();
  }
}

export function validateMultiAuthorityDecision(decision, provenance) {
  validateMultiAuthorityProvenance(provenance);
  validateAuthoritySetDecision(decision, provenance);
  if (decision.authoritySetDigest !== provenance.setDigest) fail();
  return decision;
}

export function multiAuthorityProvenance(materialized, repository, baseSha) {
  return validateMultiAuthorityProvenance({ version: 2, selfRepository: repository, authorityRevision: baseSha,
    manifestSha256: materialized.manifestSha256, setDigest: materialized.setDigest,
    members: materialized.members.map(({ content, ...member }) => member) });
}
