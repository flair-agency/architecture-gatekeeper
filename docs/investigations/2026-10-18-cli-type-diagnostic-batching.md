# CLI type diagnostic batching (2026-10-18 JST)

This is a non-normative verification note for partial Issue #254 coverage, based on
adopted commit `89046bd30a501f7a3c1a643ab75d3bd54d0a165d`.

## Change and retained contracts

Only `test/ci-report-cli-types.test.mjs` and
`test/ci-decision-kind-types.test.mjs` change executable behavior. Their four test
cases and all seven type probes remain. Diagnostic TypeScript Programs decrease
from seven to two; existing AST/transpile operations are unchanged.

The report suite compiles five independent, memory-only sibling `.mjs` roots in
one Program. Each contains the complete original facade plus its original probe,
preserving module scope, relative imports and check-JS settings. Only each root's
filename is normalized when comparing diagnostics with the original facade.
Dependency and global diagnostics must be empty, and unknown probe indexes fail.
The existing runtime AST/import/export/hash/identity oracle is unchanged.

The decision-kind suite uses the existing, unchanged fixture diagnostic helper
to compile its two original physical `.mts` fixtures together. Positive fixtures
must remain diagnostic-free; negative fixtures retain their exact diagnostic
code, line and message checks. Dependency errors and unknown fixtures fail.
Production code, public APIs, compiler settings, workflows and acceptance policy
are unchanged.

## Focused measurements

Node 22.23.3, the same machine, serial runs, command:

```sh
node --test --test-concurrency=1 test/ci-report-cli-types.test.mjs test/ci-decision-kind-types.test.mjs
```

| Version | Whole-command wall time, seconds | Cases per run |
| --- | --- | --- |
| Adopted base | 16.385, 16.182 | 4 passed |
| Candidate | 5.830, 6.213 | 4 passed |

The two-sample mean decreases from 16.284 to 6.021 seconds (about 63%). This is
focused evidence, not a whole-suite or CI speed guarantee. Compilation now runs
at module setup, so per-case durations alone exclude that cost. No memory
improvement is claimed.

## Diagnostic equivalence and detection controls

An external comparison compiled all seven original inputs independently and in
their new batches. All diagnostic fields (including code, category, location,
length, full message and related diagnostics) matched after only report-root
filename normalization. Transitive source graphs also matched; dependency and
global diagnostics were empty. The comparison checked original probe strings
and the unchanged trailing runtime oracle against the adopted source.

An isolated detached worktree first passed all four unchanged cases. Each of
the following six temporary changes then failed at its intended assertion:

| Temporary change | Retained detection |
| --- | --- |
| Report argument widened to `any` | Invalid argument probe must produce its expected diagnostic |
| Report result widened to `any` | Invalid result assignment must produce its expected diagnostic |
| Report default argument removed | Original valid no-argument calls must compile |
| Report dependency given a type error | Dependency diagnostics must be empty |
| Decision-kind result widened to `any` | Untrusted result must not assign to trusted decision type |
| Positive report probe index changed to an uncompiled index | Unknown probe guard must fail |

All six were detected without timeout. The temporary worktree was removed and
no production mutation was retained. These controls establish the exercised
contracts; they are not a claim of exhaustive mutation coverage.

Final candidate SHA, full tests, strict/build/cycle checks, package identity,
unchanged CodeQL analysis, independent reviews and protected acceptance are
recorded separately in the PR's verification results. Earlier evidence is not
relabeled as a new invocation. Broader test ownership/composition work remains
in Issue #254; library/I/O evaluation remains in Issue #573.
