# Ordinary Gemini bounded default-branch caller candidate

**Status: local enabled deployment candidate; not deployed.** The workflow
source in this checkout is the enabled caller, SHA-256
`cff2bc8294a760366d7876dd85120bd4bf2b54ec0eb863fef6eab0cbadbb5c84`.
Its seven-key admission configuration is enabled with the exact fixed values
recorded below. The corrected inert caller artifact hashes to
`4e2fe8b901a24eb08d16259c1a036299f4e01975e7670714f93069a576cbf25d`.
The current ordinal-pinned source pair is detailed below; preceding #551 source
narratives and verification remain scoped to that previous candidate.

The bounded selection was adopted through [PR #532](https://github.com/flair-agency/architecture-gatekeeper/pull/532)
at `b340f5efce301479d391affe2663d0f703812389`, tree
`70a632f7ac742687f7b2a65491ad891e851e8cd7`. Normal protected merge followed
independent review, native AGK validation, successful hosted CI/CodeQL and actual
protected accept; exact canonical document bytes were read back unchanged from
the reviewed candidate. This local implementation still requires its own final
verification, publication, protected acceptance and deployed-byte readback.
No Google authentication, Gemini execution or host enforcement for PR #517 is
claimed here.

## Corrective host-context binding before deployment

Independent final code review found a P1 in the source pair selected by #532:
its admission compared `GITHUB_SHA` with the feature PR base. Current GitHub.com
supplies a default-branch event SHA, so this would deny the legitimate selected
READY before any API reads and consume ordinal 1. The prior positive test had
supplied the feature base as `GITHUB_SHA`, hiding the defect.

The corrected source replaces only that comparison with
`GITHUB_SHA === GITHUB_WORKFLOW_SHA` after workflow-SHA validation. Event and
live-API feature base/head/merge, ordered-parent and tree checks remain exact.
Both synthetic and actual Node-child positive fixtures now use a default-source
SHA distinct from the feature base. Feature-base, wrong and omitted event SHAs
are denied before API reads. The focused Node 22.18 suite passed all five tests.

The previous inactive/enabled pair was
`9e7c45a0aea5b4d957267b4efccfbc21998184a5ecd42ef4db5d252d52c5815f` /
`ee0690f61eddf48c152c41e791b76b1549b60087259718d1bbf3f493e9ff8b21`.
Those bytes were never deployed in this work. Their full-suite run was stopped
when this P1 was found, and their native session ended after prepare, before
invoking a reviewer; neither is final verification. Retain the defect and
incomplete records. The revised source identities were adopted through [PR #551](https://github.com/flair-agency/architecture-gatekeeper/pull/551)
at `5dbda3612a347ba931d124b93a68aff5198b1006`, tree
`313c047148e722a869a81421be8b3fd332ec6150`, after protected PASS, actual accept
and hosted CI/CodeQL success. Exact canonical readback matches the reviewed
proposal. The original automated old-GHES premise was independently adjudicated
against the official versioned source and preserved in #551. Its final native review is recorded below; protected implementation deployment
acceptance remains required.
All fingerprints, PR tuple, workflow ID, ordinal/attempt and operational caps
remain unchanged; no READY, auth or Gemini request has occurred.

## Fixed prospective selection

The proposal places the existing ordinary caller on the default development
branch, currently `main`, for one `ready_for_review` session on PR #517 targeting
`feature/gemini-ci`. Its immutable tuple is:

- Head: `c4b0057d9dd47f79df2a896143f7ac6db5da2c2e`
- Protected base and reusable workflow revision:
  `c5686f63909af2e83b749ffa0b91d33cb9ea96ad`
- Reviewed merge: `96ab3902f95250a1c80aecec45434e04272ad548`
- Reviewed tree: `8107feae6dbf6bc38b279fcab724fd42a5ad0097`
- Ordered merge parents: `[c5686f63909af2e83b749ffa0b91d33cb9ea96ad,
  c4b0057d9dd47f79df2a896143f7ac6db5da2c2e]`
- Existing caller workflow ID: `381385696`; selected run number `1`, attempt
  `1` only.

This does not route Gemini to PRs targeting `main` or another branch, or add
FEATURE authority to the default-branch canonical Set. The caller selects the
protected feature policy, prompt, schema, decision-validation file and complete
six-member Authority Set from the consumer target.

GitHub's current [`pull_request_target` event reference](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#pull_request_target)
documents the event in the default branch of the base repository, with a
GHES-before-3.20 conditional preserving the older PR-base context; its current
GitHub.com table assigns `GITHUB_SHA` and `GITHUB_REF` to the default branch.
The `branches` filter above selects the PR target branch, not the workflow-file
revision. The [variables reference](https://docs.github.com/en/actions/reference/workflows-and-actions/variables)
defines `GITHUB_WORKFLOW_SHA` as the commit SHA for the workflow file. Thus
`c5686f6` identifies the protected PR base and reviewer inputs here, while the
actual event caller source must be established from the hosted
`GITHUB_WORKFLOW_SHA`; the reusable workflow has its own pinned revision. The
official docs source records are
`content/actions/reference/workflows-and-actions/events-that-trigger-workflows.md`
(blob `b365cf2bc6c7f22f26ab2730928974d7eaadcc59`) and
`content/actions/reference/workflows-and-actions/variables.md` (blob
`ed0dcd66e04d4f419380997793d1bfebe1f2336a`). No hosted run readback is
available here, so the actual host-selected source remains a live E2E proof
obligation.

The local prospective caller and the corrected inert artifact differ only in
the `architecture-gate` explanatory comment and guard. The permitted prospective
guard is:

```yaml
# One selected workflow instance/ordinal/attempt must pass the protected admission step.
if: needs.classify-self-repository.outputs.classification == 'same-repository' && needs.protected-admission.outputs.admitted == 'true' && github.event_name == 'pull_request_target' && github.event.action == 'ready_for_review' && github.event.pull_request.draft == false && github.event.pull_request.number == 517 && github.event.pull_request.head.sha == 'c4b0057d9dd47f79df2a896143f7ac6db5da2c2e' && github.run_attempt == 1
```

The guard requires the protected admission result, same-repository
classification, exact event/action, non-draft PR, fixed PR number and head, and
attempt 1. The reusable workflow remains pinned to
`c5686f63909af2e83b749ffa0b91d33cb9ea96ad`. The local configuration now contains the exact adopted seven-key enabled
record, including the corrected caller digest adopted by #551. Local enabled
bytes do not establish deployed source or live admission.

## Admission, profile and bounds

The [caller workflow](../../.github/workflows/issue334-ordinary-feature-caller.yml)
keeps classification and protected admission in separate jobs. Classification
jobs have `id-token: none`; classification requires matching event and base
repository IDs, valid full commit SHAs and the event PR number. The protected
admission job has only `contents`, `actions` and `pull-requests` read
permissions, `id-token: none`, and a three-minute job timeout. Both jobs write
only a short allowlisted output line after checking the output path, regular
file identity, link count and no-follow open.

The inline admission script binds the event, live run, workflow, PR, merge
commit, caller/config blobs and repository IDs to the fixed tuple. It reads
regular blobs at the same host-selected `GITHUB_WORKFLOW_SHA`; checks exact
ordered parents and merge tree; verifies the caller SHA and exact config keys;
and compares SHA-256 of the provider and service-account selector bytes. It
permits at most 12 API reads, 45 seconds overall, 8 seconds per read, 1,048,576
bytes per response and 100,000 bytes per blob. Redirects, malformed or missing
data, mismatched identities and bound overruns deny admission. No candidate
script or candidate-selected revision is executed.

The proposed fixed admission values are workflow ID `381385696`, run number 1,
attempt 1, caller digest
`4cf30713b143df2ea08927648d5ff4911ee378990203a16c56ffdf7fbba7c81c`, provider
selector digest
`e3e7a8a5c8f61c6b3fc7e0eed879e662be902299304d2501843cc06821fb5b9c`, and
service-account selector digest
`af5c0a83eb95b8969994e2b9667a0f2964bce2cb43e390441e40e280e1992e92`. The raw
service-account selector fingerprint is distinct from the digest of the
trimmed effective account identity,
`2180acf4e4c9e0a0a7ec6f997652c2f34e302d2b285bbeb3fd3c1d09688189c4`. Selector
values remain private. Fingerprint equality binds bytes; it does not prove
Google IAM state or successful authentication.

The selected protected policy is v6 with Gemini CLI `0.62.0`, model
`gemini-3.8-flash`, `thinkingLevel: MEDIUM`, no `thinkingBudget`, a 180-second
session deadline, 16,384 maximum output tokens, encoded prompt limit 196,608
bytes, and stdout/stderr limits of 65,536 bytes each. Workspace limits are 32
files, 131,072 bytes per file and 524,288 bytes total. One WIF acquisition has a
60-second overall authentication bound; it requests a 300-second service
account token and checks observed expiry is 240–360 seconds from issuance. The
region is `global`; project is derived from the same normalized, strictly
parsed service-account identity. The runner has no explicit renewal handle or
provider fallback. A session-local counter reserves every upstream dispatch
before send, including CLI-internal retries and uncertain sends, with a
defensive cap of 10. These are source settings, not hosted execution evidence.

## Captured diagnostics and offline input preparation

The separate selector-fingerprint workflow is ID `381535290`, not the ordinary
caller. Its first capture, [run `38171030538`](https://github.com/flair-agency/architecture-gatekeeper/actions/runs/38171030538), failed generic selector
validation. Its second capture, [run `38174516659`](https://github.com/flair-agency/architecture-gatekeeper/actions/runs/38174516659), failed with the fixed reason
`selector_validation/provider_resource_shape`; it produced no hashes and did
not reach the service-account comparison. That result does not establish an
incorrect configured Secret. The earlier suggestion that an administrator
must change the setting is withdrawn: the historical auth action reads its
input through `@actions/core.getInput`, while the diagnostic validates the raw
selector directly. No setting change or further approval is requested here.

Capture 3, [run `38188331694`](https://github.com/flair-agency/architecture-gatekeeper/actions/runs/38188331694) (run number 3, attempt 1), succeeded on the
`main` push at `32d95063485a3983ed8c37343efad21dc724244d`. It recorded the raw
selector fingerprints above and compared the trimmed effective account
identity to digest `2180acf4e4c9e0a0a7ec6f997652c2f34e302d2b285bbeb3fd3c1d09688189c4`.
It acquired no OIDC or provider credential, made no model call, and did not
consume the PR #517 session. The retained record is
`/workspace/agk-resume-evidence/diagnostic3-record.json`.

The pinned credential-free preparer also succeeded for the exact base/head/
merge/tree tuple above. It selected 12 snapshots (one changed candidate file
and 11 base references), totaling 143,024 blob bytes; serialized context was
148,882 bytes. The composed prompt was 147,670 UTF-8 bytes and the encoded
transport prompt was 150,799 bytes, below the 196,608-byte limit. Each selected
file and the packet stayed within the workspace limits. This check did not
acquire credentials, run the Gemini CLI, send model input or mutate hosted
Actions. Its retained local evidence is
`/workspace/agk-resume-evidence/pr517-offline-input-bounds.json`.

The original protected Gatekeeper run `38161465058` reported `BLOCK`; its report
remains preserved at [PR #530](https://github.com/flair-agency/architecture-gatekeeper/pull/530#issuecomment-6111946463).
That historical result remains unchanged. It is distinct from the later
selector diagnostics and is not converted to PASS by this deployment proposal.

## Risk, boundary, evidence and remaining proof

| Risk or invariant | Production boundary and source limit | Retained tests or evidence | Remaining proof |
| --- | --- | --- | --- |
| Candidate data must not select the trusted caller, policy or tuple. | Inline caller fixes the PR, refs, revisions, workflow/config paths and digest checks; API reads use `GITHUB_WORKFLOW_SHA`. | `test/issue334-ordinary-feature-caller.test.mjs` and `test/workflow-structure.test.mjs` contain synthetic source/API and workflow structure checks; offline preparer evidence binds the immutable tuple. | Full tests completed as recorded below; live GitHub API/workflow-expression behavior for the deployed source remains. |
| OIDC must remain behind bounded admission. | Classifier and admission have no OIDC permission; only the exact guard can schedule the credential-capable reusable workflow. Read limits: 12 calls, 45 seconds overall, 8 seconds each, 1 MiB response and 100,000-byte blob. | Caller-focused and workflow-structure test sources; diagnostic captures 1–3; no credential call in capture 3 or offline prep. | Canonical #532/#551 adoption/readback is complete; exact deployed-byte readback, current public run-history check and operator allowance/use accounting under the current instruction before READY, followed by live admission. Private allowance state is not asserted here. |
| Selector bytes and normalized account identity must stay distinct. | Admission hashes exact selector bytes; diagnostic 3 separately compared the trimmed effective account identity. | Retained `diagnostic3-record.json`; earlier failures preserved with their actual reasons. | Verify exact current caller/config digests during live admission; fingerprint equality alone does not prove IAM or authentication. |
| Reviewer inputs must fit the existing selected bounds. | Pinned protected preparer, Authority Set, prompt encoding and workspace limits enforce the policy caps before credential acquisition. | Exact-tuple offline preparation: 150,799 encoded prompt bytes; 12 snapshots/143,024 blob bytes and 148,882 serialized context bytes. | Completed source-scoped full/native/CodeQL results are recorded below; one live bounded hosted session remains. Offline preparation is not a model or hosted E2E result. |
| Admission failure, exhausted ordinal or uncertain provider result must not trigger another session. | Fixed workflow ID, run 1, attempt 1, fixed PR tuple, no auto-advance, rerun, repeat-ready admission or provider fallback; 10 upstream dispatch cap inside the session. | Source and focused synthetic caller coverage; historical failure results remain intact. | Re-read run history immediately before READY and retain the existing one-session approval under the current operator instruction; then record live run, auth, review and reporting evidence. |

The public workflow API history readback after diagnostic capture 3 reported
`total_count: 0` at that time. This does not establish the private approved
session ledger. Before READY, re-read the history for workflow `381385696` and
account for session use under the current operator instruction below; a different workflow instance, ordinal,
attempt or source tuple is denied. There is no auto-advance or second session.

The earlier report of 1,439 passing tests, native review and CodeQL results
belongs to the prior inactive #530/#532 candidate revision only. It does not
verify this final prospective source. Corrected full-suite verification passed 1,504 tests with zero failures, skips
or cancellations in Node 22.18 Docker with network disabled and source/runtime/
dependencies read-only; only an identical disposable test directory was writable
for generated type fixtures. CodeQL CLI 2.27.1, JavaScript queries 2.4.6 and
Actions queries 0.6.36 completed at the corrected caller source: 58 JavaScript
and 0 Actions findings. Every unmodified raw result object matched the adopted
executable baseline; no result normalization, dismissal, suppression or SARIF
rewriting occurred. These checks followed each other without heavy CPU overlap.
Final native implementation review passed against the complete adopted Set at
`5dbda3612a347ba931d124b93a68aff5198b1006`, candidate tree
`a5cc77fc34a8977e338b3e7842cd1fb6e8473997`; installed-runtime validation
exited 0. The exact returned decision digest is
`ba1575dc791a73eeb351d26773bc3418aac1dee3e57f8575a031da71f7f2c97b`.
This remains local architecture feedback; protected deployment acceptance and
actual hosted execution proof remain pending. The historical BLOCK, diagnostic failures
and successful credential-free checks do not establish implementation deployment,
host enforcement, authentication, Gemini review or acceptance.

## Pre-session accounting remains required

Verify before READY that the retained approved session remains unused. Stop
execution if that verification is unavailable, inconclusive or shows prior use.
The operator clarified that developmental allowance bookkeeping does not need a
strict particular ledger file or backend; this changes neither the required
unused-session check nor the single-session limit. No candidate document or
operator provenance claim waives the adopted prerequisite.

Keep authorization evidence and execution evidence distinct: the handoff records
one approved, unused PR #517 session; the current public history records use of
the selected workflow instance/ordinal; this resume records its own actual
Google/Gemini executions. Public history does not manufacture private approval
or establish unrelated developmental budget balances. Do not claim a private
file was freshly read when unavailable. Reconcile the retained authorization
with current selected-session execution records immediately before READY;
conflicting or insufficient records must stop the event.

No caller/config bytes, fixed ordinal/attempt, PR source, operational ceiling,
retry/fallback prohibition or host acceptance requirement changes here. The
original native decision and every BLOCK remain preserved. Account for the
selected session's actual use and outcome when it runs, without another event
or retry. No Google/Gemini call has occurred in this resume.

The protected review of `f501d98434af601049c88d9b9e5db930912797a5` returned
BLOCK because its later accounting wording could waive the prerequisite. That
report and failing accept remain preserved. The current documentary correction
restores the mandatory check and was independently adjudicated as addressed.
A fresh native Skill review of tree
`56539f0ff164309a723b6f7bf18e46f7fedb64cd` returned PASS; installed validation
exited 0, exact decision digest
`1acc4992946e27396f5316aec9971a7a872ac84e5512e34e5f00d873f812785f`.
Core workflow/config/test bytes are unchanged from the full-suite/CodeQL scope.
New protected acceptance is still required; no current allowance availability
or hosted readiness follows from these local review results.

## Current-main composition verification

Parallel PR #550 was integrated by normal merge. The composed implementation
passed all 1,507 tests with zero failures, skips or cancellations, using the
same Node 22.18 isolated Docker controls described above. Build and source
cycles passed. Independent code review found no actionable finding. Native
Skill E2E against the complete Set at
`5c5799836cc71c703b22603b71449120ee4b8915`, candidate tree
`0b64371b38c90c731634b6cceca4c374bcc618a1`, returned PASS; installed
validation exited 0, exact decision digest
`6668e9dd0aa5828d6a0e214a26ed40b304869ef274fbdd20a2e62545f7f1a3e0`.

Fresh sequential CodeQL scans of that main and candidate each retained
58 JavaScript and 0 Actions findings. Complete raw result objects matched as
multisets with all fields retained; no suppression, normalization or SARIF
rewriting occurred. Evidence is retained in
`/workspace/agk-resume-evidence/pr530-main550-codeql-comparison.json`.
Parallel PR #552 then added only the owner-approved diagnostic responsibility
to `docs/architecture.md`; it was integrated by normal merge. Executable
workflow/config/test bytes are unchanged. That updated complete Set requires
fresh native feedback and protected acceptance before deployment. All earlier
results retain their original source scope.

## Literal workflow and ordinal correction before deployment

After protected review PASS and CI/CodeQL success for `ca9893b`, independent
code review identified P1 comment 4244237796: a coherent later protected config
change could select another workflow ID or run ordinal while retaining caller
bytes. Normal merge stopped on that unresolved thread. The source was never
deployed and no PR #517 READY or Google/Gemini execution occurred. Preserve the
original finding and all prior accepted results in their source scope.

The current correction adds only `workflowId: 381385696` and `runNumber: 1`
to the inline admission's fixed `EXPECTED` selection, plus exact configuration
agreement before subsequent API reads. All existing source, PR, selector, API
and environment checks remain. Coordinated configuration/API/environment run-2
and recreated-workflow-ID negatives deny after five reads, in both actual Node
children and injected execution; positive child admission still uses twelve.
All five focused tests passed. Independent code review found no remaining
actionable finding.

Enabled caller SHA-256 is
`cff2bc8294a760366d7876dd85120bd4bf2b54ec0eb863fef6eab0cbadbb5c84`;
inert counterpart is
`4e2fe8b901a24eb08d16259c1a036299f4e01975e7670714f93069a576cbf25d`.
The exact seven-key configuration digest is
`de9b3fa8f6e502849c23caee28f6ff889947f2368739c6da7ba0e96cd3769eba`.
The guard/comment-only activation delta remains unchanged. Corrected canonical
source adoption/readback must precede this implementation's publication, with
fresh full tests, applicable CodeQL and native review. The existing one-session
approval and every mandatory pre-READY prerequisite remain unchanged.

The ordinal-corrected executable scope passed all 1,507 full tests with zero
failures, skips or cancellations under the same read-only/network-disabled
Node 22.18 Docker controls. Build and source cycles passed. Fresh CodeQL
candidate scan retained 58 JavaScript and 0 Actions findings; complete raw
result objects matched the separately scanned current executable baseline.
No value normalization, suppression or SARIF rewriting occurred. Comparison is
retained in `/workspace/agk-resume-evidence/pr530-ordinal-codeql-comparison.json`.
These results followed sequentially without full-test/CodeQL CPU overlap.
