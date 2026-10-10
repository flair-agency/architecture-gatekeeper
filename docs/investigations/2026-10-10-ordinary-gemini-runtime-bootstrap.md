# Ordinary Gemini runtime bootstrap

Internal implementation for #334 after #492. This connects the existing locked
installer to an explicit protected-base source before ordinary parent execution.
It does not select a deployment, authenticate a caller or activate a workflow.

## Responsibility

The invoking trusted host selects the checkout, exact base commit and fresh
private runtime target. The bootstrap reads only the fixed committed
`.codex/gatekeeper/gemini-verification-package-lock.json` at that base. Worktree
and candidate changes do not select the lock. The existing installer verifies
the fixed complete graph and installs with scripts disabled into a fresh 0700
directory using its existing sanitized npm environment and finite deadline.
The ordinary preparation phase subsequently rechecks the installed runtime
against the protected lock before credential issuance.

The returned identity is an installer observation, not source admission,
producer authentication or portable acceptance evidence. Installation cleanup
on failure belongs to the existing installer; the invoking host owns the
successful private runtime lifecycle. This module issues no WIF credential and
launches no reviewer.

## Risk and retained verification

| Invariant | Production boundary | Retained check |
| --- | --- | --- |
| Caller record has no executable fields | Bootstrap exact-record snapshot | Invalid, accessor and proxy inputs reject before installation. |
| Candidate does not select dependency graph | Fixed committed base-file reader | Candidate/worktree lock changes do not replace the selected base bytes. |
| Missing or invalid lock never starts npm | Committed reader and pinned installer | Missing/altered base lock rejects with zero npm dispatch. |
| Runtime install remains private and fixed | Existing installer | Fresh 0700 target, fixed command, sanitized environment, identity and reuse rejection. |
| Installation failure cannot leave a usable runtime | Existing failure cleanup | Failed npm removes the newly created target without retry. |
| Preparation precedes Vertex capability | Bootstrap guard and ordinary adapter | Preexisting Vertex credential variables reject bootstrap. |

Tests use real synthetic Git history and the production installer with a fake
npm subprocess. They do not establish network availability, authentic package
retrieval, live WIF authorization or hosted route acceptance.

## Remaining work

Concrete protected workflow configuration and producer/run/attempt/revision
verification remain #334 obligations. The safe full-decision handoff remains
under #329. Ordinary hosted PASS/BLOCK, Codex compatibility and explicit rollback
still require verification. Main/consumer activation and paid execution remain
separately authorized decisions.
