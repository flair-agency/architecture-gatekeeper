# Issue #176 cost and usage measurement addition

This note defines how to add cost and model-usage observations to the
performance measurements for [Issue #19](https://github.com/flair-agency/architecture-gatekeeper/issues/19).
It is a measurement proposal only. It does not change review routing, model or
reasoning selection, service tier, acceptance policy, or consumer behavior.

## Available starting point

Issue #176 reports an OpenAI usage/cost export total for 2026-09-21 through
2026-09-27: approximately $74.69 across 2,483 requests, alongside 296
self-gate runs and 70 LIVE Agency runs. It estimates approximately 281 runs
reaching success or failure, 8.8 requests per completed Gate, and $0.27 per
completed Gate. These are issue-reported weekly aggregates, not a run-level
ledger. The export itself and its row-level dimensions are not included in
this repository, so the figures cannot be independently recomputed here.

In particular, dividing the weekly cost by completed runs does not attribute
spend to individual Gates. It is a rough cohort average only if the export
scope and run cohort align; unrelated API activity, incomplete runs, reruns,
and date-boundary effects can change that estimate. Keep it labeled as
approximate until requests can be joined to workflow run attempts.

## Per-attempt measurement record

Add these fields beside the existing latency, change-context, and decision
fields for each sampled run attempt:

| Field | Recording rule |
| --- | --- |
| Repository and workflow run ID | Identify the Gate run. |
| Run attempt | Record the attempt separately; do not merge reruns into one cost or duration observation. |
| Model | Record the policy-resolved model used by the review. |
| Reasoning effort | Record the policy-resolved effort. |
| Service tier | Record the effective tier if available from workflow configuration or request data; otherwise mark `unknown`. |
| Model request count | Count requests joined to this attempt, including retries. State whether failed requests are included. |
| Cache-read tokens | Sum the export's cached-input token field for joined requests; retain its original field name and units. |
| Cache-write tokens | Sum the export's cache-write token field when present. If unavailable or not separately represented, mark `unavailable`; do not infer it from cached-input totals. |
| Output tokens | Sum output tokens for joined requests, preserving any separately reported reasoning-token field. |
| API cost | Sum provider-reported cost for joined requests in the export's stated currency and precision. Do not derive it from token counts unless the rate card and calculation are separately recorded. |
| Review duration | Use the existing review-job duration and keep it distinct from request latency and total workflow wall time. |
| Outcome | Preserve the existing final `PASS`, `BLOCK`, `OWNER_DECISION`, or incomplete/failure distinction. |
| Attribution status | Mark `joined`, `partial`, or `unavailable`, with the join key and export window. |

Count both successful and failed model requests when the export includes
them. A Gate that times out, is cancelled, or fails before a decision remains
in the sample with its incurred usage and terminal state; it is not excluded
from cost summaries. Report per-attempt distributions and separately show
run-level rerun totals when useful.

## Attribution and summaries

Use an exact request-to-run-attempt correlation key when one is available in
both provider usage data and the workflow/reviewer logs. Validate the mapping
for duplicate request IDs, unmatched requests, missing export pages, and
timezone/date-window boundaries. Record the export generation time and the
provider fields used. Never place API keys, authorization headers, or other
credentials in measurement records.

If exact attribution is unavailable, report provider totals and workflow
counts as separate aggregates. Do not allocate daily or weekly aggregate
spend to individual Gates by dividing by run count, and do not present such an
allocation as measured cost per Gate. Request count per Gate may be reported
only for requests that can be tied to the corresponding run attempt; otherwise
label it as a cohort-level estimate and state the denominator.

For attributable samples, report median and p95 cost, request count, cache-read
tokens, cache-write tokens, output tokens, and review duration. Include sample
count and attribution coverage with each statistic. Keep self-gate and
consumer cohorts separate, stratify by model, reasoning effort, and service
tier, and retain change size/classification and outcome context from #19.
Small samples are descriptive and must not be treated as stable targets.

## Flex dogfood comparison

The issue proposes a self-review experiment using the existing
`gpt-6-sol` / `medium` selection with `service_tier = "flex"`. Treat this as a
separate, owner-reviewed experiment after a way to verify the effective
service tier and attribute its requests is available. Compare against
contemporaneous `gpt-6-sol` / `medium` baseline attempts with the existing
service tier; do not change the reviewer model or reasoning effort in the same
comparison.

Report cost and token distributions together with review duration,
resource-unavailable and retry rates, timeout/cancellation outcomes, and
`PASS` / `BLOCK` / `OWNER_DECISION` results. A service-unavailable or
incomplete review remains incomplete under the existing fail-closed path; it
must not be counted as a successful lower-cost review. This measurement note
does not authorize Flex for consumers or change any acceptance route.

## Relationship to the latency baseline

The [2026-09-23 latency baseline](2026-09-23-architecture-gate-latency-baseline.md)
contains job-duration measurements but no per-run provider cost or token
records. Preserve it as the historical pre-optimization latency baseline.
Cost measurements should be added to a future, clearly dated sample with
attempt-level rows and documented provider-export provenance, rather than
retroactively filled from the weekly aggregate in Issue #176.

This addition helps evaluate cost alongside latency. It does not by itself
identify avoidable spend or establish that a cheaper service tier, model,
reasoning effort, routing rule, or reduced review frequency preserves semantic
review quality. Those changes require their own measured comparison and
protected-policy review.

## Self probe execution record

For the first bounded self probe, record the exact pull request head and
workflow run/attempt before comparing results. Set the repository variables
`ARCHITECTURE_GATE_SELF_FLEX=true`, `ARCHITECTURE_GATE_SELF_FLEX_PR` to the
decimal PR number, and `ARCHITECTURE_GATE_SELF_FLEX_HEAD` to its exact head SHA.
Remove all three variables after the intended run starts. The caller enables
Flex only when all three values match that event, so another PR's event cannot
enter the probe while the variables exist. Verify the run received
`self-flex-probe=true` and that
the reviewer actually used Flex; the workflow input alone does not prove the
provider's effective service tier. Keep the ordinary required check enabled,
and record any unavailable or failed review as incomplete rather than PASS.

Add the run's duration, result, request and token counts, and provider cost
only when each value is available from a source tied to that exact attempt.
Mark missing provider data as unavailable instead of filling it from the
weekly aggregate.

The merged [Codex Action PR #4](https://github.com/flair-agency/codex-action/pull/4)
adds a numeric cache-write token field to the action's JSONL telemetry. The
Architecture Gate now pins its exact merge commit
`fd900e4108e7a526da3e955a6b56408802f03223` and verifies the reviewed source,
generated entrypoint, and tests against the protected provenance manifest
before review credentials are exposed. The emitted field is
`cache_write_input_tokens`; the action reports `unavailable` when usage data is
missing or invalid. This makes cache-write tokens observable when the provider
includes them in the Responses usage event, but it does not provide provider
cost, request-to-attempt attribution, or evidence of a cache write when the
field is unavailable.

## First self probe: observed run evidence

The following are two consecutive **PR #178 revisions**, not a controlled
same-diff comparison. GitHub Actions reports attempt 1 in each case. The
review job includes checkout and setup, so its duration is not model latency.
The token number is the Codex CLI's terminal `tokens used` display, not a
provider usage or billable-token breakdown.

| Run / exact head | Requested tier | Review job (UTC) | Duration | CLI tokens used | Decision / acceptance |
| --- | --- | --- | ---: | ---: | --- |
| [36332044377](https://github.com/flair-agency/architecture-gatekeeper/actions/runs/36332044377) / `370e45b6b3212780b473432ca4b1bf989a62b575` | Flex | 2026-09-27 16:08:16–16:09:00 | 44 s | 47,706 | PASS / required accept success |
| [36332457809](https://github.com/flair-agency/architecture-gatekeeper/actions/runs/36332457809) / `1abcdb734d715d46d21b7aa302261504efbe25eb` | Default | 2026-09-27 16:15:00–16:15:54 | 54 s | 45,581 | PASS / required accept success |

The first run's review job received `self-flex-probe=true` and the Codex
argument `service_tier='flex'`. The second run had the probe step skipped after
the temporary variable was removed. The second revision also changes the
workflow and tests, so the 10-second difference does not establish a tier
latency effect. Neither log establishes the **effective provider tier**, model
request count, cache-read/write split, or per-Gate API cost. These fields remain
`unavailable` until attributable provider records are supplied.

With the pinned Action, the self Flex probe can request Codex JSONL output for
that exact PR head. The Action consumes the stream in memory and writes only
numeric turn usage, cached-input token, and tool-start counts to the Actions
log; it does not persist or print raw JSONL. The ordinary review path does not
request JSONL. These Codex-reported token counts remain attempt-level runtime
observations, not provider billing records or proof of effective service tier.
Malformed or oversized event lines can leave telemetry incomplete without
changing the Action's final-message or acceptance result.

For the next exact-head probe, capture the Action's numeric telemetry line,
the review run and attempt, the selected PR head, protected base and reviewed
merge SHAs, the Gate decision, and the required acceptance result together.
Compare those observations with a later default-tier run only when all three
revisions and the review inputs match. The same PR head alone is insufficient:
an advancing base can change the merge revision and protected inputs.
Continue to mark billed cost and effective tier unavailable without
request-level provider evidence.

The owner supplied organization exports covering 2026-08-29 through
2026-09-28. Both contain **daily buckets**, with no request ID, GitHub run ID,
or request timestamp. The completion usage export groups by model and service
tier; the cost export has one organization-wide amount per day. On 2026-09-27
UTC, they report:

| Export cohort | Requests | Input tokens | Cached input tokens | Cache-write tokens | Output tokens |
| --- | ---: | ---: | ---: | ---: | ---: |
| `gpt-6-sol` / `flex-tier` | 5 | 166,102 | 120,457 | 45,630 | 2,061 |
| `gpt-6-sol` / `default` | 284 | 11,711,756 | 9,684,924 | 2,025,980 | 120,792 |

The cost export reports **$11.67463621 for the whole organization on that
UTC day**; it does not split cost by model, tier, repository, or run. The five
Flex requests show that the provider processed some `gpt-6-sol` requests at
Flex tier that day. The export cannot prove which run incurred them, even
though the intended probe was in that window. Therefore the effective tier,
request/token split, and API cost of run 36332044377 remain `unavailable` at
run level. No cost saving can be calculated from these exports.

For 2026-09-21 through 2026-09-27 UTC, these later exports total 2,511 model
requests and $75.41207220. The earlier issue snapshot gave approximately
2,483 and $74.69; its export generation time and completeness are unknown.
Keep both as separately sourced snapshots rather than silently replacing the
issue's figures. The [official organization usage API](https://developers.openai.com/api/reference/resources/admin/subresources/organization/subresources/usage)
documents aggregate buckets and service-tier grouping, but no exact GitHub
run-attempt join key. Per-Gate cost needs request-level records or a separately
validated exclusive-use measurement window with an appropriately grouped cost
source.

## Paired self probe after cache-write telemetry pin

The first run after the Action pin in PR #182 is a necessary runtime check, but
it cannot by itself prove Flex savings. Use this documentation-only PR as a
bounded probe candidate. Run the ordinary required self Gate first, then, only
if its review completes, rerun the **same PR head** with the self Flex selector
limited to this PR number and exact head SHA. Do not modify the PR head between
attempts. Record the actual protected base SHA, reviewed merge SHA, model,
effort, decision, Action pin, review-job duration, and numeric-only Action
telemetry for each attempt. A matching head without matching base and reviewed
merge is not a same-input comparison. Clear the temporary selector after the
Flex attempt starts and verify that it is absent.

This pairing checks whether the newly pinned Action emits cache-write usage
when the provider supplies it, and describes runtime token/turn differences
for two comparable attempts. It still cannot establish effective provider
service tier or billed dollars without attributable provider records. If the
second attempt would consume excess API credit or the first is incomplete,
stop the probe and record the incomplete comparison; do not weaken required
acceptance or substitute another model.
