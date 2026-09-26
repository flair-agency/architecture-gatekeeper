# Governance assurance reporting proposal (#121)

**Status: pending owner decision; proposal only; not adopted.** This document does not amend [`docs/architecture.md`](../architecture.md), change runtime or policy behavior, enable an acceptance route, or authorize a consumer-specific architecture. The consumer owner must record any selected contract in canonical authority before implementation.

## Problem and scope

The v0.5 scalar label `G0` is easy to read as an overall governance-strength grade. Its defined meaning is narrower: Gatekeeper did not verify the identity of the annotated-tag actor. It says nothing by itself about whether the host requires the Gate check for merge, what principal authorized the exact claim, or whether a candidate actually became canonical through an enforced transition.

This distinction matters for the LIVE Agency trial: the repository is private, and its branch-protection API request returned a plan-restricted HTTP 403. A successful `Architecture Gate / accept` job therefore does not establish that the host required that check for merge. A failing job is likewise not proof of a merge barrier. The observed API limitation is specific evidence about that repository and plan, not a general statement that all private repositories lack enforcement.

This proposal addresses assurance vocabulary, reporting, route selection, compatibility, and validation. It does not repair the separate complete Authority Set issue in [#119](https://github.com/flair-agency/architecture-gatekeeper/issues/119) or the legacy PR-head authority issue in [#120](https://github.com/flair-agency/architecture-gatekeeper/issues/120). Both remain independent blockers for the LIVE Agency trial involving [#106](https://github.com/flair-agency/live-agency/pull/106) and related consumer changes.

## Existing contracts to preserve

- **v0.5 `OWNER_ADDITION / G0`:** G0 means principal/tag-actor identity was not verified. It is a procedural result under a previous protected-base policy, strict authority-only eligibility checks, exact B/tag-object binding, and a B-specific semantic review. The verifier observes the mutable tag ref's mapping to the bound tag object when verification runs. It does not promise that the ref remains unchanged through a later merge or canonical transition. Keep existing v0.5 policy bytes, artifacts, and historical results unchanged.
- **`OWNER_AMENDMENT`:** This is a distinct route with a triggering historical `BLOCK`, an AmendmentRecord, strict authority-only scope, and a separate acceptance result. Its target contract requires bound evidence to remain valid through the protected canonical transition. This freshness condition must not be retroactively applied to G0, nor weakened to G0's point-in-time tag-ref observation.
- **Host enforcement and canonical transition:** A same-run procedure or eligibility result is not proof that the host enforced a merge rule. A policy/ruleset readback is an observation of configuration, not a receipt that a specific B completed the transition. Any claim of enforced acceptance must identify evidence for the host rule and, separately, evidence of the actual canonical transition.
- **Identity and claim authorization:** Principal authentication, authorization of the exact claim, and quorum are independent from procedure, host enforcement, and transition. G0 is not redefined to imply any of them. No G1 route is available until the separate identity adapter and policy are specified and verified; see [#79](https://github.com/flair-agency/architecture-gatekeeper/issues/79).

## Proposed reporting model

Replace the implication of a single scalar grade in future reporting with independent, explicit facts. A future versioned report could include:

| Dimension | Example values | What it says |
| --- | --- | --- |
| `procedure` | `owner_addition_g0_eligible`, `owner_amendment_eligible`, `ineligible`, `incomplete` | Whether the route-specific evidence and eligibility checks completed. This is not merge acceptance by itself. |
| `principalAuthentication` | `not_verified`, `verified:<principal>`, `unknown`, `unavailable` | Whether an approved identity mechanism authenticated the relevant actor. Legacy G0 maps to `not_verified`. |
| `exactClaimAuthorization` | `not_required`, `authorized:<claim-id>`, `not_verified`, `unknown`, `unavailable` | Whether an authorized principal approved this exact claim under an adopted contract. |
| `quorum` | `not_required`, `satisfied`, `unsatisfied`, `unknown` | Whether the policy's required attester relationship/count was met. |
| `hostEnforcement` | `verified`, `not_verified`, `unavailable`, `not_applicable` | Whether evidence proves the required host mechanism applied to the target and required producer/check, with bypass scope recorded. |
| `canonicalTransition` | `verified:<receipt-id>`, `not_verified`, `pending`, `unknown` | Whether a separate host readback/receipt verifies the exact candidate became canonical. |
| `evidenceFreshness` | route-specific structured state | Which bound evidence was checked, at what event/time, and through which lifecycle boundary. |

An absent or inaccessible source is reported as `unknown` or `unavailable`, not converted to `verified` or to an eligible value. Report provenance should include the candidate repository/base/head, authority and policy identities, selected host/target, evidence references and observation times. Host configuration evidence should identify the mechanism, target branch, required check and producer identity, bypass scope, and the readback time. Configuration alone never sets `canonicalTransition=verified`.

Keep the legacy string `OWNER_ADDITION / G0` for interpreting existing v0.5 results. In new reports it may appear as a compatibility label alongside the independent fields, annotated as a legacy procedure label; it must not be presented as a total assurance level. A new advisory outcome must not be serialized as `OWNER_ADDITION_G0` or as a protected acceptance result.

## Route choices requiring owner decision

### Option A: retain protected-only governance routes

Require verifiable host enforcement for every formal governance acceptance. If enforcement evidence cannot be obtained, the route is incomplete and no acceptance is reported. This keeps the current protected-only model narrow, but repositories on plans or hosts that cannot expose/require such a control cannot use the governance acceptance route. They may still use local/manual feedback under their existing contract.

### Option B: add an explicit advisory-only procedure (recommended for owner review)

Add a separately named, opt-in mode for repositories that can verify route procedure and bind it to a recorded protected base but cannot prove host merge enforcement. It may report the procedure decision, exact inputs, policy and evidence observations for human follow-up. It must explicitly report `advisory_only`, `hostEnforcement=not_verified` (or `unavailable`), and `canonicalTransition=not_verified`. It does not emit `OWNER_ADDITION_G0` as acceptance, satisfy a required `Architecture Gate / accept` check, or imply that B is canonical. An eligible B that remains a pull request therefore has an advisory result only.

The advisory mode is not an automatic fallback. The previous protected-base policy must explicitly select it. If an enforced route was selected and host evidence is missing, inaccessible (including a plan-restricted 403), stale, or invalid, the result remains incomplete/fail-closed; it cannot downgrade to advisory. Candidate B cannot enable advisory mode, change its assurance requirements, or select a different policy. If a repository cannot protect that selection itself, the mode cannot claim protected-base policy assurance; the consumer owner must choose an external governance process or keep the route unavailable.

**Owner decision:** choose Option A or Option B, name the dimensions and report vocabulary, and define whether a host readback is required for each procedure. Record the decision in `docs/architecture.md` before implementation. This proposal does not decide that advisory-only behavior is part of the product contract.

## Compatibility and migration proposal

1. Do not rewrite, reinterpret, or invalidate historical v0.5 `G0` artifacts or policy bytes. Their claims remain bounded by the original contract: identity unverified; tag-ref mapping observed at verification; no promise of later freshness or host merge enforcement.
2. Give any new route and report a new explicit policy/report version. Old consumers keep current behavior until a protected-base policy opts into the new version through the normal owner-controlled adoption path.
3. During migration, render old G0 records with an explicit legacy explanation and unknown enforcement/transition facts. Do not infer values from a green check. New verifiers must reject an ambiguous mixture of legacy and new fields instead of silently upgrading old evidence.
4. Do not change `OWNER_AMENDMENT` freshness semantics. Its evidence remains valid through its protected transition; G0 remains a point-in-time verification result.
5. A consumer that cannot read host enforcement configuration may select the proposed advisory mode only after owner adoption and only if its policy selection is itself protected. If it cannot satisfy that prerequisite, there is no Gatekeeper acceptance route. The 403 is a visible reason, not a waiver or fallback trigger.

## Failure semantics

- Missing or malformed candidate authority, stale base/head, wrong repository, absent route evidence, or candidate self-authorization: `incomplete` or `ineligible`; never acceptance.
- Host API denial, including plan-restricted HTTP 403: enforcement is `unavailable`; an enforced route fails closed. Only a preselected advisory policy may produce an advisory result, without claiming host enforcement or transition.
- A changed or deleted v0.5 G0 tag ref after verification does not retroactively change the historical result under its existing contract. A future run must observe and validate the current mapping. Do not claim that a later merge was prevented by that old result.
- For `OWNER_AMENDMENT`, if bound evidence becomes invalid before the protected canonical transition, the transition cannot be accepted. Re-run or reauthorize with new identities as the adopted contract requires.
- A green workflow check without host-rule evidence establishes only that the workflow reported success. Without a separate transition receipt, canonical transition remains `not_verified`.
- Gatekeeper/API/model failure never causes a policy downgrade. A human or separately authorized administrative exception remains external to the Gatekeeper verdict and must not be recast as a successful check.

## Focused validation plan if adopted

### Deterministic tests

- Preserve a v0.5 fixture byte-for-byte and verify its legacy G0 meaning is unchanged.
- Validate each assurance field independently, including unavailable and unknown states; reject reports that treat a green check or configuration snapshot as proof of canonical transition.
- Simulate host API 403, timeout, missing permissions, malformed policy readback, missing required-check identity, and unknown bypass scope. Enforced mode must remain incomplete; preselected advisory mode must report only advisory fields.
- Prove no dynamic fallback from enforced to advisory, no candidate self-enabling or self-weakening policy, and no acceptance under a stale base/head or missing/partial Authority Set.
- Verify that v0.5 G0 binds tag ref state at verification time, while `OWNER_AMENDMENT` freshness remains required through canonical transition.
- Reject a legacy record presented as a new version and a new advisory report presented as protected acceptance.

### Host E2E

- On a supported repository/plan, observe the protected rule and its target, required check/producer, bypass scope and timing; attempt a controlled ineligible candidate and demonstrate the host blocks its canonical transition. Separately read back the resulting canonical revision for a qualifying candidate to produce a transition receipt.
- On a private repository where the host API denies rule inspection with 403, run only the explicitly adopted advisory path. Confirm report status is advisory, enforcement and canonical transition are unverified, and no required acceptance signal is emitted.
- Exercise a change between green check and transition (evidence, policy, tag ref, or required-check state as applicable) and prove the enforced path revalidates or prevents transition. Keep G0's existing limited freshness claim separate from the stronger `OWNER_AMENDMENT` transition contract.

No route should be enabled until owner approval, deterministic tests, and the relevant host E2E are complete. Issues [#119](https://github.com/flair-agency/architecture-gatekeeper/issues/119) and [#120](https://github.com/flair-agency/architecture-gatekeeper/issues/120) remain separate required work for the referenced LIVE Agency trial.
