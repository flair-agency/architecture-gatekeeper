import {
  computeOwnerAmendmentResultingAuthoritySet,
  deriveOwnerAmendmentGitChanges,
  type OwnerAmendmentGitChange,
  type OwnerAmendmentGitChangesResult,
  type OwnerAmendmentResultingAuthoritySet,
} from '../../../src/owner-amendment-git-changes.mjs';

const result = deriveOwnerAmendmentGitChanges({});
const mutable: OwnerAmendmentGitChangesResult = result;
mutable.changes = [];
const change: OwnerAmendmentGitChange = result.changes[0];
change.path = 'changed';
const set: OwnerAmendmentResultingAuthoritySet = computeOwnerAmendmentResultingAuthoritySet({});
set.priorDigest = 'changed';
const wrong: string = result.diffBytes;
deriveOwnerAmendmentGitChanges({
  profile: 'completed-block-v1', repository: 'owner/repo', baseSha: 'a'.repeat(40), bSha: 'b'.repeat(40),
  targetPath: 'docs/architecture.md', runGit: async () => Buffer.alloc(0), readBlob: () => Buffer.alloc(1),
});
deriveOwnerAmendmentGitChanges({ profile: 'unsupported', repository: 'owner/repo', baseSha: 'a'.repeat(40), bSha: 'b'.repeat(40), targetPath: 'docs/architecture.md', runGit: () => Buffer.alloc(1), readBlob: () => Buffer.alloc(1) });
deriveOwnerAmendmentGitChanges({ profile: 'completed-block-v1', repository: 'owner/repo', baseSha: 'a'.repeat(40), bSha: 'b'.repeat(40), targetPath: 'docs/architecture.md', runGit: () => Buffer.alloc(1), readBlob: async () => Buffer.alloc(1) });
const returnedPath: string = result.changes[0].path;
