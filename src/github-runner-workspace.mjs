/** Return the original workspace selected by the invoking GitHub runner. */
export function trustedGitHubWorkspaceRoot() {
  return process.env.GITHUB_WORKSPACE;
}

// Owner-selected invoker premise: docs/architecture/review-execution.md, PR #467.
// Adoption is pending. This accessor does not authenticate arbitrary environments.
