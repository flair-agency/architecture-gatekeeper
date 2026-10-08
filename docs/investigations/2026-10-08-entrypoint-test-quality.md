# Scoped entrypoint test quality — 2026-10-08

This is the bounded #415 slice of quality parent #412. It reuses the #254
production-boundary inventory approach. Broader duplicate rationalization,
lifecycle matrices and live host proof remain with #254, #210/#211, #336 and
#374. This investigation does not amend the canonical Authority Set or make
these fixtures a new acceptance route.

## Production boundaries and retained coverage

| Risk / invariant | Actual production boundary | Retained test and observation | Limit |
| --- | --- | --- | --- |
| Environment selects valid reporting inputs; conclusion and digest reach summary, report, API comment and runner output | `src/ci-report.mjs` direct CLI `main`, including classification, rendering and API adapters | `test/ci-report-entrypoint.test.mjs`: synthetic PASS/BLOCK; report equals summary and simulated comment; expected inline payload and decision digest; matching selected v2 and legacy v1 provenance | CLI execution is real; semantic decisions and GitHub responses are synthetic |
| Invalid selected evidence or a mismatched repository/base/head/reviewed revision cannot reach reporting/output | Same CLI: required provenance, G0 procedure and legacy binding checks | Missing/malformed selected provenance; G0 repository/base/head mismatch; legacy base/head/reviewed mismatch; matching and differing well-formed v2 G0 Authority Sets. Rejections leave summary/report/output empty and issue no fetch calls | No live producer authentication or protected acceptance proof |
| Stale-head handling and reporting failures keep their existing meanings | Same CLI: inline review, best-effort issue comment, then local output append | Stale head prevents inline POST; configured HTTP 503 produces a warning while valid local output remains; unwritable output exits nonzero. Fixture violations are recorded independently and asserted, even if production catches an API error | Reporting is not atomic: a simulated comment may precede an output-file failure. The tests do not claim rollback or turn best-effort comment failure into a new acceptance condition |
| Exact recorded policy, caller/reusable workflow, repository/base/B/run/attempt/job and artifact must compose before finalization | `src/owner-addition-finalize.mjs::finalizeOwnerAddition`, actual provenance/artifact/parser/readback adapters | `test/owner-addition-finalize-composition.test.mjs` and its fixture: a complete successful record, exact API paths and serialized record fields; wrong repository/base/producer head/run/attempt/job/workflow and merge second parent; missing evidence. Each negative asserts its specific error and last request stage | External GitHub metadata, review decisions, artifact ZIP and authority bytes are controlled synthetic responses, never live SELECTED/VERIFIED attestations |
| Canonical readback uses observed ref and exact authority state | Same finalizer through `verifyOwnerAdditionReadback` and adoption evaluation | Observed ref success; wrong/missing observed ref, changed authority bytes and unproved ancestry reject without returning a record | No real merge, publication, consumer adoption or host enforcement is performed |
| A never-settling HTTP success/error response body remains pending before the recorded deadline and rejects at it | Actual `executeGeminiReviewer` body consumption and cooperative cancellation | Two retained cases in `test/gemini-transport.test.mjs`: body-entry handshake, mocked Date/setTimeout, pending/live signal at 24ms, timeout/aborted signal at 25ms; generous outer 5s test bound | The clock tests deadline logic, not provider latency or physical process termination |

Existing `ci-report.test.mjs`, `ci-authority-route.test.mjs`,
`owner-addition-finalize.test.mjs`, `github-owner-addition-readback.test.mjs`,
`owner-addition-adoption.test.mjs` and `github-owner-addition-provenance.test.mjs`
retain helper, compatibility and historical regression coverage. No case was
removed. The two timer cases replace only the old 20–200ms elapsed-time
assertions; there is no test-count reduction quota.

The CLI hook replaces `globalThis.fetch` before the real entrypoint executes,
uses a synthetic token and temporary files, rejects unexpected API origins and
routes, and persists a violation list that every run checks. Finalizer fixtures
inject only external responses, construct an artifact using the existing
addition-record digest helper, and execute actual production composition. The
small ZIP builder is fixture data construction; it does not reproduce the
production ZIP decoder or validation logic. Existing ZIP builders are local to
other tests rather than exported shared helpers.

