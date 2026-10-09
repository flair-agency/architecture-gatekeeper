import type { ExecFileSyncOptions } from 'node:child_process';

export type GitHubCliRunnerOptions = Omit<ExecFileSyncOptions, 'stdio'> & {
  stdio?: ExecFileSyncOptions['stdio'] | Readonly<Extract<ExecFileSyncOptions['stdio'], unknown[]>>;
};

const DEFAULT_MAX_BUFFER = 2 * 1024 * 1024;

/** Adapt execFileSync to the command-runner signature used by verifier APIs. */
export function createGitHubCliRunner(
  execFileSync: (file: string, args: string[], options: ExecFileSyncOptions) => unknown,
  defaultMaxBuffer: number = DEFAULT_MAX_BUFFER,
): (file: string, args: readonly unknown[], options?: GitHubCliRunnerOptions) => unknown {
  if (typeof execFileSync !== 'function' || !Number.isSafeInteger(defaultMaxBuffer) || defaultMaxBuffer < 1) {
    throw new TypeError('GitHub CLI runner requires execFileSync and a positive default maxBuffer.');
  }
  // Verifier callbacks forward observed values without narrowing or validation.
  // These operation casts preserve the executor's own coercion/rejection behavior.
  return (file, args, options = {}) => execFileSync(file, args as string[], { maxBuffer: defaultMaxBuffer, ...options } as ExecFileSyncOptions);
}
