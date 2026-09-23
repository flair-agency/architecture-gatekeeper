# Architecture Gatekeeper

The normative Why, What, responsibility boundaries and invariants are defined
in [`docs/architecture.md`](docs/architecture.md). This README describes the
current implementation and integration surface; it does not replace that
contract.

Architecture Gatekeeper supplies reusable mechanics for three semantic design
review stages:

- a fast, read-only local Codex hook;
- an explicit, on-demand manual architecture review;
- a higher-assurance pull-request review from a clean GitHub checkout.

The package does not define a repository's architecture. Every consumer owns
its authority list, reviewer prompt, decision schema, model selection and
target-branch CI policy. The runtime does not grant filesystem, publication,
deployment, credential or service authority.

Consumers may also own an optional decision-validation policy. The output
schema uses the following fail-closed subset of the JSON Schema constructs
accepted by OpenAI Structured Outputs: `$schema`, `description`, `$defs`, local
JSON Pointer `$ref`, `anyOf`, `type`, `enum`, `properties`, `required`,
`additionalProperties`, `items`, `minItems`, `minLength`, `minimum` and
`maximum`. Recursive local references are supported; unresolved or remote
references, malformed definitions and unsupported keywords reject the review.
Instance validation memoizes each schema/instance identity pair and is bounded
to 100,000 operations and 256 recursive evaluation levels. Exceeding either
budget, including a schema cycle that repeats without instance progress, fails
closed.
Cross-field invariants are expressed as declarative `when`/`require` rules in a
separate committed JSON file. Each condition compares a JSON Pointer value to
an explicit JSON scalar (`string`, `number`, `boolean` or `null`); object and
array equality is intentionally outside this minimal contract. The shared
runtime evaluates only those declared path/value implications and does not
infer meaning from consumer fields.

When an authority is inside a Git submodule, the local runtime reads it from the
parent revision's pinned gitlink. It never fetches a missing component;
unavailable pinned objects fail closed.

## Local integration

Install an exact release (or an exact Git commit during pre-release adoption),
then add a tiny launcher:

```js
#!/usr/bin/env node
import { runHookCli } from '@flair-agency/architecture-gatekeeper';
runHookCli();
```

The repository-owned `.codex/gatekeeper/config.json` identifies committed
inputs. See `examples/config.json`. Package resolution is local and fixed: the
launcher imports its already installed exact package version and must not use
`npx` or another registry fallback. The Hook adapter invokes an installed
`codex` binary with hooks disabled and a read-only sandbox.
See [reviewer host permissions](docs/reviewer-host-permissions.md) for the
child-process authorization boundary.
When `validationPath` is configured, the local and manual review paths apply
that committed policy after structured generation and fail closed on a rule
violation or malformed policy.

## Manual review

After installing a fixed package version, invoke the package-owned entrypoint
with the architecture question or proposed change:

```sh
architecture-review 'Should this responsibility move from Runtime to the Provider?'
```

The task may instead be supplied on standard input. This standalone terminal
adapter uses child `codex exec`; it is separate from the Codex-hosted Skill.
Its host boundary is described in
[reviewer host permissions](docs/reviewer-host-permissions.md).
The command uses the same
committed consumer-owned configuration, prompt, schema, reviewer settings and
authority files as the local gate. It emits the structured `PASS`, `BLOCK` or
`OWNER_DECISION` result with the reviewed Git revision. It does not reuse Hook
input, prior Hook context or CI policy, and it does not turn a decision into
repository acceptance or implementation authority.

## Codex Skill installation

The npm package distributes the runtime and command-line entrypoints only. The
explicit `$architecture-review` workflow is distributed separately from this
repository at `skills/architecture-review/`; install that directory through the
supported Codex Skill installation route and keep its revision aligned with the
runtime release you adopt. The Skill uses the host-native reviewer/subagent
interface. It calls `architecture-review-native prepare` to construct a
committed-revision request, gives that request to a separate read-only native
reviewer, and calls `architecture-review-native validate` on the returned JSON.
The Skill enforces the prepared `reviewTimeoutMs`; a timeout is an incomplete
review and never reaches validation. It never falls back to the standalone CLI
or launches nested `codex exec`. The
version-pinned runtime, not the Skill, selects and validates repository-owned
authority.

