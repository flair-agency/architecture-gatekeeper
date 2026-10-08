# Issue #272 document status audit

Audit baseline: protected `main` at `5e9c5585055c8c330c03fc7bfdf12f0d29058782` (2026-10-08), after PR #420. The documentation status finding was first identified against `3a3cf24812cf07a338015404eb6d43a01225dde2`; PR #420 changed only `src/authority-set.mjs`, `test/json-input.test.mjs`, and added its parser-caller inventory. It changed none of the selected authority members or the authority manifest. This ledger records a bounded Issue #272 correction and an inventory; it is repository-only evidence, not architecture authority or consumer adoption.

## Outcome and status boundary

The legacy v1 authority repair's implementation timing in the selected Set was stale. [PR #126](https://github.com/flair-agency/architecture-gatekeeper/pull/126) merged on 2026-09-26, and [v0.5.1](https://github.com/flair-agency/architecture-gatekeeper/releases/tag/v0.5.1) was published later that day. The source file `src/prepare-legacy-ci-authority.mjs` has the same SHA-256 at v0.5.1 and this baseline: `832de2824907b51e98a45a40b27d97bb45e114193b847b5fc5b7cf37e5fefc7e`.

At this baseline, `src/resolve-ci-policy.mjs:113-130` requires an enforced v1 policy to select bounded `authorityFiles`, `promptPath`, `schemaPath`, and `validationPath` or explicit `null`. `src/prepare-legacy-ci-authority.mjs:21-30` reads and re-resolves policy from the recorded base, then checks selected values against values forwarded from the policy job; it does not compare reusable-workflow inputs. The caller's `validation-path` comparison is performed separately by `.github/workflows/architecture-gate.yml:168-173`, which invokes `src/verify-legacy-validation-selection.mjs:3-9`. The prompt and schema paths passed to preparation are policy-job outputs (`.github/workflows/architecture-gate.yml:253-255`); the helper reads and materializes the recorded-base snapshots (`src/prepare-legacy-ci-authority.mjs:33-58`). It does not compare caller-supplied prompt or schema inputs. The helper rejects candidate changes to selected authority at `src/prepare-legacy-ci-authority.mjs:31-32` and requires decisions to report exactly the base-selected paths at `:70-76`. `test/legacy-ci-authority.test.mjs:10-15` exercises the validation-selection function; `:17-30` checks workflow preparation wiring; `:39-90,92-124,126-157` covers recorded-base inputs, candidate self-authorization, base-only authority updates, and non-regular snapshots.

These facts establish implementation and publication only. The repair applies when a runtime containing it handles an enforced legacy v1 review. The selected base policy and base-owned caller still determine the exact review inputs. This ledger does not establish any consumer's adoption, protected caller or producer, required-check source, or host enforcement. Historical v1 reports are not reclassified. The separately versioned Issue #121 procedural route retains its stated evidence and assurance semantics; the Issue #120 repair does not create or activate a route.

## Clause-level preservation map

Only the temporal implementation-status sentences in `docs/architecture/review-execution.md` changed. The owner-authorized requirements below remain in place, byte-for-byte outside those status paragraphs.

| Selected clause | Before | Disposition and preserved meaning |
| --- | --- | --- |
| Issue #120 target and history, heading `Target: legacy v1 CI authority repair` | Lines 400-410 at baseline `3a3cf...` described the rule as not active behavior and said it applied only after PR #126 integration. | Replaced the obsolete future tense with merged, regression-tested, shipped status. Retained owner authorization, compatibility break, the consumer-policy/caller selection condition, distinction from protected host enforcement, and no retroactive reclassification. The heading/fragment is unchanged. |
| Recorded-base inputs and candidate-resistant snapshots | Lines 412-424 | Unchanged: enforced v1 must select canonical authority, prompt, schema and validation path/null; caller validation selection must match; selected bytes come from the same recorded base; candidate bytes cannot self-authorize. |
| Ordinary acceptance and separate addition | Lines 425-430 | Unchanged: candidate-modified selected authority, absent/invalid selectors or snapshots, and incomplete/extra reported paths fail closed; eligible authority-only B remains a separate previous-base-authorized addition procedure. |
| Consumer compatibility and host boundary | Lines 432-445 | Replaced only “when this target is implemented” with the current runtime qualification. Preserved the rule that missing selections do not qualify for acceptance, candidate PRs cannot select their own policy, consumers adopt base policy and base-owned caller under their governance, merge-commit callers may be candidate-controlled, protected host evidence remains separate, and Issue #121 is not weakened. |
| Local/manual availability | Lines 447-450 | Unchanged: CI is not a prerequisite for every local/manual path; trust claims follow the selected route. |
| Other selected authority | All other clauses in `review-execution.md`, all 5 other selected members, and `.codex/gatekeeper/authorities.json` | Unchanged. No route scope, evidence, policy limit, model selection, acceptance rule, or owner choice was added. |

