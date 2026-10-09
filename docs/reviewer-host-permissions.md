# Host permissions for child reviewers

## Scope

The automatic `UserPromptSubmit` Hook and standalone `architecture-review` CLI
start a child Codex reviewer when committed settings select Codex. This document
covers that selection only; Gemini uses the asynchronous API transport and does
not inherit these child sandbox guarantees. The Codex-hosted Skill uses a host-native reviewer
and is outside this child-process boundary. Host authorization is separate from
an architecture decision and from merge acceptance.

## Permission boundary

With Codex selected, both local paths call the same `runCodexReviewer` transport after selecting
committed review inputs. The Hook has no native reviewer handle, and the
standalone CLI runs without a Codex host task. Each starts an installed
`codex exec` process. The transport requests `--sandbox read-only`, disables
nested hooks, and sets the **child** approval policy to `never`.

Those child settings do not authorize process launch, access to host Codex
state or credentials, or transmission of committed authority and task data to
a model service. The surrounding host controls those permissions and may
require approval or refuse the operation. Gatekeeper must leave host policy
intact.

## Credentials

The local runtime does not set an API key explicitly for the child. It also
does not replace or filter the parent process environment. The child therefore
inherits credentials present there, including `OPENAI_API_KEY`, and may use
available Codex authentication. The host must decide whether launching the
child with that environment and sending the review inputs is permitted.

## Outcomes and troubleshooting

| Outcome | Gatekeeper result | Next step |
| --- | --- | --- |
| The host refuses the top-level CLI or Hook invocation before Gatekeeper starts | Gatekeeper has no exit status or message; only the host reports the refusal. | Check the host's authorization and data-flow policy. |
| Gatekeeper starts, but the child is refused, fails to start, cannot access the model, or times out | The CLI or Hook exits with status 2 and a generic reviewer-failure message; there is no validated decision. | Inspect the host and child execution failure before retrying. |
| The reviewer completes and its decision validates | The standalone CLI prints the structured decision and reviewed revision. The Hook returns a non-PASS decision as a failure after validation. | Handle `PASS`, `BLOCK`, or `OWNER_DECISION` according to the decision and [owner intervention guidance](owner-intervention.md). |

Neither host refusal nor child failure is a semantic `BLOCK`. A validated
`BLOCK` is a model decision about the proposed architecture. Do not change
host permissions or substitute an unvalidated result merely to make a local
Gate pass.

## Optional asynchronous PostToolUse screening

The separate PostToolUse change screen is an opt-in local feedback route. Its
synthetic CLI dogfood on CLI `0.159.2` observed one exact project hook
definition remain trusted in a fresh CLI session, and two actual semantic
reviews completed as `PASS` and `OWNER_DECISION`. This is evidence for those
sessions and that reviewed definition only; project trust does not itself
authorize every operation the child needs.

The host's permission to start the child, access required host state or
credentials, and send review inputs to the configured model service are
separate controls. The run requested a read-only child, approval policy
`never`, ignored user configuration, disabled hooks, and ephemeral execution;
those child arguments do not attest that the host enforced process isolation,
credential boundaries, or network-egress policy. The observed sessions
showed no additional visible approval prompt, but this does not establish a
host enforcement guarantee. If the host refuses or the child cannot initialize,
access the model, or return a valid decision, the screen is incomplete. Keep
host policy intact and follow the host's authorization and data-flow rules.

PostToolUse runs after the triggering tool has completed and returns
informational context; this adapter does not require acknowledgement or block
or change the completed action. These observations do not establish guaranteed
consumption of its feedback. The screen can finish while later work proceeds,
report only in a later turn, or end without observed completion when the session
exits. A parent model response of `None` after context injection establishes
non-reporting by that response, not transport failure. If host or model access
fails, the result remains incomplete under the existing review contract; it
does not select a weaker fallback. The corresponding #244 evidence is
documented in the [local screening dogfood investigation](https://github.com/flair-agency/architecture-gatekeeper/blob/main/docs/investigations/2026-10-01-local-screening-adapter-dogfood.md).

For the dated synthetic fixture, host observations, and a separate model
availability diagnostic, see the
[2026-09-23 investigation](investigations/2026-09-23-child-reviewer-host-permissions.md).
