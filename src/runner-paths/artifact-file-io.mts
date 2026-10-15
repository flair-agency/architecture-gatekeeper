import {
  closeSync, constants, fstatSync, ftruncateSync, lstatSync, mkdirSync,
  openSync, readFileSync, writeFileSync, type PathLike, type Stats,
} from 'node:fs';
import { dirname, isAbsolute, parse } from 'node:path';
import { fileURLToPath } from 'node:url';

// These guards constrain file operations, not the caller's choice of destination
// or checkout. They do not authenticate an environment or isolate a hostile UID.
type FilePath = string | Buffer;
type Ancestor = { path: FilePath; stat: Stats };
const fail = (message: string): never => { throw new Error(`Artifact file: ${message}`); };
const noFollow = constants.O_NOFOLLOW ?? 0;
const nonBlock = constants.O_NONBLOCK ?? 0;
const same = (a: Stats, b: Stats): boolean => a.dev === b.dev && a.ino === b.ino;
const regular = (stat: Stats, callerDescriptor = false): void => {
  if (!stat.isFile() || stat.isSymbolicLink() || (callerDescriptor ? stat.nlink > 1 : stat.nlink !== 1)) {
    fail('a direct single-link regular file is required.');
  }
};

function nativePath(path: PathLike): FilePath {
  if (path instanceof URL) return fileURLToPath(path);
  if (typeof path === 'string' || Buffer.isBuffer(path)) return path;
  return fail('a native file path or file descriptor is required.');
}

// Latin-1 is used only for byte-preserving path syntax operations. In particular,
// a Buffer filename containing non-UTF-8 bytes must reach fs without decoding.
function parent(path: FilePath): FilePath {
  return Buffer.isBuffer(path) ? Buffer.from(dirname(path.toString('latin1')), 'latin1') : dirname(path);
}
function pathKey(path: FilePath): string {
  return Buffer.isBuffer(path) ? path.toString('hex') : Buffer.from(path).toString('hex');
}
function absolute(path: FilePath): boolean {
  return isAbsolute(Buffer.isBuffer(path) ? path.toString('latin1') : path);
}

function withoutTrailingSeparators(path: FilePath): FilePath {
  const text = Buffer.isBuffer(path) ? path.toString('latin1') : path;
  const rootLength = parse(text).root.length;
  let end = text.length;
  while (end > rootLength && (text[end - 1] === '/' || (process.platform === 'win32' && text[end - 1] === '\\'))) end--;
  return Buffer.isBuffer(path) ? path.subarray(0, end) : path.slice(0, end);
}

function directoryChain(path: FilePath): FilePath[] {
  const paths: FilePath[] = [];
  const add = (start: FilePath): void => {
    // lstat("link/") follows the link. Check its bare component instead, without
    // resolving '..' or hiding links behind lexical path normalization.
    let current = withoutTrailingSeparators(start);
    while (true) {
      paths.push(current);
      const next = withoutTrailingSeparators(parent(current));
      if (pathKey(next) === pathKey(current)) break;
      current = next;
    }
  };
  add(path);
  if (!absolute(path)) add(process.cwd());
  return paths;
}

function directories(path: FilePath, allowMissing = false): Ancestor[] {
  const result: Ancestor[] = [];
  for (const ancestor of directoryChain(path)) {
    let stat: Stats;
    try { stat = lstatSync(ancestor); }
    catch (error) {
      if (allowMissing && (error as NodeJS.ErrnoException).code === 'ENOENT') continue;
      throw error;
    }
    if (!stat.isDirectory() || stat.isSymbolicLink()) fail('parent directories must be direct directories.');
    result.push({ path: ancestor, stat });
  }
  return result;
}

function unchanged(ancestors: Ancestor[]): void {
  for (const { path, stat } of ancestors) {
    const now = lstatSync(path);
    if (!now.isDirectory() || now.isSymbolicLink() || !same(stat, now)) fail('a parent directory changed during file validation.');
  }
}

function existing(path: FilePath): Stats | undefined {
  try { const stat = lstatSync(path); regular(stat); return stat; }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
}

function checkedOpen(path: FilePath, access: number, create: boolean, mode: number): number {
  const ancestors = directories(parent(path));
  const before = existing(path);
  // Never truncate during open. A special file cannot block the open, and a
  // swapped regular file is checked before any data is read, written or erased.
  const flags = access | noFollow | nonBlock |
    (create && !before ? constants.O_CREAT | constants.O_EXCL : 0);
  const fd = openSync(path, flags, mode);
  try {
    const opened = fstatSync(fd);
    regular(opened);
    if (before && !same(before, opened)) fail('the file changed during open.');
    unchanged(ancestors);
    const current = lstatSync(path);
    regular(current);
    if (!same(current, opened)) fail('the path no longer identifies the opened file.');
    return fd;
  } catch (error) {
    closeSync(fd);
    throw error;
  }
}

/** Recursively create the selected directory without following directory links. */
export function ensureArtifactDirectory(path: PathLike): void {
  const target = nativePath(path);
  const before = directories(target, true);
  mkdirSync(target, { recursive: true, mode: 0o700 });
  unchanged(before);
  directories(target);
}

/** Keep native destinations and overwrite/append semantics for ordinary files. */
export function writeArtifactFile(path: PathLike | number, contents: string | NodeJS.ArrayBufferView,
  { append = false, mode = 0o600 }: { append?: boolean; mode?: number } = {}): void {
  if (typeof path === 'number') {
    // An explicitly supplied open-then-unlinked regular fd is still a valid
    // capability. Path-based opens require exactly one link throughout.
    regular(fstatSync(path), true);
    // A caller-owned descriptor retains its offset and lifetime; do not truncate.
    writeFileSync(path, contents);
    return;
  }
  const fd = checkedOpen(nativePath(path), constants.O_WRONLY | (append ? constants.O_APPEND : 0), true, mode);
  try {
    regular(fstatSync(fd));
    if (!append) ftruncateSync(fd, 0);
    writeFileSync(fd, contents);
  } finally { closeSync(fd); }
}

export function readArtifactFile(path: PathLike | number): Buffer;
export function readArtifactFile(path: PathLike | number, encoding: BufferEncoding): string;
export function readArtifactFile(path: PathLike | number, encoding?: BufferEncoding): Buffer | string {
  if (typeof path === 'number') {
    regular(fstatSync(path), true);
    return encoding === undefined ? readFileSync(path) : readFileSync(path, encoding);
  }
  const fd = checkedOpen(nativePath(path), constants.O_RDONLY, false, 0o600);
  try {
    regular(fstatSync(fd));
    return encoding === undefined ? readFileSync(fd) : readFileSync(fd, encoding);
  } finally { closeSync(fd); }
}
