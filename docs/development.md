# Development guide

This guide describes repository implementation and verification practices.
The normative architecture and assurance contract is in
[`architecture.md`](architecture.md) and its five required normative members;
this guide does not amend that Set.

## Repository layout

This is a Node.js ES module package. Its supported Node version is declared by
`package.json#engines`. Editable runtime source is in `src/`; TypeScript modules
use `.mts` and JavaScript modules use `.mjs`. `npm run build` emits the runtime
package into ignored `dist/`. Tests are in `test/`, the
separately distributed Codex Skill is in `skills/architecture-review/`, and
reusable and self-review workflows are in `.github/workflows/`.

## Implementation and verification

- For behavior changes, add or update focused tests and run `npm test`.
- For package entrypoint or distribution changes, also check the installed
  package smoke path in `test/installed-smoke.mjs` and the release workflow.
- Update `README.md` when public integration or operational behavior changes.
- Follow the [release runbook](release.md) when freezing, publishing, or verifying a package release.
- Start release planning with the [Release planning issue form](../.github/ISSUE_TEMPLATE/release_planning.yml); it records scenarios and agreement before the runbook's publication steps.
- Use the [issue and pull request workflow](issue-pr-workflow.md) to record scope, acceptance criteria, verification, and remaining work.
- Keep the Skill, CLI, CI adapter and self-review configuration aligned when a
  shared contract changes.

## Risk-based verification

For a changed parser, validator, orchestration path or CLI, record a concise
risk/invariant → production boundary → retained test map in the PR or linked
investigation. Identify external synthetic responses, actual production calls,
unit/composition/distribution scope and remaining live-host proof. Test counts
and global coverage are diagnostic context, not completion evidence. Use
source-only coverage to identify unexecuted boundaries; keep its exact command,
revision and paths rather than comparing unlike percentages.

Before reusing a shared helper, check its accepted input shape, byte/depth/range
preconditions, error and termination behavior, and whether parsing or decoding
occurs before its limits. Preserve malformed-input and bounded-execution
regressions. A type annotation does not supply those properties. Exercise
representative invalid bindings and observable failed output at their owning
production boundary. Critical regressions should demonstrate detection through
selected isolated mutations or equivalent meaningful negative fixtures; remove
mutation copies afterward. Prefer deterministic clocks for deadline logic,
while retaining bounded real execution where scheduling is the property tested.

When replacing a case, map each useful assertion to retained coverage and state
uncovered paths. No test-count reduction target applies. Workflow checks parse
target jobs/steps; exact action pins and existing selected expressions remain
useful assertions. Run the focused structure suite for fast feedback:

```bash
node --test test/workflow-structure.test.mjs
```

When request or receipt identity binds runtime implementation bytes, exercise
the actual emitted and installed layouts. A grouped `.mjs` implementation must
be covered by the identity collected at its real path; prove both that a fresh
request/receipt validates and that changing a covered implementation byte
invalidates an earlier request and receipt. Keep such mutations inside isolated
package copies so repository runtime files are never altered by the test.

Static YAML analysis does not execute GitHub expressions or establish host
protection. Keep existing live-proof owners and release obligations separate.

The coordinator verifies shared-helper assumptions, cross-file dependencies,
public/direct entrypoints, source/generated identities and distribution after
bounded worker changes. Obtain independent integrated code review and the
applicable architecture review on the final candidate; worker verification is
not protected acceptance. Record focused/full runtimes, actual package results
and unresolved limits. The entrypoint and workflow investigations under
`docs/investigations/2026-10-08-*.md` provide concrete #415/#416 examples.

## TypeScript source and runtime distribution

The integrated #419 slices type OWNER_ADDITION validation, execution-result
states, tag/artifact/ZIP leaves, GitHub association/CLI/source/event helpers,
PR/run and live queue context, self-amendment scope, and amendment canonical
readback, OWNER_ADDITION post-merge readback and self-only GitHub App reporting.
The integrated slices also type GitHub ruleset readback and amendment Git-change
inspection under their respective grouped source directories, retaining flat exports.
The [96-module source map](investigations/2026-10-08-source-layout-typescript-map.md)
retains the inventory, runtime limits and #423 preview-lifecycle boundary.
The synchronized main `c9f7b75` has twenty-two original modules typed and 74
remaining. Migration is partial and does not change consumer architecture or
assurance policy.

