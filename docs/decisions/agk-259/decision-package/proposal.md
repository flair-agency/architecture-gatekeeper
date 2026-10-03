# Architecture Decision Proposal: Codex/Gemini CI coexistence and result adoption

> **Document status:** Proposed
> **Prepared:** 2026-10-02
> **Decision owner:** Unknown; the authorized AGK architecture owner under the repository's owner process
> **Review by / time bound:** None known

## Decision question and scope

- **Question:** For a provider route that has individually satisfied its adopted #252 acceptance criteria and is authorized by prior protected policy, which initial CI selection/result-adoption strategy should AGK use? An unaccepted route is ineligible for selection. The fact that another provider route is not yet accepted does not itself delay use of the individually accepted route. Should AGK use explicit single-provider selection, sequential standby/fallback, speculative parallel execution, or defer orchestration?
- **Scope and affected context:** Protected CI architecture review and the policy for selecting/adopting results across Codex and Gemini. Each selected route must individually satisfy its adopted #252 acceptance criteria and be authorized by prior protected policy. No unaccepted route may be selected. This decision does not require the other provider route to be complete before an eligible route can be selected; it does not define or activate routes.
- **Applicability conditions:** Only an owner-adopted policy recorded in canonical AGK authority may authorize implementation or activation. Any later implementation must bind the same base/head, full authority, review task, and common input identity across provider attempts and record actual provider/model/settings/runtime/request/run/attempt.
- **Exceptions:** No exception to the existing protected review contract is proposed. Local provider selection and execution are outside scope. The existing protected policy flow remains controlling: transport/execution success is distinct from a complete schema-valid semantic decision, which is distinct from protected acceptance. A `PASS`, `BLOCK`, or `OWNER_DECISION` is a completed semantic decision only when the output is complete and passes the existing deterministic consumer validation; a valid `PASS` alone does not authorize protected acceptance. Timeout/error, refusal, missing/partial output, or invalid output is execution-incomplete/error and cannot be treated as a semantic decision or acceptance.
- **Time bounds:** None known. #259 says this policy is not a new prerequisite for preview #229 or formal release #116.

## Context and classified inputs

### Facts

- #259 is an open design/owner-decision issue with no owner outcome in the supplied readback. It identifies single-provider selection, sequential standby/fallback, and speculative parallel execution as candidates; result adoption, disagreement handling, fallback triggers, common input identity, deadlines/cost/cancellation, authentication, and disclosure remain to be decided. (S1)
- The current #252 issue record says PR #264 merged an inactive credential-isolated proxy target, PR #262 remains open and contains partial launcher/proxy/runner implementation, and PR #253 supplies Gemini REST transport/tests but not supported or activated CI support or provider-quality proof. (S2, S3)
- #252 requires independent provider selection and review-path coverage, including complete inputs, deterministic validation, protected configuration, and PASS/BLOCK/OWNER_DECISION plus failure cases. It explicitly separates transport/schema success from semantic quality and protected acceptance. (S2)
- #255 assigns #259 the standby/fallback/parallel policy and says #252 owns independent provider support. It says #259 is not a new preview/formal-release gate and calls for a bounded comparison checkpoint before orchestration. (S4)
- #215 records one latest observation with a 240025 ms deadline, child exit at 240040 ms, action return at 241066 ms, inner Node exit code 1, and outer review cancellation around 12 minutes. The record says this does not establish a surviving child/process or Runner root cause. (S5)
- Current canonical AGK authority at the pinned `origin/main` revision says CI retains an independent model-review adapter and exact-SHA-pinned workflow. Its enabled distributed-authority target requires bounded immutable member snapshots, complete-set validation, and provenance; the target applies only after implementation and explicit selection. It records #252's inactive proxy target and does not contain a #259 policy. (S6)

### Assumptions

- The decision is intended to be made before adding cross-provider orchestration; this follows #259's stated sequence and is a proposal premise, not an existing owner decision.
- Each route's eligibility must be established independently under the acceptance criteria adopted in #252; current records do not establish either route as accepted. A route that has not met its own criteria is ineligible, while its status does not delay selection of a different route that is accepted and authorized by prior protected policy.
- Any real provider comparison requiring private authority or paid review needs the applicable owner authorization and disclosure/authentication controls. No such comparison was run for this proposal.

### Existing decisions

