#!/usr/bin/env node
import { appendFileSync, lstatSync, mkdtempSync, realpathSync, renameSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { spawnSync } from 'node:child_process';

const allowedNames = new Set([
  '.architecture-gatekeeper-runtime',
  '.architecture-gatekeeper-validation-runtime',
]);

function fail(message) {
  console.error(`Protected runtime relocation failed: ${message}`);
  process.exit(1);
}

function git(root, ...args) {
  const result = spawnSync('git', ['--no-replace-objects', ...args], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' },
  });
  if (result.status !== 0) fail(`git ${args.join(' ')} failed: ${result.stderr.trim()}`);
  return result.stdout.trim();
}

function assertClean(root) {
  const status = git(root, 'status', '--porcelain=v1', '--untracked-files=all', '--ignored=matching');
  if (status !== '') fail('pinned checkout is not clean, including ignored and untracked files');
}

function isWithin(path, parent) {
  const rel = relative(parent, path);
  return rel === '' || (rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
}

const name = process.argv[2];
const expectedSha = process.env.EXPECTED_RUNTIME_SHA;
if (!allowedNames.has(name)) fail('source child name is not allowed');
if (!/^[a-f0-9]{40}$/.test(expectedSha ?? '')) fail('expected workflow SHA is malformed');
if (!process.env.GITHUB_WORKSPACE || !process.env.RUNNER_TEMP || !process.env.GITHUB_ENV) fail('required GitHub paths are missing');
for (const value of [process.env.GITHUB_WORKSPACE, process.env.RUNNER_TEMP, process.env.GITHUB_ENV]) {
  if (/[\r\n]/.test(value)) fail('GitHub paths cannot contain newlines');
}

const workspaceInput = resolve(process.env.GITHUB_WORKSPACE);
const workspaceStat = lstatSync(workspaceInput);
if (!workspaceStat.isDirectory() || workspaceStat.isSymbolicLink()) fail('workspace is not a real directory');
const workspace = realpathSync(workspaceInput);
if (workspace !== workspaceInput) fail('workspace path is not canonical');

const sourceInput = join(workspace, name);
const sourceStat = lstatSync(sourceInput);
if (!sourceStat.isDirectory() || sourceStat.isSymbolicLink()) fail('source is not a real direct-child directory');
const source = realpathSync(sourceInput);
if (dirname(source) !== workspace || basename(source) !== name) fail('source is not the exact physical workspace child');
const metadataInput = join(source, '.git');
const metadataStat = lstatSync(metadataInput);
if (!metadataStat.isDirectory() || metadataStat.isSymbolicLink()) fail('Git metadata is not a real checkout directory');
if (realpathSync(metadataInput) !== metadataInput) fail('Git metadata path is not canonical');
const head = git(source, 'rev-parse', '--verify', 'HEAD^{commit}');
if (head !== expectedSha) fail('pinned checkout HEAD does not match job.workflow_sha');
const tree = git(source, 'rev-parse', '--verify', 'HEAD^{tree}');
if (!/^[a-f0-9]{40}$/.test(tree)) fail('pinned checkout tree identity is malformed');
if (git(source, 'rev-parse', '--show-toplevel') !== source) fail('source is not its own Git top-level');
assertClean(source);

const tempInput = resolve(process.env.RUNNER_TEMP);
const tempStat = lstatSync(tempInput);
if (!tempStat.isDirectory() || tempStat.isSymbolicLink()) fail('RUNNER_TEMP is not a real directory');
const runnerTemp = realpathSync(tempInput);
if (runnerTemp !== tempInput) fail('RUNNER_TEMP path is not canonical');
const parent = realpathSync(mkdtempSync(join(runnerTemp, 'gatekeeper-runtime-')));
if (dirname(parent) !== runnerTemp || isWithin(parent, workspace) || isWithin(workspace, parent)) fail('fresh runner temp directory is not a direct child disjoint from workspace');
const destination = join(parent, name);
if (/[\r\n]/.test(destination)) fail('destination path contains a newline');
if (isWithin(destination, workspace) || isWithin(workspace, destination)) fail('destination is not physically disjoint from workspace');

renameSync(source, destination);
const moved = realpathSync(destination);
if (moved !== destination || isWithin(moved, workspace) || isWithin(workspace, moved)) fail('moved checkout is not physically external');
const movedMetadata = join(moved, '.git');
const movedMetadataStat = lstatSync(movedMetadata);
if (!movedMetadataStat.isDirectory() || movedMetadataStat.isSymbolicLink() || realpathSync(movedMetadata) !== movedMetadata) fail('moved Git metadata is not a real checkout directory');
if (git(moved, 'rev-parse', '--show-toplevel') !== moved) fail('moved checkout Git top-level changed');
if (git(moved, 'rev-parse', '--verify', 'HEAD^{commit}') !== head) fail('moved checkout HEAD changed');
if (git(moved, 'rev-parse', '--verify', 'HEAD^{tree}') !== tree) fail('moved checkout tree changed');
assertClean(moved);
appendFileSync(process.env.GITHUB_ENV, `GATEKEEPER_RUNTIME_ROOT=${moved}\n`, { encoding: 'utf8', mode: 0o600 });
