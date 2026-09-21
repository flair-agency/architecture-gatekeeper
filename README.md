# Architecture Gatekeeper

Architecture Gatekeeper supplies reusable mechanics for three semantic design
review stages:

- a fast, read-only local Codex hook;
- an explicit, on-demand manual architecture review;
- a higher-assurance pull-request review from a clean GitHub checkout.

The package does not define a repository's architecture. Every consumer owns
its authority list, reviewer prompt, decision schema, model selection and
target-branch CI policy. The runtime does not grant filesystem, publication,
deployment, credential or service authority.

When an authority is inside a Git submodule, the local runtime verifies it
against the parent revision's pinned gitlink. It never fetches a missing
component; unavailable pinned objects fail closed.

## Local integration

Install an exact release (or an exact Git commit during pre-release adoption),
then add a tiny launcher:

```js
#!/usr/bin/env node
import { runHookCli } from '@flair-agency/architecture-gatekeeper';
runHookCli();
```

The repository-owned `.codex/gatekeeper/config.json` identifies committed
inputs. See `examples/config.json`. Hook execution is network-free and invokes
an installed `codex` binary with hooks disabled and a read-only sandbox.

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
its own review. `enforced` runs `openai/codex-action`; `local-only` records an
explicit waiver and makes no OpenAI API call.

The workflow publishes the result as a GitHub Actions job summary and creates
or updates one marker-owned pull-request comment. The caller must grant
`pull-requests: write` as shown above; reusable workflows cannot elevate a
caller's token permissions. If the token is read-only, as it normally is for a
fork pull request, the job summary and authoritative `Architecture Gate / accept`
result remain available and comment delivery is reported as a warning. Do not
switch to `pull_request_target` merely to make comments writable while checking
out or executing pull-request code.

## Trust boundary

This is an architecture guardrail, not a tamper-resistant security boundary.
Local execution assumes a trusted Git executable, normal object resolution and
the same-user environment already trusted to run project hooks. CI relies on a
clean GitHub checkout. No review stage implements filesystem monitoring, path
leases, rollback, local object-store defense or malicious-operator resistance.
