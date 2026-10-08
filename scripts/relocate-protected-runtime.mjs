#!/usr/bin/env node
import { lstatSync, mkdtempSync, realpathSync, renameSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

function fail(message) { console.error(`Protected runtime relocation failed: ${message}`); process.exit(1); }
function git(root, ...args) {
  const result = spawnSync('git', ['--no-replace-objects', ...args], { cwd: root, encoding: 'utf8', env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' } });
  if (result.status !== 0) fail(`git ${args.join(' ')} failed: ${result.stderr.trim()}`);
  return result.stdout.trim();
}
function assertClean(root) {
  if (git(root, 'status', '--porcelain=v1', '--untracked-files=all', '--ignored=matching') !== '') fail('pinned checkout is not clean, including ignored and untracked files');
}
function isWithin(path, parent) {
  const rel = relative(parent, path);
  return rel === '' || (rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
}

const helperPath = fileURLToPath(import.meta.url);
const scripts = dirname(helperPath);
const source = dirname(scripts);
const sourceName = basename(source);
let name;
if (sourceName === '.architecture-gatekeeper-runtime') name = '.architecture-gatekeeper-runtime';
else if (sourceName === '.architecture-gatekeeper-validation-runtime') name = '.architecture-gatekeeper-validation-runtime';
else fail('helper is not in a fixed pinned checkout');
const workspace = dirname(source);
const expectedSha = process.env.EXPECTED_RUNTIME_SHA;
if ([helperPath, scripts, source, workspace].some(value => /[\u0000-\u001f\u007f]/.test(value))) fail('physical source paths contain control characters');
if (scripts !== join(source, 'scripts') || helperPath !== join(scripts, 'relocate-protected-runtime.mjs')) fail('helper is not at an allowed pinned checkout location');
if (process.argv.length !== 3 || process.argv[2] !== name) fail('runtime argument does not match the physical checkout name');
if (!/^[a-f0-9]{40}$/.test(expectedSha ?? '')) fail('expected workflow SHA is malformed');
if (typeof process.env.GITHUB_WORKSPACE !== 'string' || typeof process.env.RUNNER_TEMP !== 'string' || /[\u0000-\u001f\u007f]/.test(process.env.GITHUB_WORKSPACE) || /[\u0000-\u001f\u007f]/.test(process.env.RUNNER_TEMP)) fail('required GitHub paths are missing or malformed');

const workspaceInput = process.env.GITHUB_WORKSPACE;
if (workspaceInput !== workspace || realpathSync(workspace) !== workspace) fail('GITHUB_WORKSPACE does not match the physical checkout parent');
const workspaceStat = lstatSync(workspace);
if (!workspaceStat.isDirectory() || workspaceStat.isSymbolicLink()) fail('workspace is not a real directory');
const scriptsStat = lstatSync(scripts), helperStat = lstatSync(helperPath);
if (!scriptsStat.isDirectory() || scriptsStat.isSymbolicLink() || realpathSync(scripts) !== scripts || !helperStat.isFile() || helperStat.isSymbolicLink() || helperStat.nlink !== 1 || realpathSync(helperPath) !== helperPath) fail('helper and scripts must have their fixed physical locations');
const sourceStat = lstatSync(source);
if (!sourceStat.isDirectory() || sourceStat.isSymbolicLink()) fail('source is not a real direct-child directory');
if (realpathSync(source) !== source || dirname(source) !== workspace) fail('source is not the exact physical workspace child');
const metadataInput = join(source, '.git');
const metadataStat = lstatSync(metadataInput);
if (!metadataStat.isDirectory() || metadataStat.isSymbolicLink() || realpathSync(metadataInput) !== metadataInput) fail('Git metadata is not a real canonical checkout directory');
const head = git(source, 'rev-parse', '--verify', 'HEAD^{commit}');
if (head !== expectedSha) fail('pinned checkout HEAD does not match job.workflow_sha');
const tree = git(source, 'rev-parse', '--verify', 'HEAD^{tree}');
if (!/^[a-f0-9]{40}$/.test(tree)) fail('pinned checkout tree identity is malformed');
if (git(source, 'rev-parse', '--show-toplevel') !== source) fail('source is not its own Git top-level');
assertClean(source);

const expectedTemp = join(dirname(dirname(workspace)), '_temp');
const tempInput = process.env.RUNNER_TEMP;
if (tempInput !== expectedTemp || realpathSync(expectedTemp) !== expectedTemp) fail('RUNNER_TEMP does not match the fixed hosted checkout temp');
const tempStat = lstatSync(expectedTemp);
if (!tempStat.isDirectory() || tempStat.isSymbolicLink()) fail('fixed hosted temp is not a real directory');
const destinationParent = realpathSync(mkdtempSync(join(expectedTemp, 'gatekeeper-runtime-')));
if (dirname(destinationParent) !== expectedTemp || isWithin(destinationParent, workspace) || isWithin(workspace, destinationParent)) fail('fresh temp directory is not a direct child disjoint from workspace');
const destination = join(destinationParent, name);
if (/[\u0000-\u001f\u007f]/.test(destination) || isWithin(destination, workspace) || isWithin(workspace, destination)) fail('destination is malformed or not physically disjoint from workspace');

renameSync(source, destination);
const moved = realpathSync(destination);
if (moved !== destination || isWithin(moved, workspace) || isWithin(workspace, moved)) fail('moved checkout is not physically external');
const movedMetadata = join(moved, '.git');
const movedMetadataStat = lstatSync(movedMetadata);
if (!movedMetadataStat.isDirectory() || movedMetadataStat.isSymbolicLink() || realpathSync(movedMetadata) !== movedMetadata) fail('moved Git metadata is not a real checkout directory');
if (git(moved, 'rev-parse', '--show-toplevel') !== moved || git(moved, 'rev-parse', '--verify', 'HEAD^{commit}') !== head || git(moved, 'rev-parse', '--verify', 'HEAD^{tree}') !== tree) fail('moved checkout Git identity changed');
assertClean(moved);
process.stdout.write(`root=${moved}\n`);