No owner decision was required: the existing Issue #120 owner decision already authorizes this repair. The update corrects only whether its implementation has shipped; it does not change the decision's scope or its applicability conditions.

## Full docs inventory and disposition

The initial remaining-document audit after Task #380, at completion revision `3a3cf24812cf07a338015404eb6d43a01225dde2`, contained 53 files under `docs/` totaling 800,616 bytes: six selected normative members, nine top-level supporting guides, and 38 files under `docs/investigations/` (including its index). The post-#420 audit baseline at `5e9c5585055c8c330c03fc7bfdf12f0d29058782` contains 54 files totaling 809,609 bytes: six selected normative members, nine top-level supporting guides, and 39 files under `docs/investigations/` (including its index). Of those 39 files, 37 are repository-only (including the index) and two are explicitly included in the package (`2026-09-23-child-reviewer-host-permissions.md` and `native-skill-e2e-template.md`). PR #420 added the 54th baseline document, `2026-10-08-json-parser-caller-inventory.md`; it remains a separate source-quality inventory. Relative to that audit snapshot, this ledger is the 55th documentation file and is repository-only. After the snapshot, PR #411 added `2026-10-08-preview4-lifecycle-clause-catalogue.md` as a separate 55th main-branch document; at `426fd7832dd5b32e6e74df74f63ba29926b7d717`, the source tree has 55 docs files totaling 851,684 bytes (40 files under `docs/investigations/`, including its index). This audit ledger would be the 56th file if added to that newer snapshot. The #411 catalogue remains outside this audit's dispositions and in its own review scope.

### Selected normative members

| File | Baseline bytes | Role and disposition |
| --- | ---: | --- |
| `docs/architecture.md` | 41,411 | Shared contract, lifecycle, invariants and stable navigation. Keep selected and read with the other five members. |
| `docs/architecture/authority-set.md` | 6,863 | Authority selection and source/size bounds. No change. |
| `docs/architecture/owner-addition.md` | 18,063 | Missing-decision procedures and assurance. No change. |
| `docs/architecture/owner-amendment.md` | 24,531 | Existing-decision amendment profiles, evidence and acceptance. No change. |
| `docs/architecture/review-execution.md` | 28,901 | Local/CI execution, legacy-v1 target and current status. The sole normative member edited; final candidate size is recorded below. |
| `docs/architecture/self-profile.md` | 7,150 | Self-only profile, release and dogfooding requirements. No change. |

### Top-level supporting guides

| File | Baseline bytes | Role and disposition |
| --- | ---: | --- |
| `docs/README.md` | 8,247 | Reader-goal map and contract navigation; retain useful navigation overlap. |
| `docs/development.md` | 4,161 | Development and verification workflow. No change; development-quality Issue #418 is separately reserved. |
| `docs/github-assurance.md` | 18,495 | Host capabilities and dated host-configuration evidence; keep dated snapshot disclaimers and fresh-readback instruction. |
| `docs/integration-reference.md` | 71,009 | Current integration surface and package behavior; keep distinct from normative requirements and operator procedure. |
| `docs/issue-pr-workflow.md` | 7,833 | Scope, acceptance evidence and delivery reporting; no duplicate authority. |
| `docs/owner-intervention.md` | 11,816 | Operator runbook and full legacy-v1 consumer upgrade instructions; remains the procedure's primary home. |
| `docs/release.md` | 28,541 | Release planning, publication, recovery and historical release records; preserve the formal v0.6.0 gates. |
| `docs/reviewer-host-permissions.md` | 5,084 | Reviewer host and child-process permission boundaries. |
| `docs/self-gate-actions-policy.md` | 5,871 | Self-only Actions event-policy observation and required steps before merge-queue claims. |

### Investigation/archive records (repository-only except where noted)

These records preserve dated observations, proposals, measurements, fixture results, clause maps, or templates. The index and original records are historical sources; their status labels do not prove current activation. Keep them in their recorded context and update concise index descriptions only when a factual successor is verified.

