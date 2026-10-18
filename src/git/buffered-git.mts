import { execFileSync } from 'node:child_process';

export function runBufferedGit(root: string, args: readonly string[]): Buffer {
  return execFileSync('git', args, { cwd: root, encoding: 'buffer', maxBuffer: 2_000_000 });
}
