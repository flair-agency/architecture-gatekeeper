import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isCanonicalRepositoryPath, readRegularGitSnapshot } from '../dist/legacy-git-snapshot.mjs';
import { assertGitHubOutputCliBoundary } from './fixtures/github-output-cli-boundary.mjs';

function committedFixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'legacy-snapshot-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', env: {
    ...process.env, GIT_AUTHOR_NAME: 'Test', GIT_AUTHOR_EMAIL: 'test@example.com',
    GIT_COMMITTER_NAME: 'Test', GIT_COMMITTER_EMAIL: 'test@example.com',
  } }).trim();
  git('init', '-q');
  mkdirSync(join(root, 'inputs'));
  const bytes = Buffer.from([0, 255, 128, 10]);
  writeFileSync(join(root, 'inputs/data.bin'), bytes);
  writeFileSync(join(root, 'inputs/executable'), 'executable bytes\n');
  writeFileSync(join(root, 'inputs/empty'), '');
  symlinkSync('data.bin', join(root, 'inputs/link'));
  git('add', '.');
  git('update-index', '--chmod=+x', 'inputs/executable');
  git('commit', '-qm', 'committed snapshots');
  return { root, git, bytes, commit: git('rev-parse', 'HEAD') };
}

test('committed snapshot retains exact binary bytes, Git object ID and digest despite working-tree changes', t => {
  const f = committedFixture(t);
  writeFileSync(join(f.root, 'inputs/data.bin'), 'uncommitted replacement');
  const snapshot = readRegularGitSnapshot({ root: f.root, commit: f.commit, path: 'inputs/data.bin', maxBytes: f.bytes.length });
  assert.deepEqual(Object.keys(snapshot), ['path', 'oid', 'bytes', 'sha256']);
  assert.equal(snapshot.path, 'inputs/data.bin');
  assert.equal(snapshot.oid, f.git('rev-parse', `${f.commit}:inputs/data.bin`));
  assert.ok(Buffer.isBuffer(snapshot.bytes));
  assert.deepEqual(snapshot.bytes, f.bytes);
  assert.equal(snapshot.sha256, createHash('sha256').update(f.bytes).digest('hex'));
  assert.equal(readRegularGitSnapshot({ root: f.root, commit: f.commit, path: 'inputs/executable' }).bytes.toString(), 'executable bytes\n');
  const materialized = join(f.root, 'materialized.bin');
  const output = join(f.root, 'runner-output');
  writeFileSync(output, 'previous=value\n');
  const args = [fileURLToPath(new URL('../dist/materialize-regular-git-snapshot.mjs', import.meta.url)),
    f.commit, 'inputs/data.bin', materialized];
  const env = { ...process.env, GITHUB_WORKSPACE: f.root, GITHUB_OUTPUT: output };
  execFileSync(process.execPath, args, { cwd: f.root, env });
  assert.deepEqual(readFileSync(materialized), f.bytes);
  assert.equal(readFileSync(output, 'utf8'), `previous=value\nsha256=${snapshot.sha256}\n`);
  assertGitHubOutputCliBoundary({ root: f.root, args, env, label: 'snapshot' });
  assert.deepEqual(readFileSync(materialized), f.bytes);
});

test('committed snapshot rejects nonregular, missing, empty and oversized inputs at the owning Git boundary', t => {
  const f = committedFixture(t);
  for (const path of ['inputs', 'inputs/link', 'inputs/missing']) {
    assert.throws(() => readRegularGitSnapshot({ root: f.root, commit: f.commit, path }), /Committed input is not a regular file/);
  }
  for (const [path, maxBytes] of [['inputs/empty', 4], ['inputs/data.bin', 3]]) {
    assert.throws(() => readRegularGitSnapshot({ root: f.root, commit: f.commit, path, maxBytes }), /Committed input has invalid size/);
  }
});

test('committed snapshot selection retains path and numeric bounds before invoking Git', () => {
  for (const path of ['inputs/data.bin', 'a'.repeat(240), '.hidden/file-name_1']) assert.equal(isCanonicalRepositoryPath(path), true);
  for (const path of [null, {}, 1, '', '../file', 'inputs/../file', './file', '/file', 'inputs//file', 'a'.repeat(241), 'file\0', 'file\\name']) {
    assert.equal(isCanonicalRepositoryPath(path), false);
  }
  const validShape = { root: 'nonexistent-checkout', commit: 'a'.repeat(40), path: 'inputs/data.bin' };
  for (const invalid of [{ root: '' }, { commit: '' }, { commit: 'A'.repeat(40) }, { path: '../file' },
    { maxBytes: 0 }, { maxBytes: -1 }, { maxBytes: 1.5 }, { maxBytes: NaN }, { maxBytes: Number.MAX_SAFE_INTEGER + 1 }]) {
    assert.throws(() => readRegularGitSnapshot({ ...validShape, ...invalid }), /Invalid committed snapshot selection/);
  }
});
