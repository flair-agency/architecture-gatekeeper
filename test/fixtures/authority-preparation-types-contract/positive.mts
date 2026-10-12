import { decodeLimits, prepareAuthoritySet } from '../../../src/prepare-authority-set.mjs';
import type { AuthorityFetcher, AuthorityLimits, PrepareAuthoritySetInput, PreparedAuthoritySet } from '../../../src/authority-validation/prepare-authority-set.mts';

const limits = decodeLimits(Buffer.from(JSON.stringify({ maxManifestBytes: 10, maxMembers: 1, maxFileBytes: 10, maxTotalBytes: 10, maxPromptBytes: 10 })).toString('base64'));
const input: PrepareAuthoritySetInput = { selfRepository: 'owner/repo', selfRoot: '/workspace', authorityRevision: 'a'.repeat(40), outputDir: '/tmp/out', limits };
const prepareTyped: (input: PrepareAuthoritySetInput) => Promise<PreparedAuthoritySet> = prepareAuthoritySet;
const customFetcher: AuthorityFetcher = (request: { repository: string; revision: string; path: string; maxBytes: number }) => ({
  repository: request.repository,
  resolvedCommit: request.revision,
  path: request.path,
  type: 'file',
  content: Buffer.from('# external\n'),
});
const inputWithFetcher: PrepareAuthoritySetInput = { ...input, fetchExternal: customFetcher };
const preparedWithFetcher = prepareTyped(inputWithFetcher);
const immutableLimits: AuthorityLimits = decodeLimits(Buffer.from(JSON.stringify({ maxManifestBytes: 10, maxMembers: 1, maxFileBytes: 10, maxTotalBytes: 10, maxPromptBytes: 10 })).toString('base64'));
void immutableLimits.maxMembers;
const prepared = prepareTyped(input);
const bufferManifest: PrepareAuthoritySetInput = { ...input, manifestBytes: Buffer.from('{"version":1,"authorities":[]}') };
const stringManifest: PrepareAuthoritySetInput = { ...input, manifestBytes: JSON.stringify({ version: 1, authorities: [] }) };
const preparedFromBufferManifest = prepareTyped(bufferManifest);
const preparedFromStringManifest = prepareTyped(stringManifest);
prepared.then(({ provenance }) => {
  const version: number = provenance.version;
  const selfRepository: string = provenance.selfRepository;
  const authorityRevision: string = provenance.authorityRevision;
  const manifestSha256: string = provenance.manifestSha256;
  const setDigest: string = provenance.setDigest;
  const members: Array<{ id: string; repository: string; resolvedCommit: string; path: string; byteLength: unknown; sha256: string }> = provenance.members;
  void [version, selfRepository, authorityRevision, manifestSha256, setDigest, members];
});
void prepared;
void preparedFromBufferManifest;
void preparedFromStringManifest;
void preparedWithFetcher;
