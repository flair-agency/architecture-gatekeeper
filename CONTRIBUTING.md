# Contributing to Architecture Gatekeeper

Thank you for helping improve Architecture Gatekeeper. Bug reports,
documentation fixes, tests and focused implementation changes are welcome.
Participation is governed by the [Code of Conduct](CODE_OF_CONDUCT.md).

## Before opening work

1. Search the existing issues and pull requests.
2. Open an issue before making a large change or changing public behavior.
3. Read [`docs/architecture.md`](docs/architecture.md) and all of its required
   normative members before proposing a
   change to architecture, trust boundaries, review decisions, evidence or
   acceptance policy. Together they form the normative contract.
4. Do not infer or add a consumer repository's architecture to this shared
   package. An unresolved owner decision must remain explicit until the owner
   records it in canonical authority.

Security vulnerabilities must follow [`SECURITY.md`](SECURITY.md), not a
public issue.

## Development workflow

The repository requires Node.js 22 or newer.

1. Fork the repository and create a focused branch from `main`.
2. Keep each pull request to one reviewable outcome.
3. Add or update focused tests for behavior changes.
4. Run `npm ci --ignore-scripts`, `npm run build`, `npm run check:typescript`,
   `node scripts/check-source-cycles.mjs`, and `npm test`. For workflow changes,
   use `node --test test/workflow-structure.test.mjs` for focused feedback.
   Follow the [risk-based verification guidance](docs/development.md#risk-based-verification)
   when reusing validators or changing production entrypoints.
5. Update the README or other public documentation when integration or
   operational behavior changes.
6. Open a pull request that explains the outcome, affected boundaries and the
   verification performed. Link the corresponding issue when one exists.

Use the [issue and pull request workflow](docs/issue-pr-workflow.md) for the
required issue criteria, the five pull request sections, partial delivery,
dependency tracking, and owner-decision handling. GitHub CLI/API users must
include the same issue sections and PR headings used by the web templates.
For release work, use the [Release planning form](.github/ISSUE_TEMPLATE/release_planning.yml)
and follow the [release planning procedure](docs/release.md#plan-a-release).

Follow [`docs/development.md`](docs/development.md) for repository layout,
distribution checks and architecture-change rollout requirements. Changes to
package entrypoints or distribution must also exercise the installed-package
smoke path and release workflow described there.

## Review and triage

Maintainers triage a new issue by confirming that it is reproducible and in
scope, identifying missing evidence or owner decisions, and assigning the
smallest useful outcome. A report may be closed when it is a support request,
cannot be reproduced with the requested information, duplicates existing
work, or belongs to a consumer repository.

Pull requests are reviewed for scope, tests, documentation, compatibility with
the normative architecture and the repository's protected acceptance policy.
Code review or a worker's verification does not replace an owner decision or
protected-policy acceptance.

`CODEOWNERS` identifies review responsibility for repository areas. The
architecture, engineering and security teams maintain their respective areas;
this does not promise a response or release deadline. See
[`SUPPORT.md`](SUPPORT.md) for support and maintenance expectations.

## Licensing

By contributing, you agree that your contribution is licensed under the
repository's [MIT License](LICENSE).
