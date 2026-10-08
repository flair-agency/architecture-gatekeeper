# Parsed workflow structure quality — 2026-10-08

This is the bounded #416 slice of parent #412. It preserves existing workflow
invariants while replacing source-position and whole-file text assertions with
YAML 1.2 parsed target-job/step checks. This document is nonnormative; it changes
no canonical authority, production permission, protected check or route.

## Existing assertion to retained structure

| Existing protected property | Parsed target and retained assertion |
| --- | --- |
| Consumer receives no self-only OIDC/attestation capabilities | Workflow permission scope and every consumer job permission map; policy/review/owner-addition exact contents-read maps and explicit per-job overrides |
| Consumer excludes self-only jobs and dependencies | Exact consumer job keys and every consumer job’s needs; block review, owner-decision record, attempt classifier, semantic eligibility and signer remain absent |
| Consumer excludes self Flex inputs/variables/service-tier selection | Parsed consumer object, including workflow/job environments and inputs; comments do not contribute |
| Consumer rejects self-only OWNER_AMENDMENT G0 | Named policy rejection step, unconditional step, selected grade environment binding, exact G0 test, diagnostic, stderr redirection and failing command |
| Self producer retains its identity and signed jobs | Self workflow name, caller architecture-gate reusable `uses`, evidence job WORKFLOW_PATH and required signer permission values |
| Protected-base policy resolution agrees between profiles | Deep equality of the named policy resolution steps; retained snapshot/resolver command references |
| Provider rejection executes within the policy dependency | Named policy guard in both profiles, no disabling `if`, after resolution, selected-provider environment and exact non-empty/non-codex test, diagnostic, stderr redirection and failing command; downstream review needs policy |
| Consumer/self owner-addition implementations differ only by the existing self environment | Deep equality of complete parsed jobs after removing only the self environment; consumer environment absent |
| Selected owner-addition and protected evidence wiring remain connected | Policy grade output, owner-addition dependencies and G0/OWNER_DECISION selectors, preparation/eligibility steps and exact reviewer action pin; exact existing v5/github-actions/ELIGIBLE evidence condition |
| Legacy recorded-base authority is materialized and checked | Named review steps in both profiles with exact legacy selectors, protected-base/authority-list environment and existing prepare/validate commands; exact Authority ID selector and validator |
| Reviewer action and self workflow source remain pinned | Exact `openai/codex-action` SHA and relative caller workflow source on the actual parsed target steps/job |
| Policy/review/addition/report/accept and self evidence dependencies stay connected | Parsed `needs` arrays/scalars on their owning jobs, with selected self evidence dependency edges |

No prior operational property is intentionally dropped. The old four test cases
are consolidated into a parsed-invariant case and a separate mutation/format
suite; the mapping above records the retained assertions rather than using a
test-count target. Existing other workflow/source tests remain.

## Parser and fixture boundaries

`yaml` 2.9.1 is pinned only as a development dependency. `parseDocument` uses
YAML 1.2 and unique-key checking, rejects every parser error, and materializes
objects with a bounded alias count. The helper never executes shell, GitHub
expressions or workflows. The parser replaces indentation-sensitive substring
job extraction; it does not introduce a second production workflow parser.

Negative fixtures alter the parsed production workflow and retain required
text in a comment or wrong job; replace provider and amendment guards with
condition-removed, inverted, unconditional-failure and comment-only scripts;
place signer permissions on the wrong job or
at workflow scope; remove a `needs` edge; move/disable a provider guard; disable
legacy assurance or broaden the v5 evidence selector. Each checks the relevant
rejection. Positive fixtures serialize/reparse mapping keys in a different
order and indentation with harmless comments. Malformed YAML and duplicate
mapping keys reject before invariant evaluation.

The credential-free ordinary CI step runs:

```sh
node --test test/workflow-structure.test.mjs
```

The existing full command remains `npm test`. Locked development dependencies
are installed with lifecycle scripts disabled. Packed runtime code has no
YAML parser import; tests and the dependency itself are outside package files,
and consumer commands require no development parser.

## Local verification

Final focused structural and retained least-privilege checks passed 10/10.
The final full suite passed 1,188/1,188 cases (0 failures, about 182.8s on
Node 22.22.0/macOS) at the original candidate revision. An independent review
later found that keyword-only provider and amendment guard checks accepted
unconditional failing scripts. The corrective follow-up and fresh verification
are recorded below; the earlier suite result does not cover that follow-up.
The package dry run listed 116 files, excluding tests and the YAML parser;
`yaml` remains development-only. `git diff --check` passed.

## Limits and integration status

The selected provider and consumer amendment guard bodies are compared against
their complete expected shell scripts, including variable tests, branch
direction, diagnostic, stderr redirection and exit behavior. This catches the
identified unconditional and inverted substitutes but remains a bounded text
check; it does not execute shell or prove general shell/GitHub-expression
equivalence. Other named-step checks retain bounded exact selectors and useful
source patterns. For example, equal policy steps establish parity but do not
independently execute the policy materializer. Static permission/dependency
checks do not prove a live caller, selected producer, Environment, required
check or host transition.
Existing hosted proof remains with #210/#211, #336 and #374; local fixtures do
not close those issues or activate a consumer route.

This change is stacked after #415/#422 while main integration authorization is
pending. Fresh main-target ordinary CI and applicable hosted checks remain
necessary; a local pass or draft stacked PR does not establish protected
acceptance. Package-list inspection is scoped distribution evidence, with the
existing local installed-preview timeout limitation tracked separately.

## Corrective review follow-up — 2026-10-08

Independent review reproduced a gap: provider and consumer G0 guards that
always printed required keywords and exited nonzero passed the original
assertions even after their selected conditions were removed or inverted. The
test helper now compares each selected guard body with its exact expected
script. Negative fixtures cover removed and inverted conditions, unconditional
failure scripts and comment-only text in both consumer/self provider guards and
the consumer G0 guard. No production workflow or authority file changed. The
corrective focused structural and least-privilege tests passed 11/11 and
`git diff --check` passed. The full-suite result is pending and must be reported
separately from the historical results above.
