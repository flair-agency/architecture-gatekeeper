import { prepareAuthoritySet } from '../../../src/prepare-authority-set.mjs';
import { decodeLimits } from '../../../src/prepare-authority-set.mjs';
import type { AuthorityFetchRequest, AuthorityFetcher } from '../../../src/authority-validation/prepare-authority-set.mts';

prepareAuthoritySet({ selfRepository: 'owner/repo', selfRoot: 42, authorityRevision: 'a'.repeat(40), outputDir: '/tmp/out' });
prepareAuthoritySet({ selfRepository: 'owner/repo', selfRoot: '/workspace', authorityRevision: 'a'.repeat(40), outputDir: '/tmp/out', manifestBytes: 42 });
prepareAuthoritySet({ selfRepository: 'owner/repo', selfRoot: '/workspace', authorityRevision: 'a'.repeat(40), outputDir: '/tmp/out' }).then(({ provenance }) => {
  const numericDigest: number = provenance.setDigest;
  const memberByteLength: number = provenance.members[0].byteLength;
  void [numericDigest, memberByteLength];
});
const invalidRequest: AuthorityFetchRequest = { repository: 42, revision: 'a'.repeat(40), path: 'docs/parent.md', maxBytes: 1024 };
const invalidFetcher: AuthorityFetcher = (request: { repository: number; revision: string; path: string; maxBytes: number }) => ({
  repository: String(request.repository), resolvedCommit: request.revision, path: request.path, type: 'file', content: Buffer.alloc(0),
});
const immutableLimits = decodeLimits('eyJtYXhNYW5pZmVzdEJ5dGVzIjoxMCwibWF4TWVtYmVycyI6MSwibWF4RmlsZUJ5dGVzIjoxMCwibWF4VG90YWxCeXRlcyI6MTAsIm1heFByb21wdEJ5dGVzIjoxMH0=');
immutableLimits.maxManifestBytes = 10;
immutableLimits.maxMembers = 1;
immutableLimits.maxFileBytes = 10;
immutableLimits.maxTotalBytes = 10;
immutableLimits.maxPromptBytes = 10;
void [invalidRequest, invalidFetcher];
