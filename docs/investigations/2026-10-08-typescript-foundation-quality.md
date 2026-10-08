# Strict TypeScript foundation and initial quality guidance (#419 / #418)

This nonnormative record describes one implementation slice under #412. It
amends no selected authority, assurance rule, route or consumer architecture.
The baseline is `44b311dad92bd604dbc50b7ccbfb89a898ae6259` (initial #417 map).

## Changed boundary and retained behavior

One original module, `owner-addition-validation`, is authored as `.mts` under
`src-ts/owner-addition/`. Its generated `.mjs` implementation is checked in under
`src/owner-addition/`; the original flat path re-exports the same four named
functions. Existing CI/multi-authority callers retain their paths and export
identities. No executable dispatch is moved. The original 96-module map still
has 95 unconverted modules; this slice does not close #417, #419 or #418.

External schemas and decoded reviewer JSON are `unknown` until the existing
runtime checks narrow them. Named eligibility/ordinary-decision contracts make
validated results readable. Two localized return assertions follow the existing
checks; they provide no authenticity claim. The ordinary-decision result type
assumes a typed caller supplies the declared string missing-decision ID. Legacy
JavaScript calls retain the original ID regex coercion, equality behavior,
optional property access, check order and error messages, including numeric,
boolean and null IDs. These cases are retained as runtime tests. No new input
acceptance restriction was introduced merely to satisfy the compiler.

Callback sync/async and complete/incomplete state contracts belong to later
owning-module slices. This import-only leaf invents neither. Runtime duplicate
key, byte/depth, exact-key and provenance validation are not replaced by types.

## Tool and distribution boundaries

Development dependencies pin TypeScript 6.0.3 and Node 22 declarations 22.20.5.
The JS compiler API is used for compilation and authored dependency parsing.
The committed NodeNext/ES2022 tsconfig enables strict, noImplicitAny and
noEmitOnError without blanket suppressions or skipped declaration checking.

`build:typescript` emits into a unique temporary directory, checks the complete
allowlisted output set, then writes the mapped runtime file. `check:typescript`
compares output bytes without replacing them. Missing/stale/extra nested output,
source/output symlinks, hard-linked output, path escapes and compiler diagnostics
fail. Isolated tests prove external link targets remain unchanged and compiler
failure does not replace existing output; child runs have 60-second bounds.
This checks development checkout paths, not concurrent hostile filesystem
replacement or protected-policy isolation. No install/publish lifecycle hook
compiles code. Ordinary CI and release preflight run the read-only check before
existing graph/tests/package steps, with no credential/permission changes.

The source checker now parses the fixed runtime `.mjs` and authored `.mts`
roots. Explicit typed `.mjs` imports require real `.mts` peers; explicit relative
bridges to unchanged runtime modules are allowed. Authored/emitted identities
are combined to detect cycles crossing runtime facades. Type-only targets are
safety-checked but do not create runtime edges. Missing targets, links, escapes,
unsupported suffixes/import-equals and syntax errors fail. Dynamic/CommonJS,
computed loads, bare packages and external graphs remain out of scope.

## Verification

- Clean locked `npm ci --ignore-scripts` succeeded; `npm run check:typescript`
  succeeded and the actual graph scan checked 97 runtime + 1 authored module
  without a cycle. The additional runtime file is the generated implementation,
  not a second migrated original module.
- Full `npm test`: **1200/1200 passed**, zero failures/cancellations/skips,
  151.082 seconds. Build/type/graph focused verification independently passed
  22/22. Compile-negative fixtures use the actual tsconfig, require the intended
  diagnostic code/location/message, and reject nonfixture diagnostics.
- Existing owner-addition CI/multi-authority suites: **31/31 passed** with
  source-only runtime coverage restricted to
  `src/owner-addition/owner-addition-validation.mjs`: 84.16% lines, 82.00%
  branches, 100% functions. This proves generated runtime execution, not complete
  coverage or execution of the authoring copy. Command:
  `node --experimental-test-coverage --test-coverage-include='src/owner-addition/owner-addition-validation.mjs' --test test/owner-addition-ci.test.mjs test/owner-addition-multiauthority.test.mjs`.
- Actual `npm pack --ignore-scripts` produced 117 files, including the flat
  facade and byte-identical generated runtime, excluding authoring/tool/tests.
  Clean offline install succeeded with no TypeScript, Node declarations, Acorn
  or YAML installed. Installed production CLI/composition/validator checks
  passed 56/56; deterministic transport deadline checks passed 2/2; the complete
  existing installed-smoke command also passed with its original bounds.
  Only the test files, two helper fixtures, and the example eligibility/selected
  decision schema fixtures were copied into the temporary package for those
  additional checks; production runtime files were the actual packed bytes.
  Two harness attempts failed because those test-only schemas were absent;
  adding the required fixtures corrected the harness without changing runtime
  source or archive inclusion.
- Independent integrated code review found no remaining actionable findings
  after resolution, runtime compatibility, output-path and diagnostic checks.
  Native architecture review of the final committed candidate remains pending.
- The existing hosted JavaScript/TypeScript CodeQL path is preserved. Hosted
  extraction/query results, ordinary main-target CI and protected acceptance
  remain pending dependent integration; local compiler/graph success is not
  those results. Do not report CodeQL analysis of this candidate as completed.

## Guidance and remaining work

`docs/development.md`, CONTRIBUTING and release preflight now document retained
helper preconditions, risk-to-boundary-to-test maps, actual production wiring,
source-only coverage, meaningful negative fixtures, deterministic deadlines,
coordinator integration and independent review. They explain strict source and
reproducible output checks, generated-runtime coverage and static/runtime
validation boundaries. This is initial #418 integration from #413–#419 evidence;
remaining source moves/contracts and their verification still need guidance.

Fresh main integration remains sequential through prior quality PRs. Stacked
draft branch checks do not replace main-target checks. No publication, release,
route activation, host protection change or new owner assurance rule occurs.
