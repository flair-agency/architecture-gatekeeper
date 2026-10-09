import test from 'node:test';
import assert from 'node:assert/strict';
import { matchesGitHubAssociatedRepository } from '../dist/github-associated-repository.mjs';
import { createGitHubCliRunner } from '../dist/github-cli-runner.mjs';

test('associated repository matching retains getter rereads, check order, and fallback behavior', () => {
  const reads = [];
  let fullNameReads = 0;
  const repo = {
    get full_name() {
      reads.push('full_name');
      fullNameReads += 1;
      return fullNameReads === 1 ? 'owner/repo' : 'changed/repo';
    },
    get id() { reads.push('id'); return 17; },
    get name() { reads.push('name'); return 'repo'; },
    get url() { reads.push('url'); return 'https://api.github.com/repos/owner/repo'; },
  };
  assert.equal(matchesGitHubAssociatedRepository(repo, { repository: 'owner/repo', repositoryId: 17 }), false);
  assert.deepEqual(reads, ['full_name', 'full_name']);

  reads.length = 0;
  assert.equal(matchesGitHubAssociatedRepository({
    get full_name() { reads.push('full_name'); return undefined; },
    get id() { reads.push('id'); return 17; },
    get name() { reads.push('name'); return 'repo'; },
    get url() { reads.push('url'); return 'https://api.github.com/repos/owner/repo'; },
  }, { repository: 'owner/repo', repositoryId: 17 }), true);
  assert.deepEqual(reads, ['full_name', 'id', 'name', 'url']);

  reads.length = 0;
  assert.equal(matchesGitHubAssociatedRepository({
    get full_name() { reads.push('full_name'); return undefined; },
    get id() { reads.push('id'); return 17; },
  }, { repository: 'owner/repo', repositoryId: Number.MAX_SAFE_INTEGER + 1 }), false);
  assert.deepEqual(reads, ['full_name']);
});

test('CLI runner spreads caller overrides and preserves output and thrown errors', () => {
  const calls = [];
  const runner = createGitHubCliRunner((file, args, options) => {
    calls.push({ file, args, options });
    return { opaque: true };
  }, 4096);
  const output = runner('gh', ['version'], { maxBuffer: 8192, encoding: 'buffer' });
  assert.deepEqual(output, { opaque: true });
  assert.deepEqual(calls, [{ file: 'gh', args: ['version'], options: { maxBuffer: 8192, encoding: 'buffer' } }]);

  const failure = new Error('exec failed');
  assert.throws(() => createGitHubCliRunner(() => { throw failure; })('gh', []), error => error === failure);
  assert.throws(() => createGitHubCliRunner(() => '', 0), {
    name: 'TypeError',
    message: 'GitHub CLI runner requires execFileSync and a positive default maxBuffer.',
  });
});
