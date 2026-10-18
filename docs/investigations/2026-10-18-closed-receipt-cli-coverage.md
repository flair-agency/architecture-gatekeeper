# Closed eligibility receipt shape at the merge-group CLI boundary

This partial #254 test increment starts from adopted source baseline
`b2633798c208548c7112398cbf2c54493b6982ea`; any intervening adopted test-only
increments and final verification revisions are identified in the delivery PR.

The production child trace now includes one closed-shape rejection for each already-supported trigger profile. The case adds an unknown field to otherwise valid canonical eligibility receipt JSON, rebuilds the artifact ZIP, and updates the artifact size and digest in both listing and detail responses. The controlled attestation fixture computes its subject digest from the supplied bytes, allowing production acceptance to reach `validateOwnerAmendmentSemanticEligibilityReceipt` and reject the unknown field.

The child assertion checks the validator diagnostic, empty stdout, and empty `GITHUB_OUTPUT`. It then restores the valid artifact and replays the child successfully. Existing exact-B receipt binding coverage remains separate.

This exercises process/output composition for a closed-shape invariant enforced
by the existing production validator. The artifact, GitHub API, and attestation
observations remain controlled fixtures; this does not establish live provenance,
host enforcement, or protected adoption. Production code, policy, profiles,
authority, CodeQL models/settings and acceptance routes are unchanged.

The focused Node 22.23.3 suite passes all eight cases in 26.230 seconds, with
zero failures, cancellations or skips. Both profile traces reuse their existing
fixture and retain the exact-B negative. The added rejection and restored valid
replay add assertions inside those traces rather than another test case.

An isolated detection control disables only the two closed-key guards inside
the receipt validator, in copied source and emitted modules. The creation guard
and all other receipt identity/digest/canonical checks remain. Both guards are
relevant because acceptance constructs the expected receipt by spreading the
parsed receipt before overriding protected fields. The prior suite still passes
8/8 against this copy; the new assertion fails for both profiles because the
child no longer rejects the extra field. The temporary copy is removed and no
repository runtime file is mutated. This is a selected ordinary regression
control, not an exhaustive mutation or security assessment.

Final-head full-suite, distribution identity, CodeQL, independent reviews and
protected CI results belong to the PR. #254 remains open for further measured
test costs, justified redundancy mapping and its separate lifecycle/consumer/
live-host/adoption/readback obligations.
