# Architecture Gatekeeper

Architecture Gatekeeper supplies reusable mechanics for two semantic design
review stages:

- a fast, read-only local Codex hook;
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

## CI integration

Call the reusable workflow at an exact release tag:

```yaml
jobs:
  architecture-gate:
    uses: flair-agency/architecture-gatekeeper/.github/workflows/architecture-gate.yml@v0.1.0
    secrets: inherit
```

The caller keeps `.codex/gatekeeper/ci-policy.json`, its prompt and schema. CI
policy is read from the protected base revision, so a pull request cannot waive
its own review. `enforced` runs `openai/codex-action`; `local-only` records an
explicit waiver and makes no OpenAI API call.

## Trust boundary

This is an architecture guardrail, not a tamper-resistant security boundary.
Local execution assumes a trusted Git executable, normal object resolution and
the same-user environment already trusted to run project hooks. CI relies on a
clean GitHub checkout. Neither stage implements filesystem monitoring, path
leases, rollback, local object-store defense or malicious-operator resistance.
