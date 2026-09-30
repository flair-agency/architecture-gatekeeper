import { constants } from 'node:fs';
import { closeSync, fstatSync, lstatSync, mkdirSync, openSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';

const fail = message => { throw new Error(`Runner temporary path: ${message}`); };
const CHILD_PATHS = Object.freeze({
  'architecture-gate-owner-decision-record-input': 'architecture-gate-owner-decision-record-input',
  'owner-amendment-semantic-reviewer-output': 'owner-amendment-semantic-reviewer-output',
  'owner-amendment-eligibility': 'owner-amendment-eligibility',
  'owner-amendment-merge-group': 'owner-amendment-merge-group',
});

/** Resolve a named direct child of GitHub's runner-owned temporary directory. */
export function resolveRunnerTempDirectory(childName) {
  const fixedChild = CHILD_PATHS[childName];
  if (!fixedChild) fail('a fixed runner temp child name is required.');
  // Workflows run these producers with RUNNER_TEMP as their working directory.
  // Use the process CWD as the root so untrusted environment strings never
  // flow into filesystem path construction.
  let root;
  try { root = realpathSync(process.cwd()); } catch { fail('runner temp directory is unavailable.'); }
  if (!process.env.RUNNER_TEMP || process.env.RUNNER_TEMP !== process.cwd()) fail('working directory is not the runner temp directory.');
  const target = resolve(root, fixedChild);
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
  return fixedRelativePath(directory, fileName);
}

function fixedRelativePath(directory, fileName) {
  if (typeof directory !== 'string' || !isAbsolute(directory)) fail('an absolute validated temp directory is required.');
  const child = basename(directory);
  if (resolve(directory) !== resolve(process.cwd(), CHILD_PATHS[child] ?? 'invalid')) fail('directory is not a fixed runner temp child.');
  // Every path reaching fs APIs below is a literal selected from this closed table.
  switch (`${child}/${fileName}`) {
    case 'architecture-gate-owner-decision-record-input/authority-provenance.json': return 'architecture-gate-owner-decision-record-input/authority-provenance.json';
    case 'architecture-gate-owner-decision-record-input/decision.json': return 'architecture-gate-owner-decision-record-input/decision.json';
    case 'architecture-gate-owner-decision-record-input/event.json': return 'architecture-gate-owner-decision-record-input/event.json';
    case 'architecture-gate-owner-decision-record-input/recorded-context.json': return 'architecture-gate-owner-decision-record-input/recorded-context.json';
    case 'architecture-gate-owner-decision-record-input/review-record.json': return 'architecture-gate-owner-decision-record-input/review-record.json';
    case 'owner-amendment-semantic-reviewer-output/decision.json': return 'owner-amendment-semantic-reviewer-output/decision.json';
    case 'owner-amendment-eligibility/eligibility-prompt.md': return 'owner-amendment-eligibility/eligibility-prompt.md';
    case 'owner-amendment-eligibility/eligibility.schema.json': return 'owner-amendment-eligibility/eligibility.schema.json';
    case 'owner-amendment-eligibility/prepared-context.json': return 'owner-amendment-eligibility/prepared-context.json';
    case 'owner-amendment-eligibility/eligibility-receipt.json': return 'owner-amendment-eligibility/eligibility-receipt.json';
    case 'owner-amendment-merge-group/event.json': return 'owner-amendment-merge-group/event.json';
    case 'owner-amendment-merge-group/verified-context.json': return 'owner-amendment-merge-group/verified-context.json';
    case 'owner-amendment-merge-group/ordinary-prompt.md': return 'owner-amendment-merge-group/ordinary-prompt.md';
    case 'owner-amendment-merge-group/ordinary-schema.json': return 'owner-amendment-merge-group/ordinary-schema.json';
    case 'owner-amendment-merge-group/ordinary-validation.json': return 'owner-amendment-merge-group/ordinary-validation.json';
    case 'owner-amendment-merge-group/ordinary-authority.json': return 'owner-amendment-merge-group/ordinary-authority.json';
    case 'owner-amendment-merge-group/ordinary-context.json': return 'owner-amendment-merge-group/ordinary-context.json';
    default: fail('file is not an approved fixed runner temp path.');
  }
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

/** Append bounded step outputs only to the runner-created command file under RUNNER_TEMP. */
export function appendGitHubOutput(contents) {
  if (typeof contents !== 'string' || contents.length === 0 || Buffer.byteLength(contents, 'utf8') > 16_384 ||
      contents.includes('\0')) fail('workflow output must be non-empty bounded text.');
  let runnerTemp;
  try { runnerTemp = realpathSync(process.cwd()); } catch { fail('runner temp directory is unavailable.'); }
  if (!process.env.RUNNER_TEMP || process.env.RUNNER_TEMP !== process.cwd()) fail('working directory is not the runner temp directory.');
  const commandDirectory = join(runnerTemp, '_runner_file_commands');
  let commandDirectoryStat;
  try { commandDirectoryStat = lstatSync(commandDirectory); } catch { fail('runner command-file directory is unavailable.'); }
  if (!commandDirectoryStat.isDirectory() || commandDirectoryStat.isSymbolicLink() || realpathSync(commandDirectory) !== commandDirectory) {
    fail('runner command-file directory is not a direct real directory under RUNNER_TEMP.');
  }
  const outputPath = process.env.GITHUB_OUTPUT;
  if (typeof outputPath !== 'string' || !isAbsolute(outputPath) || dirname(outputPath) !== commandDirectory ||
      !/^set_output_[A-Za-z0-9_-]{1,128}$/.test(basename(outputPath)) || resolve(outputPath) !== outputPath) {
    fail('GitHub output path is outside the runner-created command-file directory.');
  }
  // Rebuild the sink path from the verified directory and the constrained
  // runner-generated leaf instead of passing the environment value to fs.
  const validatedOutputPath = join(commandDirectory, basename(outputPath));
  if (validatedOutputPath !== outputPath) fail('GitHub output path is not a canonical direct child.');
  let before;
  try { before = lstatSync(validatedOutputPath); } catch { fail('runner-created output file is unavailable.'); }
  if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1 || realpathSync(validatedOutputPath) !== validatedOutputPath) {
    fail('runner-created output is not a direct regular file.');
  }
  let fd;
  try {
    fd = openSync(validatedOutputPath, constants.O_WRONLY | constants.O_APPEND | (constants.O_NOFOLLOW ?? 0));
    const opened = fstatSync(fd);
    if (!opened.isFile() || opened.nlink !== 1 || opened.dev !== before.dev || opened.ino !== before.ino) {
      fail('runner-created output file changed during validation.');
    }
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
export function ownerAmendmentTagApiRoute(repository, tagNamespace, bSha) {
  if (repository !== 'flair-agency/architecture-gatekeeper' ||
      tagNamespace !== 'refs/tags/architecture-gatekeeper/amendments' ||
      typeof bSha !== 'string' || !/^[a-f0-9]{40}$/.test(bSha)) {
    fail('tag lookup must name the fixed self repository, protected namespace, and exact commit SHA.');
  }
  return `repos/flair-agency/architecture-gatekeeper/git/ref/tags/architecture-gatekeeper/amendments/${bSha}`;
}
