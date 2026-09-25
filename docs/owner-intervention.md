# Owner intervention for Architecture Gate

Architecture Gate reports the result of its configured review and protected-base
acceptance policy. A failed or incomplete run is not a `PASS`. The repository
owner may need to act, but the action depends on the cause. This runbook is
operational guidance; each consumer's canonical architecture and repository
administration rules remain authoritative.

## OWNER_DECISION

`OWNER_DECISION` means the reviewer found an architecture choice that the
consumer's canonical authority does not resolve. The current run cannot accept
the change.

1. Read the decision and identify the unresolved responsibility or boundary.
2. The accountable owner makes the architecture decision and records it in a
   separate, authority-only predecessor change (B) in the consumer repository's
   canonical authority. Do not rely on an authority addition in the proposed
   implementation change (A): protected CI reads authority from its protected
   base, so A's head cannot authorize itself.
3. Review and merge B under the repository's existing protected acceptance
   rules. B is not an `OWNER_AMENDMENT` recovery: that route is for a prior
   `BLOCK`, and `OWNER_DECISION` is ineligible. Do not assume B will receive
   `PASS` or introduce a special acceptance route for it. If existing policy
   does not permit B to be accepted, stop and resolve that governance issue
   through the repository's established owner process; do not bypass the Gate
   or treat B's proposed authority as already adopted.
4. After B is accepted and becomes canonical, rebase or update A onto the new
   base. Remove a duplicate head-side authority addition if one was included,
   then request a fresh Gate review of A against the updated protected base.
5. Merge A only after the fresh authoritative result permits it. The new review
   may return `PASS`, `BLOCK`, or another `OWNER_DECISION` for a different
   unresolved choice.

A PR comment, workflow approval, or merge bypass does not record canonical
architecture authority. Bypassing the check is not the normal resolution for
`OWNER_DECISION`.

## CI review unavailable

An `ERROR` report means the review or its policy processing did not complete
successfully. It does not identify the cause by itself. Inspect the linked
Actions run first. API credit or billing exhaustion, model or service outage,
and credential failures are examples of review infrastructure problems; an
invalid policy or malformed decision may require a repository fix instead.

If the owner establishes that review infrastructure is unavailable and chooses
to accept the current change before service is restored:

1. Confirm the failure is not a semantic `BLOCK` or unresolved
   `OWNER_DECISION`, and record the relevant Actions run.
2. Where available and useful, run the installed exact-version local or manual
   Architecture Review. Check its `reviewedRevision` against the revision being
   accepted. A local `PASS` is development feedback, not authoritative merge
   evidence under the current CI policy.
3. Record the infrastructure cause, the accepted PR head revision, any local
   review result and its revision, and the owner's reason for accepting the
   exception in the PR.
4. If repository rules permit it, the owner or administrator explicitly uses
   the repository's merge bypass mechanism. If they do not permit bypass,
   restore the service and rerun the Gate.

The Architecture Gate check remains failed. The audit record must say that the
owner accepted a change despite an unavailable Gate; it must not claim that
Gatekeeper returned `PASS`. This is a human acceptance exception outside the
Gatekeeper evidence contract. Service failure never activates a weaker route
in protected policy. A semantic `BLOCK` is excluded from this procedure.
