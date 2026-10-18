import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('deinitializing old submodules prevents stale content after removed, renamed, and nested refreshes', t => {
  const root = mkdtempSync(join(tmpdir(), 'agk-submodule-refresh-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const child = join(root, 'child');
  const vendor = join(root, 'vendor');
  const repository = join(root, 'repository');
  const env = {
    ...process.env,
    GIT_ALLOW_PROTOCOL: 'file',
    GIT_AUTHOR_NAME: 'Architecture Gatekeeper test',
    GIT_AUTHOR_EMAIL: 'architecture-gatekeeper@example.invalid',
    GIT_COMMITTER_NAME: 'Architecture Gatekeeper test',
    GIT_COMMITTER_EMAIL: 'architecture-gatekeeper@example.invalid',
  };
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

test('deferred submodule materialization avoids obsolete remotes before selecting the refreshed tree', t => {
  const root = mkdtempSync(join(tmpdir(), 'agk-deferred-submodule-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const obsolete = join(root, 'obsolete-module');
  const unavailable = join(root, 'obsolete-module-unavailable');
  const selected = join(root, 'selected-module');
  const repository = join(root, 'repository');
  const workspace = join(root, 'workspace');
  const env = {
    ...process.env,
    GIT_ALLOW_PROTOCOL: 'file',
    GIT_AUTHOR_NAME: 'Architecture Gatekeeper test',
    GIT_AUTHOR_EMAIL: 'architecture-gatekeeper@example.invalid',
    GIT_COMMITTER_NAME: 'Architecture Gatekeeper test',
    GIT_COMMITTER_EMAIL: 'architecture-gatekeeper@example.invalid',
  };
  const git = (cwd, ...args) => {
    const result = spawnSync('git', args, { cwd, env, encoding: 'utf8', timeout: 30_000 });
    assert.equal(result.status, 0, `git ${args.join(' ')}: ${result.stderr || result.error?.message || ''}`);
    return result.stdout.trim();
  };
  const init = path => {
    mkdirSync(path, { recursive: true });
    git(path, 'init', '-q', '-b', 'main');
    git(path, 'config', 'user.name', 'Deferred submodule regression');
    git(path, 'config', 'user.email', 'deferred-submodule@example.invalid');
  };
  const commit = (cwd, message) => {
    git(cwd, 'add', '-A');
    git(cwd, 'commit', '-q', '-m', message);
  };

  init(obsolete);
  writeFileSync(join(obsolete, 'obsolete.txt'), 'old-only module\n');
  commit(obsolete, 'obsolete module');
  init(selected);
  writeFileSync(join(selected, 'selected.txt'), 'selected module\n');
  commit(selected, 'selected module');
  init(repository);
  git(repository, '-c', 'protocol.file.allow=always', 'submodule', 'add', '-q', obsolete, 'deps/obsolete');
  commit(repository, 'event tree references old module');
  const eventMerge = git(repository, 'rev-parse', 'HEAD');
  git(repository, 'rm', '-qf', 'deps/obsolete');
  git(repository, '-c', 'protocol.file.allow=always', 'submodule', 'add', '-q', selected, 'deps/current');
  commit(repository, 'candidate references current module');
  const candidate = git(repository, 'rev-parse', 'HEAD');

  // The old URL remains in the event tree but no longer resolves, modeling
  // a deleted or inaccessible historical module source.
  renameSync(obsolete, unavailable);
  git(root, '-c', 'protocol.file.allow=always', 'clone', '-q', repository, workspace);
  git(workspace, 'checkout', '--force', eventMerge);
  const eager = spawnSync('git', ['-c', 'protocol.file.allow=always', 'submodule', 'update', '--init', '--force', '--recursive'], {
    cwd: workspace, env, encoding: 'utf8', timeout: 30_000,
  });
  assert.notEqual(eager.status, 0, 'recursive materialization of the stale event tree fails when its old remote is unavailable');

  // Start cleanly as the initial actions/checkout does with submodules:false.
  // The selected immutable candidate remains fetchable and only its modules
  // are recursively materialized after the tree switch.
  rmSync(workspace, { recursive: true, force: true });
  git(root, '-c', 'protocol.file.allow=always', 'clone', '-q', repository, workspace);
  git(workspace, 'checkout', '--force', eventMerge);
  assert.equal(existsSync(join(workspace, 'deps/obsolete/obsolete.txt')), false,
    'nonrecursive initial checkout does not fetch the obsolete module');
  git(workspace, 'checkout', '--force', candidate);
  git(workspace, 'submodule', 'sync', '--recursive');
  git(workspace, '-c', 'protocol.file.allow=always', 'submodule', 'update', '--init', '--force', '--recursive');
  assert.equal(existsSync(join(workspace, 'deps/obsolete')), false, 'obsolete module path is not materialized');
  assert.equal(readFileSync(join(workspace, 'deps/current/selected.txt'), 'utf8'), 'selected module\n');
  assert.equal(git(workspace, 'status', '--porcelain'), '', 'selected checkout remains clean');
});
