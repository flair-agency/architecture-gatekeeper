/**
 * Runner value implementation. The flat compatibility accessor retains the
 * repository-scoped CodeQL model; importing this implementation is not modeled.
 * The invoker must preserve the runner value; this does not authenticate an
 * attacker-controlled environment. Never generalize to caller-selected names.
 */
export function trustedGitHubOutputPath(): string {
  const value = process.env.GITHUB_OUTPUT;
  if (typeof value !== 'string' || value.length === 0) throw new Error('GITHUB_OUTPUT is unavailable.');
  return value;
}
