import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('deinitializing old submodules prevents stale content after removed, renamed, and nested refreshes', t => {
  const root = mkdtempSync(join(tmpdir(), 'agk-submodule-refresh-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const child = join(root, 'child');
  const vendor = join(root, 'vendor');
  const repository = join(root, 'repository');
  const env = { ...process.env, GIT_ALLOW_PROTOCOL: 'file' };
  const git = (cwd, ...args) => {
    const result = spawnSync('git', args, { cwd, env, encoding: 'utf8', timeout: 30_000 });
    assert.equal(result.status, 0, `git ${args.join(' ')}: ${result.stderr || result.error?.message || ''}`);
    return result.stdout.trim();
  };
  const init = path => {
    mkdirSync(path, { recursive: true });
    git(path, 'init', '-q', '-b', 'main');
    git(path, 'config', 'user.name', 'Submodule refresh regression');
    git(path, 'config', 'user.email', 'submodule-refresh@example.invalid');
  };
  const commit = (cwd, message) => {
    git(cwd, 'add', '-A');
    git(cwd, 'commit', '-q', '-m', message);
  };

  init(child);
  writeFileSync(join(child, 'payload.txt'), 'submodule payload\n');
  commit(child, 'child module');

  init(vendor);
  git(vendor, 'config', 'receive.denyCurrentBranch', 'updateInstead');
  git(vendor, '-c', 'protocol.file.allow=always', 'submodule', 'add', '-q', child, 'children/old');
  commit(vendor, 'vendor with old nested module');

  init(repository);
  for (const path of ['deps/removed', 'deps/renamed']) {
    git(repository, '-c', 'protocol.file.allow=always', 'submodule', 'add', '-q', child, path);
  }
  git(repository, '-c', 'protocol.file.allow=always', 'submodule', 'add', '-q', vendor, 'deps/vendor');
  commit(repository, 'initial module layout');
  const initial = git(repository, 'rev-parse', 'HEAD');

  // Candidate removes one module, renames another, and updates a selected
  // module whose nested submodule is renamed. These are real gitlinks and
  // .gitmodules records, not mocked filesystem entries.
  git(repository, 'rm', '-qf', 'deps/removed');
  git(repository, 'submodule', 'deinit', '--force', 'deps/renamed');
  git(repository, 'rm', '-qf', 'deps/renamed');
  git(repository, '-c', 'protocol.file.allow=always', 'submodule', 'add', '-q', child, 'deps/new');
  const vendorPath = join(repository, 'deps/vendor');
  git(vendorPath, 'submodule', 'deinit', '--force', 'children/old');
  git(vendorPath, 'rm', '-qf', 'children/old');
  git(vendorPath, '-c', 'protocol.file.allow=always', 'submodule', 'add', '-q', child, 'children/new');
  commit(vendorPath, 'rename nested module');
  git(vendorPath, 'push', '-q', 'origin', 'HEAD:refs/heads/main');
  commit(repository, 'remove, rename, and update modules');
  const candidate = git(repository, 'rev-parse', 'HEAD');
  const workspace = join(root, 'workspace');
  git(root, '-c', 'protocol.file.allow=always', 'clone', '-q', repository, workspace);
  git(workspace, 'checkout', '--force', initial);
  git(workspace, '-c', 'protocol.file.allow=always', 'submodule', 'update', '--init', '--force', '--recursive');

  const checkout = ({ deinit }) => {
    git(workspace, 'clean', '-ffdx');
    git(workspace, 'reset', '--hard', 'HEAD');
    if (deinit) git(workspace, 'submodule', 'deinit', '--force', '--all');
    git(workspace, 'checkout', '--force', candidate);
    git(workspace, 'submodule', 'sync', '--recursive');
    git(workspace, '-c', 'protocol.file.allow=always', 'submodule', 'update', '--init', '--force', '--recursive');
  };

  // Establish the vulnerable transition first: ordinary checkout clean/reset
  // leaves removed gitlink directories behind when changing to the new tree.
  checkout({ deinit: false });
  assert.ok(existsSync(join(workspace, 'deps/removed/payload.txt')), 'removed module content remains without deinit');
  assert.ok(existsSync(join(workspace, 'deps/renamed/payload.txt')), 'renamed module content remains without deinit');
  assert.ok(existsSync(join(workspace, 'deps/vendor/children/old/payload.txt')),
    'removed nested module content remains without deinit');

  // Reset to the old snapshot, then exercise the recovery workflow's cleanup
  // before the refreshed HEAD switch and recursive target materialization.
  git(workspace, 'submodule', 'deinit', '--force', '--all');
  git(workspace, 'checkout', '--force', initial);
  git(workspace, '-c', 'protocol.file.allow=always', 'submodule', 'update', '--init', '--force', '--recursive');
  checkout({ deinit: true });
  assert.equal(existsSync(join(workspace, 'deps/removed')), false, 'removed module worktree is absent');
  assert.equal(existsSync(join(workspace, 'deps/renamed')), false, 'renamed old worktree is absent');
  assert.equal(existsSync(join(workspace, 'deps/vendor/children/old')), false, 'nested old worktree is absent');
  assert.equal(readFileSync(join(workspace, 'deps/new/payload.txt'), 'utf8'), 'submodule payload\n');
  assert.equal(readFileSync(join(workspace, 'deps/vendor/children/new/payload.txt'), 'utf8'), 'submodule payload\n');
  assert.equal(git(workspace, 'status', '--porcelain'), '', 'refreshed checkout is clean');
});
