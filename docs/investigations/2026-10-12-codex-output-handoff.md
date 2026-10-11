# Ordinary self-Codex PASS output handoff

This is implementation evidence for Issue #329, not canonical authority, a new
acceptance route, or proof of hosted enforcement. The implementation starts
from main's protected Codex workflow and the diagnosis-only #527 change.
PR #522 remains on hold. Local tests and the synthetic fixture make no provider
requests; required protected CI reviews remain separate.

## Boundary and compatibility

The protected review job validates the original bounded Codex response file
against the existing selected schema, committed consumer rules, complete
Authority Set and applicable legacy validators. It applies the existing
`classifyReview` and canonical `digestDecision` semantics before publishing
ordinary PASS metadata. It keeps the upstream Action, model/settings, timeout,
sandbox, instructions, credentials and token isolation unchanged. Non-PASS
raw decision, owner-addition, BLOCK/OWNER_DECISION record, attestation and tag
paths remain unchanged and fail closed. The main policy's selected G0 amendment
classification, signer and final tag guards still precede ordinary acceptance.

The protected producer emits a bounded structured **display-only** JSON frame
with workflow commands disabled. GitHub runner masking applies to that frame.
Only narrow validated PASS conclusion, canonical original decision digest and
random nonce cross the job-output boundary. Successful PASS publication omits
the unused raw job output; unsuccessful publication cannot select a raw PASS
fallback. The digest retains its existing sorted-object canonical JSON meaning;
it is not a raw-byte ReviewRecord digest or a portable receipt.

The reporter retrieves the exact successful producer job's masked log and binds
its single frame to the expected repository, caller/workflow selection and
resolved source, run/attempt/job, event/base/head/reviewed commits, nonce,
conclusion and original digest. The structured result remains required for
reporting. Masked narrative text is display only; the reporter does not rehash
it as the original decision or use it as governance evidence. Missing,
suppressed, malformed, altered or mismatched metadata/frame fails the report
before normal output publication. Required reporting and all acceptance guards
remain in place. The same-run metadata is not independently reusable evidence.

Report token `actions:read` permits only readback for its existing protected
reporting responsibility. Review token permissions stay `contents:read`.
Fixed GitHub API routes carry that token; a validated signed Azure log URL is
retrieved without credentials. Streaming reads, a 30-second deadline, and four
requests bound retrieval. No raw artifact, new producer, custody backend,
masking bypass, provider activation or approval exception is introduced.

## Limits and focused verification

The decision ceiling remains 65,536 bytes; selected prompt, schema and authority
limits remain unchanged. The independent display envelope ceiling is 256 KiB.
Codex log transport is capped at 4 MiB: the observed #522 attempt logs were
696,752, 1,009,066 and 776,783 UTF-8 bytes, so the feature Gemini transport's
1 MiB ceiling would leave little room for routine Codex diagnostics. This is a
bounded transport-memory allowance, not a model or authority limit increase.

Risk/invariant → production boundary → retained tests:

- Original semantic validation → protected producer → actual main schema and
  consumer rules, complete six-member IDs, malformed/duplicate JSON, altered
  provenance and failed review/policy; actual CLI emits no metadata after failure.
- Private fixed inputs → producer file reader → missing, malformed, symbolic
  and hard-linked files; descriptor identity and finite byte reads.
- Masked display versus original meaning → publication/report composition →
  synthetic marker replaced with `***`, original canonical digest retained,
  selected metadata omissions rejected even with a valid raw PASS.
- Exact host identity → log retrieval → repository/caller/workflow/ref/SHA,
  run/attempt/head/job/step failures, duplicate frames and missing producer;
  signed-log credential omission, rejected destinations, API failure/deadline.
- Output protocol and bounds → frame parser → command-like narrative remains
  JSON-escaped under disabled commands; duplicate/missing/oversized envelopes
  and logs reject.
- Governance preservation → existing acceptance plus parsed workflow → selected
  tagged amendment still rejects PASS with failed/incomplete eligibility; raw
  non-PASS record inputs, exact IDs and G0 env/guards are retained.

Pure APIs permit exact explicit fixture context for isolated host verification;
production CLI and reporter separately require the fixed main self caller and
selected architecture-gate producer. A fixture result is not model review or
Architecture Gate acceptance. Hosted synthetic runner masking/readback remains
a separate coordinator-owned proof; local tests simulate masking and API data.
Independent integrated/architecture review, full/package/CodeQL verification
and protected-source adoption remain separate before any usable-route claim.
## Execution SHA versus REST PR association SHA

Independent public API readback for [#528 run 38157015446](https://api.github.com/repos/flair-agency/architecture-gatekeeper/actions/runs/38157015446)
and its [attempt-1 jobs](https://api.github.com/repos/flair-agency/architecture-gatekeeper/actions/runs/38157015446/attempts/1/jobs)
shows `run.head_sha` and every job's `head_sha` equal the PR head
`5ddb96f276adbbbe6ff67163acc993e561979cc7`. The attached PR base and resolved
reusable workflow SHA are `e22d46867f21980b978b5cd75c279f7a4f2aa1da`.
The earlier [#527 run 38155954885](https://api.github.com/repos/flair-agency/architecture-gatekeeper/actions/runs/38155954885)
and its [attempt-1 jobs](https://api.github.com/repos/flair-agency/architecture-gatekeeper/actions/runs/38155954885/attempts/1/jobs)
similarly report PR head `0561795154b91c211c18be1b87bed62013f943b5`, while the
referenced reusable workflow resolves to `bb7c6078766e2d63cbcaf91e8eab72a7bd46a83f`.

For `pull_request_target`, execution `GITHUB_SHA` is the default-branch commit
([GitHub event documentation](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#pull_request_target));
that execution identity is distinct from these REST PR association fields.
The producer retains both identities. Retrieval correctly compares REST run/job
`head_sha` with `expected.headSha`, while checking resolved producer workflow
SHA separately. Changing either comparison to `expected.eventSha` would reject
these observed legitimate identities.

The regression uses the observed #528 API identity fields with a **synthetic**
successful publication step and validated PASS frame. It accepts the observed
PR-head binding and separately rejects substituting the base SHA in either the
run or job. It does not reclassify the historical protected BLOCK, establish an
actual model-backed PASS, or replace the required fresh-head review/acceptance.
No production comparison, authority, consumer or G0 guard changes accompany it.
