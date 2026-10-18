# Issue #567: stale pull request merge metadata

Issue #567 reports a `pull_request_target` event whose `merge_commit_sha` no longer
matches the current merge ref for that pull request. The supplied example is:

- Event base: `1054d1ba88db7bf1fc20af4d182eb614d31c6f01`
- Event head: `feaf9bbe578c6d32c0af32b55166b754c0b6a2e4`
- Event merge SHA: `5d61e22ef90b6c7e615e9aa5e8a9bf0558515792`
- Previous head represented by that merge: `d502876e5532f900d6938a96de247e9727e73121`
- Refreshed merge SHA reported for the event base/head: `1ac693dbaf498376626d25bb6eb10bf8b4405f33`

The exact-parent guard correctly rejects the event merge when its second
parent is stale. The event merge SHA remains the normal path. The workflow
first checks out that immutable event SHA without submodules and checks its
ordered parents. On a mismatch, it looks up
`refs/pull/<number>/merge`, fetches the returned immutable SHA without
submodules, and verifies that the fetched object is a commit whose ordered
parents are exactly the event base and head. Only after that verification does
the selection step choose the refreshed candidate; on the normal path, it
selects the event SHA. That step verifies the selected commit and ordered
parents again, clears existing submodule worktrees when the legacy checkout
policy enables submodules, confirms the initial checkout equals the selection
on the normal path, and emits the selected SHA. The final checkout then
materializes the selected tree when refresh or the legacy submodule policy
requires it. A post-checkout guard verifies the actual SHA and ordered parents
before recording the reviewed revision. Missing or ambiguous refs, failed
fetches, non-commit objects, cleanup or checkout failures, and candidates
with different parents remain incomplete.

The workflow regressions use locally created Git commits to reproduce the stale
metadata shape and exercise the exact-parent checks and bounded resolver script.
The selected-step cleanup runs without source credentials, after validating
the selected candidate's ordered parents and before emitting its SHA. A real
local Git regression confirms that clean/reset/checkout/recursive-update can
leave removed and renamed top-level modules and a renamed nested module, then
verifies deinitialization leaves only the refreshed tree and a clean status.
Another local Git regression makes the old event tree's submodule remote
unavailable: eager recursive materialization fails, while a nonrecursive event
checkout followed by selected-candidate recursive materialization succeeds.
The focused Actions regression executes the inline resolver against controlled
Git command results, including invalid candidate objects and parent tuples,
and verifies rejected candidates emit no checkout SHA.
These fixtures do not invoke the Actions checkout binary or a hosted workflow.
Gemini launcher tests exercise the same transition through its trusted
object-fetch helper and assert the selected SHA it returns; the source handoff
to publication and output was inspected separately. The checks do not replay
the hosted GitHub event or establish the exact historical stale-recovery
behavior. [PR #603](https://github.com/flair-agency/architecture-gatekeeper/pull/603)
was normally merged at
[`fc9014c28af9498e1191f75fe7d8008bafea9dc4`](https://github.com/flair-agency/architecture-gatekeeper/commit/fc9014c28af9498e1191f75fe7d8008bafea9dc4)
after review of head
[`d90908f609537d82f4867bd628a9a177e57b941d`](https://github.com/flair-agency/architecture-gatekeeper/commit/d90908f609537d82f4867bd628a9a177e57b941d).
Its hosted [CodeQL run 39100652588](https://github.com/flair-agency/architecture-gatekeeper/actions/runs/39100652588),
[model run 39100654794](https://github.com/flair-agency/architecture-gatekeeper/actions/runs/39100654794),
[CI test job 117596218530](https://github.com/flair-agency/architecture-gatekeeper/actions/runs/39100654794/job/117596218530),
and [protected run 39100683000](https://github.com/flair-agency/architecture-gatekeeper/actions/runs/39100683000)
succeeded. Local CodeQL 2.27.1 remains distinct from the hosted CodeQL 2.27.2
result.

The recorded hosted ordinary-path observation from 2026-10-18 is
[workflow run 39125461473](https://github.com/flair-agency/architecture-gatekeeper/actions/runs/39125461473),
[review job 117669646855](https://github.com/flair-agency/architecture-gatekeeper/actions/runs/39125461473/job/117669646855).
Merge metadata checking, selection/recording checks, and selected decision
validation succeeded. The refresh-fetch step and selected materialization step
were skipped under the ordinary Authority Set profile. This confirms the
normal path only; it is not evidence that a hosted stale event exercised
recovery. Issue #567 remains open for observation of a naturally occurring
stale-metadata event. No stale-event replay or live fixture probe was used
to produce these observations. Normal required CI and reviews for a
documentation change remain separate from operational recovery verification.
