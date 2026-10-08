# Issue 329 job-output suppression fixture

This note records a bounded investigation into the GitHub Actions job-output
handoff used by the self-review workflow. It does not amend the selected
architecture Authority Set, establish model or schema validation, or prove
protected acceptance.

## Current data path

The self workflow [`self-architecture-gate.yml`](../../.github/workflows/self-architecture-gate.yml)
invokes the self-specialized reusable workflow
[`architecture-gate.yml`](../../.github/workflows/architecture-gate.yml).
External consumers use the distinct reusable workflow
[`architecture-gate-consumer.yml`](../../.github/workflows/architecture-gate-consumer.yml).
Both define review, report, and accept handoffs; their acceptance dependencies
differ.

The handoff fields are:

| Field | Handoff and meaning |
| --- | --- |
| `final_message` | `review.outputs.final_message` selects the reviewer `final-message` or execution `final_message` step output. The report job passes it as `DECISION` to `src/ci-report.mjs`. |
| `reviewed_sha` | Produced by the review job and passed to the reporter as `REVIEWED_SHA`; reporter validation uses it for legacy authority provenance revision binding. |
| `authority_provenance` | Review output passed as `AUTHORITY_PROVENANCE_BASE64`; the reporter parses/validates it when the authority route is selected and review succeeded. |
| `legacy_authority_provenance` | Review output passed as `LEGACY_AUTHORITY_PROVENANCE_BASE64`; for policy v1, the reporter checks its base SHA, head SHA, and reviewed SHA against report inputs. |
| Selected G0 procedure/result/eligibility | The selected owner-addition procedure, result, and eligibility are passed to the reporter; the reporter validates the procedure and its repository/base/head binding. The result and eligibility also reach acceptance. Self `accept` additionally depends on amendment attempt-classifier and semantic-eligibility signer outcomes; consumer `accept` has no amendment-specific dependencies. |
| `conclusion` / `decision_digest` | `ci-report.mjs` writes these report-step outputs and the report job exports both. Acceptance consumes `conclusion`; `decision_digest` is reporting metadata and is not passed to the acceptance validator. |

The reporter also receives `BASE_SHA`, `HEAD_SHA`, PR number, workflow
reference, and run URL. Its applicable validation checks bind structured
provenance/procedure data to repository revisions. `runUrl` and `workflowRef`
are rendered report metadata; they do not authenticate the caller or producer.
The `needs` graph wires job results and outputs together, but that alone does
not prove producer or caller protection, exact source identity, or complete
same-run/revision authentication. Those claims remain open pending selected
protected producer/caller evidence. The self workflow's repository/base
classification is a separate caller-side check; its existence does not by
itself close that assurance question.

This is a code-path inventory, not a claim that all hosted output values are
currently delivered successfully. The diagnostic fixture isolates the runner
handoff property: valid synthetic JSON and an unmasked control are available
inside the producing job, while a masked full job output is expected to be
unavailable to the dependent job. A dropped value should therefore leave the
real reporter without the ordinary decision; it must not be interpreted as a
successful review.

## Fixture and limits

[`issue329-output-handoff-fixture.yml`](../../.github/workflows/issue329-output-handoff-fixture.yml)
uses only a run-specific generated marker, deliberately registers it with
`::add-mask::`, and embeds it in a synthetic step-output JSON value. A second
synthetic control output contains no masked text. The producer job parses both
step outputs and checks the marker before exporting them as job outputs. The
dependent job expects the full masked output to be empty and the control output
to arrive intact.

The workflow is gated to a push on the exact
`codex/issue329-output-handoff-fixture` branch and this workflow path, with a
fixed repository guard, no permissions, no secrets, no checkout, no external
actions, and short job/step timeouts. It stores no artifacts or raw response.
The synthetic JSON shape is deliberately small; parsing it is only a fixture
check, not Architecture Gatekeeper/model/schema/Authority Set/consumer-rule or
evidence validation. This fixture provides no credential bypass, encoding or
masking workaround for real responses, workflow adoption, route support, or
acceptance proof.

## Runner behavior reference and status

GitHub documents that job outputs containing a secret are not sent to GitHub
Actions and are skipped, with a warning; see the official
[workflow syntax: `jobs.<job_id>.outputs`](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idoutputs).
That hosted runner behavior has not yet been reproduced for this fixture.
Host reproduction is **PENDING** until the coordinator runs the exact workflow
and reads back its run result and producer warning/output behavior. No
replacement or adoption has been selected.
