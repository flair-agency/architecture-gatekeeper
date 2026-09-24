# Protected Authority Set self-CI dogfood plan (2026-09-24)

This investigation supports [Issue #51](https://github.com/flair-agency/architecture-gatekeeper/issues/51). It records a falsifiable check of the protected-base Authority Set route now selected by this repository's self-review policy. It does not amend [`docs/architecture.md`](../architecture.md), establish a new assurance rule, or claim that a run has already completed.

## Hypothesis

For a non-draft pull request targeting `main`, the self-review workflow will resolve enforcement and the Authority Set manifest from the protected base revision, materialize the declared `architecture-contract` member from that same revision, and provide the resulting complete prompt to the read-only reviewer. The run should report the selected manifest and member digests, require the decision to name exactly the selected authority ID, and fail closed if policy resolution, materialization, preflight, review, validation, or reporting fails.

This is a live check of the single-repository protected-base route. It does not exercise an external repository fetch, prove semantic comprehension of every authority byte, or reproduce the Provider PR #29 case. Those require a later two-repository fixture and a consumer adoption with the actual parent contract.

## Inputs expected from protected `main`

The self workflow calls the reusable Architecture Gate with protected review instructions, the CI decision schema, and decision validation enabled. For `main`, the policy at `.codex/gatekeeper/ci-policy.json` selects `enforced`, model `gpt-6-sol`, medium reasoning effort, manifest `.codex/gatekeeper/authorities.json`, and explicit limits: 16,384 manifest bytes, 16 members, 65,536 bytes per file, 262,144 total authority bytes, and 524,288 prompt bytes.

The expected manifest has one required member: ID `architecture-contract`, repository `self`, revision `authority-revision`, path `docs/architecture.md`. In CI, `authority-revision` must resolve to the PR's protected base SHA. The manifest, policy, reviewer prompt, schema, and validation rules must be read from protected `main`; copies proposed in the pull request are evidence and must not select or replace them. The PR merge checkout remains the reviewed change under evaluation.

## Evidence to record from the live run

Once a non-draft pull request runs the gate, record links and observed values from its Actions run and Architecture Gate report:

| Check | Expected observation | Evidence source |
|---|---|---|
| Trigger and revisions | Base branch is `main`; record protected base SHA, PR head SHA, reviewed merge SHA, and run URL. | Pull request event and Actions run |
| Protected policy | Mode is `enforced`; the protected-base policy selects the configured model, effort, manifest path, and limits above. | Policy job outputs and logs |
| Selected manifest | Record its SHA-256 from the Architecture Gate report. Confirm it corresponds to `.codex/gatekeeper/authorities.json` at the protected base revision. | Report comment and protected Git object |
| Materialized member | The report contains exactly `architecture-contract`, with repository identity, resolved commit equal to the protected base SHA, path `docs/architecture.md`, and content SHA-256. | Report comment and protected Git object |
| Reviewer request | Protected prompt and schema pass Authority Set preflight; the complete prompt contains the protected architecture snapshot and selected source ID. | Review job logs, without copying secret-bearing environment data |
| Decision validation | The structured decision reports `architecture-contract` exactly once and passes the protected schema, consumer validation, and Authority Set ID checks. | Review job result and report comment |
| Acceptance | The report conclusion and `Architecture Gate / accept` check agree; a failed, incomplete, invalid, or unavailable review does not become acceptance. | Report comment and required check |

Keep the run URL, all three revisions, manifest and set digests, member identity and digest, final decision, gate result, and any failure or manual intervention together in the Issue #51 investigation record. Do not copy API keys, source-read tokens, or other credentials into the record.

## Interpretation limits

A matching provenance record demonstrates which declared bytes the workflow materialized and reported. The exact-ID validator demonstrates that the structured result names the full selected set. Neither is proof of the model's internal reasoning. A successful single-member self-run also says nothing about external GitHub access, exact-SHA retrieval from another repository, multi-authority conflicts, or the consumer-specific Provider regression.

If the run cannot complete, retain the failure as evidence and diagnose the failing stage. Do not interpret service or access failure as a weaker successful route. If the observed protected inputs differ from those listed above, treat the hypothesis as falsified and investigate before expanding rollout. No live-run result is recorded here until the corresponding run exists.
