import {
  computeOwnerAmendmentResultingAuthoritySet,
  deriveOwnerAmendmentGitChanges,
  type OwnerAmendmentGitChangesResult,
  type OwnerAmendmentResultingAuthoritySet,
  type SynchronousGitBlobReader,
  type SynchronousGitCommand,
} from '../../../src/owner-amendment-git-changes.mjs';

const runGit: SynchronousGitCommand = args => Buffer.from(args.includes('--binary') ? 'diff' : 'M\\0docs/architecture.md\\0');
const readBlob: SynchronousGitBlobReader = (revision, path) => Buffer.from(`${revision}:${path}`);
const changes = deriveOwnerAmendmentGitChanges({
  profile: 'completed-owner-decision-self-v1', repository: 'owner/repo',
  baseSha: 'a'.repeat(40), bSha: 'b'.repeat(40), targetPath: 'docs/architecture.md',
  selectedAuthorityBytes: Object.freeze({ base: Buffer.from('before'), head: Buffer.from('after') }),
  changedFiles: [{ status: 'modified', path: 'docs/architecture.md' }],
  authorityChanges: [{ path: 'docs/architecture.md', beforeBytes: Buffer.from('before'), afterBytes: Buffer.from('after') }],
  runGit, readBlob,
});
const blockChanges = deriveOwnerAmendmentGitChanges({
  profile: 'completed-block-v1', repository: 'owner/repo',
  baseSha: 'a'.repeat(40), bSha: 'b'.repeat(40), targetPath: 'docs/architecture.md',
  selectedAuthorityBytes: Object.freeze({ base: Buffer.from('before'), head: Buffer.from('after') }),
  runGit, readBlob,
});
const changesResult: OwnerAmendmentGitChangesResult = changes;
const change = changesResult.changes[0];
const observedDiff: Buffer = changesResult.diffBytes;
const observedBytes: Buffer = change.beforeBytes;
const authoritySet: OwnerAmendmentResultingAuthoritySet = computeOwnerAmendmentResultingAuthoritySet({
  members: Object.freeze([Object.freeze({ id: 'contract', repository: 'owner/repo', resolvedCommit: 'a'.repeat(40),
    path: 'docs/architecture.md', byteLength: 6, sha256: '0'.repeat(64), content: Buffer.from('before') })]),
  changes: changesResult.changes, repository: 'owner/repo', baseSha: 'a'.repeat(40),
});
const readonlyChanges = Object.freeze([Object.freeze({ path: 'docs/architecture.md',
  beforeBytes: Buffer.from('before'), afterBytes: Buffer.from('after') })]);
const readonlySet = computeOwnerAmendmentResultingAuthoritySet({
  members: Object.freeze([Object.freeze({ id: 'contract', repository: 'owner/repo', resolvedCommit: 'a'.repeat(40),
    path: 'docs/architecture.md', byteLength: 6, sha256: '0'.repeat(64), content: Buffer.from('before') })]),
  changes: readonlyChanges, repository: 'owner/repo', baseSha: 'a'.repeat(40),
});
const priorDigest: string = authoritySet.priorDigest;
void [observedDiff, observedBytes, priorDigest, readonlySet, blockChanges];
