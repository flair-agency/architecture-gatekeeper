import { constants } from 'node:fs';
import { closeSync, fstatSync, lstatSync, mkdirSync, openSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { basename, dirname, isAbsolute, resolve } from 'node:path';

const fail = message => { throw new Error(`Runner temporary path: ${message}`); };
const CHILD = /^[a-z0-9][a-z0-9-]{0,63}$/;
const FILE = /^[a-z0-9][a-z0-9.-]{0,127}$/;

/** Resolve a named direct child of GitHub's runner-owned temporary directory. */
export function resolveRunnerTempDirectory(runnerTemp, childName) {
  if (typeof runnerTemp !== 'string' || !isAbsolute(runnerTemp) || !CHILD.test(childName ?? '')) {
    fail('an absolute runner temp directory and fixed child name are required.');
  }
  let root;
  try { root = realpathSync(runnerTemp); } catch { fail('runner temp directory is unavailable.'); }
  const target = resolve(root, childName);
  if (dirname(target) !== root) fail('directory escapes runner temp.');
  mkdirSync(target, { recursive: true, mode: 0o700 });
  let actual;
  try { actual = realpathSync(target); } catch { fail('temporary child directory is unavailable.'); }
  if (actual !== target || dirname(actual) !== root || !lstatSync(target).isDirectory() || lstatSync(target).isSymbolicLink()) {
    fail('temporary child is not a real direct directory under runner temp.');
  }
  return target;
}

/** Resolve a fixed file name beneath a validated runner temp child directory. */
export function resolveRunnerTempFile(directory, fileName) {
  if (typeof directory !== 'string' || !isAbsolute(directory) || !FILE.test(fileName ?? '')) {
    fail('an absolute validated temp directory and fixed file name are required.');
  }
  const target = resolve(directory, fileName);
  if (dirname(target) !== directory) fail('file escapes its runner temp directory.');
  return target;
}

export function readRunnerTempFile(directory, fileName, maximumBytes = 1_048_576) {
  const target = resolveRunnerTempFile(directory, fileName);
  let fd;
  try {
    fd = openSync(target, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.size < 1 || stat.size > maximumBytes) fail('temporary input is not a bounded regular file.');
    return readFileSync(fd);
  } finally { if (fd !== undefined) closeSync(fd); }
}

export function writeRunnerTempFile(directory, fileName, contents, { overwrite = false } = {}) {
  if (!(typeof contents === 'string' || Buffer.isBuffer(contents))) fail('temporary output must be exact bytes or text.');
  const target = resolveRunnerTempFile(directory, fileName);
  const flags = constants.O_WRONLY | constants.O_CREAT | (constants.O_NOFOLLOW ?? 0) |
    (overwrite ? constants.O_TRUNC : constants.O_EXCL);
  let fd;
  try {
    fd = openSync(target, flags, 0o600);
    if (!fstatSync(fd).isFile()) fail('temporary output is not a regular file.');
    writeFileSync(fd, contents);
  } finally { if (fd !== undefined) closeSync(fd); }
  return target;
}

/** Append only to GitHub Actions' output-command file within runner temp. */
export function appendRunnerGitHubOutput(runnerTemp, outputPath, contents) {
  if (typeof outputPath !== 'string' || !isAbsolute(outputPath) || !(typeof contents === 'string' || Buffer.isBuffer(contents))) {
    fail('GitHub output file or contents are invalid.');
  }
  let root, path;
  try { root = realpathSync(runnerTemp); path = resolve(outputPath); } catch { fail('GitHub output path is unavailable.'); }
  const parent = dirname(path);
  if (!/^set_output_[A-Za-z0-9-]{1,80}$/.test(basename(path))) fail('GitHub output must be the runner-owned output command file.');
  let parentReal, stat, fd;
  try { parentReal = realpathSync(parent); stat = lstatSync(path); } catch { fail('GitHub output path is not a runner-owned regular file.'); }
  if (parentReal !== resolve(root, '_runner_file_commands') || !stat.isFile() || stat.isSymbolicLink()) {
    fail('GitHub output path is not a runner-owned regular file.');
  }
  try {
    fd = openSync(path, constants.O_WRONLY | constants.O_APPEND | (constants.O_NOFOLLOW ?? 0));
    if (!fstatSync(fd).isFile()) fail('GitHub output is not a regular file.');
    writeFileSync(fd, contents);
  } finally { if (fd !== undefined) closeSync(fd); }
}

/** Validate a Git tree path before embedding it in a revision:path argument. */
export function validateRepositoryTreePath(value) {
  if (typeof value !== 'string' || value.length > 240 || value.startsWith('/') || value.includes('\\') ||
      !/^[A-Za-z0-9._/-]+$/.test(value) || value.split('/').some(part => !part || part === '.' || part === '..')) {
    fail('repository tree path is malformed or unsafe.');
  }
  return value;
}

/** The v0.6.0 self profile never dereferences external authority repositories. */
export function validateSelfAuthorityManifest(manifest) {
  if (!manifest || !Array.isArray(manifest.authorities) || manifest.authorities.length === 0) {
    fail('a non-empty protected Authority Set is required.');
  }
  for (const member of manifest.authorities) {
    if (member?.repository !== 'self') fail('the v0.6.0 self profile supports only authorities in this repository.');
    validateRepositoryTreePath(member.path);
  }
  return manifest;
}

/** Build a GitHub REST ref URL only for the fixed self repository and namespace. */
export function ownerAmendmentTagApiUrl(repository, tagNamespace, bSha) {
  if (repository !== 'flair-agency/architecture-gatekeeper' ||
      tagNamespace !== 'refs/tags/architecture-gatekeeper/amendments' ||
      typeof bSha !== 'string' || !/^[a-f0-9]{40}$/.test(bSha)) {
    fail('tag lookup must name the fixed self repository, protected namespace, and exact commit SHA.');
  }
  return `https://api.github.com/repos/flair-agency/architecture-gatekeeper/git/ref/tags/architecture-gatekeeper/amendments/${bSha}`;
}
