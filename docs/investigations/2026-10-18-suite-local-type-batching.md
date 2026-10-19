# Suite-local type fixture batching (2026-10-18 JST)

This partial #254 increment starts at adopted main
`b2633798c208548c7112398cbf2c54493b6982ea`. The
[proposal and guard mapping](https://github.com/flair-agency/architecture-gatekeeper/issues/254#issuecomment-6245043065)
were recorded before replacing the repeated compiler/dependency checks.

## Selected boundary and retained oracles

Twelve test suites compile their existing positive/negative physical `.mts`
roots together through the unchanged `compileFixtureDiagnostics` helper.
Programs decrease from 24 to 12, with one Program per suite. Each suite keeps
its original project compiler options and exact per-fixture diagnostic oracle.
The helper rejects all dependency/global diagnostics before returning a scoped
fixture accessor, including an explicit error for an uncompiled fixture.

| Suite (`test/*.test.mjs`) | Fixture directory (`test/fixtures/`) | Retained fixture diagnostic counts: positive / negative |
| --- | --- | --- |
| `gemini-transport-types` | `gemini-transport-contract` | 0 / 0, including existing expected-error probes |
| `materialize-regular-git-snapshot-types` | `materialize-regular-git-snapshot-contract` | 0 / 3 |
| `owner-amendment-handoff-cli-types` | `owner-amendment-handoff-cli-contract` | 0 / 5 |
| `owner-amendment-merge-group-b-context-types` | `owner-amendment-merge-group-b-context-contract` | 0 / 4 |
| `owner-amendment-pr-run-context-types` | `owner-amendment-pr-run-context-contract` | 0 / 2 |
| `github-owner-addition-provenance-types` | `github-owner-addition-provenance-contract` | 0 / 7 |
| `github-owner-amendment-readback-types` | `github-owner-amendment-readback-contract` | 0 / 6 |
| `github-merge-group-event-types` | `github-merge-group-event-contract` | 0 / 3 |
| `github-ruleset-readback-types` | `github-ruleset-readback-contract` | 0 / 9 |
| `ci-procedural-authority-change-types` | `ci-procedural-authority-change-contract` | 0 / 3 |
| `owner-amendment-owner-decision-context-verifier-types` | `owner-amendment-owner-decision-context-verifier-contract` | 0 / 2 |
| `owner-amendment-owner-decision-handoff-types` | `owner-amendment-owner-decision-handoff-contract` | 0 / 8 |

All 27 cases and 24 fixture files remain. Their existing code/line/message,
strict-config, operation AST/hash, export identity and inert dispatch assertions
remain. An external printed-AST comparison verifies that 25 complete test
callbacks are unchanged. The two handoff CLI callbacks replace repeated compiler
setup with the guarded accessor: the positive still requires no diagnostics and
every negative assertion is unchanged. Existing per-call dependency guards map
to the helper's single whole-Program guard; no vacuous dependency filter remains
after the scoped accessor. The materializer's formerly dynamic dependency error
text is supplied by the helper's bounded diagnostic summary and a context label.

## Measurements and diagnostic equivalence

Node 22.23.3, same machine, serial whole-command measurements, two sequential
runs per version, with `node --test --test-concurrency=1` and the twelve suites
listed above:

| Version | Whole-command seconds | Cases per run |
| --- | --- | --- |
| Adopted base | 69.834, 61.066 | 27 passed |
| Candidate | 36.354, 36.194 | 27 passed |

The two-sample mean decreases from 65.450 to 36.274 seconds (about 45%) for
this selected command. Compilation now runs during module initialization, so
per-case durations alone omit that work. Whole-suite and hosted observations
belong to the final revision-bound PR verification; no memory gain is claimed.
An initial sandbox attempt reported files rather than actual cases and was
discarded. The retained runs require all 27 cases, zero failure/cancel/skip.

An external comparison compiles every original fixture independently and in its
suite's batch. Full diagnostic code/category/file/start/length/message/related
information and the union of transitive source graphs match, without filename
normalization. Each root is an external module without global augmentation.
Compiler option expressions are unchanged, fixture pairs are explicit, and no
Program/cache is shared across suites.

The unmodified isolated copy passes all 27 cases. Fifteen selected controls each
fail at the intended retained guard/oracle: omitting the negative root in each
of twelve suites, making the materializer's required output input optional,
widening the Gemini result from unknown to any, and introducing a dependency
type error. Copies are removed afterward. These controls exercise ordinary
type-test detection and do not constitute a security assessment or exhaustive
mutation coverage. Repository source/runtime files are never mutated.

## Remaining #254 work

Production source, fixtures, shared helper, compiler settings, public package,
authority, workflows and CodeQL models/settings are unchanged. Final strict,
build, full tests, distribution identity, applicable reviews and protected CI
remain revision-bound PR evidence. No acceptance route or assurance rule changes.

#254 remains open/partial for other measured compiler/setup costs, concrete
redundancy mappings and production-composition gaps. Existing tuple/migration,
consumer/bootstrap/recovery and live-host/adoption/readback obligations retain
their separate prerequisites. The existing I/O refactor is not the next task
while owner-independent test improvements remain available.
