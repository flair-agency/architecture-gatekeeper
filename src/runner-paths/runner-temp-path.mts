import { constants } from 'node:fs';
import { trustedGitHubOutputPath } from '../github-runner-env.mjs';
import { closeSync, fstatSync, ftruncateSync, lstatSync, mkdirSync, openSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';

const fail: (message: string) => never = message => { throw new Error(`Runner temporary path: ${message}`); };
const CHILD_PATHS: Readonly<Record<string, string>> = Object.freeze({
  'self-amendment-pr': 'self-amendment-pr',
  'architecture-gate-owner-addition': 'architecture-gate-owner-addition',
});

function runnerTempRoot(): string {
  // Workflows run these producers with RUNNER_TEMP as their working directory.
  // Use the process CWD as the root so untrusted environment strings never
  // flow into filesystem path construction.
  let root: string;
  try { root = realpathSync(process.cwd()); } catch { fail('runner temp directory is unavailable.'); }
  if (!process.env.RUNNER_TEMP || process.env.RUNNER_TEMP !== process.cwd()) fail('working directory is not the runner temp directory.');
  return root;
}

/** Resolve a named direct child of GitHub's runner-owned temporary directory. */
export function resolveRunnerTempDirectory(childName: unknown): string {
  const fixedChild = CHILD_PATHS[childName as string];
  if (!fixedChild) fail('a fixed runner temp child name is required.');
  const root = runnerTempRoot();
  const target = resolve(root, fixedChild);
  if (dirname(target) !== root) fail('directory escapes runner temp.');
  mkdirSync(target, { recursive: true, mode: 0o700 });
  let actual: string;
  try { actual = realpathSync(target); } catch { fail('temporary child directory is unavailable.'); }
  if (actual !== target || dirname(actual) !== root || !lstatSync(target).isDirectory() || lstatSync(target).isSymbolicLink()) {
    fail('temporary child is not a real direct directory under runner temp.');
  }
  return target;
}

/** Resolve a fixed file name beneath a validated runner temp child directory. */
export function resolveRunnerTempFile(directory: unknown, fileName: unknown): string {
  return fixedRelativePath(directory, fileName);
}

function fixedRelativePath(directory: unknown, fileName: unknown): string {
  if (typeof directory !== 'string' || !isAbsolute(directory)) fail('an absolute validated temp directory is required.');
  if (typeof fileName !== 'string') fail('file is not an approved fixed runner temp path.');
  const root = runnerTempRoot();
  const child = directory === root ? '.' : basename(directory);
  if (child !== '.' && resolve(directory) !== resolve(root, CHILD_PATHS[child] ?? 'invalid')) fail('directory is not a fixed runner temp child.');
  // Every path reaching fs APIs below is a literal selected from this closed table.
  switch (`${child}/${fileName as string}`) {
    case 'self-amendment-pr/prompt.md': return 'self-amendment-pr/prompt.md';
    case 'self-amendment-pr/schema.json': return 'self-amendment-pr/schema.json';
    case './architecture-gate-prompt.md': return 'architecture-gate-prompt.md';
    case './architecture-gate-decision.schema.json': return 'architecture-gate-decision.schema.json';
    case './architecture-gate-decision.validation.json': return 'architecture-gate-decision.validation.json';
    case './architecture-gate-legacy-prompt.md': return 'architecture-gate-legacy-prompt.md';
    case './architecture-gate-legacy-provenance.json': return 'architecture-gate-legacy-provenance.json';
    case 'architecture-gate-owner-addition/eligibility-prompt.md': return 'architecture-gate-owner-addition/eligibility-prompt.md';
    case 'architecture-gate-owner-addition/eligibility.schema.json': return 'architecture-gate-owner-addition/eligibility.schema.json';
    case 'architecture-gate-owner-addition/procedure.json': return 'architecture-gate-owner-addition/procedure.json';
    case 'architecture-gate-owner-addition/evidence-context.json': return 'architecture-gate-owner-addition/evidence-context.json';
    case 'architecture-gate-owner-addition/eligibility-evidence.json': return 'architecture-gate-owner-addition/eligibility-evidence.json';
    default: fail('file is not an approved fixed runner temp path.');
  }
}

export function readRunnerTempFile(directory: unknown, fileName: unknown, maximumBytes: unknown = 1_048_576): Buffer {
  const target = resolveRunnerTempFile(directory, fileName);
  let fd: number | undefined;
  try {
    fd = openSync(target, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0));
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.nlink !== 1 || stat.size < 1 || stat.size > (maximumBytes as number)) fail('temporary input is not a bounded single-link regular file.');
    return readFileSync(fd);
  } finally { if (fd !== undefined) closeSync(fd); }
}