- Canonical AGK authority records the #252 credential-isolated proxy target as inactive and not a route activation. The current canonical snapshot contains no #259 owner decision. (S6)
- #252's current issue scope assigns independent Codex/Gemini CI support and its acceptance evidence to #252; #259 separately owns optional standby/fallback/parallel result policy. These issue records are planning/status evidence, not substitutes for canonical adoption. (S2, S4)
- No authorized owner decision for the exact Proposal revision below is present. Adoption remains Pending.

### Constraints and evidence

- Transport/execution success, complete schema-valid semantic decision, and protected acceptance are distinct. Only a complete output that passes existing deterministic consumer validation and is `PASS`, `BLOCK`, or `OWNER_DECISION` is a completed semantic decision; a valid `PASS` alone does not authorize protected acceptance. Falling back after a semantic decision changes result-adoption policy, not simply availability. (S1, S2)
- Parallel execution can produce disagreement and late completed results; local cancellation does not prove remote processing or billing stops. #259 requires those cases and actual producer identity to be addressed. No measurements for them are supplied. (S1)
- The single #215 timing observation is operational context only; it is not comparative evidence that either provider or orchestration strategy is superior. Root cause and PR-size correlation remain unknown. (S5)
- The #252 route acceptance prerequisites are not shown complete in the current source set. A transport merge or partial implementation is insufficient evidence of independent route usability. (S2, S3)

## Decision drivers

- Preserve protected acceptance and distinguish semantic outcomes from execution failures.
- Do not select an unaccepted route. Permit explicit selection of a route only after that route individually proves its adopted #252 inputs, validation, protected selection, and enabled governance paths; do not make acceptance of the other provider a precondition.
- Make input identity, provenance, deadlines, retries, cancellation, residual execution/cost, authentication, and disclosure auditable before using fallback or parallel execution.
- Compare measured waiting time, stabilization/maintenance effort, duplicate calls, and review-quality conflicts without inventing budgets or treating one incident as a provider comparison.

## Options considered

| Option | Benefits | Costs / risks | Conditions, exceptions, and trade-offs |
| --- | --- | --- | --- |
| A. Explicit protected single-provider selection for the initial increment | Smallest policy surface; clear producer and result provenance; avoids silently discarding completed decisions or duplicating calls. | A selected route's timeout/error leaves review incomplete; availability depends on that route. | The selected route must individually be accepted under #252 and authorized by prior protected policy; the other provider need not yet be accepted. No automatic fallback or parallel execution. |
| B. Sequential standby/fallback | May complete review after an execution failure in the first route. | Adds trigger ambiguity, latency, retry/cost controls, and risk of treating a semantic result as an availability failure. | Both routes involved must individually be accepted under #252 and authorized by prior protected policy; otherwise the unaccepted route is ineligible and fallback cannot invoke it. Must define fallback direction, exact incomplete/error triggers, no fallback after a completed semantic `PASS`/`BLOCK`/`OWNER_DECISION` unless the owner explicitly changes adoption policy, common input identity, deadlines, retries, and late-result handling. |
| C. Speculative parallel execution | May reduce wait when one route is slow. | Duplicates work/cost; can yield conflicting or late completed decisions; cancellation may not stop remote work; expands private-input disclosure. | Both routes involved must individually be accepted under #252 and authorized by prior protected policy. Requires owner-defined adoption (first valid, first PASS, collect/reconcile, or other), disagreement escalation, shared input identity, deadlines, duplicate-call/concurrency limits, residual-work observation, and explicit disclosure/authentication boundaries. No such policy or measurements are established here. |
| D. Defer orchestration and retain explicit selection until evidence and owner policy exist | Preserves current protected contract while #252 route acceptance and bounded comparisons mature. | Does not mitigate delay by automatic cross-provider execution. | May be paired with Option A as the initial increment; reconsider fallback/parallel only after each involved route is independently accepted under #252 and bounded evidence is available. It creates no release gate. |

## Proposed decision