When recording Skill dogfood, separate a runtime prepare/validate smoke from a
host-native Skill E2E and from CI acceptance. The smoke exercises request
construction and validation only. The E2E record identifies the separate
host-native reviewer task/agent, preserves the exact prompt and schema sent
with the prepared model, reasoning effort and timeout, and traces the decision
validated back to that reviewer result. It also records evidence that the host
applied the model, effort, timeout and read-only settings; task-text instructions
alone are insufficient. If those controls cannot be verified, the local review
remains incomplete. This is diagnostic execution evidence,
not cryptographic merge evidence; CI acceptance remains the protected-policy
workflow result. Use the [native Skill E2E record template](docs/investigations/native-skill-e2e-template.md).

## Distribution

Runtime releases are published as fixed public versions to the `@flair-agency`
GitHub Packages npm registry. Public package visibility does not make GitHub
Packages anonymous: consumers still need normal GitHub Packages authentication
with `read:packages`. A release tag must identify the exact commit whose
`package.json` declares that version. The publication workflow packs and
inspects the archive, installs it in an empty directory, exercises every public
executable, publishes with package lifecycle scripts disabled, and reads the
published version and integrity back from the registry. Reusable GitHub Actions
workflows remain pinned separately to an exact Git commit SHA.

## CI integration

Call the reusable workflow at the immutable commit that produced the reviewed
release, and pass only the two credentials declared by the workflow:

```yaml
jobs:
  architecture-gate:
    permissions:
      contents: read
      pull-requests: write
    uses: flair-agency/architecture-gatekeeper/.github/workflows/architecture-gate.yml@<release-commit-sha>
    secrets:
      OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
      CI_SOURCE_READ_TOKEN: ${{ secrets.CI_SOURCE_READ_TOKEN }}
```

The caller keeps `.codex/gatekeeper/ci-policy.json`, its prompt and schema. CI
policy is read from the protected base revision, so a pull request cannot waive
its own review. `enforced` runs the exact-SHA-pinned
`flair-agency/codex-action` fork of upstream v1.12. The fork contains only the
bounded descendant-stdio drain fix from upstream PR #151 and retains v1.12's
credential isolation and protected argument checks. This is a temporary
workaround: replace the fork pin only after reviewing an upstream release that
contains the equivalent fix. `local-only` records an explicit waiver and makes
no OpenAI API call.

The enforced Codex Action step has a five-minute timeout. The review job has
a separate twenty-minute outer limit so checkout, authority materialization,
and the one-minute diagnostic have room around that action deadline. If the
Action step fails or times out, the next diagnostic
step records the Action outcome, whether its final-message file was written,
the file size and JSON parseability, and the installed Codex CLI/proxy versions
without printing the decision or credentials. A parseable final-message file
after a timeout points to a post-output Action/CLI lifecycle problem; an
absent or invalid file leaves the model/API execution path in question. The
distinction is diagnostic only:
either failure remains incomplete and cannot satisfy `Architecture Gate / accept`.
GitHub's **Re-run jobs → Enable debug logging** can add runner and step traces
for an individual attempt when more detail is needed.

Version 1 of `.codex/gatekeeper/ci-policy.json` accepts only `version`,
`default`, and `branches` at the top level. Both `default` and every named
branch use one of these shapes:

```json
{
  "version": 1,
  "default": { "mode": "local-only" },
  "branches": {
    "main": {
      "mode": "enforced",
      "model": "gpt-6-sol",
      "reasoningEffort": "medium"
    }
  }
}
```