Editable `.mts` and `.mjs` files live under `src/`. Strict NodeNext compilation
uses `rootDir: src`, `outDir: dist`, `allowJs: true`, and `checkJs: false`.
`npm run check:typescript` runs `tsc --noEmit --project tsconfig.json`.
`npm run build` clears ignored `dist/` and runs the same project compiler to
emit `.mjs`. The `allowJs` and `checkJs: false` settings include JavaScript in
the build while strict type checking applies to `.mts`. Keep established flat
`src/*.mjs` facades and package aliases and
bins; their runtime targets are in `dist/`. Source-location-sensitive modules
such as preview lifecycle retain their flat emitted path. Audit `import.meta.url`,
relative resources and child-script locations before moving implementations.

Install locked development dependencies with lifecycle scripts disabled, then:

```bash
npm ci --ignore-scripts
npm run check:typescript
npm run build
node scripts/check-source-cycles.mjs
npm test
```

The committed tsconfig uses strict checking, `noImplicitAny`,
`noEmitOnError`, and NodeNext ESM resolution. TypeScript 6.0.3 and Node 22 types
pinned at 22.20.5 are development-only. CI and release jobs use Node 22, install
the lockfile with lifecycle scripts disabled, and build before runtime tests
and package creation. There are no checked-in generated runtime files and no
install or publish lifecycle compilation. Registry credentials remain in
their existing later steps.

External JSON, environment, API and evidence values remain `unknown` until
existing runtime checks establish their usable shape. Preserve check order,
coercion/error compatibility, exact-key restrictions, byte/depth limits and
provenance/authenticity verification. Localized return assertions must describe
which completed runtime checks establish the shape; assertions and brands are
not evidence validation. Never create a no-op assertion function that appears
to validate input. Compile-negative fixtures use the actual tsconfig, reject
unexpected diagnostics and identify the intended field/argument failure.
Execution-result types distinguish completed observations with bounded response
bytes from incomplete observations without those bytes. General host outcomes
remain unknown because an accepted accessor may change across the original two
reads; the completed branch narrows only its captured success/available facts.
Tag-readback callback types preserve existing synchronous, Promise and thenable
returns; API and observed OID values stay unknown. Readonly observations leave
Buffer contents mutable. Tag-attempt results distinguish absence from a present amendment attempt; the
final absence check narrows the result after its existing re-read. Reader
callbacks accept synchronous values, Promises and thenables. Parsing a tag
envelope checks its existing key/profile bindings and decodes bounded evidence
bytes; unchecked envelope fields remain unknown and do not establish semantic
eligibility. Artifact discovery and fetching preserve exact-attempt metadata, pagination,
compressed-byte limits and digest checks. Their result types distinguish
successful observations from incomplete observations without artifact bytes or
identity fields; repeatedly read external fields remain unknown. Attestation
inspection assumes verified CLI output and trusted expectations; it does not
establish those preconditions. The synchronous CLI invocation leaves returned
output unknown until its existing JSON parsing and inspection. Its type does
not exclude asynchronous callbacks, which still fail as malformed output at
runtime. Other callback contracts remain with their owning modules. The authority-source
fetch contract preserves sync, Promise and thenable responses and reader results,
optional signal/headers, bounded decoding, request counts and existing timeouts.
Captured validated request strings and computed Buffer output are typed; parsed
JSON stays unknown. The readback callback composes that streaming response with
its JSON operation; standard fetch and direct shared callback composition are
compile-tested. Event and readback properties that are reread stay unknown;
readback describes canonical placement only, separate from eligibility and
acceptance.

OWNER_ADDITION readback preserves its existing PR/ordered-parent/tree/ancestry/
authority-byte checks and performs no network I/O. It reports observed placement
facts for a separate adoption evaluator. Reporter callbacks retain standard
fetch and synchronous/Promise/thenable JSON responses. External inputs, payloads
and output metadata reread after validation stay unknown; exact name/repository
constants and computed digests are typed. Publishing assumes a protected caller
already validated the result and does not authenticate that precondition.
Neither result type supplies owner authorization, producer provenance or route
activation. Focused accessor regressions retain existing observable rereads.

