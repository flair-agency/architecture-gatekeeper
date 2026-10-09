import { createHash } from 'node:crypto';

export type OwnerAmendmentSelfScopeResult = Readonly<{ baseSha: unknown; headSha: unknown; authorityId: string; authorityPath: string; previousSha256: string; newSha256: string }>;

const SHA = /^[a-f0-9]{40}$/;
const ID = /^[a-z][a-z0-9-]{0,63}$/;
const PATH = /^(?:[A-Za-z0-9._-]+\/)*[A-Za-z0-9._-]+\.md$/;
const TRIGGER_PROFILES = new Set(['completed-block-v1', 'completed-owner-decision-self-v1']);
// Access views preserve original property reads and coercions; they are not source validation.
type PolicyView = { ownerAmendmentVersion: unknown; ownerAmendmentGrade: unknown; ownerAmendmentScope: unknown; ownerAmendmentTriggerProfile: unknown; ownerAmendmentAuthorityId: unknown; ownerAmendmentAuthorityPath: unknown };
type ManifestView = { version: unknown; authorities: unknown };
type MemberView = { id?: unknown; path?: unknown; repository?: unknown; revision?: unknown };
type ChangedFileView = { path?: unknown; status?: unknown };
type ScopeInput = { policy: unknown; manifest: unknown; baseSha: unknown; headSha: unknown; changedFiles: unknown; baseAuthorityBytes: unknown; headAuthorityBytes: unknown };
const digest = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');

/**
 * Check the authority-only scope of a self G0 amendment. BLOCK keeps its
 * original one-member/one-file restriction; OWNER_DECISION validates changes
 * against the complete previous Authority Set. The adapter must derive every
 * input from the previous protected base and exact B Git objects. This is
 * eligibility input, not an acceptance result.
 */
export function inspectOwnerAmendmentSelfScope({ policy, manifest, baseSha, headSha,
  changedFiles, baseAuthorityBytes, headAuthorityBytes }: ScopeInput): OwnerAmendmentSelfScopeResult {
  if (!SHA.test((baseSha ?? '') as string) || !SHA.test((headSha ?? '') as string) || baseSha === headSha) {
    throw new Error('Exact previous base and B revision are required.');
  }
  if (!policy || (policy as PolicyView).ownerAmendmentVersion !== 1 || (policy as PolicyView).ownerAmendmentGrade !== 'G0' ||
      (policy as PolicyView).ownerAmendmentScope !== 'authority-only' ||
      !TRIGGER_PROFILES.has((policy as PolicyView).ownerAmendmentTriggerProfile as string)) {
    throw new Error('Previous protected policy did not select a supported self G0 amendment profile.');
  }
  const id = (policy as PolicyView).ownerAmendmentAuthorityId;
  const path = (policy as PolicyView).ownerAmendmentAuthorityPath;
  if (typeof id !== 'string' || !ID.test(id) || typeof path !== 'string' ||
      !PATH.test(path) || path.length > 240 || path.split('/').some(part => part === '.' || part === '..') ||
      !manifest || (manifest as ManifestView).version !== 1 || !Array.isArray((manifest as ManifestView).authorities) ||
      !Array.isArray(changedFiles) || (changedFiles as unknown[]).length === 0) {
    throw new Error('A selected self authority and changed authority paths are required.');
  }

  const selectedMembers = ((manifest as ManifestView).authorities as unknown[]).filter((member: unknown) => (member as MemberView | null)?.id === id && (member as MemberView | null)?.path === path);
  if (selectedMembers.length !== 1 || (selectedMembers[0] as MemberView).repository !== 'self' ||
      (selectedMembers[0] as MemberView).revision !== 'authority-revision') {
    throw new Error('Selected target must be exactly one previous self authority member.');
  }

  if ((policy as PolicyView).ownerAmendmentTriggerProfile === 'completed-block-v1') {
    if (((manifest as ManifestView).authorities as unknown[]).length !== 1 || (changedFiles as unknown[]).length !== 1 ||
        ((changedFiles as unknown[])[0] as ChangedFileView | null | undefined)?.path !== path || ((changedFiles as unknown[])[0] as ChangedFileView | null)?.status !== 'modified') {
      throw new Error('B must modify exactly the selected self authority member.');
    }
  } else {
    const previousSelfPaths = new Set(((manifest as ManifestView).authorities as unknown[])
      .filter((member: unknown) => (member as MemberView | null)?.repository === 'self' && (member as MemberView | null)?.revision === 'authority-revision')
      .map((member: unknown) => (member as MemberView).path));
    if (new Set((changedFiles as unknown[]).map((file: unknown) => (file as ChangedFileView | null)?.path)).size !== (changedFiles as unknown[]).length ||
        !((changedFiles as unknown[]).every((file: unknown) => file && typeof (file as ChangedFileView).path === 'string' &&
        previousSelfPaths.has((file as ChangedFileView).path) && (file as ChangedFileView).status === 'modified')) ||
        !((changedFiles as unknown[]).some((file: unknown) => (file as ChangedFileView).path === path))) {
      throw new Error('B must modify the selected target and only previous self authority members.');
    }
  }
  if (!Buffer.isBuffer(baseAuthorityBytes) || !Buffer.isBuffer(headAuthorityBytes) ||
      !(baseAuthorityBytes as Buffer).length || !(headAuthorityBytes as Buffer).length ||
      (baseAuthorityBytes as Buffer).equals(headAuthorityBytes as Buffer)) {
    throw new Error('B must change the selected authority bytes.');
  }
  return Object.freeze({ baseSha, headSha, authorityId: id, authorityPath: path,
    previousSha256: digest(baseAuthorityBytes as Buffer), newSha256: digest(headAuthorityBytes as Buffer) });
}
