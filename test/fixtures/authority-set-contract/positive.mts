import { execFileSync } from 'node:child_process';
import {
  MULTI_AUTHORITY_PROFILE,
  materializeAuthoritySet,
  parseAuthorityManifest,
  readCommittedAuthorityFile,
  validateAuthorityLimits,
  validateAuthoritySetDecision,
  type AuthorityFetchRequest,
  type AuthorityManifest,
  type AuthorityProfile,
  type AuthoritySetFetcher,
  type MaterializeAuthoritySetInput,
} from '../../../src/authority-validation/authority-set.mts';

const limits = validateAuthorityLimits({ maxManifestBytes: 4096, maxMembers: 4, maxFileBytes: 1024,
  maxTotalBytes: 2048, maxPromptBytes: 8192 }, MULTI_AUTHORITY_PROFILE);
const limit: number = limits.maxFileBytes;
void limit;
const profile: AuthorityProfile = MULTI_AUTHORITY_PROFILE;
void profile;

const manifest = parseAuthorityManifest(Buffer.from(JSON.stringify({ version: 1, authorities: [
  { id: 'architecture', repository: 'self', revision: 'authority-revision', path: 'docs/architecture.md' },
]})), limits);
manifest.version = 2;
manifest.authorities.push({ id: 'extra', repository: 'org/repo', revision: 'a'.repeat(40), path: 'docs/extra.md' });

const fetcher: AuthoritySetFetcher = (request: AuthorityFetchRequest) => {
  const repository: string = request.repository;
  const revision: string = request.revision;
  const maximum: number = request.maxBytes;
  void repository;
  void revision;
  void maximum;
  return {
    then<TResult1 = unknown, TResult2 = never>(
      onfulfilled?: ((value: unknown) => TResult1 | PromiseLike<TResult1>) | null,
      _onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
    ): PromiseLike<TResult1 | TResult2> {
      return Promise.resolve(onfulfilled?.({ externalResponse: 'remains unknown' }) as TResult1);
    },
  };
};
const minimalInput: MaterializeAuthoritySetInput = {
  manifestBytes: Buffer.from('{}'), limits, selfRepository: 'org/repo', selfRoot: '.',
  authorityRevision: 'a'.repeat(40), fetchExternal: fetcher,
};
const pending = materializeAuthoritySet(minimalInput);
void pending.then(result => {
  result.members.push({ id: 'x', repository: 'org/repo', resolvedCommit: 'a'.repeat(40), path: 'x.md',
    byteLength: 'caller-visible reread', sha256: '', content: '' });
  result.prompt = 'caller may mutate constructed result';
});

const jsonDecision: unknown = validateAuthoritySetDecision(
  { decision: 'PASS', authorityIds: ['architecture'] }, { members: [{ id: 'architecture' }] });
void jsonDecision;

const nativeExec: typeof execFileSync = execFileSync;
void nativeExec;
const directRead = readCommittedAuthorityFile('..', 'a'.repeat(40), 'docs/architecture.md', 4096);
const content: Buffer = directRead;
void content;

const standardPromiseCallback: NonNullable<MaterializeAuthoritySetInput['fetchExternal']> = async request => ({
  repository: request.repository, resolvedCommit: request.revision, path: request.path,
  type: 'file', content: Buffer.from('body'),
});
void standardPromiseCallback;
