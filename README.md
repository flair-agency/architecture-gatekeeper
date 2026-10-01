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
[`docs/architecture.md`](docs/architecture.md) is the normative architecture
and assurance contract.

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
local `codex` binary with hooks disabled and a read-only sandbox. It never uses
`npx` or a registry fallback.

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

The reusable workflow is
[`architecture-gate.yml`](.github/workflows/architecture-gate.yml). Consumers
pin it to the exact commit that produced the reviewed release and keep their
policy, prompt, schema, and optional validation policy in the consuming
repository. See the [integration reference](docs/integration-reference.md) for
the complete workflow example and protected-base behavior.

The reviewer job emits bounded numeric Codex usage and tool counts to its
Actions log when the pinned Action supplies them. This includes the ordinary
review path. It does not publish raw Codex JSONL, per-request API cost, or proof
of the provider's effective service tier; missing or malformed usage remains
unavailable for cost attribution.

Consumers can optionally declare structured `findings` in their decision
schema to receive verified added/deleted-line feedback in one non-accepting
GitHub `COMMENT` review. Each inline comment identifies Architecture
Gatekeeper, and the job summary/sticky report link to GitHub-returned inline
comment URLs when available. The existing report remains the fallback. See the
[CI integration reference](docs/integration-reference.md) for location
validation, bounds and rerun behavior.

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