**Proposed Decision (the exact content offered for owner review):** For a selected CI provider route that has individually satisfied its owner-adopted #252 acceptance criteria and is authorized by prior protected policy, use explicit protected single-provider selection as the initial strategy. A route that has not individually satisfied its #252 criteria is ineligible for selection; the other provider's acceptance is not a precondition to selecting an eligible route. Do not enable automatic sequential fallback or speculative parallel execution in this initial increment. Keep the existing protected policy flow: transport/execution success is distinct from a complete schema-valid semantic decision, and that decision is distinct from protected acceptance. Only a complete `PASS`, `BLOCK`, or `OWNER_DECISION` output that passes existing deterministic consumer validation is a completed semantic decision; a valid `PASS` alone does not authorize protected acceptance. If the selected route returns timeout/error, refusal, missing/partial output, invalid output, or another execution-incomplete result, retain diagnostics and treat the review as incomplete; do not reinterpret it as a semantic decision or acceptance and do not automatically invoke another provider. Preserve same-input identity and actual producer/model/settings/runtime/request/run/attempt provenance for every review. Reconsider fallback or parallel execution only through a separately owner-adopted policy that defines result adoption/disagreement, triggers, deadlines/retries, duplicate and residual cost, cancellation, and authentication/disclosure boundaries, informed by bounded evidence. This recommendation does not activate either route, change canonical authority, alter local provider behavior, or add a release prerequisite.

This section is the sole proposed normative decision text for any later exact-revision owner action. The surrounding analysis and source map explain it but are not separate adoption targets. It is a recommendation, not an adopted decision.

## Consequences and conditional analysis

- **Expected consequences:** If adopted, an individually accepted and previously authorized route can be selected without waiting for the other route's acceptance; an unaccepted route remains ineligible. The existing protected policy flow continues to distinguish transport/execution success, validated semantic decisions, and protected acceptance. An execution failure remains incomplete, and no second provider is invoked automatically. This reduces orchestration policy but retains single-route availability risk.
- **Applicable analysis included:** Bounded readback of #259, #252, #255, #215, the current canonical architecture at a pinned Git revision, and one current #262 PR status readback. No provider call, paid review, implementation experiment, or quality comparison was performed.
- **Applicable analysis missing or deferred:** Evidence that each candidate route meets its own #252 criteria before it is selected; measured route completion/runtime/cost; bounded comparative semantic cases; operational behavior for fallback/parallel; approved auth/disclosure conditions. Those are prerequisites to a later orchestration proposal, not assumptions of this one.
- **Trade-offs accepted by this proposal:** An execution failure of the selected provider leaves the review incomplete rather than automatically seeking another provider. This is proposed only; owner acceptance is pending.

## Unresolved owner choices

| Question | Why owner judgment is needed | What depends on it | Needed by / time bound |
| --- | --- | --- | --- |
| Which initial strategy should AGK authorize: explicit selection of an individually #252-accepted, previously authorized route, sequential fallback, parallel execution, or explicit deferral? If explicit selection is chosen, is the proposal's eligibility rule correct: the selected route itself must be accepted and protected-policy-authorized, while the other route need not yet be accepted? | It determines protected result-adoption and orchestration responsibilities. | Any canonical policy, implementation, or activation for #259. | None known; #259 is not a preview/formal-release gate. |
| If fallback or parallel is selected instead, what exact semantic-result adoption, disagreement/escalation, trigger, deadline/retry, concurrency/duplicate-cost, late-result/cancellation, residual-work, authentication, and disclosure rules apply? | These choices can change protected acceptance, cost, availability, and private-input exposure. The sources do not establish them. | The corresponding alternative's safe implementation and evidence requirements. | Only if the owner selects fallback or parallel; no numeric bounds inferred here. |

## Source map

