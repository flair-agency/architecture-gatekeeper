const DEFAULT_MAX_BUFFER = 2 * 1024 * 1024;

/** Adapt execFileSync to the command-runner signature used by verifier APIs. */
export function createGitHubCliRunner(execFileSync, defaultMaxBuffer = DEFAULT_MAX_BUFFER) {
  if (typeof execFileSync !== 'function' || !Number.isSafeInteger(defaultMaxBuffer) || defaultMaxBuffer < 1) {
    throw new TypeError('GitHub CLI runner requires execFileSync and a positive default maxBuffer.');
  }
  return (file, args, options = {}) => execFileSync(file, args, { maxBuffer: defaultMaxBuffer, ...options });
}
