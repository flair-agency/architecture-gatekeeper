# Issue #111: missing-decision adoption plan

The OWNER_ADDITION / G0 implementation exists, but this plan is not an enabled
acceptance policy. The route is available only when the previous protected
consumer policy explicitly selects it; this repository's current self policy
leaves it inactive. The owner direction and contract are in
[`../architecture.md`](../architecture.md).
The live state of Issue #111 and related pull requests must be read back before
changing or closing them.

## Why the current path stalls

Protected CI reads authority from the protected base. An implementation change
A cannot resolve its `OWNER_DECISION` by adding a decision to A's head. A
predecessor B can carry the missing architecture decision, but under current
acceptance policy B may itself remain unresolved or be blocked. The target
route below addresses this governance loop without asserting that unrelated
work was completed.

## Minimal OWNER_ADDITION / G0 route

1. The consumer's **previous protected-base policy** explicitly opts in and
   identifies the authority in scope. The previous protected Authority Set
   contains exactly one `self` member whose path matches the selected
   authority. B cannot enable the route for itself.
2. B contains only the missing architecture decision being added to that
   authority. It does not amend an existing rule, include implementation or
   workflow changes, or claim that work was completed. Unrelated findings,
   contradictions or unresolved decisions make B ineligible.
3. The completed ordinary `OWNER_DECISION` carries a protected structured
   `ownerDecisionId`. Create a deliberate annotated Git tag object whose
   versioned `AdditionRecord` has `missingDecision.id` equal to that ID and
   targets B's exact commit. B-specific eligibility review verifies the ID
   match and checks that B adds that unresolved choice without conflicting
   with existing authority. The tag record is a claim; the pure procedure
   verifier does not infer its semantic validity from text.
4. The verifier checks the tag object bytes and records its object OID with the
   B revision, previous protected base/policy and authority state. The OID
   identifies immutable object bytes; the remote tag ref is mutable. Reading
   the ref confirms its mapping only at that time and does not prove that it
   cannot later move or be deleted. A historical `BLOCK` ReviewRecord is not
   required, and this route does not require retaining a reusable historical
   review artifact.
5. The protected verifier emits a distinct `OWNER_ADDITION / G0` result for B.
   It does not require a historical `BLOCK` ReviewRecord, an authenticated
   exact-claim receipt, an identity provider or a revocation service. G0 makes
   no claim that the tagger, pusher or owner was authenticated. It also makes
   no guarantee that a post-check tag-ref change invalidates a green result.
   Missing, stale or unverifiable inputs and required service failures remain
   incomplete/fail closed; no untrusted B code or package lifecycle script
   runs in a credential-bearing job.
6. After B actually becomes canonical, update A to the new protected base and
   run a fresh review and normal acceptance check. A's prior `OWNER_DECISION`
   remains unchanged as historical evidence; G0 does not accept A.

The original live-agency B is an ineligible negative case because it asserted
that migration and cutover were complete while protected authority still
described them as unselected and unverified. It is a work-completion claim,
not the missing architecture decision. A repaired B may add the prospective
responsibility decision only; A still needs evidence of completed migration if
its own acceptance depends on that fact.

## Proof gates

- Accept only a previous-policy-enabled, exact, in-scope missing-decision B
  with exactly one matching `self` Authority Set member and an annotated tag
  object bound to its exact commit and `ownerDecisionId`.
- Reject candidate self-enablement, tag objects targeting another commit,
  changed policy/base/authority/B, changes to existing rules, implementation
  or workflow changes, unsupported completion claims, contradictions and
  unrelated unresolved choices.
- Verify that reporting distinguishes `OWNER_ADDITION / G0` from semantic
  `PASS` and preserves A's prior `OWNER_DECISION` unchanged.
- Keep untrusted code and package lifecycle scripts out of credential-bearing
  jobs; missing or invalid evidence and required service failure fail closed.
- Document and test the limited G0 claim: exact annotated tag object and
  point-in-time ref mapping are verified, tag actor identity is not, and no
  post-green ref-mutation guarantee is claimed.
- After B is canonical, require a fresh review of A under the new base. Keep
  A's earlier `OWNER_DECISION` unchanged.

## Order and closure

1. Keep the route inactive in this repository's current protected policy.
2. Complete code review and fixture E2E for the implemented G0 record,
   verifier, previous-base policy selection and protected reporting path.
3. For first-time policy adoption, use only the authorized one-time
   owner-controlled administrative exception after those review and E2E gates;
   record that exception separately from Gatekeeper acceptance. The candidate
   policy does not authorize itself.
4. Release the reviewed implementation and adopt the policy through the
   consumer's protected process. Do not claim release or activation before
   those steps complete.
5. Close #111 only after an eligible B can become canonical through the
   selected protected route and A receives a fresh review. Broader evidence
   routes remain tracked separately under Issue #20. Historical-`BLOCK`
   `OWNER_AMENDMENT` work in #75/#78 and draft PR #107 retain their separate
   eligibility and evidence requirements.

The route's G0 result is a procedural protected acceptance under the
consumer's prior policy. It is not a claim of authenticated owner identity.
Existing owner-authorized administrative exceptions remain governed by the
consumer and outside Gatekeeper results.
