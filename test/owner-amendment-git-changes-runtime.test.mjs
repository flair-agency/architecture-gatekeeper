import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveOwnerAmendmentGitChanges } from '../dist/owner-amendment-git-changes.mjs';

test('retains the final accessor path read without narrowing its returned value', () => {
  const baseBytes = Buffer.from('base authority');
  const headBytes = Buffer.from('head authority');
  const changedPath = Symbol('final path read');
  let pathReads = 0;
  const authorityChange = {
    get path() {
      pathReads += 1;
      return pathReads < 6 ? 'docs/architecture.md' : changedPath;
    },
    beforeBytes: baseBytes,
    afterBytes: headBytes,
  };
  const result = deriveOwnerAmendmentGitChanges({
    profile: 'completed-owner-decision-self-v1',
    repository: 'owner/repo',
    baseSha: 'a'.repeat(40),
    bSha: 'b'.repeat(40),
    targetPath: 'docs/architecture.md',
    selectedAuthorityBytes: { base: baseBytes, head: headBytes },
    changedFiles: [{ status: 'modified', path: 'docs/architecture.md' }],
    authorityChanges: [authorityChange],
    runGit: args => Buffer.from(args.includes('--name-status') ? 'M\0docs/architecture.md\0' : 'diff'),
    readBlob: (revision, path) => {
      assert.equal(path, 'docs/architecture.md');
      return revision === 'a'.repeat(40) ? baseBytes : headBytes;
    },
  });

  assert.equal(result.changes[0].path, changedPath);
  assert.equal(pathReads, 6);
});
