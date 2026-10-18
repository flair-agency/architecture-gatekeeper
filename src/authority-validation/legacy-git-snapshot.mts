import { createHash } from 'node:crypto';
import { runBufferedGit } from '../git/buffered-git.mts';

const SHA = /^[a-f0-9]{40}(?:[a-f0-9]{24})?$/;
const PATH = /^(?:[A-Za-z0-9._-]+\/)*[A-Za-z0-9._-]+$/;

export function isCanonicalRepositoryPath(path: unknown): boolean {
  return typeof path === 'string' && path.length > 0 && path.length <= 240 &&
    PATH.test(path) && path.split('/').every(part => part !== '.' && part !== '..');
}

export interface GitSnapshotOptions {
  root: string;
  commit: string;
  path: string;
  maxBytes?: number;
}

export interface RegularGitSnapshot {
  path: string;
  oid: string;
  bytes: Buffer;
  sha256: string;
}

export function readRegularGitSnapshot({ root, commit, path, maxBytes = 65_536 }: GitSnapshotOptions): RegularGitSnapshot {
  if (!root || !SHA.test(commit || '') || !isCanonicalRepositoryPath(path) ||
      !Number.isSafeInteger(maxBytes) || maxBytes < 1) {
    throw new Error(`Invalid committed snapshot selection: ${path}`);
  }
  const entry = runBufferedGit(root, ['ls-tree', '-z', '--full-tree', commit, '--', path]);
  const match = /^(100644|100755) blob ([a-f0-9]{40}(?:[a-f0-9]{24})?)\t([^\0]+)\0$/.exec(entry.toString('utf8'));
  if (!match || match[3] !== path) throw new Error(`Committed input is not a regular file: ${path}`);
  const bytes = runBufferedGit(root, ['show', `${commit}:${path}`]);
  if (!bytes.length || bytes.length > maxBytes) throw new Error(`Committed input has invalid size: ${path}`);
  return { path, oid: match[2], bytes, sha256: createHash('sha256').update(bytes).digest('hex') };
}
