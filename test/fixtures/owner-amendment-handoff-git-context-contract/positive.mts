import { resolveOwnerAmendmentHandoffGitContext, type OwnerAmendmentHandoffGitContext } from '../../../src/owner-amendment-handoff-git-context.mjs';
import { deriveOwnerAmendmentGitChanges } from '../../../src/owner-amendment-git-changes.mjs';

const baseSha = 'a'.repeat(40);
const headSha = 'b'.repeat(40);
const runGit = (_args: string[]) => Buffer.from('');
const context: OwnerAmendmentHandoffGitContext = resolveOwnerAmendmentHandoffGitContext({
  repository: 'owner/repo', baseSha, headSha, runGit,
});
const withBranch = resolveOwnerAmendmentHandoffGitContext({ repository: 'owner/repo', baseSha, headSha, baseBranch: 'main', runGit });
const copiedBytes: Buffer = context.policyBytes;
copiedBytes[0] = 1;
context.authorityBytes.base[0] = 1;
if (context.authorityChanges) context.authorityChanges[0].beforeBytes[0] = 1;
context.changedFiles[0].path.toUpperCase();
context.scope.authorityId.toUpperCase();
const unknownRevision: unknown = context.scope.baseSha;
const parsedField: unknown = context.parsedPolicy['unrecognized'];

if (context.authorityChanges) {
  const composed = deriveOwnerAmendmentGitChanges({ profile: 'completed-owner-decision-self-v1',
    repository: context.repository, baseSha: context.baseSha, bSha: context.headSha,
    targetPath: context.scope.authorityPath, selectedAuthorityBytes: context.authorityBytes,
    changedFiles: context.changedFiles, authorityChanges: context.authorityChanges, runGit,
    readBlob: (_revision, _path) => Buffer.from('') });
  void composed;
}
void [withBranch, unknownRevision, parsedField];
