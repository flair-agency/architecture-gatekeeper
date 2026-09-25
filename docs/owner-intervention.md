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
2. The accountable owner makes the architecture decision and records it in
   canonical authority through a process permitted by the consumer's existing
   policy. When protected CI reads authority from the protected base, a
   proposed implementation change (A) cannot resolve its own review by adding
   authority only to A's head; that authority must become canonical before A
   receives a fresh review. Whether the authority change (B) must be separate
   and what other files it may include depend on the consumer's existing
   policy; this runbook does not impose a universal authority-only rule.
3. Evaluate B under the existing policy. B may itself return `OWNER_DECISION`
   or `BLOCK`; the historical-`BLOCK` `OWNER_AMENDMENT` route does not cover
   `OWNER_DECISION`, and this runbook does not provide B a new acceptance
   route. If B cannot proceed under existing policy, the governance question
   remains unresolved. Issue #111 describes this adoption gap; this runbook
   does not resolve it.
4. Once B actually becomes canonical, update A to that base and request a fresh
   Gate review. Merge A only if the fresh review and protected acceptance
   policy permit it. That review may identify a different unresolved choice.

A review comment or workflow approval alone does not record canonical
architecture authority. A repository owner may use an existing, owner-authorized
administrative exception where repository governance permits it. Such an
exception remains outside Gatekeeper's result and must not be described as
`PASS` or satisfy the Gatekeeper acceptance check. If it allows a change to
merge, record that separately under the repository's administrative process.

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
