# OWNER_ADDITION adoption without verified host enforcement: use-case evaluation (#121)

**Status: owner decisions accepted; canonical amendment proposed in PR #129.**
This record evaluates the v0.5.1 consumer scenario. The normative contract is
[`docs/architecture.md`](../architecture.md); the amendment has effect only
after adoption into the canonical branch. This investigation does not activate
the route or claim release readiness.

## Observed consumer constraints

- `flair-agency/live-agency` is a private repository. Its branch-protection
  request returned a plan-restricted HTTP 403 during the v0.5.1 trial.
- [A, PR #106](https://github.com/flair-agency/live-agency/pull/106) is open and
  draft. [B candidate, PR #112](https://github.com/flair-agency/live-agency/pull/112)
  is open and currently cannot satisfy the single-file missing-decision
  addition contract: it asserts completed work and conflicts with an existing
  allocation rule. No case below claims that B is presently eligible.
- The repository currently permits merge commits, squash merges and rebase
  merges. A v0.5.1 route can select a narrower supported subset, but it must
  state that limit before use.
- The accepted #119 extension keeps B's edit to one authority file while both
  reviews use the complete previous-base Authority Set. #120's legacy v1
  PR-head authority defect remains an independent rollout blocker.

## Cases and claims

In this table, *canonical placement* means observed Git/authority state; it
does not itself mean valid governance adoption. `Verified` means evidence for
the stated claim is checked, not that owner identity is authenticated.

| Case | Procedure eligibility | Canonical placement | Valid OWNER_ADDITION adoption | Host enforcement |
| --- | --- | --- | --- | --- |
| 1. #106 predecessor B is eligible, then normally merged and read back on Free private | eligible for exact B | verified for exact adopted content | verified only if the selected G0 adoption procedure and transition binding are established | unavailable |
| 2. B is eligible but not merged | eligible | pending / not observed | pending, never inferred from green | unavailable |
| 3. B is ineligible but merged | ineligible | may be verified as a Git fact | **invalid as OWNER_ADDITION**; this is an irregular canonical change | unavailable |
| 4. Same valid B on a host with a proven required check | eligible | verified after readback | same substantive adoption as case 1 | verified only with exact target/check/producer/bypass evidence |
| 5. H1 was reviewed but H2 or different authority bytes were merged | H1 eligible; H2 needs its own evaluation | H2 may be canonical | H1 adoption **not verified**; equal PR number is insufficient | independent |
| 6. Eligible B is squash merged | eligible for B head H | result S may contain the same authority bytes despite H not being its ancestor | depends on an explicit H-to-S integration proof; digest equality alone is insufficient | independent |
| 7. Authenticated principal without host rule, or G0 under a host rule | depends on each exact B | independently observed | decided by the selected procedure | independent of principal authentication |

Case 3 is the key counterexample to treating a merge or canonical readback as
adoption. Case 2 prevents treating a green pre-merge check as adoption. Case 5
requires exact candidate binding. Case 6 shows why commit identity and adopted
content identity are different.

## Candidate meaning of the result

The cases support four separate questions:

1. **Eligibility:** Did the exact B satisfy the recorded-base-selected G0
   procedure, including tag, decision ID, scope and complete Authority Set
   review? This can be checked before merge.
2. **Adoption:** Did the selected procedure for adopting that eligible B occur?
   This requires a definition of the adoption act and its evidence; neither a
   green check alone nor a merge alone suffices.
3. **Canonical placement:** Did the proposed authority state from that exact
   candidate enter the named target's canonical history, and what is present
   at a recorded readback time? This can be checked after merge even if host
   enforcement was not verified.
4. **Assurance:** Which actor, claim, policy protection, host enforcement and
   timing facts were actually verified? Existing G0 does not authenticate the
   tagger/pusher/owner. Unverified host enforcement does not answer questions
   1–3, and a successful merge does not answer the host-enforcement question.

A pre-merge result therefore cannot state that B is already adopted or
canonical. A post-merge record may state procedural G0 adoption only if it
validates the exact-B eligibility result from before merge, including producer
and time, the supported ordinary merge-commit relationship, and canonical
readback. It must still report
`principalAuthentication=not_verified` and
`hostEnforcement=unavailable|not_verified` where applicable. An ineligible B
that was merged can have verified canonical placement and invalid or unverified
OWNER_ADDITION adoption at the same time.

## Evidence boundary and implementation options

The G0 annotated tag is an immutable object binding exact B and the missing
decision, but its actor is unverified and its ref is mutable. It is procedural
evidence without proving that a named owner acted. The accepted procedure
requires that tag, a bound eligible pre-merge result with verifiable producer
and time, an ordinary PR merge commit whose ordered parents are recorded base
and exact B and whose tree equals B's tree, and a later canonical readback
bound to the observed target ref. A post-merge rerun cannot substitute for
proof that eligibility existed before merge. The new route must not silently
upgrade historical v0.5 results or treat arbitrary saved green text as proof.

For canonical placement, the selected first adapter requires an ordinary
merge commit M with exact recorded base and B as ordered parents, B's tree as
M's tree, and an observed target T containing M and the proposed authority
bytes. This directly covers case 1 because LIVE Agency allows merge commits.
It deliberately reports case 6 as unsupported, not as a failed adoption in
principle. Squash/rebase support needs a separate exact integration proof that
binds B's identity, before/after authority bytes, host merge result and target
readback. `PR.merged=true` or matching authority digests alone cannot establish
that mapping. The selected v0.5.1 release scope is merge-commit integration;
[Issue #130](https://github.com/flair-agency/architecture-gatekeeper/issues/130)
tracks the later squash/rebase contract.

## Owner decisions recorded

The owner accepted all four decisions. The proposed canonical amendment in
`docs/architecture.md` records them:

1. The exact-B G0 tag, pre-merge eligibility result, ordinary PR merge and
   post-merge canonical readback form the procedural adoption evidence.
2. v0.5.1 supports merge commits first. Squash and rebase require a later
   integration-proof contract.
3. Before merge, report
   `eligibility=eligible, adoption=pending, canonical=pending`; a permanent
   `ADVISORY_ONLY` classification is not required for this route.
4. The final adoption record verifies that eligibility for exact B existed
   before merge, including its producer and time.

Owner authentication and host enforcement remain independent assurance
dimensions and must be reported as unverified or unavailable when that is
what the evidence supports.

The route remains inactive until implementation, focused verification and
the representative LIVE Agency end-to-end sequence are complete.

The remaining implementation work is to replace the draft #123 route, finish
#120, and verify cases 1–5 plus the declared case-6 limit. The v0.5.1 release
still requires the real sequence
`#106 OWNER_DECISION -> eligible B -> B adoption -> B canonical -> #106 fresh
review` without forced merge. The consumer owner must separately resolve
#112's existing-rule conflict and completed-work assertion before B can pass.
