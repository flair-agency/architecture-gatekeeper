# Ordinary Gemini MAIN caller activation candidate

**Status: reviewed deployment candidate; activation pending.** The MAIN caller remains disabled on
`main` until this candidate receives review and separate owner deployment
approval. This note does not authorize activation, a provider/model call, or a
deployment. The seven-condition caller expression is a consistency guard; it
does not itself admit a run or establish owner authorization.

## Scope and current state

This candidate is limited to the workflow `if` expression, its focused
structural and synthetic condition tests, and this investigation. It changes no MAIN policy, canonical
authority, runtime, provider, WIF binding, credential, or protected-host
configuration. The reusable workflow remains pinned at
`7dc99525b4ff1510f1de310f6f5b877ab05bbfd2`; its permissions, selectors,
secrets, trigger, and copied same-repository classifier remain as on the
selected MAIN baseline `6fe98cb8109d7b17f73bafde64df34a2c0fb0104`.

The candidate expression requires all of these conditions:

- the copied classifier reports `same-repository`;
- event `pull_request_target`, action `ready_for_review`, and a non-draft PR;
- PR number 517 and head SHA
  `c4b0057d9dd47f79df2a896143f7ac6db5da2c2e`;
- workflow run attempt 1.

The expression narrows a future caller invocation to one context. It is not an
admission system: `ready_for_review` may happen again, and a new run can again
have attempt 1. A coordinator with owner authorization must admit one exact
context, observe that run, and stop. The caller will also automatically match
a repeated ready event at this head with a new attempt-1 run. The coordinator is prohibited from initiating
repeat ready-event admission, reruns, fallback, or a second attempt; the caller
does not enforce that procedural prohibition. This does not claim a
durably spent-once token or host isolation.

## Related decisions and evidence

The earlier owner-approved single #517 session remains unstarted. The #519
FEATURE caller was activated and merged (`43e9a28571ad0508a425220256a18d6b140525b2`); that feature result does not
authorize MAIN activation. The #525 MAIN caller was merged inactive (`bb7c6078766e2d63cbcaf91e8eab72a7bd46a83f`).
The #528/#529 ordinary MAIN Codex repair was merged and its E2E passed. The
#522 session remains held in another chat without edits. These are separate
work items and do not supply the owner decision for this candidate.

The feature protected-base result `43e9a28571ad0508a425220256a18d6b140525b2`, source head
`c4b0057d9dd47f79df2a896143f7ac6db5da2c2e`, and merge
`20cc0c1a58ee8263898a56c8df34472bd14ea173` are proposal references. They are
not asserted here as current immutable latest-source facts; the coordinator
must read back the exact source and protected base before any authorized run.

The owner reported WIF secrets configured. Their identity bindings,
authentication, and use have not been verified here. No paid provider call was
made or is included in this candidate. Provider/model settings and runtime
remain subject to their existing selected authority and separate owner
decisions.

## Review and activation boundary

This is not an adoption of the FEATURE authority into MAIN. It does not change
canonical policy or assurance requirements. Before any MAIN activation,
reviewers must inspect the exact source diff and owner approval must separately
authorize deployment. The existing single-session approval remains unconsumed;
it does not itself authorize MAIN deployment. Source adoption and
caller activation are distinct decisions. The candidate guard cannot stand in
for exact admission, and this local note does not prove GitHub evaluates the
expression as intended.

The focused tests use a YAML parser and a synthetic narrow expression
evaluator, and execute the copied classifier script against local fixtures.
The evaluator uses strict JavaScript equality, not GitHub Actions coercion;
its missing-field negatives are local diagnostics, not host-engine proof. It is not a GitHub Actions engine,
host-configuration check, or protected acceptance result. No approval or deployment event is implied by preparing or publishing this
candidate.

## Completed development verification

- Baseline: `6fe98cb8109d7b17f73bafde64df34a2c0fb0104`. No runtime,
  package, policy, or canonical Authority Set source changed.
- Node 22.18.0: lockfile installation with lifecycle scripts disabled, build
  (including strict TypeScript compilation), and five focused tests passed.
  Tests were directly invoked with Node so all five named test results were
  observable; `node --test` also exited successfully but reported only the
  file-level result in this environment.
- Independent read-only code review found one explanation issue concerning
  repeat-ready matching. It was corrected and the reviewer confirmed it
  resolved, with no implementation findings.
- CodeQL 2.27.1, JavaScript queries 2.4.6 and Actions queries 0.6.36:
  JavaScript/TypeScript baseline and candidate both have 58 findings; Actions
  both have zero. Complete SARIF result multisets, including locations,
  fingerprints, messages and flows, are equal. No findings were dismissed,
  suppressed or removed; no model changes. The final changed test and workflow
  bytes were checked against their actual database source archives. Both
  repository model regressions passed. The test was corrected after initial
  extraction, so JavaScript was freshly extracted and analyzed; the workflow
  remained unchanged in the completed Actions extraction.
- Native Skill E2E used the installed pinned entrypoint, the complete
  six-member Set at the baseline, and a separate read-only host reviewer
  (`gpt-6.1-sol`, medium). Its original `PASS` was preserved and deterministically
  validated. That result permits candidate preparation only, explicitly
  retaining the owner deployment boundary. Physical write denial and an
  enforced hard timeout were not claimed. Private request, response and
  provenance were retained; the temporary session was removed.
- GitHub readback confirmed #517's head, protected FEATURE base and ordered
  merge parents still match the recorded tuple above. Fresh input preparation
  yielded 12 files, a 148,882-byte packet and 150,799-byte encoded prompt within
  the 196,608-byte prompt bound, with all six authority IDs. The preparation
  implementation and its runtime/package/build sources match the pinned
  reusable revision. This is preparation, not an actual workflow run, admission
  or provider evidence.

These are development checks, not CI acceptance or verified deployment. The
remaining deployment check is governed by the existing
[credential-isolated review execution authority](../architecture/review-execution.md):
“Exact Google identity bindings, project, region, credential lifetime/renewal
and operational limits still require explicit selection and verification before
activation.” Configured secret names alone do not meet that requirement. Values
or secrets must not be posted to this investigation.

The existing single #517 session approval is retained. MAIN deployment requires
its own approval and satisfaction of these existing deployment requirements;
this candidate neither extends the execution budget nor requests a second
paid session.
