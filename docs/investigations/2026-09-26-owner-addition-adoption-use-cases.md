# OWNER_ADDITION adoption without verified host enforcement: use-case evaluation (#121)

**Status: proposal for owner decision.** This record evaluates the v0.5.1
consumer scenario. It does not amend [`docs/architecture.md`](../architecture.md)
or activate a new route. The earlier #121 advisory-only decision remains the
normative contract until the owner selects a replacement and it is recorded
there.

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
canonical. A post-merge record could state procedural G0 adoption only if it
validates both eligibility and the selected adoption act for exact B and
verifies canonical placement. It must still report
`principalAuthentication=not_verified` and
`hostEnforcement=unavailable|not_verified` where applicable. An ineligible B
that was merged can have verified canonical placement and invalid or unverified
OWNER_ADDITION adoption at the same time.

## Evidence boundary and implementation options

The initial G0 annotated tag is an immutable object binding exact B and the
missing decision, but its actor is unverified and its ref is mutable. It can
be the selected procedural artifact without proving that a named owner acted.
The owner must decide whether that artifact, a pre-merge eligible result and a
normal PR merge constitute the G0 adoption act. If the product claims that an
eligible check existed *before* the merge, it needs bound run/producer/time
evidence; a post-merge rerun can establish eligibility at its own observation
time but cannot invent that earlier fact. The new route must not silently
upgrade historical v0.5 results or treat arbitrary saved green text as proof.

For canonical placement, a narrow first adapter could require an ordinary
merge commit M with exact recorded base and B as ordered parents, B's tree as
M's tree, and an observed target T containing M and the proposed authority
bytes. This directly covers case 1 because LIVE Agency allows merge commits.
It deliberately reports case 6 as unsupported, not as a failed adoption in
principle. Squash/rebase support needs a separate exact integration proof that
binds B's identity, before/after authority bytes, host merge result and target
readback. `PR.merged=true` or matching authority digests alone cannot establish
that mapping. The choice is a release-scope decision, not something the
implementation should infer.

## Decisions requested of the owner

1. **Adoption act:** For G0 where required checks are not verified, is a valid
   exact-B annotated tag + bound eligible pre-merge Gate result + ordinary PR
   merge + verified canonical readback sufficient to call B adopted through
   `OWNER_ADDITION / G0`, while explicitly saying owner identity and host
   enforcement were not verified? Recommended **yes** for v0.5.1. If the
   pre-merge result's provenance cannot be verified, report adoption
   incomplete rather than substituting a post-merge rerun silently.
2. **Merge method:** May v0.5.1 support merge commits first, with squash and
   rebase integration proof as follow-up? Recommended **yes** for the shortest
   #106 E2E, since LIVE Agency permits merge commits. Case 6 remains a valid
   future use case and must not be described as conceptually invalid.
3. **Result vocabulary:** Should pre-merge report an `OWNER_ADDITION` candidate
   with `eligibility=eligible, adoption=pending, canonical=pending`, and the
   post-merge result update those independent states, instead of creating a
   permanent `ADVISORY_ONLY` class? Recommended **yes**. Historical G0 results
   keep their original meaning; the new policy/report versions are explicit.
4. **Pre-merge proof:** Must the completed adoption record verify that an
   eligible check for exact B existed before merge, including its producer and
   time, rather than relying only on a post-merge rerun? Recommended **yes**
   because the #106 use case says the owner sees B's G0 result before adoption.
   A later rerun can still diagnose the state, but must be labeled as later.

After these decisions, amend canonical architecture first, then replace the
draft #123 route, finish #120, and prove cases 1–5 plus the declared case-6
limit in focused tests. The v0.5.1 release still requires the real sequence
`#106 OWNER_DECISION -> eligible B -> B adoption -> B canonical -> #106 fresh
review` without forced merge. The consumer owner must separately resolve
#112's existing-rule conflict and completed-work assertion before B can pass.