`local-only` accepts only `mode`; `enforced` requires `mode`, `model`, and
`reasoningEffort`, with no other fields. `model` is a nonempty identifier using
letters, digits, `.`, `_`, or `-`; `reasoningEffort` is one of `minimal`, `low`,
`medium`, `high`, `xhigh`, `max`, or `ultra`. Policy resolution validates every
branch entry, even when another branch is being reviewed. Unknown fields,
incomplete entries, or unsupported policy versions fail the policy job rather
than falling back to an older review route. Before upgrading the workflow,
remove previously ignored metadata and correct any stale branch entries.

Policy version 2 adds an opt-in distributed Authority Set to an `enforced`
branch. The protected-base branch entry must declare both
`authorityManifestPath` and every `authorityLimits` value. For example:

```json
{
  "version": 2,
  "default": { "mode": "local-only" },
  "branches": {
    "main": {
      "mode": "enforced",
      "model": "gpt-6-sol",
      "reasoningEffort": "medium",
      "authorityManifestPath": ".codex/gatekeeper/authorities.json",
      "authorityLimits": {
        "maxManifestBytes": 16384,
        "maxMembers": 16,
        "maxFileBytes": 65536,
        "maxTotalBytes": 262144,
        "maxPromptBytes": 524288
      }
    }
  }
}
```

The manifest is a version 1 selector with an `authorities` array of stable
`id`, GitHub `repository` (or `self`), immutable `revision` (or
`authority-revision` for `self`), and `.md` `path` values. The selected
protected output schema must require `authorityIds` as a nonempty string
array, and the caller must set `protected-review-instructions: true`. The
workflow checks the schema, complete prompt size, every selected source and
exact reported IDs before accepting a result. Missing or oversized limits,
sources or IDs fail the review. The runtime ceilings are 65,536 manifest
bytes, 32 members, 131,072 bytes per file, 524,288 bytes total, and 1,048,576
bytes for the complete prompt. The values above are the recommended effective
profile. This repository's self-review selects the version 2 route from its
protected base, with `docs/architecture.md` as its first Authority Set member.
The adoption pull request is reviewed under the prior protected-base policy;
the new selection applies to subsequent pull requests after merge. Local and
manual review can opt in separately through version 2 of
`.codex/gatekeeper/config.json`.

Before the review job receives `OPENAI_API_KEY`, a separate credential-free
integrity job checks out that same exact fork commit, verifies its revision,
base/head trees, complete three-commit sequence, changed-file allowlist and
SHA-256 content manifest owned by this repository. It then installs only its
lockfile-pinned dependencies, runs its typecheck and complete
test suite (including credential-isolation and descendant-stdio regressions),
rebuilds the bundled action, and rejects a changed `dist`. The review job needs
both policy resolution and this integrity job, so failed validation prevents the
fork from receiving review credentials. The integrity job has only
`contents: read`, receives no caller secrets, uses exact-SHA setup actions, and
has a five-minute timeout. Updating the fork requires reviewing and changing the
repository-owned manifest as part of the Gatekeeper diff.