| Inventory | Classification / disposition |
| --- | --- |
| `docs/investigations/2026-09-23-architecture-gate-latency-baseline.md`; `2026-09-23-architecture-responsibility-reassessment.md`; `2026-09-23-child-reviewer-host-permissions.md`; `2026-09-23-codex-action-integrity-trust-design.md` | Dated measurements, responsibility assessment, host observations and trust proposal. Historical scope remains explicit. |
| `docs/investigations/2026-09-24-distributed-authority-design.md`; `2026-09-24-historical-block-artifact-poc.md`; `2026-09-24-issue72-native-skill-e2e.md`; `2026-09-24-native-skill-e2e.md`; `2026-09-24-self-authority-set-ci-dogfood.md` | Design, feasibility and local/CI experiment records. Preserve each run's limits; no present route is inferred. |
| `docs/investigations/2026-09-25-block-attestation-probe.md`; `2026-09-25-historical-pr-block-probe-plan.md`; `2026-09-25-offline-historical-block-verifier.md`; `2026-09-25-real-pr-block-probe-implementation.md`; `2026-09-25-validated-block-producer-probe.md` | Test-only BLOCK evidence experiments and plans. Preserve distinctions from production ReviewRecord, protected adoption and G0 acceptance. |
| `docs/investigations/2026-09-26-governance-assurance-reporting-proposal.md`; `2026-09-26-owner-addition-adoption-use-cases.md`; `2026-09-26-owner-addition-g0-e2e.md` | Decision rationale, use cases and synthetic fixture evidence. Canonical rules stay in owner-addition authority. |
| `docs/investigations/2026-09-27-ai-executor-dependency-boundary.md`; `2026-09-28-issue176-cost-measurement.md` | Dated provider-boundary and cost/usage work. Use current contract/reference for present support. |
| `docs/investigations/2026-10-01-local-screening-adapter-dogfood.md`; `2026-10-01-local-screening-host-probe.md`; `2026-10-01-local-screening-implementation-review.md`; `2026-10-01-local-screening-route-selection.md` | Local screening experiments, review and provisional route material. They do not establish desktop delivery or protected acceptance. |
| `docs/investigations/2026-10-02-architecture-document-restructure.md`; `2026-10-02-credential-isolated-review-proxy-boundary.md`; `2026-10-02-local-provider-execution-contract.md` | Historical architecture/editorial and provider design records. Selected clauses alone are normative. |
| `docs/investigations/2026-10-04-architecture-authority-split.md`; `2026-10-04-architecture-authority-split-map.json`; `2026-10-04-author-association-mismatch.md`; `2026-10-04-fork-pr-environment-authorization-design.md`; `2026-10-04-gemini-ci-delivery-plan.md`; `2026-10-04-ordinary-ci-execution-verification.md` | Split evidence, machine map, host case, inactive Fork design, provider plan and partial implementation verification. Each has its own source revision/status; none activates a route. |
| `docs/investigations/2026-10-07-canonical-authority-lifecycle-editorial-map.json` | Issue #384 clause-preservation map; its scope explicitly excludes this document-wide status audit. Leave bytes unchanged. |
| `docs/investigations/2026-10-07-preview-package-pin-recovery-history.md` | Verbatim historical rehearsal extraction with source hash; current recovery rules remain in integration-reference. |
| `docs/investigations/2026-10-07-reader-goals-editorial-map.md` | #381/#382 source-backed supporting-doc reconciliation and navigation map. Keep as prior delivery evidence. |
| `docs/investigations/2026-10-08-json-parser-caller-inventory.md` | #413/#420 caller/limit/order inventory, merged after the initial 3a3 audit. Keep as separate source-quality scope. |
| `docs/investigations/index.md` | Repository-only evidence index, status caveats and guide-home map. Add one discovery row for this audit. |
| `docs/investigations/issue111-owner-adoption-plan.md` | Historical consumer adoption plan; it requires fresh policy/issue readback and is not current adoption evidence. |
| `docs/investigations/native-skill-e2e-template.md` | Reusable evidence-record template, not a run result. |

Package distribution is controlled by `package.json#files`: all six authority members and the top-level supporting guides ship; the investigation index and this new ledger are repository-only. The two explicitly listed dated/template investigation files ship. This audit adds no archive entry to the npm package.

## Duplicate, stale and preserved-material dispositions

