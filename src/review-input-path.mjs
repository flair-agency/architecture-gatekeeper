import { lstatSync, realpathSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';

/** Same-drive parent traversal and cross-drive paths are outside on each platform. */
export function containsPath(parent, target, paths = { relative, isAbsolute, sep }) {
  const rel = paths.relative(parent, target);
  return rel !== '..' && !rel.startsWith('..' + paths.sep) && !paths.isAbsolute(rel);
}

/**
 * Resolves a file path relative to an authorized root directory using lexical and existing-ancestor realpath checks.
 * Rejects null bytes and verifies that the lexical path does not traverse outside
 * baseDir or recognized temporary directories.
 * @param {string} userPath
 * @param {string} baseDir
 * @returns {string}
 */
export function resolveSafePath(userPath, baseDir) {
  if (typeof userPath !== 'string' || !userPath.trim()) {
    throw new Error('Path must be a non-empty string.');
  }
  if (userPath.includes('\0')) {
    throw new Error('Path contains forbidden null bytes.');
  }
  const root = resolve(baseDir);
  const resolved = isAbsolute(userPath) ? resolve(userPath) : resolve(root, userPath);
  
  const contains = containsPath;
  // A checkout path must remain in that checkout, even when another root is allowed.
  const candidates = contains(root, resolved) ? [root] :
    [process.env.RUNNER_TEMP, tmpdir(), '/tmp', '/private/tmp', '/var/folders', '/private/var/folders']
      .filter(Boolean).map(candidate => resolve(candidate)).filter(candidate => contains(candidate, resolved))
      .sort((a, b) => b.length - a.length);
  const selectedRoot = candidates[0];
  if (!selectedRoot) throw new Error('Path traversal denied: path escapes authorized root directories.');

  // A lexical in-root path must not escape through a symlink, including output parents.
  let ancestor = resolved;
  while (true) {
    const ancestorRelative = relative(selectedRoot, ancestor);
    if (ancestorRelative === '..' || ancestorRelative.startsWith('..' + sep) || isAbsolute(ancestorRelative)) {
      throw new Error('Path traversal denied: ancestor escapes selected root.');
    }
    try { lstatSync(ancestor); break; }
    catch (error) {
      if (error.code !== 'ENOENT' || dirname(ancestor) === ancestor) throw error;
      ancestor = dirname(ancestor);
    }
  }
  let physicalAncestor;
  try { physicalAncestor = realpathSync(ancestor); }
  catch { throw new Error('Path traversal denied: dangling or inaccessible path ancestor.'); }
  const physicalRoot = realpathSync(selectedRoot);
  if (!contains(physicalRoot, physicalAncestor)) throw new Error('Path traversal denied: symlink escapes authorized root directories.');
  const canonical = resolve(physicalAncestor, relative(ancestor, resolved));
  const canonicalRelative = relative(physicalRoot, canonical);
  if (canonicalRelative === '..' || canonicalRelative.startsWith('..' + sep) || isAbsolute(canonicalRelative)) {
    throw new Error('Path traversal denied: canonical path escapes selected root.');
  }
  return canonical;
}

