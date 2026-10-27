# Review output handoff: current scope of #329

Investigation baseline: main `e7a0c6958426394196da46882ea2ccf331832fce`.
This is implementation/evidence analysis, not Canonical authority, consumer
selection, disclosure permission or a completed acceptance claim. Current-head
verification belongs in the linked PR and Issue #329; historical runs below
retain their original source and assurance scope.

## Adoption and affected routes

| Route or record | Current state at the baseline |
| --- | --- |
| #432 | Merged into `feature/gemini-ci`. Secret-free run [37721924693](https://github.com/flair-agency/architecture-gatekeeper/actions/runs/37721924693), attempt 1, source `9061056fc544fe9b5d8c98bd03251994600bd5dc`, proved valid same-job synthetic JSON, suppressed full job output and intact control. Its one-session fixture was deliberately excluded from main; this is retained host evidence, not an active production route. |
| #438 / #439 / #527 | #438/#439 supplied diagnosis and injected execution-to-report/accept negatives on the feature branch. #527 backported diagnosis to main as `e22d46867f21980b978b5cd75c279f7a4f2aa1da`. Current `ci-report` and `ci-execution-composition` retain those behaviors. Diagnosis alone repairs no transport. |
| Codex self ordinary PASS | Solved by #528/#529: complete original validation followed by exact-job masked display retrieval. Synthetic run [38156807751](https://github.com/flair-agency/architecture-gatekeeper/actions/runs/38156807751) and post-adoption model-backed run [38158556463](https://github.com/flair-agency/architecture-gatekeeper/actions/runs/38158556463) are separate observations. Neither proves every current Owner procedure. |
| Codex self ordinary BLOCK / OWNER_DECISION | Still used raw `final_message` at baseline, so suppression turns the report into ERROR. The scoped change extends the existing ordinary display mechanism to these outcomes only for enforced self v2 with protected instructions and no selected OWNER_ADDITION. Ordinary acceptance still rejects both. |
| Ordinary Gemini v6 | #334 is completed. #580/#582/#583 adopted protected preparation, original validation, and the same-run REST masked-log projection path onto main. Model-backed run [38200371751](https://github.com/flair-agency/architecture-gatekeeper/actions/runs/38200371751) exercised the admitted bounded caller; current tests cover PASS/BLOCK/OWNER_DECISION. Main still selects Codex. Historical permission for that Gemini session authorizes no further session. |
| Codex consumer workflows, including enforced legacy v1 | Supported compatibility routes still consume raw `final_message`; they have the diagnostic but no replacement handoff. The self-only display loader cannot be selected for another repository/caller. A supported runtime does not establish which live consumers have adopted it. |
| Selected consumer OWNER_ADDITION / G0 | Still requires the exact original ordinary OWNER_DECISION and separate eligibility/procedure evidence. The ordinary display projection is insufficient. Suppression remains unresolved wherever this route is actually selected. Self main does not select it. |
| Current self OWNER_AMENDMENT | Main selects the protected ordinary-PR procedure, with closed seven-check eligibility and exact current-PR verification. Its separate `decision_base64`/context handoff is not the ordinary `final_message` path. No current evidence establishes a suppression incident in that closed result. The ordinary report is a prerequisite; the scoped fix preserves it for rejecting outcomes while keeping separate eligibility mandatory. This does not prove hosted amendment adoption under induced masking. |
| Gemini governance, original Fork privileged execution, retired self tag/attestation routes | Not activated by this work. Gemini supports the selected ordinary enforced v6 profile; original self Forks are denied before privileged execution. Retired self governance producers are absent from current source. Do not repair or activate them by copying ordinary display data. |
| Local/native/preview results | Their selected local/procedural meanings remain; they are not cross-job CI replacement evidence. No ordinary CI failure selects them. |

#522 is **merged**, as `d41837170920d49f4e88ea6124026b92f8515230`.
Its run 38148650463 attempts 1–3 remain genuine suppressed-output failures.
Its later current-head reviews and protected acceptance succeeded and the owner
released the hold before merge. The hold statements in old #329/#528/#529
comments are historical. They do not describe its current adoption state.
#566 concerns a separate native stream/persistence proposal and is closed
`not_planned`; it supplies no CI handoff authorization.

## Information and evidence that must survive

