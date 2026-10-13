import { closeSync, constants, fstatSync, lstatSync, openSync, readSync, realpathSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, resolve, sep } from 'node:path';

/** Bound local diagnostic I/O to host-selected locations, never caller-provided roots.
 * This is a filesystem guard, not authentication or isolation from a same-user process.
 */
export function resolveDiagnosticPath(value: unknown): string {
  if (typeof value !== 'string' || !value || value.includes('\0')) throw new Error('Diagnostic path must be a nonempty filename.');
  const target = resolve(value);
  // Optional host roots are independent. A missing unrelated HOME/TMPDIR or
  // cwd must not veto a path beneath another valid host-selected root.
  const home = canonicalRoot(homedir);
  if (home && target.startsWith(`${home}${sep}`)) return canonicalParent(target);
  const temporary = canonicalRoot(tmpdir);
  if (temporary && target.startsWith(`${temporary}${sep}`)) return canonicalParent(target);
  const working = canonicalRoot(() => process.cwd());
  if (working && target.startsWith(`${working}${sep}`)) return canonicalParent(target);
  // Resolve conventional Unix roots canonically too, retaining rejection of
  // caller-supplied parent aliases while permitting their canonical locations.
  const unixTemporary = sep === '/' ? canonicalRoot(() => '/tmp') : null;
  if (unixTemporary && target.startsWith(`${unixTemporary}${sep}`)) return canonicalParent(target);
  const unixVariableTemporary = sep === '/' ? canonicalRoot(() => '/var/tmp') : null;
  if (unixVariableTemporary && target.startsWith(`${unixVariableTemporary}${sep}`)) return canonicalParent(target);
  throw new Error('Diagnostic path is outside host home, temporary and working directories.');
}

function canonicalRoot(provider: () => string): string | null {
  try { return realpathSync(provider()); } catch { return null; }
}

function canonicalParent(target: string): string {
  // Validate an existing parent before any access to the selected leaf. Reject
  // aliases even when the symlink destination is another permitted location.
  if (realpathSync(dirname(target)) !== dirname(target)) throw new Error('Diagnostic path parent must be canonical.');
  return target;
}

/** Read a direct, single-link regular file with bounded bytes and strict UTF-8. */
export function readDiagnosticText(path: unknown, maximumBytes: number, accountReadBytes?: (bytes: number) => void): string {
  const target = resolveDiagnosticPath(path);
  // Windows does not expose O_NOFOLLOW. Inspect the leaf on every platform,
  // then bind the opened handle to that direct regular file before reading.
  const leaf = lstatSync(target);
  if (!leaf.isFile() || leaf.isSymbolicLink() || leaf.nlink !== 1 || leaf.size > maximumBytes) throw new Error('Invalid diagnostic file.');
  const fd = openSync(target, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0));
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.nlink !== 1 || stat.size > maximumBytes || stat.dev !== leaf.dev || stat.ino !== leaf.ino) throw new Error('Invalid diagnostic file.');
    // Bound the actual read too: a file may grow after fstat. readFileSync(fd)
    // alone could otherwise allocate beyond the declared limit.
    const bytes = Buffer.alloc(maximumBytes + 1);
    let length = 0;
    while (length < bytes.length) {
      const count = readSync(fd, bytes, length, bytes.length - length, null);
      if (!count) break;
      length += count;
      // Account actual I/O before decoding, including bytes from reads that
      // later fail or exceed the individual file limit. Existing callers omit
      // the optional observer and retain the same guards and decoding.
      accountReadBytes?.(count);
    }
    if (length > maximumBytes) throw new Error('Diagnostic file exceeds limit.');
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, length));
  } finally { closeSync(fd); }
}
