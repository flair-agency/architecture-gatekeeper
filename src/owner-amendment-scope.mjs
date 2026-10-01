import { createHash } from 'node:crypto';

const SHA = /^[a-f0-9]{40}$/;
const ID = /^[a-z][a-z0-9-]{0,63}$/;
const PATH = /^(?:[A-Za-z0-9._-]+\/)*[A-Za-z0-9._-]+\.md$/;
const TRIGGER_PROFILES = new Set(['completed-block-v1', 'completed-owner-decision-self-v1']);
const digest = bytes => createHash('sha256').update(bytes).digest('hex');

/**
 * Check the authority-only scope of a self G0 amendment. BLOCK keeps its
 * original one-member/one-file restriction; OWNER_DECISION validates changes
 * against the complete previous Authority Set. The adapter must derive every
 * input from the previous protected base and exact B Git objects. This is
 * eligibility input, not an acceptance result.
 */
export function inspectOwnerAmendmentSelfScope({ policy, manifest, baseSha, headSha,
  changedFiles, baseAuthorityBytes, headAuthorityBytes }) {
  if (!SHA.test(baseSha ?? '') || !SHA.test(headSha ?? '') || baseSha === headSha) {
    throw new Error('Exact previous base and B revision are required.');
  }
  if (!policy || policy.ownerAmendmentVersion !== 1 || policy.ownerAmendmentGrade !== 'G0' ||
      policy.ownerAmendmentScope !== 'authority-only' ||
      !TRIGGER_PROFILES.has(policy.ownerAmendmentTriggerProfile)) {
    throw new Error('Previous protected policy did not select a supported self G0 amendment profile.');
  }
  const id = policy.ownerAmendmentAuthorityId;
  const path = policy.ownerAmendmentAuthorityPath;
  if (typeof id !== 'string' || !ID.test(id) || typeof path !== 'string' ||
      !PATH.test(path) || path.length > 240 || path.split('/').some(part => part === '.' || part === '..') ||
      !manifest || manifest.version !== 1 || !Array.isArray(manifest.authorities) ||
      !Array.isArray(changedFiles) || changedFiles.length === 0) {
    throw new Error('A selected self authority and changed authority paths are required.');
  }

  const selectedMembers = manifest.authorities.filter(member => member?.id === id && member?.path === path);
  if (selectedMembers.length !== 1 || selectedMembers[0].repository !== 'self' ||
      selectedMembers[0].revision !== 'authority-revision') {
    throw new Error('Selected target must be exactly one previous self authority member.');
  }

  if (policy.ownerAmendmentTriggerProfile === 'completed-block-v1') {
    if (manifest.authorities.length !== 1 || changedFiles.length !== 1 ||
        changedFiles[0]?.path !== path || changedFiles[0]?.status !== 'modified') {
      throw new Error('B must modify exactly the selected self authority member.');
    }
  } else {
    const previousSelfPaths = new Set(manifest.authorities
      .filter(member => member?.repository === 'self' && member?.revision === 'authority-revision')
      .map(member => member.path));
    if (new Set(changedFiles.map(file => file?.path)).size !== changedFiles.length ||
        !changedFiles.every(file => file && typeof file.path === 'string' &&
        previousSelfPaths.has(file.path) && file.status === 'modified') ||
        !changedFiles.some(file => file.path === path)) {
      throw new Error('B must modify the selected target and only previous self authority members.');
    }
  }
  if (!Buffer.isBuffer(baseAuthorityBytes) || !Buffer.isBuffer(headAuthorityBytes) ||
      !baseAuthorityBytes.length || !headAuthorityBytes.length ||
      baseAuthorityBytes.equals(headAuthorityBytes)) {
    throw new Error('B must change the selected authority bytes.');
  }
  return Object.freeze({ baseSha, headSha, authorityId: id, authorityPath: path,
    previousSha256: digest(baseAuthorityBytes), newSha256: digest(headAuthorityBytes) });
}