## Demonstrated defect and correction

Before the composition regression, the finalizer discarded the GitHub ref
name and supplied a newly synthesized `refs/heads/<expected branch>` to the
readback validator. Returning a known target SHA together with the wrong ref
name therefore produced `canonical=verified`; the initial refined suite was
12/13. The one-line correction passes `targetRefRaw.ref` unchanged to the
existing verifier. Wrong and missing ref names now trigger its existing
rejection. This restores the observed-target-ref requirement in
[`owner-addition.md`](../architecture/owner-addition.md), especially the
canonical placement/readback contract; it introduces no new assurance rule.

## Verification and defect detection

Focused source-only coverage executes the actual entrypoints:

```sh
node --test --experimental-test-coverage \
  --test-coverage-include='src/ci-report.mjs' \
  --test-coverage-include='src/owner-addition-finalize.mjs' \
  test/ci-report-entrypoint.test.mjs test/ci-report.test.mjs \
  test/ci-authority-route.test.mjs \
  test/owner-addition-finalize-composition.test.mjs \
  test/owner-addition-finalize.test.mjs
```

Observed on Node 22.22.0/macOS: 68 passed, 0 failed, about 0.66s.
`ci-report.mjs`: 96.35% lines / 84.73% branches / 100% functions.
`owner-addition-finalize.mjs`: 90.11% lines / 70.59% branches / 94.59%
functions. These are this command's source-only measurements, not a full-suite
coverage claim or a percentage target. The original #415 baseline was a
different full-suite revision; compare uncovered boundaries, not percentages
as if the runs were identical.

Four separate temporary copies of `src/`, `test/` and `package.json` tested
selected mutations. Each selected control test passes in the unmodified tree;
only its isolated copy is changed, and every copy is removed afterward.

| Deliberate isolated mutation | Retained detecting command | Observed result |
| --- | --- | --- |
| Remove the CLI legacy base/head/reviewed binding guard | `node --test --test-name-pattern='requires and validates selected Authority Set and legacy' test/ci-report-entrypoint.test.mjs` | Exit 1: mismatched evidence reaches output and the expected rejection assertion fails |
| Remove the producer run-attempt equality check in `github-owner-addition-provenance.mjs` | `node --test --test-name-pattern=wrong-attempt test/owner-addition-finalize-composition.test.mjs` | Exit 1: the retained specific-error/stage assertion detects the missing check |
| Restore synthesis of the expected target ref in the finalizer | `node --test --test-name-pattern='readback-ref|readback-missing-ref' test/owner-addition-finalize-composition.test.mjs` | Exit 1: wrong/missing observed ref produces a record rather than the required rejection |
| Replace both response-body deadline races with direct awaits in `gemini-transport.mjs` | `node --test --test-name-pattern='races never-settling response body' test/gemini-transport.test.mjs` | Exit 1: Node detects unresolved test promises after the mocked deadline; both cases are cancelled, not passing |

No mutation was made in the working source or committed. This is evidence of
these selected defects being detected, not a general mutation score.

The deterministic clock follows the supported Node 22
[MockTimers API](https://nodejs.org/download/release/v22.17.0/docs/api/test.html#class-mocktimers).
Real scheduling remains in child-process and installed-package tests, with
bounded subprocesses. No flake was observed in these focused runs; tight bounds
are a risk distinct from an observed flake. The existing macOS preview
installed-smoke 120-second limit from #414 remains diagnostic context, not a
reason to weaken the deadline or skip the distribution check.

## Remaining boundaries

The finalizer's public CLI argument/token lookup/output-file wrapper is not
covered by these composition tests; they call its public production function.
Installed-package smoke separately checks distribution/entrypoint behavior.
API access, principal authentication, required-check enforcement, real merges,
canonical placement and published registry readback are not demonstrated by
synthetic success. Existing live proof and host adapter issues retain them.

Some parse-error and best-effort inline-error paths remain outside this focused
slice, including malformed optional G0 fields, inline fetch exceptions and
link-warning rendering. The coverage output also leaves finalizer policy/input
error branches and its CLI wrapper unexecuted. This map retains those gaps
explicitly rather than claiming every line is required or covered.
