import { resolveOwnerAmendmentHandoffGitContext } from '../../../src/owner-amendment-handoff-git-context.mjs';
import { deriveOwnerAmendmentGitChanges } from '../../../src/owner-amendment-git-changes.mjs';

const baseSha = 'a'.repeat(40);
const headSha = 'b'.repeat(40);
const runGit = (_args: string[]) => Buffer.from('');
resolveOwnerAmendmentHandoffGitContext({ repository: 'owner/repo', headSha, runGit });
resolveOwnerAmendmentHandoffGitContext({ repository: 'owner/repo', baseSha, headSha });
const context = resolveOwnerAmendmentHandoffGitContext({ repository: 'owner/repo', baseSha, headSha, runGit });
context.changedFiles.push({ path: 'x.md', status: 'modified' });
context.changedFiles[0].status = 'modified';
context.policy.mode = 'local-only';
context.scope.authorityId = 'changed';
const assumedString: string = context.scope.headSha;
const promisedGit = (_args: string[]) => Promise.resolve(Buffer.from(''));
resolveOwnerAmendmentHandoffGitContext({ repository: 'owner/repo', baseSha, headSha, runGit: promisedGit });
const badCompose = deriveOwnerAmendmentGitChanges({ profile: 'completed-block-v1', repository: context.repository,
  baseSha, bSha: headSha, targetPath: context.scope.authorityPath,
  selectedAuthorityBytes: context.authorityBytes, runGit: promisedGit,
  readBlob: (_revision, _path) => Buffer.from('') });
void [assumedString, badCompose];
