# Self reference and rollout contract

This is a required normative member of the Architecture Gatekeeper self
Authority Set. Read it with the [shared contract](../architecture.md) and every
other selected member. It does not infer a consumer's architecture or policy.

## Self amendment route

The self repository uses the single [protected ordinary-PR amendment
procedure](owner-amendment.md#self-owner-amendment-through-an-ordinary-protected-pr).
That contract's old-Policy selection and complete Authority Set govern
eligibility. The same protected Actions PR validates the exact
base/head/test-merge, authority-only diff, and seven-question semantic
eligibility result. The ordinary review's
`PASS` remains refused while B is pending.

The owner approves and merges the eligible PR under existing repository
controls. Canonical readback verifies the actual target, resulting Authority
bytes, and base/tree relationship; a squash merge is supported when the
readback proves the expected test-merge tree. Report adoption after successful
readback. Re-review A against the new canonical Authority when A exists.

No separate App/Queue self adoption, historical trigger, tag, attestation, or
portable evidence custody is required. The source and check-identity limits
are described in the owner amendment contract.
This self procedure does not enable a consumer route or establish broader
consumer support.

## Dogfooding and change discipline

### Development sequence and v0.6.0 self reference profile (owner decision)

Keep public local/native review and explicitly selected Preview procedures
usable under their existing semantics. Preview feedback does not become
protected self-amendment eligibility or adoption. A clean consumer installation
does not depend on legacy self-amendment formats or evidence. Existing release
scope, release-history cleanup, and other consumer assurance requirements stay
in their own records and processes.

For shared changes, review the affected responsibility and trust boundary,
implement the smallest conforming mechanism, and exercise the affected path
before wider rollout. Use CI as an independent acceptance check, not as the
first design review.
