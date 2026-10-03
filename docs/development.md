# Development guide

This guide describes repository implementation and verification practices.
The normative architecture and assurance contract is in
[`architecture.md`](architecture.md); this guide does not amend it.

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

## Architecture changes and rollout

Record any required owner decision in `docs/architecture.md` before changing
architecture or assurance responsibilities. Follow its
[dogfooding and change discipline](architecture.md#dogfooding-and-change-discipline)
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
