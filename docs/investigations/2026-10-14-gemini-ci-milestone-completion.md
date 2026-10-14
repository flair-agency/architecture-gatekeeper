# Codex and Gemini CI support milestone completion record

This repository-only record consolidates the verification, evaluation, and
acceptance evidence for Milestone #12 ([Issue #252](https://github.com/flair-agency/architecture-gatekeeper/issues/252),
[Issue #255](https://github.com/flair-agency/architecture-gatekeeper/issues/255),
[Issue #334](https://github.com/flair-agency/architecture-gatekeeper/issues/334),
[Issue #335](https://github.com/flair-agency/architecture-gatekeeper/issues/335),
[Issue #336](https://github.com/flair-agency/architecture-gatekeeper/issues/336),
[Issue #337](https://github.com/flair-agency/architecture-gatekeeper/issues/337), and
[Issue #338](https://github.com/flair-agency/architecture-gatekeeper/issues/338))
against `main` baseline `e9dd38b070e2d7378435da79fbb8a75ea260a6c6` after the
staged promotion of Slice 1A ([PR #580](https://github.com/flair-agency/architecture-gatekeeper/pull/580)
at `bbbf86a`), Slice 1B ([PR #582](https://github.com/flair-agency/architecture-gatekeeper/pull/582)
at `17ae954`), Slice 1C ([PR #583](https://github.com/flair-agency/architecture-gatekeeper/pull/583)
at `51215db`), and Slice 2A ([PR #584](https://github.com/flair-agency/architecture-gatekeeper/pull/584)
at `e9dd38b`).

This document does not amend the canonical six-member Authority Set in
`.codex/gatekeeper/authorities.json`, activate a consumer or `main` Gemini
route, select a Gemini governance profile, or authorize automatic fallback or
parallel result adoption.

## 1. Owner-governance CI review route matrix (#335)

Canonical authority ([`docs/architecture/review-execution.md`](../architecture/review-execution.md)
and [`docs/architecture/owner-amendment.md`](../architecture/owner-amendment.md))
selects Gemini only for ordinary `version: 6` `enforced` CI review (with bare
`{ "mode": "local-only" }` retained for local-only waiver entries). It explicitly
selects no Gemini governance profile, `G0` selection, or
`owner-amendment-semantic-eligibility-receipt` encoding.

| Policy / route | Provider support | Canonical & implementation boundary | Verification evidence |
| --- | --- | --- | --- |
| Policy `v1` (`enforced` / `local-only`, `authorityFiles` compatibility route with `promptPath`, `schemaPath`, `validationPath`) | Codex only on `enforced` (`model` + `reasoningEffort`); bare `{ "mode": "local-only" }` waiver | Rejects `provider`, `thinkingLevel`, `authorityManifestPath`, `ownerAddition`, and `ownerAmendment`. | `test/policy.test.mjs`, `test/resolve-ci-policy.test.mjs` |
| Policy `v2` (`enforced` / `local-only`, Authority Set + legacy single-member `ownerAddition` `G0` + `ownerAmendment` v1 trigger profiles) | Codex only on `enforced` (`model` + `reasoningEffort`); bare `{ "mode": "local-only" }` waiver | Self policy `.codex/gatekeeper/ci-policy.json` (`v2`) selects `ownerAmendment` `completed-owner-decision-self-v1` (`v2` also supports `completed-block-v1` and legacy single-member `ownerAddition` `G0`). `owner-amendment-semantic-eligibility-receipt` has a closed Codex field set (`model`, `reasoningEffort`). | `test/policy.test.mjs`, `test/ci-execution-composition.test.mjs`, `test/owner-amendment-semantic-eligibility.test.mjs` |
| Policy `v4` (`enforced` / `local-only`) & Policy `v5` (`procedural` / `local-only`) with multi-document `ownerAddition` v2 `G0` (`adoptionEvidence` on `v5`) | Codex only on `enforced` (`v4`) / `procedural` (`v5`) (`model` + `reasoningEffort`); bare `{ "mode": "local-only" }` waiver | `v4` and `v5` require Codex `reasoningEffort` and execute `owner-addition` only in Codex workflows (`architecture-gate.yml`, `architecture-gate-consumer.yml`). (`version: 3` is not a supported policy version and is rejected by `resolveCiPolicy()`.) | `test/policy.test.mjs`, `test/owner-addition-finalize-composition.test.mjs`, `test/installed-smoke.mjs` |
| Policy `v6` (`enforced` ordinary review with explicit `provider: "codex" \| "gemini"`; bare `{ "mode": "local-only" }` waiver) | Independently selected Codex or Gemini on `enforced`; bare waiver on `local-only` | Rejects `provider`, `model`, and reasoning fields on `local-only` entries, and explicitly rejects `ownerAddition`, `ownerAmendment`, and `adoptionEvidence` on all entries. `.github/workflows/architecture-gate-providers.yml` defines no `owner-amendment` job and skips `owner-addition` (`owner_addition_grade` is empty and `needs.review.outputs.decision_kind` is never populated by `gemini-review`), resulting in `OWNER_ADDITION_SELECTED: 'false'` and empty `OWNER_ADDITION_ELIGIBILITY` in `report` and `accept`. | `test/policy.test.mjs`, `test/ordinary-gemini-ci-workflow.test.mjs`, `test/ci-execution-composition.test.mjs` |

An ordinary `v6` Gemini review (`PASS`, `BLOCK`, or `OWNER_DECISION`) cannot
produce `G0` procedural eligibility or an `owner-amendment` receipt, and
`ci-enforced-acceptance.mjs` fails closed whenever conclusion is not `PASS`
without verified `G0` eligibility.

## 2. End-to-end failure, cancellation, and credential-confinement matrix (#336)

Under [`docs/architecture/review-execution.md`](../architecture/review-execution.md),
live hosted Gemini execution was bounded to the single admitted session on PR
#517 ([Run 38200371751](https://github.com/flair-agency/architecture-gatekeeper/actions/runs/38200371751)).
Component and CLI/workflow composition tests cover the full `F01`–`F17` failure
and cancellation matrix offline without consuming additional paid hosted
sessions; unexercised live-host failure stimuli are recorded explicitly as
bounded non-claims.

| ID | Stimulus / scenario | Required observation | Offline component & CLI composition verification | Hosted observation & boundary |
| --- | --- | --- | --- | --- |
| `F01` | CLI version or startup failure | Incomplete review; no response parsed or published | `test/gemini-cli-process.test.mjs`, `test/gemini-ci-runtime.test.mjs`, `test/ordinary-gemini-ci-adapter.test.mjs` | Runtime pin `0.62.0` verified in [Run 38200371751](https://github.com/flair-agency/architecture-gatekeeper/actions/runs/38200371751); live startup-failure injection not separately run on host. |
| `F02` | Deadline exceeded during review session | Shared finite 180s session deadline aborts execution; incomplete review | `test/gemini-cli-process.test.mjs`, `test/gemini-cli-session.test.mjs`, `test/ordinary-gemini-ci-adapter.test.mjs` | Hosted job/step timeouts wired in `architecture-gate-providers.yml` (7m job / 5m step / 180s session); live hosted timeout not separately triggered. |
| `F03` | Caller cancellation / abort signal | Incomplete review; no stale response adoption | `test/prepared-gemini-ci-review.test.mjs`, `test/ci-execution-composition.test.mjs` | Offline composition verifies `cancelled` / `skipped` / `failure` outcomes fail `report` without output fallback and deny acceptance. |
| `F04` | Main process exits with lingering child | Process-group cleanup and bounded pipe closure | `test/gemini-cli-process.test.mjs` | OS-level process-group cleanup verified in local child-process fixtures; GitHub runner VM teardown remains host-governed best effort. |
| `F05` | Missing, expired, or rejected WIF / OIDC / Vertex auth | Incomplete review; zero CLI launch on WIF failure; no fallback | `test/github-vertex-wif.test.mjs`, `test/ordinary-gemini-ci-adapter.test.mjs`, `test/gemini-security-proxy.test.mjs` | Diagnostic [Run 38188331694](https://github.com/flair-agency/architecture-gatekeeper/actions/runs/38188331694) verified selector digests before single-session WIF issuance in [Run 38200371751](https://github.com/flair-agency/architecture-gatekeeper/actions/runs/38200371751). |
| `F06` | Model refusal, empty stdout, or partial output | Incomplete review (`ERROR`); no semantic outcome | `test/gemini-cli-response.test.mjs`, `test/prepared-gemini-ci-review.test.mjs`, `test/ci-execution-composition.test.mjs` | Verified across parser, adapter, and `ci-report.mjs` CLI composition. |
| `F07` | Truncated / incomplete decision stream or CLI error envelope (`MAX_TOKENS` boundary) | Deterministic rejection before semantic validation; raw Vertex `finishReason` (`MAX_TOKENS`) is not surfaced in the Gemini CLI `--output-format json` `{ response, error }` envelope and is only rejected if the CLI exits non-zero, populates `error`, or emits truncated/schema-invalid decision JSON | `test/gemini-cli-response.test.mjs`, `test/prepared-ci-decision.test.mjs`, `test/prepared-gemini-ci-review.test.mjs` | Verified in CLI envelope and decision validators; a hypothetical schema-valid JSON response accompanied by an unexposed upstream `MAX_TOKENS` finish reason is a documented CLI envelope non-claim. |
| `F08` | Malformed, duplicate-key, or deeply nested JSON | Bounded deterministic rejection; raw text excluded from public report | `test/prepared-ci-decision.test.mjs`, `test/ordinary-gemini-ci-publication.test.mjs`, `test/ci-execution-composition.test.mjs` | Verified in `ci-report.mjs` and publication projection parsers. |
| `F09` | Wrong schema, Authority Set digest, or consumer rule | Deterministic rejection after JSON parse; review incomplete | `test/prepared-ci-decision.test.mjs`, `test/ordinary-gemini-ci-adapter.test.mjs`, `test/ordinary-gemini-ci-publication.test.mjs` | Verified across `completePreparedCiReview` and `ci-report.mjs` revalidation. |
| `F10` | Valid `PASS`, `BLOCK`, and `OWNER_DECISION` decisions | Preserve semantic decision; only `PASS` passes ordinary `accept` | `test/gemini-ci-ordinary-composition.test.mjs`, `test/ordinary-gemini-ci-publication.test.mjs`, `test/ci-execution-composition.test.mjs` | Hosted [Run 38200371751](https://github.com/flair-agency/architecture-gatekeeper/actions/runs/38200371751) exercised end-to-end semantic `BLOCK` (`gemini-review` succeeded, `report` rendered `BLOCK` + inline findings, `accept` exited `1`). Hosted `PASS` and `OWNER_DECISION` remain covered by offline completion, log-projection publication, `ci-report.mjs`, and `ci-enforced-acceptance.mjs` composition. |
| `F11` | Combined packet file count (>32 across changed + reference files), per-file (>128 KiB), total packet (>512 KiB), or stdin (>192 KiB) exceeded | Reject before credential use or model dispatch | `test/prepare-review-file-context.test.mjs`, `test/prepare-gemini-ci-verification-input.test.mjs`, `test/ordinary-gemini-ci-adapter.test.mjs` | Verified in `prepareProtectedCiInput` and `ordinary-gemini-ci-adapter` before WIF issuance. |
| `F12` | Candidate config/instruction files in workspace | Materialized under inert ordinal paths (`evidence/file-0001-after.txt`) while original path and revision identity are retained only in manifest metadata; CLI hooks/skills/MCP/extensions disabled | `test/materialize-review-workspace.test.mjs`, `test/gemini-cli-session.test.mjs`, `test/ordinary-gemini-ci-adapter.test.mjs` | Exercised in [Run 38200371751](https://github.com/flair-agency/architecture-gatekeeper/actions/runs/38200371751) on the 1-file PR `#517` candidate diff (`docs/investigations/2026-10-11-ordinary-gemini-hosted-candidate.md`) plus offline workspace fixtures with hostile candidate instruction files. |
| `F13` | Unauthorized proxy method, host, model route, redirect, or >10 upstream dispatches | Proxy rejects with fixed nonsecret error; session cap stops dispatch at 10 | `test/gemini-security-proxy.test.mjs`, `test/prepared-gemini-ci-review.test.mjs` | Hosted session in [Run 38200371751](https://github.com/flair-agency/architecture-gatekeeper/actions/runs/38200371751) completed in 3 upstream dispatches within the 10-request cap. |
| `F14` | Credential and renewal-capability non-inheritance | WIF assertion, access token, and OIDC renewal handles withheld from CLI args, env, files, and logs | `test/github-vertex-wif.test.mjs`, `test/gemini-cli-proxy-session.test.mjs`, `test/ordinary-gemini-ci-adapter.test.mjs` | Enforced by parent-only WIF exchange + loopback proxy. Ambient same-user host capabilities remain a documented non-claim without separate host isolation. |
| `F15` | Host marks review job failed, cancelled, or skipped, or run/job SHA/attempt mismatches | `ordinary-gemini-ci-report-fetch.mjs` and `ci-report.mjs` fail closed without emitting report outputs; `accept` and `ci-enforced-acceptance.mjs` deny acceptance | `test/ordinary-gemini-ci-publication.test.mjs`, `test/ci-execution-composition.test.mjs` | Includes exact `job.head_sha === run.head_sha` and `run_attempt` verification in `src/ordinary-gemini-ci-publication.mts`. |
| `F16` | `#215` process hang vs `#329` cross-job output suppression | Distinguished with diagnostic evidence; Gemini route avoids cross-job `final_message` secret-masking drop via same-run REST job-log projection | `test/ordinary-gemini-ci-publication.test.mjs`, `test/ci-execution-composition.test.mjs` | `#329` reproduced in [Run 37721924693](https://github.com/flair-agency/architecture-gatekeeper/actions/runs/37721924693) (`Skip output 'final_message' since it may contain secret`); same-run REST job-log retrieval verified live in [Run 38200371751](https://github.com/flair-agency/architecture-gatekeeper/actions/runs/38200371751). |
| `F17` | Governance route or authority change under ordinary Gemini policy | Candidate authority-file edits are bound to `baseSha` as untrusted diff evidence without amending active authority; Policy `v6` rejects governance blocks, and `accept` rejects non-`PASS` conclusions (`BLOCK`, `OWNER_DECISION`, `ERROR`) without `G0` eligibility | `test/prepare-gemini-ci-verification-input.test.mjs`, `test/policy.test.mjs`, `test/ci-execution-composition.test.mjs` | Verified across revision-bound input preparation, policy resolution, and acceptance CLI composition tests. |

### Distinction between #215 and #329

- **Issue #215 (`openai/codex-action` termination/hang)**: The reviewer process
  or its descendants fail to exit cleanly after model execution, causing the
  step/job to hit its outer timeout (`review-step-timeout-minutes` /
  `review-job-timeout-minutes`).
- **Issue #329 (GitHub Actions cross-job output suppression)**: The reviewer
  completes and writes a valid JSON decision to `$GITHUB_OUTPUT`, but the
  GitHub Actions runner suppresses the job output (`Skip output 'final_message'
  since it may contain secret`) when any substring matches a registered mask,
  delivering an empty string to downstream `report` (`DECISION=""`). Reproduced
  in [Run 37721924693](https://github.com/flair-agency/architecture-gatekeeper/actions/runs/37721924693)
  (attempt 1, workflow head `9061056fc544fe9b5d8c98bd03251994600bd5dc`).
  On the Codex path, `src/ci-report.mjs` (`src/ci-review/ci-report.mts`) now diagnoses absent `DECISION` input
  explicitly when `REVIEW_RESULT === 'success'`. On the Gemini path,
  `src/ordinary-gemini-ci-publication.mts` emits a framed projection in the
  `gemini-review` step log and the `report` job retrieves and verifies the
  same-run, same-attempt, same-head-SHA log via the GitHub Actions REST API,
  verified end to end in [Run 38200371751](https://github.com/flair-agency/architecture-gatekeeper/actions/runs/38200371751).

## 3. Quality and operating cost evaluation (#337) and #255 checkpoint

### Representative comparison on complete scope and authority

| Dimension | Codex CI baseline (`gpt-6.1-sol`, `low` / `medium`) | Adopted Gemini CI profile (`gemini-3.8-flash`, `thinkingLevel: MEDIUM`, no `thinkingBudget`) |
| --- | --- | --- |
| Runtime & workspace boundary | `openai/codex-action@86365089eb2b84e0a8fb0717b304f8bdcb13b20e` (`read-only`, `drop-sudo`) over full checkout | Pinned `@google/gemini-cli@0.62.0` in fresh `0700` runtime + revision-bound controlled workspace (max 32 combined packet files across changed + protected reference files, 128 KiB/file, 512 KiB packet, 192 KiB stdin) + parent-only Vertex WIF loopback proxy |
| Representative real-review quality | Hosted self-reviews on Slices 1A–1C ([Run 38491544340](https://github.com/flair-agency/architecture-gatekeeper/actions/runs/38491544340), [Run 38492578459](https://github.com/flair-agency/architecture-gatekeeper/actions/runs/38492578459), [Run 38493761906](https://github.com/flair-agency/architecture-gatekeeper/actions/runs/38493761906)): `PASS` after catching a real `job.head_sha` vs `run.head_sha` P1 in `@codex review` on #583 (`7481f71`). | Hosted single-session review on #517 ([Run 38200371751](https://github.com/flair-agency/architecture-gatekeeper/actions/runs/38200371751)) over the complete 6-member Authority Set (`fe095367...`) and the 1-file PR `#517` candidate diff (`docs/investigations/2026-10-11-ordinary-gemini-hosted-candidate.md`, 14 insertions between `c5686f6` and `c4b0057`), supplemented by multi-file Vertex evaluations in `#262` and `#333`: returned schema-valid semantic `BLOCK` (`decision_digest`: `b0314b8b068e23839b86c71790c33781d98374b76e78556abbf191c34818e67e`) with concrete P1 findings on workflow/documentation scope alignment rather than a false `PASS`. |
| Observed wall-clock latency | ~180–240s per normal `Self Architecture Gate` run (`review` job ~2m30s–3m30s); up to 7m job timeout when affected by #215 hangs. | ~95s total in `gemini-review` ([Run 38200371751](https://github.com/flair-agency/architecture-gatekeeper/actions/runs/38200371751)), including fresh pinned npm bootstrap, WIF token exchange, 3 Vertex `streamGenerateContent` calls, and projection output. |
| Upstream dispatch & cost characteristics | Metered via OpenAI API key (`OPENAI_API_KEY`); rerun overhead dominated by occasional #215 step timeouts requiring full job rerun. | Keyless Google Cloud WIF + Vertex AI `gemini-3.8-flash` (`global`); bounded by the 192 KiB stdin cap, 16,384 `maxOutputTokens`, and 10-request per-session circuit breaker (3 requests observed in Run 38200371751). Exact billing/token totals depend on private GCP billing export and are not claimed from public CI logs. |
| Limitations | Subject to upstream Action process-exit hangs (#215) and job-output secret-masking drops (#329). | Single hosted session authorized; multi-run consistency variance on identical inputs is bounded by offline/direct evaluations (#262/#333) rather than repeated paid hosted runs. Hard 32-file combined packet (changed + reference files) / 512 KiB context packet limit rejects oversized diffs before dispatch. |

### Issue #255 engineering-versus-rerun checkpoint and operational recommendation

1. **Implementation vs operating cost balance**: The provider-neutral input/completion boundary (`#332` / Slice 1A `#580`), credential-isolated Gemini runtime and WIF launcher (`#262`, `#333` / Slice 1B `#582`), and reusable dual-provider workflow (`#334` / Slice 1C `#583`) are now merged on `main` as finite, tested modules without ongoing branch-sync overhead.
2. **Active default recommendation**: Keep Codex (`gpt-6.1-sol`) as the active default on `main` because `main` uses Policy `v2` with `OWNER_AMENDMENT` (`triggerProfile: "completed-owner-decision-self-v1"` selected in `.codex/gatekeeper/ci-policy.json`; `v2` also supports `completed-block-v1`), which canonical authority restricts to Codex.
3. **Consumer / ordinary branch boundary**: Canonical authority (`docs/architecture/review-execution.md`) currently authorizes only the single bounded PR `#517` verification session ("not completion or broader activation"), so general consumer adoption remains inactive pending broader owner authorization. In the implemented contract, ordinary `enforced` branches (with bare `{ "mode": "local-only" }` waivers on non-enforced branches) within the 32-file combined packet (changed + reference files) / 512 KiB context packet and 192 KiB prompt bound select Policy `v6` (`provider: "gemini"`) with `.github/workflows/architecture-gate-providers.yml`, `with: protected-review-instructions: true`, explicit caller permissions (`contents: read`, `pull-requests: write`, `id-token: write`, `actions: read`), and GCP WIF secrets without any Codex CLI or `OPENAI_API_KEY` dependency on that route.
4. **Deferred scope**: Automatic provider fallback, standby retry, and speculative parallel execution remain unimplemented and owned by [#259](https://github.com/flair-agency/architecture-gatekeeper/issues/259); OpenAI API WIF remains owned by [#218](https://github.com/flair-agency/architecture-gatekeeper/issues/218).

## 4. Issue #252 final acceptance matrix (#338)

| #252 requirement / criterion | Delivered implementation on `main` | Verification & hosted evidence | Remaining boundary / non-claim |
| --- | --- | --- | --- |
| Isolated Gemini CLI + credential-isolated loopback proxy runtime | `src/gemini-cli/*`, `src/gemini-security-proxy.mjs` ([PR #262](https://github.com/flair-agency/architecture-gatekeeper/pull/262) at `cd7e0c6`) | `test/gemini-cli-*.test.mjs`, `test/gemini-security-proxy.test.mjs`, `test/installed-smoke.mjs` | Claims credential non-inheritance and loopback route/model enforcement, not same-user OS isolation. |
| Complete recorded inputs, revision-bound context packet, and Policy `v6` provider selection | `src/prepare-protected-ci-input.mjs`, `src/complete-prepared-ci-review.mjs`, `src/authority-validation/resolve-ci-policy.mts` ([PR #580](https://github.com/flair-agency/architecture-gatekeeper/pull/580) at `bbbf86a`) | `test/prepare-gemini-ci-verification-input.test.mjs`, `test/prepared-gemini-ci-review.test.mjs`, `test/policy.test.mjs` | Enforces 192 KiB stdin, 32 combined packet files (changed + reference files), 128 KiB/file, 512 KiB packet; rejects truncation. |
| Parent-only Google Cloud WIF + pinned Gemini CLI `0.62.0` bootstrap + same-run REST job-log publication | `src/github-vertex-wif.mts`, `src/gemini-ci-runtime.mjs`, `src/ordinary-gemini-ci-adapter.mjs`, `src/ordinary-gemini-ci-publication.mts`, `src/ci-review/ci-report.mts` ([PR #582](https://github.com/flair-agency/architecture-gatekeeper/pull/582) at `17ae954`) | `test/github-vertex-wif.test.mjs`, `test/gemini-ci-runtime.test.mjs`, `test/ordinary-gemini-ci-adapter.test.mjs`, `test/ordinary-gemini-ci-publication.test.mjs` | Same-run REST log retrieval binds `run_id`, `run_attempt`, and `job.head_sha === run.head_sha`. |
| Reusable CI workflow supporting Gemini without Codex/OpenAI credentials while preserving Codex support | `.github/workflows/architecture-gate-providers.yml` ([PR #583](https://github.com/flair-agency/architecture-gatekeeper/pull/583) at `51215db`) | Hosted Gemini [Run 38200371751](https://github.com/flair-agency/architecture-gatekeeper/actions/runs/38200371751) on `architecture-gate-providers.yml` (no Codex / no `OPENAI_API_KEY`); offline/static Codex-route compatibility on `architecture-gate-providers.yml` (`test/ordinary-gemini-ci-workflow.test.mjs`, `test/ci-execution-composition.test.mjs`); hosted Codex self-review on `architecture-gate.yml` ([Run 38493761906](https://github.com/flair-agency/architecture-gatekeeper/actions/runs/38493761906)) | Default `architecture-gate.yml` and `architecture-gate-consumer.yml` remain Codex-only; `architecture-gate-providers.yml` remains inactive pending broader owner authorization and consumer adoption, and its `v6` Codex branch is verified by offline/static workflow and composition tests rather than a separate hosted `architecture-gate-providers.yml` Codex run. |
| Governance paths and failure/cancellation behavior (#335, #336) | Policy `v6` governance exclusion + `F01`–`F17` failure/cancellation handling across input preparation, adapter, reporter, and acceptance CLIs | `test/prepare-gemini-ci-verification-input.test.mjs`, `test/ci-execution-composition.test.mjs`, `test/ordinary-gemini-ci-workflow.test.mjs`, Section 1 & Section 2 above | Governance routes (`OWNER_ADDITION`, `OWNER_AMENDMENT`) remain Codex-only by canonical owner decision. |
| Implemented contract, diagnostics, and explicit protected recovery documentation (#338) | [`docs/integration-reference.md`](../integration-reference.md) and this record | `test/ordinary-gemini-ci-workflow.test.mjs`, `test/ci-execution-composition.test.mjs` | Recovery uses explicit protected `v6` policy and caller updates, never automatic provider fallback. |
