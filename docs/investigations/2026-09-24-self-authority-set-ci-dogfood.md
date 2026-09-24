# Protected Authority Set self-CI dogfood (2026-09-24)

This investigation supports [Issue #51](https://github.com/flair-agency/architecture-gatekeeper/issues/51). It records a live check of the protected-base Authority Set route selected by this repository's self-review policy. It does not amend [`docs/architecture.md`](../architecture.md) or establish a new assurance rule.

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

## Observed run: PR #67

The [Architecture Gate run](https://github.com/flair-agency/architecture-gatekeeper/actions/runs/35949225937) for [PR #67](https://github.com/flair-agency/architecture-gatekeeper/pull/67) completed successfully. The protected base was `d1fe955b85d68e4d323df9ee18b30a9f8a9424f3`, the PR head was `378abec7ef491d42e537426cbf33dd7c1fdba075`, and the reviewed merge revision was `7c116ed5ddd373cb58479d17244dfb1b13bfb542`.

All five jobs succeeded. The policy job's “Require protected instructions” check passed. In review, “Materialize protected Authority Set,” “Check protected Authority Set schema and complete prompt,” and “Require exact reported Authority IDs” all passed. The report returned `PASS` with `authorityIds: ["architecture-contract"]`.

The report recorded manifest SHA-256 `f207ce5ff4333c5d05348276422b73a95d7e4227d362e04177da5a28b164edf2` and Authority Set digest `02a1b3d8ad9bcd355efc26e4f2760df5f1879d1d4d29320dbdee8ef0167bbf32`. Its sole member was `docs/architecture.md`, resolved at protected base `d1fe955b85d68e4d323df9ee18b30a9f8a9424f3`, with content SHA-256 `84cb047bbb4fcaef9701b7443091e86f8ae7ab9babfceb7b74e81ef8aec9b9a1`. The manifest, set, and member digests were independently recomputed from protected-base content and the materializer.

## Interpretation limits

A matching provenance record demonstrates which declared bytes the workflow materialized and reported. The exact-ID validator demonstrates that the structured result names the full selected set. Neither is proof of the model's internal reasoning. This successful single-member self-run says nothing about external GitHub access, exact-SHA retrieval from another repository, multi-authority conflicts, or the consumer-specific Provider regression.

For subsequent runs, retain failures as evidence and diagnose the failing stage. Do not interpret service or access failure as a weaker successful route. If observed protected inputs differ from those listed above, treat the hypothesis as falsified and investigate before expanding rollout.
