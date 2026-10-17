# Production-boundary inventory and remaining work for #254

This non-normative inventory reads adopted main
`7f41f880342298d3b8e41b5034b18383dd32cbe1`, after normal adoption of
[#593](https://github.com/flair-agency/architecture-gatekeeper/pull/593) and
[#594](https://github.com/flair-agency/architecture-gatekeeper/pull/594).
It records source/test relationships, not a new test execution or an authority
decision. #254 remains partial. Completed quality parent #412 and original96
migration #419 do not close the broader lifecycle or test-rationalization scope.

## Existing production composition

The actual child call is in
[`owner-amendment-merge-group-route-composition.test.mjs`](../../test/owner-amendment-merge-group-route-composition.test.mjs),
subtest `executes production main with tagged G0 evidence and rejects runtime
and receipt binding mismatches`. It executes
[`scripts/owner-amendment-merge-group-gate.mjs`](../../scripts/owner-amendment-merge-group-gate.mjs)
and nested semantic input preparation with real temporary Git objects. It runs
for `completed-owner-decision-self-v1`; the surrounding
`completed-block-v1` case composes components rather than invoking main.

GitHub API/GraphQL, `gh`, artifact transport and attestation observations are
controlled fixtures. Production functions construct and consume semantic
eligibility bytes, but there is no live model, authenticated attestation,
protected queue transition or canonical readback in that child trace. Separate
component projections still use supplied collaborator results and must not be
counted as execution of the complete CLI.

| Invariant | Production boundary and actual retained test | What remains unverified at the CLI/live boundary |
| --- | --- | --- |
| Exact repository/base/B/queue selection | Child CLI above; `owner-amendment-merge-group-b-context.test.mjs`, `selects one exact open same-repository B bound by merge commit and queue entry` plus wrong-tree, ambiguous-PR and queue-binding cases | The selector's full rejection matrix is function-level; fixtures do not authenticate live GitHub observations. |
| Protected prior policy and checked-out runtime | Child CLI reads prior policy from Git and rejects a checked-out revision different from the selected base; acceptance test `fails closed on absent prior opt-in and leaves profile selection disabled by default` | The absent-opt-in case is not a child-main trace. No candidate policy or test success activates the route. |
| Canonical records and tag bindings | `owner-amendment-merge-group-evidence.test.mjs`, `rejects malformed canonical envelope bytes and evidence digest mismatch before verification`; semantic test `production BLOCK adapter rejects non-profile AmendmentRecord bytes before semantic preparation` | Malformed closed records have component coverage, not every child-main output rejection. |
| Complete trigger/Authority Set bindings | `owner-amendment-semantic-eligibility.test.mjs`, `OWNER_DECISION prompt, AmendmentRecord, and receipt bind every changed authority member`; acceptance test `OWNER_DECISION requires complete ordered multi-path hashes and Authority Set digests through acceptance` | This is semantic preparation/acceptance composition, not live producer execution or all supported topology traces. |
| Producer run/attempt and artifact identity | Child CLI rejects missing exact artifact, consistently expired metadata, and selected/detail run-attempt disagreement. `owner-amendment-artifact-discovery.test.mjs` separately covers pagination, duplicate/mismatched artifacts and run association | Additional function-level identity and pagination cases are not all executed through main. Controlled artifact/attestation bytes do not establish producer provenance. |
| Missing tag cannot hide a successful signer | Child CLI supplies the exact expected tag404 with successful pre-queue signer history and observes the existing missing-tag diagnostic, empty stdout and empty `GITHUB_OUTPUT`. The [test-rationalization increment](2026-10-18-quality254-test-rationalization.md) adds no-signer ordinary main dispatch with exact outputs and absence of amendment preparation | The producer-inspection component case remains independent coverage. Synthetic ordinary dispatch does not establish completed ordinary review, protected adoption or live host enforcement. |
| Receipt and prepared-input binding | Child CLI rejects a receipt for another B. `owner-amendment-merge-group-acceptance.test.mjs` separately rejects model/effort/digest mismatch and absent or invalid exact prepared inputs | Main does not execute every acceptance negative. No synthetic receipt establishes authenticated execution. |
| Observable failure and valid fixture restoration | All six retained child failures assert empty stdout and workflow output. The discovery/tag mutations restore cloned responses before one valid replay, whose output remains pre-transition with adoption/canonical placement pending | Restoration verifies this fixture, not a production retry guarantee. Success does not mean adoption. |

The child failures are wrong checked-out base, wrong receipt B, missing artifact,
expired artifact, conflicting attempt and missing tag with successful signer.
The [focused coverage note](2026-10-18-merge-group-cli-evidence-coverage.md)
records their specific diagnostics. No new tests, removal or mutation experiment
is part of this inventory.

## Six lifecycle areas retained by the issue

| Requested area | Retained production/test coverage | Remaining outcome and owning scope |
| --- | --- | --- |
| Supported predecessor reachability | The child trace above exercises one selected self OWNER_DECISION tuple; BLOCK evidence and both-profile eligibility have separate component tests | Enumerate supported predecessor/profile/topology/bounds/host/merge tuples and finite traces. Do not infer a complete graph from one fixture. #254/#299 retain this inventory; live host proofs remain separate. |
| Old/new migration matrix | `preview-migration-initial.test.mjs`, `initial compatible v1→v2 M passes old review, binds raw unchanged authority, then fresh successor B works`; `preview-lifecycle-cli.test.mjs`, `CLI child composition supports the selected initial legacy migration and fresh review`; owner-addition v4/v5 parser/caller tests | These exercise different mechanisms and assurance profiles, not one completed v1/v2/v4/v5 matrix for an external consumer. Preserve explicit unsupported combinations and predecessor selection under #301/#254. Preview observation is not protected adoption. |
| Bootstrap plus second normal adoption | No lifecycle bootstrap-plus-second-adoption trace was identified in the reviewed tests; measurement-bootstrap tests concern diagnostics | A selected exact lineage/authorization and implemented transition plan are prerequisites to the actual proof. #299 retains the lifecycle scope. Do not introduce bootstrap selection to fill a test row. |
| Consumer fixture | `owner-addition-finalize-composition.test.mjs`, `real finalizer composes selected policy, producer evidence, immutable workflow, merge and readback`; preview CLI composition | Synthetic finalizer/preview tests do not establish an external consumer's selected release/caller, least-privilege host or live enforcement. Retain the exact consumer prerequisites rather than generalizing self-only permissions. |
| Oversized predecessor recovery | Authority preparation/manifest/member tests enforce existing limits and reject oversized inputs | No positive, preselected recovery-profile trace through complete old/new authority, adoption/readback and ordinary preparation is established by those rejection tests. #300 owns recovery; new profile/bounds selection requires owner authority. |
| Self commissioning and phase failures | Child pre-transition tests; `github-owner-amendment-readback.test.mjs` exercises merge parents/tree, changing refs and canonical bytes at its own boundary | Actual protected BLOCK and self OWNER_DECISION normal cycles and readbacks remain #210/#211/#137, coordinated by #299. Static inactive-workflow checks and injected API observations do not supply those traces. |

## Duplicate-test disposition

No deletion is proposed from this inventory. Discovery-function tests retain
pagination/identity diagnostics; child tests add process/output behavior.
Evidence, semantic producer and acceptance suites protect different bindings;
readback tests observe a later phase. Preview CLI tests exercise a distinct
unverified procedure. Static workflow checks separately retain inactive-route
wiring. Shared assertions or the same normal fixture alone are insufficient
grounds to remove any of those boundaries.

Before proposing a removal, identify the exact invariant and assertion,
retained production boundary and test, distinct negative/compatibility behavior,
and any uncovered scope. Demonstrate equivalent defect detection where needed;
do not delete cases to meet a count or speed quota. This inventory identifies
no complete equivalent mapping that justifies removing those suites. The
[bounded rationalization](2026-10-18-quality254-test-rationalization.md) later
maps fourteen duplicate assertion executions to retained oracles and reuses
compiler work without removing type fixtures or test cases.

## Next bounded work and decision boundaries

Owner-independent follow-up can finish the supported-tuple inventory and
compare further concrete duplicate candidates against retained assertions. The
bounded rationalization exercises the existing no-signer ordinary dispatch
through main. A distinct malformed-record output rejection remains a possible
test task after confirming its added boundary value. These are not newly
required routes and are not all blocked by #210.

Live host/consumer proofs need the exact selected inputs and operational
prerequisites from their owning issues. #210 explicitly retains the canonical
owner decision for extending ordinary-PR App required-source acceptance; that
decision does not prevent ordinary source/test inventory. New consumer,
bootstrap or recovery profiles cannot be invented by a fixture. #573 owns the
separate Git/filesystem implementation model; #576 owns early capacity feedback.
Neither issue is a new prerequisite for this bounded test inventory.

## Existing verification references

These results belong to their original reviewed heads and are not rerun claims
for this documentation change:

| Adopted increment | Reviewed head | Focused/full observation |
| --- | --- | --- |
| #593 | `7d7ab2a9d076ca0487ac6ec8aeabb0934615b755` | Node22 composition7/7 in6.39s; full2,058/2,058 in467.77s, zero fail/skip/cancel |
| #594 | `21ec6a9ce61dc92ab2ec0a2bb62f8dd85f54eacb` | Node22 composition7/7 in6.51s; full2,058/2,058 in458.82s, zero fail/skip/cancel |

Their current-head CI, CodeQL/model, Code/Security Review, independent integrated
review, Native Skill review and non-skipped protected acceptance passed before
normal adoption. CodeQL check success does not declare the previously recorded
16 unrelated results or same-user filesystem concurrency limits fixed. No
additional security reproduction, model execution, alert dismissal, query/model
change, protected-check change or route activation is part of this inventory.