| Item / claim | Class | Source and locator | Date / version | Limitations or conflict |
| --- | --- | --- | --- | --- |
| #259 alternatives, decision gaps, recommendation candidate, sequencing, no new release gate | Fact / constraint | S1: [Issue #259](https://github.com/flair-agency/architecture-gatekeeper/issues/259), Outcome; Decisions still needed; Evaluation and delivery. Snapshot `sources/agk-issue-259.json`, body SHA-256 `5b66672d99ba02fc5c21067cbb500b6d6728b9dbb0519e4f5423365b1ac35792`, snapshot SHA-256 `33b122ea05858ad92610de3cfe185b3bcee76a9370383ab469733d77dca709f4`. | Readback 2026-10-02; OPEN, 0 comments | Issue content is a design request, not owner adoption or proof of authority. |
| #252 route scope, status, acceptance conditions and separation from #259 | Fact / constraint | S2: [Issue #252](https://github.com/flair-agency/architecture-gatekeeper/issues/252), Goal; Current status; Remaining decisions and implementation; Done when. Snapshot `sources/agk-issue-252.json`, SHA-256 `87e1358e3e0b65ec6859d4d46c89b25e6c54018497105c0e777aacd2fbc68fa2`. | Readback 2026-10-02; OPEN | Issue describes acceptance criteria; this snapshot does not prove they are met. |
| Current #262 status | Fact | S3: [PR #262](https://github.com/flair-agency/architecture-gatekeeper/pull/262), current status readback `sources/agk-pr-262-current.json`, SHA-256 `d37abac3506efe542cb02cf2e511394ef7a46cf471e54ea00d28b9be9bc1442c`; OPEN, non-draft, unmerged, head `584acd8be7a3285feaf2681ba1d8006d63b4fcf2`. | Readback 2026-10-02 | Single state readback only; does not establish implementation correctness or adoption. It updates the older draft/head status in #252. |
| Work ownership, bounded comparison, policy remains under #259, release-gate limit | Fact / constraint | S4: [Issue #255](https://github.com/flair-agency/architecture-gatekeeper/issues/255), Owner direction and priority; Work ownership; Coordination and cost checkpoints; Completion. Snapshot `sources/agk-issue-255.json`, SHA-256 `bfa7b93d55215676d808fbdd8654cfa9108eb142b6c940798d8a176c13dfb8e7`. | Readback 2026-10-02; OPEN | Coordination/planning record, not canonical adoption. |
| Timing observation and explicit root-cause limitation | Constraint or evidence | S5: [Issue #215](https://github.com/flair-agency/architecture-gatekeeper/issues/215), Latest #86 observation and Remaining work. Snapshot `sources/agk-issue-215.json`, SHA-256 `c2c78d543a7f64bde902815b6e6dfeb0c2cf40031e331d2a1d245a43bd93f060`. | Readback 2026-10-02; OPEN | One reported run; does not identify a surviving process, Runner cause, provider superiority, or strategy outcome. |
| Current canonical CI and #252 boundary; no #259 decision | Existing decision / constraint | S6: `docs/architecture.md` at `flair-agency/architecture-gatekeeper@1d827fa47eac1740aa6e943654a3b7c1a1f56cb0`, Git blob `966aaff9f61969c10587974d928590b2b6858c6e`, snapshot `sources/current-docs-architecture-1d827fa.md`, SHA-256 `c1e0c257012eada3744fe5b8add85d8f1b4838c878fa781c3934de5b8b5d3551`; lines 65–113 for the conditional distributed-authority target and complete-set validation; lines 829–853 and 896–907 for review adapters/protected CI; lines 916–929 for the inactive #252 proxy target. | Canonical source pinned to `origin/main` 2026-10-02 | Exact current authority snapshot; lines 65–113 describe the conditional distributed-authority target and complete-set validation, lines 829–853 and 896–907 support review adapters/protected CI, and lines 916–929 support the inactive #252 proxy target. The statement that this snapshot contains no #259 decision is a document-wide inspection, corroborated by the #259 issue readback (S1). Local-provider rule at lines 870–879 is deliberately not generalized to CI. |
| Proposed explicit-selection-first outcome | Proposed decision | This Proposal, “Proposed decision” section; target revision SHA-256 recorded in trial receipt. | 2026-10-02 | Recommendation only; not adopted and not canonical authority. |
| Initial strategy and conditional subchoices | Unresolved owner choice | This Proposal, “Unresolved owner choices”; issue #259 decisions list (S1). | None known | The conditional details become active questions only if fallback or parallel is selected. |

## Adoption record

- **Owner outcome:** Pending
- **Target artifact(s) and revision(s):** This Proposal, exact SHA-256 recorded in the accompanying trial receipt; specifically the “Proposed Decision” section above.
- **Authorized owner/authority:** Unknown; must be established by AGK's owner process.
- **Authorization evidence URL or record ID:** Pending; no owner action on this exact revision was supplied.
- **Date and adopted scope:** Pending
- **Applicability conditions:** Pending owner action; proposal recommends applicability only to a selected route that individually satisfies #252's adopted acceptance criteria and has prior protected-policy authorization. Acceptance of the other route is not a prerequisite.
- **Exceptions:** Pending owner action; proposal defines none beyond keeping local provider behavior out of scope.
- **Current canonical architecture disposition:** Unchanged by this Proposal; owner process must record any later update.
- **Downstream artifacts explicitly adopted/derived:** None; no Authority Set, manifest, implementation, or activation created.
