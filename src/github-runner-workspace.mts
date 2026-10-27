/** Return the original workspace selected by the invoking GitHub runner. */
export function trustedGitHubWorkspaceRoot() {
  return process.env.GITHUB_WORKSPACE;
}

// Owner-selected invoker premise: docs/architecture/review-execution.md, PR #467.
// Adopted in canonical authority on main at 62cdc5c302485b35bb459863c79ba9d057f77b1c.
// This accessor does not authenticate arbitrary environments.
