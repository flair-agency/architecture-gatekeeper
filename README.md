# Architecture Gatekeeper

[![CI](https://github.com/flair-agency/architecture-gatekeeper/actions/workflows/ci.yml/badge.svg)](https://github.com/flair-agency/architecture-gatekeeper/actions/workflows/ci.yml)
[![Architecture Gate](https://github.com/flair-agency/architecture-gatekeeper/actions/workflows/self-architecture-gate.yml/badge.svg)](https://github.com/flair-agency/architecture-gatekeeper/actions/workflows/self-architecture-gate.yml)
[![GitHub release](https://img.shields.io/github/v/release/flair-agency/architecture-gatekeeper)](https://github.com/flair-agency/architecture-gatekeeper/releases/latest)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![GitHub Sponsors](https://img.shields.io/github/sponsors/flair-agency?label=Sponsor&logo=github)](https://github.com/sponsors/flair-agency)

Architecture Gatekeeper provides reusable, fail-closed architecture review
mechanics for Codex repositories. It keeps repository-owned architecture,
review instructions, schemas, model selection, and acceptance policy under the
consumer's control.

It supports three review paths:

- a fast, read-only local Codex hook;
- an explicit manual architecture review;
- a higher-assurance pull-request review from a clean GitHub checkout.

The package does not define a consumer's architecture and does not grant
filesystem, publication, deployment, credential, or service authority.
[`docs/architecture.md`](docs/architecture.md) introduces the normative architecture
and assurance contract, including all five required members in `docs/architecture/`.

## Requirements

- Node.js 22 or later
- GitHub Packages authentication with `read:packages`
- an exact package version or exact Git commit

## Quick start

Install a fixed release from the `@flair-agency` GitHub Packages registry, then
add a launcher owned by the consuming repository:

```js
#!/usr/bin/env node
import { runHookCli } from '@flair-agency/architecture-gatekeeper';
runHookCli();
```

The consumer records its committed inputs in
`.codex/gatekeeper/config.json`. Start from
[`examples/config.json`](examples/config.json), then select the repository's
own authority, prompt, decision schema, reviewer settings, and timeout.

For the complete installation contract, policy formats, Authority Set limits,
CI example, distribution rules, and trust boundaries, see the
[integration reference](docs/integration-reference.md).

## Review paths

### Local hook

The launcher imports the already-installed exact package version and invokes a
selected reviewer adapter from committed settings. Codex remains the default,
using a local `codex` binary with hooks disabled and a read-only sandbox. An
explicit Gemini selection uses the asynchronous API adapter without starting
Codex. It never uses `npx` or a registry fallback. See the
[local provider configuration](docs/integration-reference.md#local-reviewer-execution-composition).

Consumers may opt into an additional asynchronous `PostToolUse` change screen
with a separate launcher that imports `runPostToolScreenHookCli`. Configure it
only in the consumer's project-local Codex hooks. It reviews bounded tracked
diffs after supported `Bash`, `exec_command`, `apply_patch`, `Edit`, and `Write`
events, and returns informational context without blocking or changing the
completed tool result. Untracked paths, diffs over 64 KiB, dirty submodules, or
inconsistent snapshots are reported as incomplete. Set the Hook timeout above
the consumer's configured reviewer timeout plus local preparation and cleanup
time. This PostToolUse pilot is currently unsupported on native Windows because
its current single-flight lock implementation excludes `win32` and assumes
atomic hard-link support; there it returns informational `incomplete` before
screening. This limitation applies only to the PostToolUse pilot; the existing
local review, manual, Skill, and CI paths are unchanged. The pilot does not run
by default and does not replace the explicit
architecture-review Skill for design intent. See the
[PostToolUse integration details](docs/integration-reference.md#optional-asynchronous-posttooluse-screen).

### Manual review

Run the installed command with an architecture question or proposed change:

```sh
architecture-review 'Should this responsibility move from Runtime to the Provider?'
```

The command emits the repository-defined structured decision, such as `PASS`,
`BLOCK`, or `OWNER_DECISION`. A result is review evidence; it is not repository
acceptance or implementation authority.

### Codex Skill

The separately distributed Skill is in
[`skills/architecture-review/`](skills/architecture-review/). Keep its revision
aligned with the runtime release. The Skill uses a separate host-native reviewer
and the package-owned prepare/validate contract; it does not fall back to nested
`codex exec`. Record end-to-end evidence with the
[native Skill E2E template](docs/investigations/native-skill-e2e-template.md).

### Pull-request gate

CI pins upstream `openai/codex-action` v1.12 to an immutable commit and trusts
its published Action bundle. Fork-specific per-run integrity jobs are retired;
step/job limits and fail-closed result validation remain. See the
[integration reference](docs/integration-reference.md) for trust and timeout
limits.

Protected policy execution selection under #332 is implementation-stage work,
not a supported consumer option. Consumers must not configure `execution` until
a representative protected policy-selected hosted review and reporting path has
been verified. Current supported caller timeout inputs remain documented in the
[integration reference](docs/integration-reference.md#protected-codex-execution-selection). Staged
self-verification also checks bounded execution status before semantic validation;
this status grants no acceptance.

The reusable workflow is
[`architecture-gate-consumer.yml`](.github/workflows/architecture-gate-consumer.yml). Consumers
pin it to the exact commit that produced the reviewed release and keep their
policy, prompt, schema, and optional validation policy in the consuming
repository. See the [integration reference](docs/integration-reference.md) for
the complete workflow example and protected-base behavior.

For host-triggered callers, see the
[caller authorization boundary](docs/github-assurance.md#caller-authorization-and-host-integration-boundary).
The consumer owns authorization; Gatekeeper preserves its selected review and
credential boundaries. Consult host documentation for platform-specific signals.

On the protected Authority Set and legacy v1 consumer routes, the reviewer
receives the exact event base/head revisions, verified merge revision and the
base-to-merge committed diff as untrusted task data. Untracked helper checkouts
are excluded from that diff. The complete prompt, including task data, must fit
the existing selected limit; missing revisions, mismatched merge parents or
excess bytes leave review incomplete. These parent checks validate GitHub’s
synthetic review checkout against the recorded event tuple; they do not restrict
the eventual PR merge strategy or prove canonical transition or host enforcement.
A stale or mismatched checkout requires a fresh review run. Other compatibility
routes are unchanged.

Ordinary consumers use this reusable workflow without self-only OIDC or
attestation permissions. The self repository uses a separate internal workflow
for its selected evidence producers. Consumers upgrading an old enforced v1
policy must first follow the [legacy adoption procedure](docs/integration-reference.md#upgrading-legacy-v1-consumers);
adding selectors to a candidate PR cannot adopt its protected-base policy.

The reviewer job emits bounded numeric Codex usage and tool counts to its
Actions log when the pinned Action supplies them. This includes the ordinary
review path. It does not publish raw Codex JSONL, per-request API cost, or proof
of the provider's effective service tier; missing or malformed usage remains
unavailable for cost attribution.

#### Self-repository Fork contributions

Original Fork pull requests remain welcome, but the self-review workflow does
not run privileged or paid review for them. A maintainer may manually select
needed changes onto a same-repository branch and open a new pull request; link
the source Fork and briefly describe the selected changes for human context.
The candidate remains untrusted until separately reviewed. The new pull
request receives its own review, and no result or acceptance transfers from
the new pull request back to the source Fork.

#### Self-review credential migration

The self-review workflow keeps using the repository `OPENAI_API_KEY` secret
unless the repository variable `ARCHITECTURE_GATE_SELF_REVIEW_ENVIRONMENT` is
set to the exact string `true`. Stage the migration by first creating the
`architecture-gate-self-protected` GitHub Actions Environment, limiting its
deployment branch to `main`, and adding its `OPENAI_API_KEY` secret. Then set
the variable to `true`. The workflow validates that the opt-in comes from this
repository's `main` self-review workflow and only assigns the Environment to
the three jobs that call OpenAI: ordinary review, OWNER_ADDITION eligibility,
and OWNER_AMENDMENT semantic eligibility.

On opt-in, the caller deliberately passes an empty repository key. A missing
Environment key therefore fails review without falling back to the repository
secret. Keep the repository secret until every workflow consumer has migrated;
remove it only after those consumers are verified on their Environment-backed
route. Reusable workflow users are unchanged because Environment selection
defaults off.

The repository variable is an opt-in selector, not proof of host configuration.
Until the Environment is provisioned and its `main` deployment restriction and
secret access are read back, this change makes no claim of verified credential
isolation or successful Environment-backed execution.

This variable stages credential selection for the existing self workflow. It
does not create the separate protected App receiver or complete its rollout.
That receiver still needs its own `main`-only Environment and App credentials,
minimal App installation permissions, required-check source configuration,
and host readback before any receiver activation.

Consumers can optionally declare structured `findings` in their decision
schema to receive verified added/deleted-line feedback in one non-accepting
GitHub `COMMENT` review. Each inline comment identifies Architecture
Gatekeeper, and the job summary/sticky report link to GitHub-returned inline
comment URLs when available. The existing report remains the fallback. See the
[CI integration reference](docs/integration-reference.md) for location
validation, bounds and rerun behavior.

In addition to Codex, repositories can run automated reviews with Google Gemini
using the standalone runner `architecture-review-gemini-ci`. It supports keyless
authentication via Google Cloud Workload Identity Federation (WIF) and Vertex AI,
as well as Google AI Studio API keys.
The launcher requires an explicit model scope (or the model in `--request-json`)
and a project scope for Vertex. Standalone prompt/schema reviews are compatibility
feedback, without protected-authority assurance. Revision-bound requests must
pass shared preflight and record `provider: "gemini"`; Codex selections are rejected.
The shared request constructor supports committed Gemini settings for the
asynchronous local route. The reusable CI workflows still select Codex;
protected Gemini CI integration and adoption remain tracked in #252. Policy v6
can encode an explicit ordinary-review provider and its distinct settings, but
the workflows reject an unwired Gemini selection before reviewer execution.
It is not an activated Gemini CI route.
Decision files default to a private temporary directory outside the checkout.
Explicit output paths must be new files outside the reviewed repository, within
`RUNNER_TEMP` or a recognized OS temporary root. Symlink escapes are rejected. If
`GITHUB_OUTPUT` is present, publication failure fails the runner; normal checkout
execution uses the trusted runner-provided canonical output file, with regular-file, link and opened-identity checks.
The isolated launcher requires an explicit/environment key or access token and does
not run local gcloud renewal. An authenticated same-user Cloud SDK installation
is outside this isolation boundary: use a host without ambient credentials or a
separate OS isolation boundary when those credentials must be inaccessible. It applies a bounded session deadline, shuts down the
proxy and terminates the child on expiry (exit 124), escalating after 250 ms. This
is not a guarantee against uninterruptible operating-system processes.
Explicit Gemini thinking budgets currently support `gemini-2.5-flash` and
`gemini-2.5-pro`; direct endpoints must match the selected official provider scope.


## Assurance boundary

- Consumers own architecture and policy; this package only executes the
  selected contract.
- Review is read-only evidence. Protected repository policy decides acceptance.
- Missing, malformed, unresolved, or oversized selected inputs fail closed.
- A pull request cannot waive or replace the protected-base policy used to
  review itself.
- Sponsorship does not grant authority over architecture, review outcomes,
  issue priority, acceptance, or release decisions.

## Documentation

Use the [documentation map](docs/README.md) to choose between the normative
architecture contract, integration reference, and operational guides.

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

The `./preview-lifecycle` package API supports ordinary review, the
predecessor-authorized completed-BLOCK amendment procedure, and a missing-
decision addition from a completed OWNER_DECISION. All preserve `UNVERIFIED`
assurance and do not integrate changes or supply trusted acceptance. Owner-
decision amendment and migration remain unsupported. See the
[integration reference](docs/integration-reference.md#ordinary-review-preview)
for the API sequence and boundaries.
