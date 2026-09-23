# Architecture Gate latency baseline (2026-09-23)

This records a pre-optimization baseline for [Issue #19](https://github.com/flair-agency/architecture-gatekeeper/issues/19). No workflow or runtime optimization was made for this measurement.

## Method

The self-Gate cohort is the 11 consecutive `Self Architecture Gate` workflow runs numbered 45 through 55 inclusive (IDs 35828071613 through 35845043390), with #55 as the selection cutoff on 2026-09-23. We count attempts separately: run #50 has both its failed attempt 1 and successful attempt 2, giving 12 measured attempts. The dates below are UTC. The selections are consecutive run numbers, not hand-picked by outcome. All 11 used `pull_request_target`.

The consumer cohort is separate: three recent successful `Architecture Gate` runs in `flair-agency/live-agency` observed for this investigation (IDs 35844039900, 35828125675, and 35725533053; all `pull_request`). This is a small illustrative cohort, not a consecutive sample and not suitable for a failure-rate estimate.

Job durations are GitHub Actions job durations rounded to whole seconds. For the self-Gate summaries, p50 means the median; when a series has an even number of observations, it is the arithmetic mean of the two middle values. Run wall time is the Actions run's displayed total duration for one attempt. Run-series span is the API `updated_at - created_at` for the entire run record and therefore includes reruns and any inter-attempt waiting. Jobs can overlap; their durations must not be added to infer wall time. A gap between jobs is visible elapsed time, not evidence of its cause.

For size, additions/deletions/files are current PR diff metadata. We mark a size as exact only when the PR's current head equals the sampled run's head SHA. For older heads, we give a change classification only; current PR size is not presented as historical size.

## Self-Gate attempts

Times are seconds. `PASS`, `BLOCK`, and `REVIEW FAILED` describe the final acceptance/report result, not merely the workflow's outer conclusion.

| Run / attempt | PR and change classification | Policy | Integrity | Review | Report | Accept | Attempt wall | Result |
|---|---|---:|---:|---:|---:|---:|---:|---|
| [#55 / 1](https://github.com/flair-agency/architecture-gatekeeper/actions/runs/35845043390) | #41 docs + package metadata; exact +9/-2, 2 files | 4 | 46 | 55 | 5 | 2 | 2:05 | PASS |
| [#54 / 1](https://github.com/flair-agency/architecture-gatekeeper/actions/runs/35843086966) | #39 workflow + policy docs; exact +86/-2, 4 files | 5 | 50 | 59 | 8 | 4 | 2:22 | PASS |
| [#53 / 1](https://github.com/flair-agency/architecture-gatekeeper/actions/runs/35842504329) | #39 policy docs; prior head, size not measured | 7 | 53 | 59 | 6 | 3 | 2:58 | PASS |
| [#52 / 1](https://github.com/flair-agency/architecture-gatekeeper/actions/runs/35841422677) | #38 reviewer permissions docs; exact +115/-2, 6 files | 4 | 50 | 70 | 6 | 4 | 2:28 | PASS |
| [#51 / 1](https://github.com/flair-agency/architecture-gatekeeper/actions/runs/35839611547) | #38 reviewer permissions docs; prior head, size not measured | 9 | 53 | 60 | 6 | 3 | 2:25 | PASS |
| [#50 / 1](https://github.com/flair-agency/architecture-gatekeeper/actions/runs/35838250895/attempts/1) | #38 reviewer permissions docs; prior head, size not measured | 6 | 51 | 21 | 7 | 3 | 1:41 | REVIEW FAILED; rerun followed |
| [#50 / 2](https://github.com/flair-agency/architecture-gatekeeper/actions/runs/35838250895) | #38 reviewer permissions docs; prior head, size not measured | reused | reused | 71 | 5 | 3 | 1:29 | PASS |
| [#49 / 1](https://github.com/flair-agency/architecture-gatekeeper/actions/runs/35837773912) | #38 reviewer permissions docs; prior head, size not measured | 7 | 50 | 67 | 7 | 3 | 2:27 | BLOCK (accept failed) |
| [#48 / 1](https://github.com/flair-agency/architecture-gatekeeper/actions/runs/35836276480) | #37 owner intervention docs + report code/tests; exact +78/-3, 6 files | 5 | 58 | 77 | 5 | 39 | 3:17 | PASS |
| [#47 / 1](https://github.com/flair-agency/architecture-gatekeeper/actions/runs/35835652660) | #37 owner intervention docs; prior head, size not measured | 5 | 52 | 58 | 4 | 4 | 2:20 | PASS |
| [#46 / 1](https://github.com/flair-agency/architecture-gatekeeper/actions/runs/35832057318) | #35 model-policy/config and test updates; exact +4/-4, 4 files | 5 | 46 | 58 | 8 | 3 | 2:30 | PASS |
| [#45 / 1](https://github.com/flair-agency/architecture-gatekeeper/actions/runs/35828071613) | #34 model-policy/config and test updates; exact +4/-4, 4 files | 5 | 55 | 104 | 6 | 4 | 3:08 | PASS |

For actual job executions (11 policy and integrity jobs each; 12 review, report, and accept jobs each), median (p50) and range were: policy 5s (4–9), integrity 51s (46–58), review 59.5s (21–104), report 6s (4–8), accept 3s (2–39). Successful policy and integrity jobs carried into the #50 retry are shown as `reused` and are not counted a second time. Attempt wall time was 2:26 median, range 1:29–3:17. The self-Gate run-level outcomes were 10 successful runs and one failed run; run #50's first attempt failed before its successful rerun. At attempt level there were 10 PASS and two non-PASS outcomes. These small counts are descriptive, not an SLO estimate.

The review job is the largest typical measured contributor, at 59.5 seconds median, and reaches 104 seconds in this sample. Integrity verification adds a relatively consistent 51 seconds at the median. The policy, report, and accept jobs are usually short, with the #48 accept job (39 seconds) an outlier worth checking in logs before drawing conclusions.

Run #50 makes attempt duration and run-series span materially different. Attempt 1 took 1:41 and attempt 2 took 1:29 as shown in the Actions UI, while the complete run record spans 12:01 from creation through final update. GitHub carried the successful policy and integrity jobs from attempt 1 into the retry; attempt 2 reran review, report, and accept. Integrity ended 08:39:20 UTC and the retried review began 08:48:54: a 9:34 visible gap across the rerun boundary. Available timing establishes that gap but not its cause. Investigate it separately; do not count it as integrity or review execution time.

## LIVE Agency consumer runs

These three successful runs are listed separately and not mixed into self-Gate percentiles.

| Run | PR change | Policy | Integrity | Review | Report | Accept | Run wall | Result |
|---|---|---:|---:|---:|---:|---:|---:|---|
| [35844039900](https://github.com/flair-agency/live-agency/actions/runs/35844039900) | #102 generic dataset write-intent contract; exact +31/-6, 1 file | 6 | 78 | 132 | 7 | 3 | 4:03 | PASS |
| [35828125675](https://github.com/flair-agency/live-agency/actions/runs/35828125675) | #101 GPT-6 model pilot; historical head, size not measured | 6 | 78 | 102 | 7 | 4 | 3:30 | PASS |
| [35725533053](https://github.com/flair-agency/live-agency/actions/runs/35725533053) | #97 architecture-gatekeeper hooks; exact +684/-7, 15 files | 8 | 77 | 144 | 8 | 5 | 4:21 | PASS |

Consumer run-series duration was 4:03, 3:30, and 4:21 respectively. The one older consumer run covers a much larger change, so it should not be compared as if these three were a controlled or representative performance sample. The observed consumer review jobs (102–144s) are longer than the self-Gate median, but this sample alone cannot establish a repository or change-size effect.

## Reproduction and limits

The source is GitHub Actions run/job metadata, not inferred durations from workflow YAML. For example:

```sh
gh run list -R flair-agency/architecture-gatekeeper --workflow self-architecture-gate.yml --limit 30
gh api repos/flair-agency/architecture-gatekeeper/actions/runs/RUN_ID/jobs --paginate
gh api repos/flair-agency/architecture-gatekeeper/actions/runs/RUN_ID
```

Use the run attempt selector/UI or `/attempts/N` pages to inspect earlier attempts; the jobs endpoint for the run's latest attempt does not replace the attempt history. For exact PR size, compare the PR head SHA to the sampled run head SHA before using `gh pr view --json additions,deletions,changedFiles`. If they differ, classify the sampled change from its contemporaneous commit/PR and leave historical size unreported unless reconstructed against the exact base and head.

Limits: this is a one-day, small dogfood sample, with repeated pushes to the same PRs, 12 attempts from 11 runs, and only three selected consumer runs. The cohort includes model-selection changes (#34 and #35), so it is not a controlled same-model sample. The current PR diff is not a historical diff for prior commits. The `#50` series includes an unexplained inter-job gap and one review service failure; #49 has an acceptance failure, and #48 has an unusually long acceptance job. This is enough to identify likely measurement targets—integrity execution, review variability, and the unexplained queue/wait gap—but not enough to set permanent p50/p95 targets, infer failure rates, or conclude that a fast path is safe. Continue collecting attempt-level durations and change classifications before selecting an optimization.
