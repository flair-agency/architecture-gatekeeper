# Development guide

This guide describes repository implementation and verification practices.
The normative architecture and assurance contract is in
[`architecture.md`](architecture.md) and its five required normative members;
this guide does not amend that Set.

## Repository layout

This is a Node.js ES module package. Its supported Node version is declared by
`package.json#engines`. Runtime JavaScript and compatibility paths are in `src/`; migrated TypeScript
authoring source is in `src-ts/`. Tests are in `test/`, the
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

Static YAML analysis does not execute GitHub expressions or establish host
protection. Keep existing live-proof owners and release obligations separate.

The coordinator verifies shared-helper assumptions, cross-file dependencies,
public/direct entrypoints, source/generated identities and distribution after
bounded worker changes. Obtain independent integrated code review and the
applicable architecture review on the final candidate; worker verification is
not protected acceptance. Record focused/full runtimes, actual package results
and unresolved limits. The entrypoint and workflow investigations under
`docs/investigations/2026-10-08-*.md` provide concrete #415/#416 examples.

## Staged TypeScript and reproducible JavaScript

#419 starts with the shared OWNER_ADDITION validation leaf, CI execution
result normalizer and owner-amendment tag readback callback contracts. The [96-module source map](investigations/2026-10-08-source-layout-typescript-map.md)
tracks the remaining 93 original modules and #417 grouping work. Author
`src-ts/<responsibility>/*.mts`; emit checked-in JavaScript to the corresponding
`src/<responsibility>/*.mjs`. Preserve existing flat `src/*.mjs` paths, package
exports and bins. A re-export facade is sufficient only for an import-only leaf;
executable paths need explicit direct dispatch and inert-import verification.
Audit `import.meta.url`, relative resources and child-script locations before
moving their implementation.

Install locked development dependencies with lifecycle scripts disabled, then:

```bash
npm ci --ignore-scripts
npm run check:typescript
node scripts/check-source-cycles.mjs
npm test
```

`check:typescript` uses the fixed committed tsconfig with strict checking,
`noImplicitAny`, `noEmitOnError` and NodeNext ESM resolution. TypeScript 6.0.3
provides the compiler API used by both build and dependency analysis; Node 22
types are pinned at 22.20.5. Both are development-only. Compilation happens in
a unique temporary directory, compares the complete allowlisted output set and
bytes with the checked-in generated files, and rejects missing, stale or extra
managed `.mjs` output. To regenerate after an authoring change, run
`npm run build:typescript`, review its JavaScript diff, then repeat the check.
No install/publish lifecycle script silently compiles code. Ordinary CI and
release preflight run the same read-only check before tests/package creation;
registry credentials remain in their existing later steps.

External JSON, environment, API and evidence values remain `unknown` until
existing runtime checks establish their usable shape. Preserve check order,
coercion/error compatibility, exact-key restrictions, byte/depth limits and
provenance/authenticity verification. Localized return assertions must describe
which completed runtime checks establish the shape; assertions and brands are
not evidence validation. Never create a no-op assertion function that appears
to validate input. Compile-negative fixtures use the actual tsconfig, reject
unexpected diagnostics and identify the intended field/argument failure.
The CI result normalizer distinguishes completed results carrying response bytes
from incomplete results without those bytes; completion means host-reported
success with bounded output, not a validated semantic decision or acceptance.
General observed outcomes remain unknown where the accepted JavaScript input
can return a changing accessor value. Callback sync/async contracts remain
future work when their actual owning modules migrate.

Runtime coverage follows executed `src/**/*.mjs`, including the generated
implementation behind a flat facade. Report those exact paths without counting
an unexecuted authoring copy as runtime coverage. The unchanged JavaScript/
TypeScript CodeQL path analyzes authoring `.mts` and runtime `.mjs`; supported
suffixes are documented in the [CodeQL language reference](https://codeql.github.com/docs/codeql-overview/supported-languages-and-frameworks/).
Review authored/generated locations as corresponding evidence, not independent
coverage; retain hosted extraction/query results before claiming analysis of
the final candidate. Installed consumers receive JavaScript and need no
TypeScript compiler; verify archive contents and clean/offline installation.

## Static source import cycles

`node scripts/check-source-cycles.mjs` checks fixed checkout roots `src/`
(runtime `.mjs`) and optional `src-ts/` (authoring `.mts`). Acorn parses runtime
ESM; the pinned TypeScript compiler API parses authored syntax. Neither parser
loads or evaluates candidate modules. Value-bearing relative imports and
re-exports contribute graph edges. Authoring `.mjs` specifiers resolve their
actual sibling `.mts` peer; an explicit relative reference into `src/` can
bridge to an unchanged runtime module. A similarly named runtime file does not
substitute for a missing authoring peer. Authoring and emitted peer identities
are combined so a cycle involving an authored dependency and runtime facade
cannot disappear between separate scans.

The check rejects cycles, invalid syntax, missing relative targets, symbolic
links, escapes from both fixed roots, import-equals forms and unsupported
source suffixes. `src/` supports `.mjs`; `src-ts/` supports `.mts`. Pure type-only
imports/re-exports have their target safety checked but do not create runtime
cycle edges. The strict compiler still owns type resolution and semantic
checking. Arguments cannot select another root; fixtures use isolated checkout
copies. Dynamic imports, computed/CommonJS loads, bare packages and external
package graphs remain outside this static relative-edge scope. Parser/tool
success supplies development verification, not protected acceptance or
consumer architecture authority.

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
