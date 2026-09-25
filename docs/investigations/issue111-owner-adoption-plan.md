# Issue #111: missing-decision adoption plan

This is an implementation plan, not an enabled acceptance policy. The owner
direction and target boundary are in [`../architecture.md`](../architecture.md).
The live state of Issue #111 and related pull requests must be read back before
changing or closing them.

## Why the current path stalls

Protected CI reads authority from the protected base. An implementation change
A cannot resolve its `OWNER_DECISION` by adding a decision to A's head. Moving
that text to a predecessor B prevents A from using its own proposal, but B may
also be unresolved. In the live-agency example, predecessor B additionally
asserted that migration and cutover were complete while the protected status
still described them as unselected and unverified. A new adoption route must
resolve the governance loop without treating that completion claim as a fact.

## First usable slice

1. The consumer's *previous* protected policy names the authority scope,
   approved addition purpose, authorized owner principals, evidence route and
   required assurance. Its candidate change cannot opt itself in.
2. Prepare a separate B containing only an eligible missing-decision addition
   and permitted authority consistency updates. Identify each purported fact
   of completed work separately. A conflicting existing rule or unsupported
   completion claim makes B ineligible for this slice.
3. Produce a versioned `AdditionClaim` bound to repository, previous base and
   policy, exact B revision, previous/proposed authority digests, purpose and
   scope. A later `AuthorizationReceipt` binds the exact claim digest to the
   authorized principal and immutable approval event. Neither a PR's approval
   summary nor a statement in B substitutes for this receipt.
4. A protected verifier checks eligibility, record provenance, authorization,
   current base/head and revocation. It reports an adoption result for B, not a
   semantic `PASS` for B or A. No credential-bearing job executes candidate
   code or package lifecycle scripts.
5. The host integration must keep the verified bindings valid until B becomes
   canonical. Test the interval after a green check and before merge; a
   successful check alone is not proof that a later transition used the same
   authorization and exact claim.
6. Read back B's canonical commit. Update A to the new base and run a fresh
   review and acceptance check. The old `OWNER_DECISION` stays in the record.

The authorization event source, principal verification adapter, revocation
source and host transition mechanism are still unselected. The first technical
probe must prove exact-claim approval and transition-time freshness with the
chosen host. Until then this remains an inactive contract.

## Proof gates

- Accept an authorized, exact, in-scope addition B and return A to review.
- Reject candidate self-enablement, an unrelated owner, a different claim or
  B revision, changed base/policy/authority, and revoked authorization.
- Reject implementation or verifier changes mixed into B, an existing-rule
  change disguised as an addition, and unsupported completion claims.
- Reject missing, forged, stale or unavailable producer and identity evidence.
- Demonstrate that changes after check success cannot authorize the later
  canonical transition; if the host cannot enforce this, do not enable route.
- Keep failure of a required service fail closed. Do not substitute `G0` or an
  administrator bypass for the selected owner authorization assurance.

The original live-agency B is a negative fixture: its owner decision and
migration-completion assertion must be evaluated separately. A corrected B
that adopts a prospective responsibility decision while retaining existing
migration safeguards is the positive fixture. A still needs evidence of
completed migration if its own acceptance depends on that fact.

## Order and closure

1. Correct the current runbook and README without claiming an active route.
2. Review and adopt the target contract in `docs/architecture.md`.
3. Prove the host's authorization and transition ordering in a bounded probe.
4. Implement the minimal record schema, pure verifier and protected adapter,
   with focused negative tests. Keep routing disabled until the probe passes.
5. Align CLI, Skill and CI reporting, then dogfood local/manual, installed
   package and protected CI paths in this repository and a consumer.
6. Close #111 only after an owner can adopt a repaired B through the normal
   protected route and A receives a fresh review. Issue #20 remains open for
   broader evidence routes. Historical-`BLOCK` work in #75/#78 and draft PR
   #107 follows with its separate eligibility and evidence requirements.

An initial policy adoption cannot authorize itself. Record the one-time use of
the existing owner-controlled process to bootstrap the route. Later use of an
administrative exception remains explicitly outside Gatekeeper acceptance.
