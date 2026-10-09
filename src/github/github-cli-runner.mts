import type { ExecFileSyncOptions } from 'node:child_process';

const DEFAULT_MAX_BUFFER = 2 * 1024 * 1024;

/** Adapt execFileSync to the command-runner signature used by verifier APIs. */
export function createGitHubCliRunner(
  execFileSync: (file: string, args: string[], options: ExecFileSyncOptions) => unknown,
  defaultMaxBuffer: number = DEFAULT_MAX_BUFFER,
): (file: string, args: string[], options?: ExecFileSyncOptions) => unknown {
  if (typeof execFileSync !== 'function' || !Number.isSafeInteger(defaultMaxBuffer) || defaultMaxBuffer < 1) {
    throw new TypeError('GitHub CLI runner requires execFileSync and a positive default maxBuffer.');
  }
  return (file, args, options = {}) => execFileSync(file, args, { maxBuffer: defaultMaxBuffer, ...options });
}
