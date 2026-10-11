# Issue #334 ordinary Gemini caller placement

This investigation prepares default-main registration of the Issue #334
feature caller in an unconditionally inactive state. It records the observed
trigger gap and review history; it does not record model review execution or
successful route execution.

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
The intended caller registration therefore belongs on default `main` while its
event filter selects `feature/gemini-ci` as the PR base branch. At the source
baseline for this proposal, main had no
`.github/workflows/issue334-ordinary-feature-caller.yml` and no registry entry
for this caller.

## Inactive registration and bounds

The previously proposed active workflow and focused test were byte-identical
to protected feature-base commit
`43e9a28571ad0508a425220256a18d6b140525b2` (workflow SHA-256
`550c6a5bca901f811754a3fee45e2a804cd1038726de151ba721c5fa5c0ba3d0`; test
SHA-256 `4ca8b4d104af8c9b3479c1de72232ad813e036edadcd0a836b895ab61fb1351c`).
Host AGK on PR #525 correctly BLOCKed that active executable source in run
`38150100089` while default-main activation authorization was pending. The
current workflow is inactive: its only event is `pull_request_target`
`ready_for_review` targeting `feature/gemini-ci`, and the privileged reusable
workflow job has literal `if: false`. The job retains the strict classifier,
permissions, inputs, two WIF secret mappings, and pin
`7dc99525b4ff1510f1de310f6f5b877ab05bbfd2`. With the job condition false,
the called workflow and its WIF/model steps are unreachable. The previous
seven-condition guard is preserved beside the job as commented proposal text,
not active admission. No automatic retry or additional trigger is present.

The reusable workflow's existing target selection uses the protected
`feature/gemini-ci` base policy and full Authority Set for this feature-targeted
PR. The inactive default-main registration does not change that selection or
MAIN's existing policy, provider, and authority. Main currently lacks the
feature base's two ordinary Gemini execution clauses in
`docs/architecture/review-execution.md`; they are not silently adopted as MAIN
authority. No new canonical choice is claimed. Separate main source adoption
and activation approval remain required before replacing `if: false` with an
authorized admission condition and permitting a future candidate event.

## Scope and status

The only proposed files are this investigation, the workflow, and its focused
test. The test checks the inactive job condition, trigger/pin/credential bounds,
and executes the copied classifier against same-repository, fork, and malformed
metadata fixtures. Mutation fixtures check that changing or removing the
literal false condition fails the staged invariant. These checks do not emulate
GitHub's workflow engine, host protection, credential issuance, model dispatch,
or a live review.

These source files are reviewable preparation only. This preparation does not
authorize default-branch source adoption, activation, or a further PR #517
ready transition. The previous active-source BLOCK remains historical evidence;
it does not activate or authorize this inactive registration. Restoring the
commented guard requires separate main source adoption and activation approval,
plus a new exact coordinator-context admission before any future candidate
event. No automatic retries are configured.
