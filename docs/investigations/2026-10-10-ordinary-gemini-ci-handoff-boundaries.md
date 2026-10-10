# Ordinary Gemini CI caller and decision handoff boundaries

Implementation investigation for #334 and #329, based on feature `f15def8`
(main compatibility import `208b055`). This document selects no replacement
transport, producer, acceptance policy or active route.

## Actual caller gap

The reusable `architecture-gate.yml` policy job rejects Gemini. Its review job
requires the OpenAI credential and executes Codex Action unconditionally.
The v6 policy parser represents the adopted Gemini reviewer but does not allow
Gemini `execution` selectors. Existing Git-backed composition coverage already
connects preparation, fixed call construction, profile execution, shared
completion, reporting classification and in-memory acceptance with synthetic
inputs. Repeating that composition behind another generic wrapper would not
supply the missing hosted caller.

The historical Issue 334 push verification script is a different caller. Its
exact predecessor, start claim, diagnostic journals and encrypted evidence
belong to admitted development verification. They must not silently become
ordinary CI governance or protected producer authentication.

The next implementation boundary is an inactive ordinary host adapter with
separate preparation and execution phases. Preparation binds the observed
checkout and ordered merge parents, selects protected inputs through the
ordinary preparer, and inspects the fixed runtime before Vertex credentials.
Execution receives the parent-only credential, applies the adopted profile and
runs shared completion validation once. It retains full results in process;
no workflow is activated and no cross-job transport is selected by this work.
Consistency with host inputs does not authenticate an arbitrary invocation.
The preparation handle is process-local and intentionally has no serialized
handoff format. A future host launcher must obtain the parent-only credential
between phases in that process; separate GitHub auth-action steps cannot reuse
this handle. That launcher/issuance connection remains unimplemented. The new
adapter is not a runnable workflow or a usable ordinary CI route by itself.
Response Buffers remain caller-owned mutable diagnostic bytes, not immutable
or authenticated portable evidence.

## Existing cross-job consumers

| Consumer | Required input | Why status alone is insufficient |
| --- | --- | --- |
| `report` / `ci-report.mjs` | Full structured decision; selected authority or legacy provenance; policy/review status; repository/base/head/reviewed revision; selected owner-addition procedure | Classification reads nested gates and ownerDecisionId; rendering uses summary/findings/gates; authority validation and canonical digest need complete selected material. |
| `accept` / `ci-enforced-acceptance.mjs` | Review status, report status/conclusion and selected addition/amendment classifier/signer results | Raw decision is not read directly, but replacing reporting with an unvalidated status would change the upstream acceptance boundary. |
| `block-review-record` | Exact complete decision and authority provenance plus repository/PR/base/head/merge/workflow/run/attempt context | The selected record producer constructs exact decision-bound evidence; an ordinary status is not a ReviewRecord. |
| `owner-amendment-owner-decision-record` | Exact complete OWNER_DECISION and authority provenance with the same context dimensions | Missing-decision semantics and record binding cannot be reconstructed from a decision kind. |
| `owner-addition` preparation | Ordinary decision, ordinary schema, authority provenance and protected B/policy/tag context | The eligibility review must address the exact missing decision identified by the earlier protected review. |

The workflow currently carries `final_message` to these consumers. The existing
#329 synthetic reproduction proves a valid in-job response can disappear at
that boundary due to runner suppression. It proves neither a safe substitute
nor that the suppressed response is safe to publish or persist.

## Constraints on a future replacement

Preserve selected schema, complete Authority Set and consumer-rule validation;
keep semantic decisions separate from incomplete execution. Bind the selected
producer and exact repository/revisions/workflow/run/attempt under the applicable
host mechanism, rejecting missing, altered, unrelated and stale material.
Document which consumers are supported before making an ordinary usable-route
claim; governance consumers cannot be silently replaced by status-only data.

Do not encode, mask, log or upload potentially secret-bearing response bytes to
bypass GitHub's output guard. Schema validity, a digest, or a successful model
execution does not establish secret-free content or producer authentication.
A same-job result can avoid one output boundary, but moving privileged
reporting into that job requires an explicit credential/process responsibility
review; it is not selected by this investigation. Encrypted private development
evidence likewise supplies no ordinary acceptance handoff.

## Remaining verification

The new caller requires tests at its host-context, pinned-runtime and credential
seams, including disagreement before dispatch and incomplete/error without
retry or fallback. Existing lower-level Git/fake-CLI composition tests remain.
#329 still owns replacement selection and local/hosted same-attempt positive
and negative evidence. #334 still owns real ordinary provider-selected hosted
operation, unchanged Codex compatibility and explicit rollback. No such
completion or activation is claimed here.
