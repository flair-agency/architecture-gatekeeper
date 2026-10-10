import { prepareAuthoritySet } from '../../../src/prepare-authority-set.mjs';

prepareAuthoritySet({ selfRepository: 'owner/repo', selfRoot: 42, authorityRevision: 'a'.repeat(40), outputDir: '/tmp/out' });
prepareAuthoritySet({ selfRepository: 'owner/repo', selfRoot: '/workspace', authorityRevision: 'a'.repeat(40), outputDir: '/tmp/out', manifestBytes: 42 });
prepareAuthoritySet({ selfRepository: 'owner/repo', selfRoot: '/workspace', authorityRevision: 'a'.repeat(40), outputDir: '/tmp/out' }).then(({ provenance }) => {
  const numericDigest: number = provenance.setDigest;
  const memberByteLength: number = provenance.members[0].byteLength;
  void [numericDigest, memberByteLength];
});
