import {
  MULTI_AUTHORITY_PROFILE,
  type MaterializedAuthoritySetMember,
  readCommittedAuthorityFile,
  validateAuthorityLimits,
  validateAuthoritySetDecision,
  type AuthorityFetchRequest,
  type AuthoritySetFetcher,
  type MaterializeAuthoritySetInput,
} from '../../../src/authority-validation/authority-set.mts';

const limits = validateAuthorityLimits({ maxManifestBytes: 4096, maxMembers: 4, maxFileBytes: 1024,
  maxTotalBytes: 2048, maxPromptBytes: 8192 });
limits.maxMembers = 2;

const request: AuthorityFetchRequest = { repository: 'org/repo', revision: 'a'.repeat(40), path: 'a.md' };
void request;

const tooNarrow: AuthoritySetFetcher = (input: { repository: 'org/repo'; revision: string; path: string; maxBytes: number }) => ({
  repository: input.repository, resolvedCommit: input.revision, path: input.path,
  type: 'file', content: Buffer.alloc(input.maxBytes),
});
void tooNarrow;

const observed: 'PASS' = validateAuthoritySetDecision({ decision: 'PASS', authorityIds: [] }, { members: [{ id: 'x' }] });
void observed;

const asyncReader: typeof readCommittedAuthorityFile = async () => Buffer.from('bytes');
void asyncReader;

const malformedInput: MaterializeAuthoritySetInput = {
  manifestBytes: Buffer.alloc(0), limits: {}, selfRepository: 'org/repo', selfRoot: '.',
  authorityRevision: 'a'.repeat(40), profile: MULTI_AUTHORITY_PROFILE,
};
void malformedInput;

declare const materializedMember: MaterializedAuthoritySetMember;
const assumedByteLength: number = materializedMember.byteLength;
void assumedByteLength;
