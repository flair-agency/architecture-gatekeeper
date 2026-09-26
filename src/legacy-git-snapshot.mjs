import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const SHA = /^[a-f0-9]{40}(?:[a-f0-9]{24})?$/;
const PATH = /^(?:[A-Za-z0-9._-]+\/)*[A-Za-z0-9._-]+$/;

export function isCanonicalRepositoryPath(path) {
  return typeof path === 'string' && path.length > 0 && path.length <= 240 &&
    PATH.test(path) && path.split('/').every(part => part !== '.' && part !== '..');
}

export function readRegularGitSnapshot({ root, commit, path, maxBytes = 65_536 }) {
  if (!root || !SHA.test(commit || '') || !isCanonicalRepositoryPath(path) ||
      !Number.isSafeInteger(maxBytes) || maxBytes < 1) {
    throw new Error(`Invalid committed snapshot selection: ${path}`);
  }
  const entry = execFileSync('git', ['ls-tree', '-z', '--full-tree', commit, '--', path], { cwd: root, maxBuffer: 2_000_000 });
  const match = /^(100644|100755) blob ([a-f0-9]{40}(?:[a-f0-9]{24})?)\t([^\0]+)\0$/.exec(entry.toString('utf8'));
  if (!match || match[3] !== path) throw new Error(`Committed input is not a regular file: ${path}`);
  const bytes = execFileSync('git', ['show', `${commit}:${path}`], { cwd: root, maxBuffer: 2_000_000 });
  if (!bytes.length || bytes.length > maxBytes) throw new Error(`Committed input has invalid size: ${path}`);
  return { path, oid: match[2], bytes, sha256: createHash('sha256').update(bytes).digest('hex') };
}
