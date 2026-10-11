# Issue #334 ordinary Gemini caller placement

This is a bounded source proposal for the default-branch placement of the
already-reviewed Issue #334 feature caller. It records the observed trigger
gap and the exact candidate source; it does not record a deployment, a model
review result, or successful route execution.

## Finding

The feature activation in PR #519 merged as
`43e9a28571ad0508a425220256a18d6b140525b2`. One `ready_for_review`
transition on candidate PR #517 produced only PR-description workflow run
`38148227556`; no Gemini caller run was observed. The single transition is
the supplied event evidence for this investigation. It does not establish a
model dispatch or a successful review route. No paid request, WIF exchange, or
review session startup was observed. No dispatch count is inferred.

GitHub documents that `pull_request_target` uses the workflow from the
default branch, including for pull requests targeting another branch:
[pull_request_target event documentation](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#pull_request_target).
The intended candidate workflow therefore belongs on default `main` while its
event filter selects `feature/gemini-ci` as the PR base branch. The current
main tree has no `.github/workflows/issue334-ordinary-feature-caller.yml` and
no registry entry for this caller.

## Proposed caller and bounds

The proposed workflow and its focused structural test are copied byte for
byte from protected feature-base commit
`43e9a28571ad0508a425220256a18d6b140525b2`: the workflow's SHA-256 is
`550c6a5bca901f811754a3fee45e2a804cd1038726de151ba721c5fa5c0ba3d0`, and the
test's SHA-256 is
`4ca8b4d104af8c9b3479c1de72232ad813e036edadcd0a836b895ab61fb1351c`. The
workflow listens only
for `pull_request_target` `ready_for_review` events targeting
`feature/gemini-ci`. Its job retains the same-repository classifier and exact
PR #517, head `c4b0057d9dd47f79df2a896143f7ac6db5da2c2e`, event, draft-state,
and run-attempt-1 conditions. It calls the reusable workflow pinned to
`7dc99525b4ff1510f1de310f6f5b877ab05bbfd2` and passes the existing protected
policy, prompt, schema, and validation paths. It has no automatic retry or
additional trigger.

The pinned reusable workflow selects policy and the full Authority Set from
the protected **feature base** for this feature-targeted PR. This proposal
changes only where the caller source is placed; the reusable workflow still
uses its existing target-base selection. Main policy, provider, and authority
files are not modified by these three source files. Main currently lacks the
feature base's two ordinary Gemini execution clauses in
`docs/architecture/review-execution.md`; those clauses are therefore not
silently adopted as MAIN authority by placing this caller on default `main`.
The placement does not change the existing target-`feature/gemini-ci` policy
and Authority Set selection. No new canonical choice is claimed here; separate
authorization for deployment of the caller on main remains pending.

## Scope and status

The only proposed files are this investigation, the workflow, and its focused
test. The test includes local synthetic expression evaluation and classifier
fixtures; those checks do not emulate GitHub's workflow engine, host protection,
credential issuance, model dispatch, or a live review.

These source files are reviewable preparation only. This preparation does not
authorize a default-branch merge or a further PR #517 ready transition. A
default-branch merge would deploy a credential-capable caller targeting the
feature branch and requires separate authorization. The already authorized
single #517 session has not started.