| Material | Evidence-backed disposition |
| --- | --- |
| Legacy-v1 implementation timing | Corrected only the two obsolete temporal clauses mapped above. Recorded-base policy and policy-job consistency checks, the separate caller `validation-path` match, and missing-input fail-closed behavior remain conditions. |
| Legacy-v1 operator procedure | `integration-reference.md` retains old heading/fragments as link pointers; `owner-intervention.md` contains the detailed consumer upgrade procedure. The index records that migration. Keep aliases and the single primary procedure. |
| README and docs/README navigation | Distinct project orientation and documentation-map roles; short overlapping links are purposeful navigation, not duplicated procedures. |
| Architecture root headings after the split | Retained fragment headings point to full clauses in selected members; pointers do not duplicate authority or permit module-only selection. Keep them. |
| Investigation index summaries | Short status, baseline and successor summaries are for discovery; original reports remain evidence sources. Keep summaries with dated caveats. |
| Issue #384 lifecycle map and PR #411 preview.4 catalogue | #384 records clause correspondence for its specified baseline; PR #411's separate preview.4 catalogue merged at the `426fd7832dd5b32e6e74df74f63ba29926b7d717` snapshot. Its content remains outside this audit. |
| Other potentially changing operational/status docs | No source-backed stale contradiction was demonstrated in this bounded pass. Host records that need current observation are explicitly dated/snapshot-limited; preview and self-rollout guides retain their separate policy/host gates. Do not rewrite from a merged PR or historical plan alone. |

The audit baseline at `5e9c5585055c8c330c03fc7bfdf12f0d29058782` contains 54 files and 809,609 bytes under `docs/`. Before/after sizes for the edited and selected documents are:

| File | Before bytes | Candidate bytes | Delta |
| --- | ---: | ---: | ---: |
| `docs/architecture/review-execution.md` | 28,901 | 29,039 | +138 |
| `.codex/gatekeeper/authorities.json` | 1,077 | 1,077 | 0 |
| `docs/architecture.md` | 41,411 | 41,411 | 0 |
| `docs/architecture/authority-set.md` | 6,863 | 6,863 | 0 |
| `docs/architecture/owner-addition.md` | 18,063 | 18,063 | 0 |
| `docs/architecture/owner-amendment.md` | 24,531 | 24,531 | 0 |
| `docs/architecture/self-profile.md` | 7,150 | 7,150 | 0 |
| **Selected six-member Set total** | **126,919** | **127,057** | **+138** |

The new ledger and one-line index entry increase repository-only docs size; neither is part of package files or selected authority. No reduction target or max-file-limit change is proposed.

## Historical scope and unresolved release dependency

Issue #272 remains open after the six-member split (#313) and the bounded Task #380 reorganization. This ledger audits the remaining status/inventory scope; it does not redo either delivery. It preserves the #384 lifecycle map's explicitly bounded purpose and the dated evidence/history of earlier rollouts. PR #411's preview.4 catalogue merged separately at the `426fd7832dd5b32e6e74df74f63ba29926b7d717` snapshot and is outside this audit. A read-only GitHub status readback on 2026-10-08 found PRs [#322](https://github.com/flair-agency/architecture-gatekeeper/pull/322), [#297](https://github.com/flair-agency/architecture-gatekeeper/pull/297), and [#237](https://github.com/flair-agency/architecture-gatekeeper/pull/237), [#238](https://github.com/flair-agency/architecture-gatekeeper/pull/238), and [#239](https://github.com/flair-agency/architecture-gatekeeper/pull/239) open; their preview lifecycle, consumer assurance, receiver, App diagnostic, and Environment routing scopes remain separate and untouched. Issue [#418](https://github.com/flair-agency/architecture-gatekeeper/issues/418) also remained open and reserves development-quality criteria; `docs/development.md` was not edited. Follow-up Task [#421](https://github.com/flair-agency/architecture-gatekeeper/issues/421) tracks review, protected checks, merge and exact readback; this ledger does not claim those later outcomes.

The 2026-10-07 checkpoint on [Issue #116](https://github.com/flair-agency/architecture-gatekeeper/issues/116) still lists protected self integration and applicable owner selections (#210), both protected amendment cases (#211/#137), documentation readiness/readback (#272), and exact final package/release verification (#212). It states preview.4 content is not frozen. Those external final-release gates remain open; this audit does not close Issue #272 or establish v0.6.0 readiness.

Unresolved matters remain distinct: consumer architecture and adoption are consumer-owned; protected host enforcement needs host evidence; Issue #147 leaves its procedural BLOCK profile's wire formats and trusted backend unselected; the exact-claim authorization/revocation mechanism remains unselected; self App/merge-queue rollout still needs selected policy, host readback and protected E2Es; Gemini deployment identity and operational settings require selection and verification before activation. This status correction resolves none of these matters.

## Review and verification record

The reviewable candidate and subsequent independent reviews, protected checks and exact readback are tracked by [Task #421](https://github.com/flair-agency/architecture-gatekeeper/issues/421). This ledger is not itself a review decision or protected acceptance result.
