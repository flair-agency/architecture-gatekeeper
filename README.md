# Architecture Gatekeeper

[![CI](https://github.com/flair-agency/architecture-gatekeeper/actions/workflows/ci.yml/badge.svg)](https://github.com/flair-agency/architecture-gatekeeper/actions/workflows/ci.yml)
[![Architecture Gate](https://github.com/flair-agency/architecture-gatekeeper/actions/workflows/self-architecture-gate.yml/badge.svg)](https://github.com/flair-agency/architecture-gatekeeper/actions/workflows/self-architecture-gate.yml)
[![GitHub release](https://img.shields.io/github/v/release/flair-agency/architecture-gatekeeper)](https://github.com/flair-agency/architecture-gatekeeper/releases/latest)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![GitHub Sponsors](https://img.shields.io/github/sponsors/flair-agency?label=Sponsor&logo=github)](https://github.com/sponsors/flair-agency)

Coding agents can follow `AGENTS.md` and still move a responsibility or trust
boundary. Instructions explain how to work; generic AI review may not use the
consumer's architecture, and static checks only enforce encoded patterns. None
resolves an owner choice absent from repository authority.

In about 30 seconds, the relationship is:

```text
coding-agent change
  → Gatekeeper selects committed repository-owned review inputs
  → reviewer returns PASS / BLOCK / OWNER_DECISION
  → Gatekeeper validates the structured response and declared consumer rules
  → repository policy decides what that evidence permits
```

Illustrative, not a recorded result: if a consumer reserves review-credential
issuance to a protected workflow, moving it into a pull-request-controlled step
could yield `BLOCK`. If authority leaves a new responsibility unassigned, it
could yield `OWNER_DECISION`. Neither result authorizes implementation or
acceptance.

| Mechanism | What it contributes | What it does not decide by itself |
| --- | --- | --- |
| Instructions (`AGENTS.md`) | Agent context | Architecture review or acceptance |
| Generic AI review | Broad feedback | Consumer-bound review unless it uses selected authority |
| Linters and static checks | Deterministic checks for encoded patterns | Unwritten intent or responsibility choices |
| Architecture Gatekeeper | Review against committed inputs; validate structured results and declared rules | Acceptance; consumer policy decides what evidence permits |

Each consumer owns its architecture, review inputs and acceptance policy.

## Choose your goal

| Your goal | Start here | Route or boundary |
| --- | --- | --- |
| Run your first review as a consumer | [First manual review](docs/integration-reference.md#manual-review) | Exact package version, committed consumer inputs and a local Codex login |
| Add local feedback | [Local integration](docs/integration-reference.md#local-integration) | Hook/manual; selected local provider settings apply |
| Use a host-native review workflow | [Codex Skill](docs/integration-reference.md#codex-skill-installation) | Separately installed Skill and host reviewer |
| Review pull requests | [CI integration](docs/integration-reference.md#ci-integration) | Protected-base policy and host-controlled execution |
| Operate or troubleshoot a review | [Owner intervention](docs/owner-intervention.md) | `BLOCK`, `OWNER_DECISION`, incomplete results and recovery |
| Measure review effectiveness | [Diagnostic measurement](docs/measurement.md) | Opt-in local/CI records, adjudicated cases and blind audits |
| Enable optional local/native diagnostics | [Measurement adapters](docs/measurement-adapters.md) | Default-off observers and private storage |
| Change or release this package | [Development](docs/development.md) and [release guide](docs/release.md) | Maintainer procedures |
| Read the rules and assurance limits | [Architecture contract](docs/architecture.md) and [documentation map](docs/README.md) | Normative contract and guide index |

## Requirements

- Node.js 22 or later.
- GitHub Packages authentication with `read:packages` to install. Package
  visibility and registry authentication are separate; [Issue #33](https://github.com/flair-agency/architecture-gatekeeper/issues/33)
  remains the source for that distribution work.
- An authenticated local `codex` CLI for the first manual Codex review.
- Consumer-owned authority, prompt, decision schema, reviewer settings and
  configuration committed at the revision being reviewed.

## Quick start

Follow the complete [first manual review walkthrough](docs/integration-reference.md#manual-review),
which creates and commits a small consumer fixture, installs
`@flair-agency/architecture-gatekeeper@0.6.0-preview.3`, and shows the command
and observable outcomes. Its sample result is review evidence, not repository
acceptance or implementation authority.

See the compact [first-review demo transcript](https://github.com/flair-agency/architecture-gatekeeper/blob/main/docs/first-review-demo.md)
for one actual native preview review. Issue [#393](https://github.com/flair-agency/architecture-gatekeeper/issues/393)
tracks the demo work; the broader adoption funnel is tracked in [Issue #390](https://github.com/flair-agency/architecture-gatekeeper/issues/390).

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
the consumer's protected-base policy. The separate
[provider-capable workflow](.github/workflows/architecture-gate-providers.yml)
implements ordinary Gemini review with a pinned profile and a
masked, full-detail report handoff. It remains inactive until a consumer adopts
that workflow and selects Gemini in protected-base policy. This separate
adoption does not select Gemini for the existing Codex-only consumer workflow
or this repository's self policy, and does not establish broader consumer
support or acceptance. See the [caller authorization boundary](docs/github-assurance.md#caller-authorization-and-host-integration-boundary).

The CI reporter confines its projection and summary files to the invoking
GitHub runner's per-step file-command layout and rejects linked or substituted
files. Its optional local `REPORT_PATH` must name
`architecture-gate-report.md` in the current directory; it creates that file
exclusively and never overwrites an existing destination. See the
[report filesystem boundary](docs/integration-reference.md#report-filesystem-boundary).

In workflow revisions that include this behavior, `pull_request_target` first
checks out the event merge SHA without submodules. A matching ordered event
base/head tuple takes the fast path; only a parent mismatch on that exact event
commit permits one bounded lookup of the current PR merge ref. The immutable
result must match the same tuple before the selected tree is materialized; any
recursive submodule checkout follows selection. The review record uses that
selected SHA in the same run. Missing or malformed event SHA, checkout
mismatch, invalid recovery, or failed materialization leaves review incomplete;
event base/head are never replaced. The [CI integration guide](docs/integration-reference.md#ci-integration)
describes full conditions and earlier workflow pins.

Legacy authority and owner-addition CI artifact steps run with the GitHub
runner's `RUNNER_TEMP` as their working directory. Their CLIs accept only fixed
output names (or the exact absolute path resolved from that working directory),
and workflow output is appended through the runner-provided `GITHUB_OUTPUT`.
The [artifact I/O checks](docs/development.md#artifact-file-io-checks) describe
the remaining filesystem concurrency limits. This design was approved in
[PR #591](https://github.com/flair-agency/architecture-gatekeeper/pull/591#issuecomment-6235948030).
CI Policy v6 can explicitly select the existing Codex OWNER_ADDITION,
OWNER_AMENDMENT and procedural addition routes, as well as ordinary provider
review. Existing policy and evidence versions keep their meanings; upgrading
the format enables no Owner procedure automatically. See the
[selection and compatibility table](docs/integration-reference.md#policy-v6-compatibility-and-explicit-owner-selections)
for supported combinations and predecessor-governed migration. This source
extension requires a compatible runtime/workflow pin; older published pins
retain their original behavior.

For a complete consumer-owned local v2 configuration and CI policy v4 example,
including the separate optional G0 selection, see
[examples/consumer-v4](examples/consumer-v4/README.md).

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

This legacy section remains as a public anchor. Current self-repository PR
operations are documented in the [self repository amendment operation](docs/owner-intervention.md#self-repository-amendment-operation).


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
operations, development and release guides, or normative contract.

### Diagnostic measurement

Capture and directory export require a POSIX host; Windows support is limited
to offline dataset analysis. Use the [measurement guide](docs/measurement.md)
to collect local and CI review attempts, export redacted records and assess
findings against independent case
judgments and blind audits. Collection is opt-in; descriptive metrics include
denominators and missing observations without claiming causal drift prevention.
CI diagnostics run in an independent optional job after required review/report/accept.
The pinned public runtime observes published decisions and bounded public job
metadata; private request, finding-count, execution and freshness facts remain unknown.

### Unverified preview lifecycle API

The predecessor-selected `preview-unverified-procedure-v1` lifecycle API and
its route-specific limits are documented in the [integration reference](docs/integration-reference.md#unverified-preview-lifecycle-api).
An installed `architecture-preview-lifecycle` command exposes prepare,
complete, finalize and fresh through bounded JSON on stdin/stdout, using the
invoking checkout as its fixed root.
All preview procedures remain `UNVERIFIED` and do not provide protected
acceptance.

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

Licensed under the [MIT License](LICENSE).
Copyright © 2026 Flair Agency.

## Self Canonical changes

The self workflow compares each candidate against the complete Authority Set
selected by its recorded base. Ordinary `PASS` cannot authorize a change to
those members, including an erroneous model `PASS`.

When the old Policy explicitly selects `ownerAmendment.acceptance: "protected-pr"`,
an authority-only PR receives a separate eligibility review against the full old
Set. The existing Actions acceptance job verifies that result and the current
PR base/head/test-merge before permitting an Owner-approved normal merge.
Squash readback confirms the adopted tree; the next review uses the new Authority.
See the [procedure and limits](docs/owner-intervention.md).

The retired self App/Queue, tag handoff and attestation producers are not shipped.
No App or Queue is needed for this procedure. Existing GitHub required checks and
Owner merge permissions remain the host boundary; code adoption does not change
host settings. Local/native review, Git-based Preview lifecycle and
OWNER_ADDITION remain available for a clean installation.