| Consumer | Required information and validation source |
| --- | --- |
| Review producer | Complete bounded original decision; selected schema; consumer-owned rules; complete selected authority IDs (or legacy paths); successful policy/execution. Validate original bytes before publication. Neither a process exit nor a file proves semantic completion. |
| Report | Semantic enum plus structured display fields: findings and locations, summary, authority descriptions/paths/IDs, responsibility, capability/guarantee/scope/prohibition arrays and gates. Preserve original canonical decision digest separately from the masked display. Require complete selected provenance and reviewed revision. |
| Ordinary accept | Successful protected policy, review and report from the workflow dependency graph, reported conclusion, selected-Authority change result and all selected procedure guards. PASS is eligible only after complete original validation and required structured reporting. The digest identifies that original decision; it supplies no independent validation or producer authority. |
| OWNER_ADDITION | Exact ordinary OWNER_DECISION, `ownerDecisionId`, applicable nested gate results and original selected-schema validation; complete same selected Set/provenance; base Policy; exact B/tag/AdditionRecord/missing-decision binding and separate B eligibility. Versioned procedural adoption additionally requires its selected producer/completion-time/pre-merge evidence, exact ordered merge parents/tree and canonical readback. A masked narrative or an omitted ID cannot replace these. |
| Current self OWNER_AMENDMENT | Old Policy/digest and complete ordered Set/digest; repository/base/head/test-merge; exact authority-only changed bytes/diff and proposed purpose; closed eligibility with all seven checks; context hash including prompt/schema; selected workflow/run/attempt context and final live PR verification. Owner integration and canonical readback remain later, separate actions. An ordinary displayed BLOCK/OWNER_DECISION is not that eligibility result. |

Authority provenance includes manifest digest, set digest and each required
member's stable ID, repository, immutable resolved commit, path and content
digest. All selected members remain required. Legacy v1 additionally requires
the recorded-base prompt/schema/validation selection, exact authority paths,
base/head/reviewed provenance and rejection of candidate-edited authority.
No display transport downgrades either contract.

For ordinary self display, expected metadata is derived from the existing
trusted producer and workflow dependencies, never candidate evidence. Both
ends retain repository, caller source/ref, reusable workflow repository/source/
ref, run ID, attempt, execution event SHA, base, PR head and reviewed merge.
REST PR association `head_sha` is checked against the PR head, separately from
execution/workflow source. Retrieval requires exactly one successful completed
producer job and emission step in that attempt and exactly one matching frame,
including nonce, semantic conclusion and original digest. Existing request,
byte, decoding, command-protocol, destination and deadline bounds remain.

## Secret handling and the smallest safe change

Schema validity is not disclosure approval. Summary/finding/gate narrative,
snippets, authority names/paths and provenance can carry private information;
unknown credentials can occur even in syntactically valid JSON. A digest can
also reveal correlation and is not a confidentiality proof.

The self change reuses only the already-rendered fields and existing
runner-masked log boundary of #528. Original bytes stay in existing private
job-local inputs. It adds no raw response artifact, encoding workaround,
credential, permission, producer, evidence backend or acceptance rule. The new
ordinary frame name distinguishes its three-outcome meaning from the former
PASS-only frame; same-run pinned source prevents version mixing. Existing
internal filenames remain to avoid unrelated source/package relocation.

Masked text is presentation data. Its bytes intentionally need not hash to
the original digest. This mechanism checks frame identity and structural/
semantic bindings under the existing trusted GitHub producer/log boundary; it
does not authenticate arbitrary narrative against the original response or
provide portable evidence. Missing/masked identity fields, malformed JSON,
altered conclusion/bindings, ambiguous jobs/frames or unavailable logs leave
reporting incomplete and deny acceptance. The existing missing-raw-input path
still reports ERROR. Failure/cancellation/skip/in-progress cannot supply a
successful producer, and there is no raw-PASS fallback after display selection.

For other consumers and G0, first identify exactly which private fields and
evidence are required and which fields the consumer permits publishing.
Whitelisting self display fields does not supply that consumer decision.
If exact potentially sensitive original evidence must cross jobs, choosing a
private transfer/storage authority, access/retention/publication responsibility
or a producer assertion in place of existing downstream checks requires the
consumer Owner's decision and applicable Canonical adoption before code.
No such mechanism is introduced here. #329 remains open for those routes.

## Retained verification map

- Original schema/rules/complete Set and legacy checks → protected producer →
  `test/codex-pass-publication.test.mjs`, including rejecting-outcome schema,
  consumer-rule, missing-member and unsupported-profile cases.
- Exact run/attempt/revisions/caller/producer and conclusion → log retrieval →
  the same existing API/frame negatives, plus rejecting-outcome bindings,
  missing frames/metadata, incomplete producer and mismatched decision kind.
- Actual report CLI → runner-compatible summary/output files → parameterized
  PASS/BLOCK/OWNER_DECISION masked reporting with original digest, and refusal
  before outputs on missing metadata.
- Ordinary and Owner acceptance → unchanged acceptance implementation →
  rejecting results remain rejected; only independent successful protected-PR
  amendment verification permits that separate selected procedure.
- Workflow selection → parsed production workflow → self enforced/protected
  constraints, v2/non-G0 rejecting-outcome guard, original governance input
  wiring and all original validators before publication.
- Host behavior → existing bounded synthetic fixture → select one synthetic
  outcome per run, observe masked narrative and exact-job retrieval with
  current protected-PR guard negatives. No model, provider secret, OIDC,
  artifact, public PR report or actual acceptance authority is exercised.

Local fixture and predicate tests cannot prove hosted failure termination,
consumer adoption, Owner authorization, protected caller enforcement or final
canonical placement. PR and Issue evidence must identify those limits rather
than mark every #329 condition complete.
