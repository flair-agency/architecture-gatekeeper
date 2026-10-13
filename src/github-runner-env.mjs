// @ts-check
import { trustedGitHubOutputPath as readGitHubOutputPath } from './github/github-runner-env.mts';
/**
 * Owner-authorized GitHub runner boundary (docs/architecture.md).
 * The invoker must preserve the runner value; this does not authenticate an
 * attacker-controlled environment. Never generalize to caller-selected names.
 */
/** @returns {string} */
export function trustedGitHubOutputPath() {
  return readGitHubOutputPath();
}
