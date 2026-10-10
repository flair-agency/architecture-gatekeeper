import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { prepareReviewFileContext } from '../src/review-inputs/prepare-review-file-context.mts';

function git(root, ...args) {
  return execFileSync('git', ['--no-replace-objects', ...args], { cwd: root, encoding: 'utf8', env: {
    ...process.env, GIT_AUTHOR_NAME: 'Test', GIT_AUTHOR_EMAIL: 'test@example.com',
    GIT_COMMITTER_NAME: 'Test', GIT_COMMITTER_EMAIL: 'test@example.com',
  } }).trim();
}

function reviewFixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'review-context-getter-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  git(root, 'init', '-q');
  writeFileSync(join(root, 'changed.txt'), 'base\n');
  writeFileSync(join(root, 'reference.md'), 'protected\n');
  git(root, 'add', '.');
  git(root, 'commit', '-qm', 'base');
  git(root, 'checkout', '-qb', 'candidate');
  writeFileSync(join(root, 'changed.txt'), 'candidate\n');
  git(root, 'add', '.');
  git(root, 'commit', '-qm', 'candidate');
  const headSha = git(root, 'rev-parse', 'HEAD');
  git(root, 'checkout', '-q', '-');
  writeFileSync(join(root, 'target.txt'), 'target\n');
  git(root, 'add', '.');
  git(root, 'commit', '-qm', 'target');
  const baseSha = git(root, 'rev-parse', 'HEAD');
  git(root, 'merge', '--no-ff', '-qm', 'review merge', 'candidate');
  return { root, baseSha, headSha, reviewedSha: git(root, 'rev-parse', 'HEAD') };
}

test('returns the original reread limit values after validating their earlier getter values', t => {
  const context = reviewFixture(t);
  const observed = {};
  const reads = {};
  for (const [name, initial, later] of [
    ['maxFiles', 8, '8'], ['maxFileBytes', 4096, 4097], ['maxTotalBytes', 20_000, '20000'],
  ]) {
    reads[name] = 0;
    Object.defineProperty(observed, name, { enumerable: true, get() {
      reads[name] += 1;
      return reads[name] === 1 ? initial : later;
    } });
  }

  const packet = prepareReviewFileContext({ ...context, referencePaths: ['reference.md'], limits: observed });

  assert.deepEqual(reads, { maxFiles: 2, maxFileBytes: 2, maxTotalBytes: 2 });
  assert.deepEqual(packet.limits, { maxFiles: '8', maxFileBytes: 4097, maxTotalBytes: '20000' });
});