export function writeRunnerTempFile(directory: unknown, fileName: unknown, contents: unknown, { overwrite = false }: { overwrite?: unknown } = {}): string {
  if (!(typeof contents === 'string' || Buffer.isBuffer(contents))) fail('temporary output must be exact bytes or text.');
  const target = resolveRunnerTempFile(directory, fileName);
  let before;
  if (overwrite) {
    try { before = lstatSync(target); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    if (before && (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1)) fail('temporary output is not a direct single-link regular file.');
  }
  // Keep exclusive creation and validate existing outputs before any truncation.
  const flags = constants.O_WRONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0) |
    (!overwrite || !before ? constants.O_CREAT | constants.O_EXCL : 0);
  let fd: number | undefined;
  try {
    fd = openSync(target, flags, 0o600);
    const opened = fstatSync(fd);
    if (!opened.isFile() || opened.nlink !== 1 ||
        (before && (opened.dev !== before.dev || opened.ino !== before.ino))) fail('temporary output is not the selected single-link regular file.');
    if (overwrite) ftruncateSync(fd, 0);
    writeFileSync(fd, contents);
  } finally { if (fd !== undefined) closeSync(fd); }
  return target;
}

/** Append bounded step outputs to the trusted GitHub runner-provided sink. */
export function appendGitHubOutput(contents: unknown): void {
  if (typeof contents !== 'string' || contents.length === 0 || Buffer.byteLength(contents, 'utf8') > 16_384 ||
      contents.includes('\0')) fail('workflow output must be non-empty bounded text.');
  // The invoking GitHub runner owns this sink; it is not a caller path option.
  const outputPath = trustedGitHubOutputPath();
  if (typeof outputPath !== 'string' || !isAbsolute(outputPath) || resolve(outputPath) !== outputPath) {
    fail('GitHub output must be a canonical absolute path supplied by the runner.');
  }
  let before;
  try { before = lstatSync(outputPath); } catch { fail('runner-created output file is unavailable.'); }
  if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1 || realpathSync(outputPath) !== outputPath) {
    fail('runner-created output is not a direct regular file.');
  }
  let fd: number | undefined;
  try {
    fd = openSync(outputPath, constants.O_WRONLY | constants.O_APPEND | (constants.O_NOFOLLOW ?? 0));
    const opened = fstatSync(fd);
    if (!opened.isFile() || opened.nlink !== 1 || opened.dev !== before.dev || opened.ino !== before.ino) {
      fail('runner-created output file changed during validation.');
    }
    writeFileSync(fd, contents);
  } finally { if (fd !== undefined) closeSync(fd); }
}

/** Validate a Git tree path before embedding it in a revision:path argument. */
export function validateRepositoryTreePath(value: unknown): string {
  if (typeof value !== 'string' || value.length > 240 || value.startsWith('/') || value.includes('\\') ||
      !/^[A-Za-z0-9._/-]+$/.test(value) || value.split('/').some(part => !part || part === '.' || part === '..')) {
    fail('repository tree path is malformed or unsafe.');
  }
  return value;
}

/** The v0.6.0 self profile never dereferences external authority repositories. */
export function validateSelfAuthorityManifest(manifest: unknown): unknown {
  if (!manifest || !Array.isArray((manifest as { authorities?: unknown }).authorities) ||
      (manifest as { authorities: unknown[] }).authorities.length === 0) {
    fail('a non-empty protected Authority Set is required.');
  }
  for (const member of (manifest as { authorities: unknown[] }).authorities) {
    if ((member as { repository?: unknown } | null | undefined)?.repository !== 'self') fail('the v0.6.0 self profile supports only authorities in this repository.');
    validateRepositoryTreePath((member as { path?: unknown }).path);
  }
  return manifest;
}
