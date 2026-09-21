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
schema remains limited to the subset accepted by OpenAI Structured Outputs;
cross-field invariants are expressed as declarative `when`/`require` rules in a
separate committed JSON file. Each condition compares a JSON Pointer value to
an explicit JSON scalar (`string`, `number`, `boolean` or `null`); object and
array equality is intentionally outside this minimal contract. The shared
runtime evaluates only those declared path/value implications and does not
infer meaning from consumer fields.

The local runtime records one Git revision to identify the review and reads its
configuration, prompt, schema and validation policy from that committed
revision. It also supplies authority files to the reviewer as snapshots read
from that revision, so working-tree copies remain untrusted review material. It
does not compare files with working-tree bytes, monitor Git state during review
or provide tamper resistance. Git, CI, sandboxing and PR review own execution
and change verification.

For authority inside a Git submodule, the snapshot reader resolves the parent
revision's pinned gitlink and reads the blob from that exact nested commit. It
never fetches a missing component; unavailable pinned objects fail closed.

## Local integration

Install an exact release from the `@flair-agency` GitHub Packages registry, then
invoke the installed package bin from the Hook without network fallback:

```sh
npm exec --offline -- architecture-gatekeeper
```

The package is private. Consumers must map the `@flair-agency` scope to
`https://npm.pkg.github.com` and authenticate installation with package-read
access. The committed dependency and lockfile select the exact reviewed
version; Hook execution never resolves or downloads a newer release.

The repository-owned `.codex/gatekeeper/config.json` identifies committed
inputs. See `examples/config.json`. Hook package resolution is network-free;
the installed `codex` reviewer runs with hooks and host Skill discovery disabled
and a read-only sandbox. This keeps the selected reviewer from recursively
invoking a user-installed review Skill instead of evaluating the supplied
snapshots.
When `validationPath` is configured, the local and manual review paths apply
that committed policy after structured generation and fail closed on a rule
violation or malformed policy.

## Local reviewer deployment

`--offline` applies to npm resolution only: it prevents a registry fetch while
locating the already installed, exact package. The installed `codex` reviewer
still needs the authenticated connection to its configured OpenAI/Codex service
endpoint to produce a decision.

The package supplies the child reviewer on standard input with the configured
authority snapshots from the recorded revision, the review task, and (for a
Hook run) its prior structured review context. It starts that reviewer in the
consumer repository with read-only filesystem access, so the reviewer can also
read repository material through its tools. The package does not enumerate or
upload an entire repository itself; an operator must nevertheless authorize the
repository material that its selected reviewer is allowed to read.

The following are host deployment guidance, not settings that Gatekeeper can
impose on its outer task, terminal, CI runner, or managed host. A host profile
selected *before* invoking this package should provide:

- the consumer repository is readable by the review process, but remains
  read-only to the reviewer;
- only the outbound access that its configured OpenAI/Codex service endpoint(s)
  require, rather than arbitrary network access;
- a non-interactive outer-runner policy that can start the installed `codex`
  client without asking for a review-by-review approval; and
- the local `codex` binary is authenticated and available on `PATH`.

The runtime itself passes `--sandbox read-only`, disables hooks and host Skill
discovery, and sets the *child* Codex `approval_policy` to `never`. The first
two are internal hardening: they prevent the reviewer from writing and from
recursively invoking host-installed workflows or ambient hook instructions.
The child approval setting prevents the reviewer from pausing for tool
approval; it cannot relax the permission, network, or approval policy of the
outer task, terminal, CI runner, or managed host that starts this package. A
rejection by that outer environment before `architecture-review` starts is an
execution-environment rejection, not a `PASS`, `BLOCK`, `OWNER_DECISION`, or a
Gatekeeper failure. It must be diagnosed there rather than worked around with a
PTY, a source entrypoint, or `danger-full-access`.

For a release-candidate dogfood check, pack the candidate and install it into a
separate tools prefix, then run its real bin from the consumer repository. The
following is non-interactive and does not require a PTY; replace the task text
with the change under review. It intentionally keeps the package install
offline while allowing only the preselected reviewer service connection:

```sh
npm pack --ignore-scripts
tools_dir=$(mktemp -d)
npm --prefix "$tools_dir" install --offline --ignore-scripts --no-save \
  ./flair-agency-architecture-gatekeeper-<version>.tgz
(cd /path/to/consumer && npm exec --prefix "$tools_dir" --offline -- \
  architecture-review 'Review the proposed change against committed authority.')
```

The command must emit a schema-valid `PASS`, `BLOCK`, or `OWNER_DECISION` with
`reviewedRevision`; malformed output, a reviewer timeout, a missing output
file, or a nonzero reviewer exit fails closed with exit status 2. A structured
manual decision is review feedback, so its JSON result is emitted normally;
the Hook entrypoint rejects non-`PASS` decisions. This check proves the packed
artifact, isolated install, package bin, non-interactive stdin/stdout flow and
reviewer result. It does not turn local feedback into CI acceptance evidence.

## Manual review

After installing a fixed package version, invoke the package-owned entrypoint
with the architecture question or proposed change:

```sh
architecture-review 'Should this responsibility move from Runtime to the Provider?'
```

The task may instead be supplied on standard input. The command uses the same
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
runtime release you adopt. The Skill is a thin invocation workflow: the
version-pinned runtime, not the Skill, selects and validates repository-owned
authority.

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

This repository dogfoods the reusable workflow through
`.github/workflows/self-architecture-gate.yml`. The `pull_request_target` caller
always comes from the protected base revision; it never runs a workflow supplied
by the pull request. Jobs that check out the pull-request merge revision have
only `contents: read`. The reporting job inherits `pull-requests: write`, but it
checks out only the called workflow's immutable source and never executes
pull-request code. The review prompt, output schema and CI policy are also read
from the protected base revision under `.codex/gatekeeper/`. This caller sets
`protected-review-instructions: true`; privileged triggers must enable that
input so a pull request cannot replace its own reviewer instructions. The
default remains `false` for compatibility with consumers that are still
bootstrapping their first base-owned prompt and schema.

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
