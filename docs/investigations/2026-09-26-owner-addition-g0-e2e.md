# OWNER_ADDITION / G0 fixture E2E (Issue #114)

This report records the v0.5 fixture exercise for the `OWNER_ADDITION / G0`
contract in [`docs/architecture.md`](../architecture.md#owner_addition--g0-route-for-missing-decisions-issue-111).
It is evidence about the synthetic fixture only; it does not claim adoption by
the live-agency consumer or release of v0.5. See [Issue #114](https://github.com/flair-agency/architecture-gatekeeper/issues/114).

## Fixture and outcomes

The public [`architecture-gatekeeper-v05-fixture` repository](https://github.com/flair-agency/architecture-gatekeeper-v05-fixture)
has branch protection on `v05-e2e`, with `architecture-gate / accept` required.
The fixture uses synthetic authority and changes.

| Change | Evidence | Outcome |
| --- | --- | --- |
| Earlier candidate B | [PR #3](https://github.com/flair-agency/architecture-gatekeeper-v05-fixture/pull/3) | Rejected by the separate eligibility review: removing the old permission or retaining it beside the new decision was judged ineligible. |
| A′, before B | [PR #5](https://github.com/flair-agency/architecture-gatekeeper-v05-fixture/pull/5), [run 36218891573](https://github.com/flair-agency/architecture-gatekeeper-v05-fixture/actions/runs/36218891573) | Semantic `OWNER_DECISION`; A′ was not accepted. |
| B′, eligible authority addition | [PR #6](https://github.com/flair-agency/architecture-gatekeeper-v05-fixture/pull/6), [run 36219201636](https://github.com/flair-agency/architecture-gatekeeper-v05-fixture/actions/runs/36219201636) | `OWNER_ADDITION / G0` accepted under the fixture's previous protected policy. The annotated tag object OID was `f7ef46fb4c0d8b654a809e39e0b176c5271c46ff`. B′ then merged normally at `00401a3`. |
| A′, rebased after B′ | [PR #5](https://github.com/flair-agency/architecture-gatekeeper-v05-fixture/pull/5), [run 36219396555](https://github.com/flair-agency/architecture-gatekeeper-v05-fixture/actions/runs/36219396555) | Fresh semantic review returned `OWNER_DECISION` again. A′ remains not `PASS` and not accepted. |

A later attempted A-conformance run did not reach semantic review: the Codex
Action reported `Quota exceeded. Check your plan and billing details.` before
producing a decision. The wrapper subsequently reported a `sudo` child exit,
which was a consequence of the Codex failure, not the root cause. This is an
API availability failure, not a completed A result.

## Audit trail and limits

The audits of live-agency [PR #106](https://github.com/flair-agency/live-agency/pull/106)
and [PR #112](https://github.com/flair-agency/live-agency/pull/112)
found no extractable pure missing decision in the live-agency proposal. The
26-line addition duplicated the existing Scouting versus Management distinction
in [`docs/domain/model.md`](https://github.com/flair-agency/live-agency/blob/main/docs/domain/model.md#L402-L422),
conflicted with its Asia/Tokyo whole-session start-date allocation rule
([same source, lines 412–415](https://github.com/flair-agency/live-agency/blob/main/docs/domain/model.md#L412-L415)),
and asserted private preservation and Provider cutover completion while
[`docs/migration/status.md`](https://github.com/flair-agency/live-agency/blob/main/docs/migration/status.md#L120-L134)
still recorded them as unresolved. Those proposals therefore were not used as
fixture authority. Instead, following the owner's separate decision for this
synthetic fixture, its canonical authority says the fixture release pipeline
owns generating and publishing release notes. That fixture decision assigns
no responsibility to the live-agency service. The normative G0 scope and
claims remain defined by [`docs/architecture.md`](../architecture.md#owner_addition--g0-route-for-missing-decisions-issue-111)
and the procedural checklist in [`issue111-owner-adoption-plan.md`](issue111-owner-adoption-plan.md).

The repository's local suite reported 143 passing tests. The fixture E2E
demonstrates the G0 path and the required fresh A review; it does not make G0 a
semantic `PASS` for B or A. As specified by the canonical contract, the tag OID
identifies exact annotated-tag bytes, while the remote tag ref is mutable and
only its mapping at verification time is observed. G0 does not authenticate
the tagger, pusher, or owner, and does not guarantee that later ref movement or
deletion invalidates a green check. The exercise establishes no live consumer
adoption, release, or completion of A.