Ruleset readback retains the fixed protected-main workflow context, App
installation binding, single-repository administration grant and token
revocation in `finally` before a snapshot is returned. Storage remains anchored
to the real checkout, with private regular-file modes and same-run/base/freshness
checks. Environment fields and API JSON are unknown; the captured workflow and
fixed constants are typed, while context fields read again remain unknown.
Readonly annotations prevent typed reassignment but do not freeze returned
objects. A local snapshot is same-job launcher input, not a portable receipt or
proof of host enforcement; the unchanged runtime validators still own its use.

Runtime coverage follows the emitted and executed `dist/**/*.mjs` files. Report
those exact paths without counting source files as runtime coverage. CodeQL
analyzes authored `.mts`, compatibility `.mjs`, and Actions source. Generated
`dist/` is git-ignored; confirm its treatment from the actual CodeQL extraction
before making a coverage claim about emitted files. Review authored and emitted
locations as corresponding evidence, not independent coverage; retain hosted
extraction/query results before claiming analysis of the final candidate.
Installed consumers receive the `dist/` JavaScript and need no TypeScript compiler; verify archive contents
and clean/offline installation.

## Static source import cycles

`node scripts/check-source-cycles.mjs` checks the fixed `src/` tree containing
editable runtime `.mjs` and authored `.mts` files. Acorn parses runtime ESM; the
pinned TypeScript compiler API parses authored syntax. Neither parser loads or
evaluates candidate modules. Value-bearing relative imports and re-exports
contribute graph edges. An authored `.mjs` specifier resolves to a sibling
`.mts` source when present, or to an unmigrated `.mjs` module otherwise, matching
NodeNext resolution. The checker rejects duplicate authored/runtime module
paths so source and emitted peers cannot mask each other.

The check rejects cycles, invalid syntax, missing relative targets, symbolic
links, escapes from the fixed root, import-equals forms and unsupported source
suffixes. `src/` supports `.mjs` and `.mts`. Pure type-only imports/re-exports
have their target safety checked but do not create runtime cycle edges. The
strict compiler still owns type resolution and semantic checking. Arguments
cannot select another root; fixtures use isolated checkout copies. Dynamic
imports, computed/CommonJS loads, bare packages and external package graphs
remain outside this static relative-edge scope. Parser/tool success supplies
development verification, not protected acceptance or consumer architecture
authority.

## Architecture changes and rollout

Record any required owner decision in the complete selected architecture Set
(the relevant normative member) before changing
architecture or assurance responsibilities. Follow its
[dogfooding and change discipline](architecture/self-profile.md#dogfooding-and-change-discipline)
for local/manual, packaged and CI paths as applicable before broader rollout.

## Local CodeQL

Run these commands from a source checkout (Node.js 22 or newer):

```bash
npm run codeql
```

Install the [official CodeQL bundle](https://docs.github.com/en/code-security/how-tos/find-and-fix-code-vulnerabilities/scan-from-the-command-line/set-up-codeql-cli)
for your OS, including the standard query packs. Add its `codeql` directory to
`PATH` (`codeql.exe` on Windows). No npm dependencies need installing. If the CLI is missing, the command
exits with installation guidance before creating a scan directory. Supported
systems follow CodeQL's official requirements; allow several GB of disk space.
The command analyzes JavaScript/TypeScript and Actions with the default suites,
including the local threat model used by CI. The repository-owned model pack in
`.github/codeql/extensions/github-output` represents only the adopted GitHub
runner output boundary. Local analysis explicitly loads the same pack that
GitHub default setup discovers from this directory.

Before scanning the repository, the command runs the standard path-injection
query with and without the model against a generated fixture. Only the trusted
accessor finding may disappear; unrelated environment, CLI, and checked-path
findings must remain. Model or query incompatibility fails this regression and
stops analysis. `npm run codeql:model` runs only this regression; the CI
`codeql-model` job runs it with the official CodeQL CLI independently of the
existing default-setup scan. The fixture, baseline/modeled SARIF, and regression result are
retained alongside the whole-tree results. Hosted model loading still requires
verification in the subsequent GitHub CodeQL run.

Each invocation retains SARIF results,
CodeQL database logs, and `summary.json` under
`~/.local/share/architecture-gatekeeper/codeql/scan-*`. The resolved output
directory must be outside the repository. These artifacts
can be large and are retained until explicitly removed.

A successful command means analysis completed, not that findings are absent.
Review findings and compare with the prior run before committing; whole-tree
results can include findings outside the PR diff. Record the CLI/query versions
when comparing with CI. This command is development tooling, not a published
package entrypoint or protected acceptance decision.
