import type { AuthorityManifest } from '../authority-validation/authority-set.mts';

/** Select the existing single-self-member G0 authority after parsing its manifest. */
export function selectSingleOwnerAdditionMember(manifest: AuthorityManifest, authorityPath: unknown): string {
  const member = manifest.authorities[0];
  if (manifest.authorities.length !== 1 || member.repository !== 'self' ||
      member.revision !== 'authority-revision' || member.path !== authorityPath) {
    throw new Error('G0 owner addition requires the selected Authority Set to contain only its affected self member.');
  }
  return member.id;
}
