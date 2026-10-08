# Development guide

This guide describes repository implementation and verification practices.
The normative architecture and assurance contract is in
[`architecture.md`](architecture.md) and its five required normative members;
this guide does not amend that Set.

## Repository layout

This is a Node.js ES module package. Its supported Node version is declared by
`package.json#engines`. Runtime code is in `src/`, tests are in `test/`, the
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

## Static source import cycles

From a source checkout on the supported Node.js version, run:

```bash
node --experimental-vm-modules scripts/check-source-cycles.mjs
```

The CI `test` job runs the same command before the test suite. It parses every
`src/**/*.mjs` module with Node's
[`vm.SourceTextModule`](https://nodejs.org/download/release/v22.22.0/docs/api/vm.html#class-vmsourcetextmodule)
constructor and checks static relative `import` and `export ... from` edges.
It never links or evaluates the modules. A cycle prints a concrete dependency
chain and exits nonzero. Missing relative targets, paths outside `src`, symbolic
links, unsupported source extensions and syntax errors also fail the check.
The optional `[src-root]` argument selects a fixture directory for tool tests.

The check excludes dynamic `import()`, CommonJS `require`, computed loads,
bare package specifiers (including Node builtins), and files outside the selected
root. It does not claim that runtime dependencies or external package graphs
are acyclic. The `.mjs` scope must be extended as part of a future TypeScript
migration; adding `.js`, `.cjs`, `.jsx`, `.ts`, `.tsx`, `.mts` or `.cts` source
files currently fails rather than silently omitting them. This is repository
development verification and supplies no protected acceptance or consumer
architecture decision.

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
