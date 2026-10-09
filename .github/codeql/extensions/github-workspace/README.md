# GitHub runner workspace boundary proposal

The proposed local CodeQL model represents the owner-selected premise, recorded
for canonical adoption in draft PR #467, that the invoking GitHub execution
preserves its original `GITHUB_WORKSPACE` and selects the intended checkout and
recorded revisions. The model adds only a `path-injection` barrier on the return
value of `trustedGitHubWorkspaceRoot()` in
`src/github-runner-workspace.mjs`. It does not authenticate an arbitrary
environment, establish checkout origin, protect Git or its object store, or
establish same-user filesystem isolation. Canonical adoption and host
verification remain pending.

Only the GitHub CLI entrypoints for committed regular-file materialization and
legacy CI authority preparation use this accessor. Their exported generic APIs,
the generic Git snapshot reader, caller-selected roots, direct environment
reads, and other accessors remain unmodeled. The preparer uses the same root for
recorded-base snapshot reads and `git diff` working-directory selection.

The local regression analyzes the standard `js/path-injection` query with the
local threat model, using the production accessor, both production CLI modules,
the generic reader and generic preparer. It checks baseline and modeled flows
for direct `GITHUB_WORKSPACE`, another environment variable, CLI input, another
export in the same file, a caller-selected argument, a copied same-named
accessor in another file, generic reader roots and generic preparer CLI roots.
The shared sink can remain reported due to those negative callers; the
regression distinguishes flows from aggregated alert identity and does not
claim a production finding count reduction.

The model and accessor alone do not establish protected acceptance or host
enforcement. Hosted loading requires separate evidence from the subsequent
GitHub CodeQL run.
