# Ordinary CI execution verification — Issue #332

Status: partial verification, 2026-10-04. This investigation maps delivered
implementation to #332; it is not canonical authority or route adoption.
The six-member Authority Set, especially the [execution contract](../architecture/review-execution.md#target-provider-independent-ci-execution-boundary-issue-332-owner-decision-2026-10-04), remains authoritative.

## Delivered boundary and criterion map

PRs #339, #340, #343, #344, #346 and #348 are merged. The Action remains a
workflow adapter. No generic Node executor, automatic fallback, parallel result
adoption, Gemini activation or stronger termination assurance is introduced.

| Issue criterion | Implementation and verification | Remaining evidence |
| --- | --- | --- |
| Canonical responsibility split | #339; protected selection, execution, semantic validation and acceptance are separate | None for recording the adopted split |
| Explicit inputs/outcomes and bounded diagnostics | `ci-execution-result.mjs` and `ci-execution-observation.mjs`; result and observation tests exercise exact bounds, failure/cancel/skip/unknown, missing/oversized responses, redacted fixed status and malformed metadata | Whole-job cancellation can prevent observation; absence is not successful execution |
| Upstream observability/enforcement inventory | Fixed-source inventory below | Actual descendant termination, kill time and runner recovery remain unknown |
| Pinned Codex compatibility | Both workflows retain upstream pin; `resolve-ci-policy.test.mjs` verifies legacy output shape and protected standard/Flex precedence; composition tests bind the same settings to Action inputs and observer | Representative reusable consumer hosted verification; requested settings do not attest backend identity |
| Exact B/H/reviewed input binding | `prepare-review-context.test.mjs` uses divergent real Git history, rejects reversed/wrong merge parents and one-parent reviewed commits; `prepare-review-file-context.test.mjs` verifies committed snapshots/references | Self adopted-path evidence below; separate consumer exercise remains |
| Full context and explicit bounds | Authority Set tests enforce file/aggregate/rendered prompt limits; file-context tests enforce count/file/serialized bounds and malformed snapshots; prepared review tests reject complete prompt/envelope overflow before startup | These are route-specific limits, not an assertion that both context representations are identical |
| Execution plus semantic validation and cleanup | Prepared decision tests cover PASS/BLOCK/OWNER_DECISION, exact IDs, consumer rules, malformed JSON/schema/UTF-8; prepared CLI composition cases cover response normalization followed by validation and cleanup | Offline fake CLI/proxy results are not authenticated Vertex review or hosted Codex cancellation evidence |
| Pre-commit verification | Record actual commands/results with the implementation PR | Tests, native AGK, uncommitted review and CodeQL must complete before commit |

## Fixed upstream Action inventory

Sources inspected at `86365089eb2b84e0a8fb0717b304f8bdcb13b20e`:
[action.yml](https://github.com/openai/codex-action/blob/86365089eb2b84e0a8fb0717b304f8bdcb13b20e/action.yml)
and [runCodexExec.ts](https://github.com/openai/codex-action/blob/86365089eb2b84e0a8fb0717b304f8bdcb13b20e/src/runCodexExec.ts).
This is a source inventory, not a reproduction or diagnosis of #215.

| Fact | Observation or control | Limit of the evidence |
| --- | --- | --- |
| Invocation | Composite Action launches Node; `runCodexExec` spawns the constructed CLI command, writes selected prompt to stdin and inherits stdout/stderr | Does not attest model consumption or provide a process-tree receipt |
| Requested settings | Model, effort, schema, arguments and read-only sandbox are supplied to the constructed command | The shared expected identity records requested settings, not backend model identity |
| Completion | Child `error` rejects; `close` with nonzero code rejects; zero code triggers final-message read and output publication | CLI zero exit or output existence is not semantic PASS |
| Response | Action exposes `final-message`; AGK normalizes the exact same source used by validators, with a 64 KiB ceiling | Raw stdout/stderr can contain task material; shared fixed status does not make upstream logs redacted |
| Deadline/cancel | AGK applies policy-selected step/job deadlines; GitHub host dispatches cancellation | `runCodexExec` supplies no spawn timeout, AbortSignal or process-group kill/acknowledgment protocol; no proof of descendant termination or recovery |
| Cleanup | Temporary output cleanup is in finalization; temporary inline-schema cleanup is in `finally`; explicitly supplied output/schema files are retained | Finalization is reached only after zero exit; nonzero exit can bypass temporary output cleanup. Abrupt termination can bypass JS cleanup. The composite defines no proxy shutdown step; do not claim universal cleanup |
| Missing response/failure | Common normalizer exposes no response bytes after failed/cancelled host outcome or absent/oversized response | Cause and termination stay unknown; cancelled whole jobs may never execute the observer |

Existing safeguards are preserved. No retries, kill implementation, upstream
patch or weakened acceptance are included in this verification work. Reliability
work remains #215; provider deployment and live dispatch remain #333/#334.

## Hosted self evidence

[Run 37191832982](https://github.com/flair-agency/architecture-gatekeeper/actions/runs/37191832982)
at attempt 1 exercised protected base `6104f439e78b02b9c00ce2c5a049bc224b36f5e6`
through pinned runtime checkout, Codex execution, observation, validation,
reporting and successful acceptance. It predates protected adoption of #348 and
therefore does not verify the new self context preparation step.

[Run 37194082231](https://github.com/flair-agency/architecture-gatekeeper/actions/runs/37194082231)
at attempt 1 exercised protected base `3c1f44d19245716b9e2ef2491f4bfb6409139d32`,
head `aab4ae752baebbda5ab1c121125a4287d0bb240e`, and reviewed merge
`55f2da82d4e19c31f8b665bdd1eb15b6e4ded3fc`.
[Review job 111412219908](https://github.com/flair-agency/architecture-gatekeeper/actions/runs/37194082231/job/111412219908)
completed pinned checkout, exact task context preparation, complete prompt
preflight, Codex execution, common observation, consumer validation and exact
Authority IDs successfully. Reporting and OWNER_DECISION evidence production
also succeeded. Acceptance correctly failed because the validated semantic
result was OWNER_DECISION. This verifies execution/validation/reporting and
fail-closed separation; it does not establish acceptance of that candidate or
turn OWNER_DECISION into PASS. It is not a hung failure and must not be retried
as one.

## Closure limits

Keep #332 open until its full criterion evidence is reconciled. Representative
reusable-consumer protected-policy-selected hosted review/reporting remains
unverified, so public consumer adoption of the execution object stays withheld.
Offline fixtures can establish interface behavior and cleanup of owned local
resources; they cannot establish authenticated provider operation, host process
termination or merge-enforcement configuration. Gemini WIF deployment, activation,
quality/cost/latency evaluation and governance remain in #333–#338. These delivered
seams do not resolve Codex Action hangs.
