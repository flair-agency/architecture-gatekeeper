# Architecture Gatekeeper

[![CI](https://github.com/flair-agency/architecture-gatekeeper/actions/workflows/ci.yml/badge.svg)](https://github.com/flair-agency/architecture-gatekeeper/actions/workflows/ci.yml)
[![Architecture Gate](https://github.com/flair-agency/architecture-gatekeeper/actions/workflows/self-architecture-gate.yml/badge.svg)](https://github.com/flair-agency/architecture-gatekeeper/actions/workflows/self-architecture-gate.yml)
[![GitHub release](https://img.shields.io/github/v/release/flair-agency/architecture-gatekeeper)](https://github.com/flair-agency/architecture-gatekeeper/releases/latest)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![GitHub Sponsors](https://img.shields.io/github/sponsors/flair-agency?label=Sponsor&logo=github)](https://github.com/sponsors/flair-agency)

Architecture Gatekeeper supplies architecture-review mechanics while each
consumer repository owns its architecture, review inputs and acceptance policy.
The package returns structured review evidence; repository policy determines
what that evidence permits.

## Choose your goal

| Your goal | Start here | Route or boundary |
| --- | --- | --- |
| Run your first review as a consumer | [First manual review](docs/integration-reference.md#manual-review) | Exact package version, committed consumer inputs and a local Codex login |
| Add local feedback | [Local integration](docs/integration-reference.md#local-integration) | Hook/manual; selected local provider settings apply |
| Use a host-native review workflow | [Codex Skill](docs/integration-reference.md#codex-skill-installation) | Separately installed Skill and host reviewer |
| Review pull requests | [CI integration](docs/integration-reference.md#ci-integration) | Protected-base policy and host-controlled execution |
| Operate or troubleshoot a review | [Owner intervention](docs/owner-intervention.md) | `BLOCK`, `OWNER_DECISION`, incomplete results and recovery |
| Change or release this package | [Development](docs/development.md) and [release guide](docs/release.md) | Maintainer procedures |
| Read the rules and assurance limits | [Architecture contract](docs/architecture.md) and [documentation map](docs/README.md) | Normative contract and guide index |

## Requirements

- Node.js 22 or later.
- GitHub Packages access with `read:packages` to install the package.
- An authenticated local `codex` CLI for the first manual Codex review.
- Consumer-owned authority, prompt, decision schema, reviewer settings and
  configuration committed at the revision being reviewed.

## Quick start

Follow the complete [first manual review walkthrough](docs/integration-reference.md#manual-review),
which creates and commits a small consumer fixture, installs
`@flair-agency/architecture-gatekeeper@0.6.0-preview.3`, and shows the command
and observable outcomes. Its sample result is review evidence, not repository
acceptance or implementation authority.

## Review paths

### Local hook

The local Hook uses the provider selected by committed consumer settings. Codex
uses a local child process; Gemini's local route uses its asynchronous API
adapter. The optional `PostToolUse` screen is a separate, after-the-fact pilot
and is not enabled by default. See [local provider execution](docs/integration-reference.md#local-reviewer-execution-composition)
and [PostToolUse details](docs/integration-reference.md#optional-asynchronous-posttooluse-screen).

### Manual review

Use the [first review walkthrough](docs/integration-reference.md#manual-review).
The CLI emits the consumer's structured decision and reviewed revision; results
do not themselves accept a change.

### Codex Skill

The [Codex Skill](docs/integration-reference.md#codex-skill-installation) is
distributed separately from the npm runtime and uses a host-native reviewer.
Its host controls and evidence boundaries are documented in the integration
reference. Record end-to-end evidence with the
[native Skill E2E template](docs/investigations/native-skill-e2e-template.md).

### Pull-request gate

The reusable [CI workflow](docs/integration-reference.md#ci-integration) uses
the consumer's protected-base policy. Gemini CI and other unwired provider
targets are not activated consumer routes. This repository's self-only workflow
settings do not establish consumer support or acceptance. See the [caller
authorization boundary](docs/github-assurance.md#caller-authorization-and-host-integration-boundary).

#### Self-repository Fork contributions

This repository's self-review policy does not run privileged or paid review for
original Fork pull requests. A maintainer may select or modify needed changes
onto a same-repository branch and open a separate ordinary pull request. Link
the source Fork and summarize the selected changes; the new pull request gets
its own review, and no result or acceptance transfers back to the original.
See the [self Fork contract](docs/architecture/review-execution.md#self-repository-original-fork-denial-issue-350-owner-decision-2026-10-04)
and [GitHub assurance](docs/github-assurance.md) for the boundary and inactive
shared target.

#### Self-review credential migration

Environment-backed credentials and receiver rollout are repository-specific
operations. Follow the [self-review credential migration procedure](docs/integration-reference.md#self-review-credential-migration)
and current [GitHub assurance guide](docs/github-assurance.md); these self-only
settings do not apply to ordinary consumers.


## Assurance boundary

- Consumers own architecture and policy; this package only executes the
  selected contract.
- The reviewer role is review-only; its result is evidence. Protected repository
  policy decides acceptance.
- Missing, malformed, unresolved, or oversized selected inputs fail closed.
- A pull request cannot waive or replace the protected-base policy used to
  review itself.
- Sponsorship does not grant authority over architecture, review outcomes,
  issue priority, acceptance, or release decisions.

## Documentation

Use the [documentation map](docs/README.md) to find the integration walkthrough,
operations, development and release guides, or normative contract. See the
[preview lifecycle API](docs/integration-reference.md#unverified-preview-lifecycle-api)
for its predecessor-selection and `UNVERIFIED` limits.

## Project participation

- [Contributing](CONTRIBUTING.md)
- [Code of Conduct](CODE_OF_CONDUCT.md)
- [Security policy](SECURITY.md)
- [Support policy](SUPPORT.md)
- [Release notes](https://github.com/flair-agency/architecture-gatekeeper/releases)

Only the latest published release is supported, on a best-effort basis.

## Sponsorship

Support maintenance, security and quality improvements, and documentation
through [GitHub Sponsors](https://github.com/sponsors/flair-agency).
Sponsorship does not change the project's authority or acceptance boundaries.

## License

[MIT](LICENSE)

## Unverified preview lifecycle API

The predecessor-selected `preview-unverified-procedure-v1` lifecycle API and
its route-specific limits are documented in the [integration reference](docs/integration-reference.md#unverified-preview-lifecycle-api).
All preview procedures remain `UNVERIFIED` and do not provide protected
acceptance.
