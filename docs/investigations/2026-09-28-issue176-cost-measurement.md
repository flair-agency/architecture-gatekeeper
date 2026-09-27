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
workflow run/attempt before comparing results. Temporarily set the repository
variable `ARCHITECTURE_GATE_SELF_FLEX=true` only while starting that run, then
remove the variable. Verify the run received `self-flex-probe=true` and that
the reviewer actually used Flex; the workflow input alone does not prove the
provider's effective service tier. Keep the ordinary required check enabled,
and record any unavailable or failed review as incomplete rather than PASS.

Add the run's duration, result, request and token counts, and provider cost
only when each value is available from a source tied to that exact attempt.
Mark missing provider data as unavailable instead of filling it from the
weekly aggregate.
