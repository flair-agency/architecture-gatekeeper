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

## Validation and evidence that a replacement must preserve

This section inventories current paths for investigation; it adds no canonical
requirement and does not select a transport. A replacement design remains
unresolved. It cannot be treated as equivalent by carrying only a `PASS` label
and digest.

- Preserve the selected schema and, when policy selects them, consumer-owned
  validation rules. The self schema requires the complete structured decision,
  including findings, authority identifiers and files, review scope, gates,
  and gate details; consumer schema selection can differ. See
  [the self schema](../../.codex/gatekeeper/ci-decision.schema.json),
  [decision validation](../../src/validate-decision.mjs), and the validation
  steps in both reusable workflows.
- Preserve selected Authority Set provenance and decision checks: exact
  selected authority IDs, and for the multi-authority profile its set digest.
  Legacy policy v1 also carries hashes for policy, prompt, schema, optional
  validation, and authority members, bound to base, head, and reviewed SHAs.
  See [authority validation](../../src/validate-authority-set-decision.mjs),
  [multi-authority checks](../../src/multi-authority-provenance.mjs), and
  [report provenance parsing](../../src/ci-report.mjs).
- For OWNER_ADDITION / G0, preserve the separately validated procedure,
  selected grade, job result, and eligibility, including exact repository,
  base/head, policy, authority, missing-decision, tag, and record bindings.
  This route reports eligibility, not semantic PASS. Self acceptance also
  checks its selected amendment-attempt and semantic-eligibility signer
  results; the consumer reusable workflow has no amendment-specific acceptance
  dependencies. See [enforced acceptance](../../src/ci-enforced-acceptance.mjs).
- `decision_digest` is SHA-256 of the canonicalized decision JSON alone. It
  adds no independent binding to externally supplied policy/schema, provenance,
  validator results, revisions, run attempt, producer, or caller. Fields already
  inside the decision contribute to that hash, but the hash does not authenticate
  who selected or validated them. The reporter receives a run URL containing the
  run ID, but does not check `run_attempt`; `workflowRef` and run URL are
  rendered metadata, not caller or producer authentication. Current `needs`
  wiring does not by itself establish protected source or same-run/attempt
  assurance.

The full decision and findings, authority IDs/paths/revisions/hashes, legacy
policy and prompt paths/hashes, and G0 procedure fields can disclose private
review or authority context. Their presence in job outputs does not make them
safe for artifact retention or public reporting. This inventory describes
observed code paths and open assurance questions, not new architecture policy.

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
Hosted reproduction completed on 2026-10-08 in [run 37721924693,
attempt 1](https://github.com/flair-agency/architecture-gatekeeper/actions/runs/37721924693),
workflow head `9061056fc544fe9b5d8c98bd03251994600bd5dc`:

- The `produce` job succeeded and its second step confirmed that the synthetic
  JSON parsed and both the masked marker and unmasked control were present.
- At job completion, the runner emitted
  `Skip output 'final_message' since it may contain secret.`
- The `inspect-handoff` job succeeded: its masked full job output was empty,
  while the unmasked control parsed and matched its expected value.

The producer and dependent job ran on Ubuntu 24.04 image versions
`20260927.320.1` and `20261004.327.1`, respectively. These are observations of
that run, not assumptions required by a replacement design.

This reproduces the runner handoff failure class with generated noncredential
data. It does not prove why a particular historical real response matched
GitHub's redaction guard, validate an actual AGK decision, or establish safe
replacement transport or protected acceptance. No replacement or adoption has
been selected. #329 remains open for complete downstream validation/evidence
requirements, safe handoff selection, and exact-run/revision and sensitive-input
negative verification.
