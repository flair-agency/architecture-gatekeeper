# #254: bounded test rationalization and ordinary CLI dispatch

This partial #254 increment starts at adopted main
`4571c046218c662c03b1467a80b83c5b30a806e1`. The
[removal proposal](https://github.com/flair-agency/architecture-gatekeeper/issues/254#issuecomment-6241916882)
records the retained coverage before the assertion removals. It follows the
[remaining-boundary inventory](2026-10-18-quality254-remaining-boundaries.md).
Production sources, workflows, policy, Authority Set, CodeQL configuration and
acceptance rules are unchanged.

## Removed duplication and retained oracles

No test case or fixture is removed. Fourteen duplicate assertion executions
are removed, with these exact replacements:

| Removed execution | Retained check of the same property | Distinct checks retained |
| --- | --- | --- |
| `policy.test.mjs`, `artifact CLI workflows run from runner.temp with anchored runtime paths`: consumer/self legacy prepare and validate cwd plus complete command strings (8 assertions) | `workflow-structure.test.mjs`, `production workflow files satisfy parsed structural invariants`, calls `assertWorkflowStructure` for both selected workflows; named legacy steps require the same `runner.temp` cwd and complete command strings | Provider legacy assertions remain: the provider workflow is outside that structural helper. All four owner-addition cwd/command assertions remain for each of the three workflows. |
| `policy.test.mjs`, `legacy v1 workflow binds protected instructions, authority, and exact report`: two raw legacy step-name matches | The same test still locates both parsed steps by exactly those names and asserts their cwd and complete commands; the structural suite also requires both names | Policy/prompt/schema/validation/provenance bindings remain in the original test. |
| `owner-amendment-merge-group-workflow.test.mjs`, `merge-group amendment verifier remains inactive in the self workflow`: `pull_request_target`, absence of top-level `merge_group`, local reusable workflow path, absence of merge-group accept/integrity jobs (4 assertions) | `policy.test.mjs`, `dogfoods only the protected reusable workflow with separated permissions`, retains the identical four regex assertions over the identical production workflow | Main branch, route condition, deny job, inactive verifier entrypoint, credentials, tag settings, script and binding checks remain. |

The general source-wiring regex assertions are not substitutes for execution.
Provider-specific, PASS-publication, fork-denial and review-environment suites
retain distinct targets or executable boundaries; this change removes none of
those suites. Reviewed-merge script flags and exact ordered-parent construction
also remain. Static workflow checks cannot establish live host protection.

## Reused compiler work

`helpers/type-fixture-diagnostics.mjs` compiles the explicit module fixtures of
one suite together. The four suites use four TypeScript Programs rather than
nine; they keep all nine fixture oracles:

| Suite | Retained diagnostic contract |
| --- | --- |
| `typescript-contract.test.mjs` | Positive imports/results; negative fields `2322` at lines 7/11 with both message checks; negative arguments `2345` at lines 3/4 with parameter-message checks; existing strict/noImplicitAny/noEmitOnError assertions and both JS coercion/getter compatibility tests |
| `typescript-tag-contracts.test.mjs` | Positive sync/async/thenable/external values; seven exact negative code/line tuples and all seven message checks, including readonly and unknown/nullability constraints |
| `typescript-block-compose-contract.test.mjs` | Positive flat/physical imports and callback compatibility; exact negative tuples `2322:4`, `2322:8`, `2540:10` |
| `typescript-owner-amendment-block-semantic-contract.test.mjs` | Positive flat/physical imports; exact negative tuples `2741:5`, `2322:6`, `2322:7`; existing required-field `@ts-expect-error` checks remain in the fixture |

These `.mts` fixtures are independent modules with the same suite compiler
options and dependency graph. Every diagnostic must either belong to an
explicit fixture and pass that fixture's oracle, or fail the dependency/config
assertion. The helper rejects lookup of an uncompiled fixture. It neither
suppresses diagnostics nor changes TypeScript options or production types.
Empty-diagnostic assertions summarize code, location and message rather than
passing compiler AST graphs to Node's assertion inspector. An initial isolated
positive-fixture mutation exposed an unbounded failure-reporting path (the
child was killed); that run is not defect-detection evidence. The final
negative controls must fail with the intended assertion and a readable report.

## Added production boundary

The existing `completed-owner-decision-self-v1` child-CLI case in
`owner-amendment-merge-group-route-composition.test.mjs` now also runs the exact
selected B with an empty signer-job listing and the expected tag404. It checks:

- Exact ordinary-dispatch stdout and `GITHUB_OUTPUT` binding to base/B.
- The production main inspected the exact run attempt and missing tag.
- No amendment eligibility directory, attestation invocation or artifact fetch.
- Restoring responses and clearing output still reproduces the amendment route.

The successful-signer/tag404 rejection, all six prior CLI failure cases and
their empty failed outputs remain. API/gh/model/attestation responses are
synthetic; real Git and production main execute. Ordinary dispatch is not an
ordinary-review PASS, protected adoption, canonical readback or ACTIVE proof.
The independent component-level no-signer test remains useful for its owning
producer-inspection boundary.

## Verification and remaining scope

With Node 22.23.3, the four focused type suites pass before and after the change.
One sequential local observation was 16.57 seconds before and 10.88 seconds
after, with all 11 tests retained. These are observations, not a performance
guarantee. The focused policy/structure/producer/route suites pass 82/82 in
7.55 seconds. The first new CLI run exposed a test-fixture reset omission
(ordinary output remained before the valid replay); the candidate clears the
output between those cases and the focused rerun passes.

All nine isolated/batched fixture diagnostic streams match, including code,
category, source positions, message and related information; dependency and
configuration diagnostics are empty. Twenty isolated-copy negative controls
detect errors in four positive fixtures, missing errors in five negative
fixtures, an imported source error, consumer/self/provider legacy commands,
owner-addition command, parsed legacy step name, four retained caller regex
conditions and the actual CLI ordinary-route binding. Each fails for its
intended oracle; the temporary copy is removed. These are ordinary test
mutations, with no new attack reproduction or security assurance claim.

Full verification and review/adoption results are recorded in the PR against
its final head.

The inventory's other main-dispatch negatives, full supported-tuple inventory,
old/new lifecycle matrix and live-host/consumer/adoption/readback proofs remain
open under #254 and its existing related issues. New consumer, bootstrap,
recovery or required-source profiles still require their existing owner
authority. No new owner decision is needed for this test-only increment.
