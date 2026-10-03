/**
 * Owner-authorized GitHub runner boundary (docs/architecture.md).
 * The invoker must preserve the runner value; this does not authenticate an
 * attacker-controlled environment. Never generalize to caller-selected names.
 */
export function trustedGitHubOutputPath() {
  const value = process.env.GITHUB_OUTPUT;
  if (typeof value !== 'string' || value.length === 0) throw new Error('GITHUB_OUTPUT is unavailable.');
  return value;
}
