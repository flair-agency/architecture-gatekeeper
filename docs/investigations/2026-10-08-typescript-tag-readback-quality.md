# Typed owner-amendment tag readback callbacks (#419 / #417)

Nonnormative third implementation slice under #412, based on
`57f50d9503d40da38f2a5e18fea218d54d1760e9` (PR #433). It introduces no selected
authority, consumer policy, credential interface, evidence meaning or acceptance
rule. The adjacent tag creation adapter and other acceptance orchestration stay
with their existing modules.

## Boundary and type benefit

The original flat `readOwnerAmendmentTagForMergeGroup` function remains available.
The authored `.mts` and generated implementation move under `owner-amendment/`.
Named input, result and callback contracts expose the existing fetch dependency
and the raw tag object dependency. The latter can return Buffer synchronously or
through a Promise; the fetch response decodes JSON as unknown. Retained API
ruleset/ref payloads stay unknown in the public result, and transport readback
does not establish provenance, eligibility, adoption or acceptance.

Existing runtime checks and JavaScript evaluation order remain controlling: input
repository/B/ref/ruleset/token validation, ruleset update/deletion/no-bypass
checks, initial annotated ref mapping, bounded raw bytes and exact object hash,
UTF-8/header/newline/JSON checks, and repeated final mapping. The existing bare
Git read mechanism and its cleanup stay intact. This slice performs no real
remote tag creation, GitHub API request or route activation in its tests.

The ref validator originally reads the SHA property for the regex and again
when returning it. An injected response can have a changing getter; keep the
callback's OID argument unknown rather than claiming the first read proves its
later value. Retained OIDs are conservatively unknown in the result. Named raw
Buffer and synchronous/asynchronous callback contracts still expose what the
byte validator establishes.

Readonly result/tag fields reflect only the existing shallow Object.freeze
calls. Buffer contents and retained API payloads are not claimed to be immutable.
Local casts describe original JavaScript property reads or completed runtime
checks; they do not replace validation. External API JSON remains unknown.

## Verification

- Clean locked install, strict mapped-output check and actual source graph pass:
  **99 runtime + 3 authored modules**, no static relative cycles. The original
  96 paths plus three generated modules are not 99 migration completions.
- Coordinator compared the actual base Git blob with the generated implementation
  using pinned Acorn 8.19.0. The ASTs match exactly after ignoring only positions
  and literal raw spelling. Type erasure and formatting leave runtime expressions,
  checks, property reads, calls, return values and errors intact. This excludes
  the intentional flat facade and build-map change, checked separately.
- Actual-tsconfig positive fixtures accept synchronous and asynchronous Buffer
  callbacks, unknown OID narrowing and mutable Buffer contents. Ten exact
  code/location/message negatives reject missing json, synchronous fetch/json,
  non-Buffer sync/async returns, missing input fields, unrefined unknown values
  and assignment to frozen result fields; unexpected module diagnostics fail.
- Worker focused runtime/type/build checks **16/16 pass**. Independent frozen
  review found no actionable code/docs findings; contract **2/2** and runtime
  **13/13** pass independently. The added third-folder build fixture checks
  recursive extra output and preserves all three mapped outputs on failure.
  Existing first/second-folder missing/stale/symlink/hardlink/compiler-error
  fixtures remain; this slice does not claim separate exhaustive third-folder
  negatives for every shared path check.
- Full source suite: **1205/1205 pass**, zero failures/skips/cancellations,
  **130.898 seconds**. Existing cases and deadlines are unchanged.
- Scoped generated runtime coverage from tag readback/merge-group evidence
  tests: **22/22 pass**, 76.64% lines, 69.39% branches, 88.89% functions.
  The default bare-Git read path is not exercised by these injected offline
  fixtures; these percentages describe this scope, not a quality target or
  complete remote verification.
- Actual npm archive contains **119 files** including byte-identical flat and
  generated peers. Clean offline install needs no TypeScript/Node declarations/
  Acorn/YAML at runtime. Installed production/readback/composition checks
  **106/106 pass** and deterministic transport-deadline cases **2/2 pass**.
  Complete installed smoke **passes with all existing cases/deadlines**,
  including the unchanged 120-second five-file preview child. Package setup,
  production cases and whole smoke together take **140.482 seconds**.
  This run follows full-source completion, with no concurrent coordinator full
  suite; Node **22.22.0**, host reports 12 CPUs. The archive integrity is
  `sha512-kK8MeqCkx3vQgRBk6JdWKpaIgGGspQixU4kr8TShBFRxOl2LPwCSEPvlQVbtP9J5q5zH/FkOiUHx8j2mUVWfbg==`.
  No preview/smoke code, cases or bounds changed. PR #433's two earlier timeout
  observations remain historical; this new candidate's PASS does not prove their
  cause or replace fresh checks on a future main-integration candidate.
  Read-only diagnosis established the earlier timeout location/termination only;
  isolated file timings cannot be summed to establish parallel suite duration.
  Git fixture/host contention remains an unproven hypothesis.
- Native architecture review of the final committed candidate is pending.
  Fresh main-target CI/CodeQL/protected acceptance are pending integration;
  local typing, independent review and native feedback do not establish them.

## Remaining scope

The combined inventory is **3/96 original modules migrated, 93 remaining**.
#417/#419/#418 remain open, including other callbacks, executable/resource
prerequisites and final inventory/guidance. Stacked drafts do not run ordinary
main-target CI/CodeQL/protected acceptance. Fresh checks and sequential authorized
integration remain pending. #422 is open, now behind a subsequent docs-only main
change; its prior exact-candidate protected PASS does not authorize a merge.
