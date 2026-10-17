# BLOCK profile production child-main coverage for #254

This bounded test-only increment follows merged baseline
`8c23c4d041dcfd4a84c7a57ec8b2c1a8e211bd13` and the independent capacity
change. It changes no production source, selected policy or authority.

The earlier [remaining-boundary inventory](2026-10-18-quality254-remaining-boundaries.md)
identified that `completed-block-v1` had component composition, while only
`completed-owner-decision-self-v1` ran the production merge-group child CLI.
Both profiles are already implemented and predecessor-selected. This change
runs the existing child trace for each, with a profile-specific decision oracle.

| Invariant | Actual retained production boundary/test | Evidence limit |
| --- | --- | --- |
| Exact profile dispatch and decision | Both profile parents in `test/owner-amendment-merge-group-route-composition.test.mjs` now execute `scripts/owner-amendment-merge-group-gate.mjs` and nested preparation as real child processes, retaining their separate component projections. | Synthetic GitHub/gh/artifact/attestation observations; no live model or authenticated provenance. |
| Required runtime and evidence/receipt rejection | The same child trace rejects the wrong checked-out base, receipt B, missing/expired artifact, attempt disagreement, and missing tag with a successful signer. Each rejection asserts empty stdout and workflow output. | Controlled normal/rejecting fixture traces, not every component's rejection matrix or a live protected queue. |
| Existing ordinary dispatch | No signer plus missing exact-B tag still selects ordinary with exact stdout/workflow outputs, no amendment preparation, attestation or artifact acquisition; valid amendment replay follows restoration. | Dispatch is not completed ordinary review or adoption. |
| Pre-transition result | Both profiles assert their own BLOCK/OWNER_DECISION result and pending adoption/canonical placement. | Neither trace proves protected T2 transition, canonical readback, ACTIVE, bootstrap, recovery or external-consumer support. |

The BLOCK fixture now includes the same current source/emitted runtime as the
OWNER_DECISION fixture so its exact checked-out-base guard runs normally.
No injected VERIFIED result replaces the child-main trace. Existing synthetic
component projections remain explicitly labeled and retained.

Focused/full timing, selected isolated defect-detection controls, package and
current-head review/CI results belong to the delivery PR verification record.
This source note does not relabel earlier test observations or claim whole
Issue #254 completion. The broader supported-tuple/migration inventory and
live-host/consumer/lifecycle proofs remain under their existing owning issues.