The `codex-action-integrity-observe` job compares the declared Action pin and
verification command text in the protected workflow with the provenance
manifest and an explicitly unpromoted fixture record. Its narrow parser does
check the expected enforced-mode job conditions and rejects `continue-on-error`
on the full integrity job, plus `if`, `continue-on-error`, `shell`, or
`working-directory` overrides on its verification step. It still does not
prove the commands actually ran or interpret full YAML semantics, and cannot
be reused for authorization. The job has no secrets and is outside the review
and acceptance dependencies. Its output is diagnostic only; the full integrity
job above still runs on every enforced review. The fixture does not claim that
a protected verification run or owner approval occurred. See the
[Issue #45 trust design](docs/investigations/2026-09-23-codex-action-integrity-trust-design.md)
for the promotion and governance requirements before a fast path can exist.

To enforce consumer-owned cross-field invariants in CI, pass
`validation-path` to the reusable workflow. The file is always read from the
protected base revision. Validation runs with the called workflow's immutable
runtime after the model returns and before the review job can succeed; neither
the policy nor its evaluator executes pull-request code.

The workflow publishes the result as a GitHub Actions job summary and creates
or updates one marker-owned pull-request comment. The caller must grant
`pull-requests: write` as shown above. If the token is read-only, as it normally is for a
fork pull request, the job summary and authoritative `Architecture Gate / accept`
result remain available and comment delivery is reported as a warning. Do not
switch to `pull_request_target` merely to make comments writable while checking
out or executing pull-request code.

`OWNER_DECISION` is an architecture escalation, not an alternate acceptance
route. It means the protected consumer authority does not contain enough owner
direction for the Gatekeeper to decide. The current `Architecture Gate / accept`
check therefore fails. The accountable owner makes the unresolved decision in
the design or manual-review flow, records it in canonical consumer-owned
authority, and reruns the gate. The new run can return `PASS` when the proposed
change follows that authority, or `BLOCK` when it does not. A review comment,
workflow approval or other run-local acknowledgement does not replace the
canonical authority update.

For `OWNER_DECISION` and CI review failures caused by API, billing, model,
credential or service availability, follow the
[owner-intervention runbook](docs/owner-intervention.md). CI failure remains
fail closed; any repository-owner merge bypass is recorded as an explicit
operational exception outside Architecture Gate acceptance.

This repository dogfoods the reusable workflow through
`.github/workflows/self-architecture-gate.yml`. The `pull_request_target` caller
requires the scoped [self-Gate Actions event policy](docs/self-gate-actions-policy.md)
before GitHub enforces its public-repository default on 2026-11-02. The
policy's configuration, verification, and recovery steps are documented there.
The `pull_request_target` caller
always comes from the protected base revision; it never runs a workflow supplied
by the pull request. Jobs that check out the pull-request merge revision have
only `contents: read`. The reporting job inherits `pull-requests: write`, but it
checks out only the called workflow's immutable source and never executes
pull-request code. The review prompt, output schema and CI policy are also read
from the protected base revision under `.codex/gatekeeper/`. This caller sets
`protected-review-instructions: true`; privileged triggers must enable that
input so a pull request cannot replace its own reviewer instructions. The
CI reviewer also disables automatic loading of checkout-owned `AGENTS.md`
files; they remain review evidence, not reviewer instructions. The
default remains `false` for compatibility with consumers that are still
bootstrapping their first base-owned prompt and schema.

The repository also dogfoods the local and Codex-hosted Skill paths through
`.codex/gatekeeper/config.json`. Its version 2 configuration selects the
committed `authorities.json` manifest, a declared self repository and all five
effective Authority Set limits. Manual CLI, Hook and native preparation read
these inputs and every self authority file from one recorded commit. They
require exact `authorityIds` for every decision and report the selected set
digest and member provenance. The full local prompt, including task and Hook
context, must fit the configured prompt limit. An external member currently
leaves local review incomplete; it cannot fall back to version 1 or use a
source token. Version 1 consumer configurations retain their synchronous
public request and review APIs. Local implementation and working-tree content
remain review evidence rather than authority. The native self-review has a
bounded 180-second deadline and remains fail closed if the reviewer does not
complete within it.

Lifecycle-workaround adoption evidence and repeat dogfood results are tracked
in [architecture-gatekeeper issue #15](https://github.com/flair-agency/architecture-gatekeeper/issues/15).

Consequently, the first pull request that introduces this caller cannot execute
the self-review. After that bootstrap change is adopted, subsequent pull
requests exercise the real model review, job summary and sticky-comment path.

The reusable workflow uses GitHub.com's `job.workflow_repository`,
`job.workflow_sha` and `job.workflow_ref` identity properties to load and report
the exact called-workflow revision instead of code from the consumer checkout.
These properties are not available on GitHub Enterprise Server, which is not a
supported CI target for this workflow.

## Trust boundary

This is an architecture guardrail, not a tamper-resistant security boundary.
Local execution assumes a trusted Git executable, normal object resolution and
the same-user environment already trusted to run project hooks. CI relies on a
clean GitHub checkout. No review stage implements filesystem monitoring, path
leases, rollback, local object-store defense or malicious-operator resistance.
