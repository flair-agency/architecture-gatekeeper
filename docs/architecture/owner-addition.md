# Owner addition contract

This is a required normative member of the Architecture Gatekeeper self Authority
Set. Read it with the [shared contract](../architecture.md) and every other
selected member; topic separation supplies no implicit precedence or route
activation. Setup and operating guidance are in the [documentation map](../README.md).

### OWNER_ADDITION / G0 route for missing decisions (Issue #111)

`OWNER_DECISION` for a missing architecture decision rejects Change A until
that decision becomes canonical and A receives fresh review. A consumer may
separately select predecessor-B `OWNER_ADDITION / G0`; it is not semantic
`PASS` for A or B and does not erase A's result.

The initial route requires previous protected-base policy opt-in and its
selection of the exact eligible authority path, matching the previous Set's
exactly one `self` member. B may modify only that selected authority file; it
cannot enable or change policy. B adds only the missing decision: no existing-rule
changes, implementation/workflow changes, completion claims, contradictions or
unrelated unresolved choices. Historical BLOCK evidence is not required; this
route differs from OWNER_AMENDMENT.

A completed ordinary `OWNER_DECISION` carries protected `ownerDecisionId`.
The versioned tag `AdditionRecord` binds `missingDecision.id` to that ID.
B-specific semantic eligibility verifies the match and that B adds the missing
choice without contradiction or unrelated unresolved choices. The pure G0
artifact verifier checks binding, not semantic properties inferred from text;
no historical BLOCK or reusable historical review artifact is required.

A deliberate annotated Git tag targets exact B and binds selected authority,
missing decision and `ownerDecisionId`. The verifier checks tag-object bytes,
computes/records OID, confirms B, and records verification policy and authority
state. OID identifies exact object bytes; reading the mutable ref proves only
its observed mapping, not protection against later movement or deletion.

G0 is procedural and auditable, not authentication of tagger, pusher or owner,
or proof of tag availability through later transition. It requires no identity
provider, authenticated exact-claim receipt, revocation service or guarantee
that later ref changes invalidate a green check. Required verifier/service
failures fail closed. Privileged credentials cannot reach or execute B's PR
code or package lifecycle scripts.

After B becomes canonical, review A afresh against the new protected base under
normal consumer acceptance policy; BLOCK or another OWNER_DECISION remains
possible. G0 does not accept A. Owner-authorized administrative exceptions stay
outside this result under existing consumer governance.

The deterministic verifier and protected reporter are implemented, but the
route requires prior protected-policy selection and all verifier requirements.
This repository's policy does not select it: self-review remains inactive.
First-time policy adoption may use the existing governance's one-time
owner-controlled administrative exception after code review and the fixture
full-cycle E2E below; that exception is neither Gatekeeper acceptance nor route
activation for a review. v0.5.1 release requires the public fixture E2E and
package release checks. Fixture success activates no self or real-consumer
route and settles no consumer architecture or migration status. Work completion
is not a missing decision; owners establish required completion evidence
separately.

### Target multi-document OWNER_ADDITION route (Issue #119 owner decision)

The owner selected the following bounded extension for v0.5.1 on 2026-09-26.
It removes the initial route's single-member Authority Set restriction only
through an explicitly versioned, consumer-selected route. It preserves the
single-file scope of Change B and does not authorize a consumer architecture
decision, an existing-rule amendment, or a work-completion claim.

The previous base policy selects the complete required Authority Set and
exactly one affected `self` member by stable ID and path. That member must use
`authority-revision`; its base bytes come from the same recorded base as the
policy and manifest. B may modify only that existing authority file. B cannot
change the policy, manifest, another authority member, implementation, or
workflow, or enable this route for its own review. An enforced route retains
protected-base selection. The separately versioned recorded-base procedural
route in Issue #121 reports its observed policy protection and host enforcement;
that selection does not relax addition eligibility.

Both the ordinary review of B and its separate addition-eligibility review
must receive every required member of that same base-selected Authority Set.
Same-repository members are immutable base snapshots, and external members
remain the exact consumer-selected snapshots under the existing GitHub
materialization and credential boundary. The eligibility request also receives
the affected member's proposed B bytes and exact base-to-B diff, identified as
candidate evidence rather than existing canonical authority. It must check
the proposed addition against unchanged members as well as the affected
member's existing rules. Links, prompt references, repository discovery,
summaries, and a smaller selected subset cannot substitute for required
authority bytes.

Every completed ordinary semantic decision and every completed B eligibility
result must report exactly the complete selected `authorityIds`. Missing,
duplicate, or extra IDs invalidate that review. A missing, inaccessible,
malformed, unverifiable, or oversized member leaves the procedure incomplete
before semantic review; it cannot be omitted, truncated, sampled, or replaced
by a weaker route. A material conflict among loaded authorities with no
adopted precedence or refinement rule remains an unresolved owner decision.
B must still add only the identified missing decision without changing an
existing rule, introducing a contradiction or unrelated unresolved choice,
or asserting completed work. An ordinary `BLOCK` cannot trigger this route.

The new route uses explicit policy, AdditionRecord, eligibility-schema and
report versions distinct from the initial route. Its tag-bound AdditionRecord
and procedure/report bind the repository, exact base and B commits, selected
policy revision and digest, manifest digest, complete selected-set digest,
affected member ID and path, before/after content digests, and exact missing
decision ID. The report also records every member's repository, resolved
commit, path and content digest, the annotated tag object OID and observed
tag-ref mapping. The ordinary review and eligibility result must be bound to
that same selected-set identity. A stale or mismatched base, head, policy,
set, affected member, decision ID or tag invalidates the procedure. These are
same-run bindings; they do not establish that a model read every byte or
create independently reusable acceptance evidence.

For this new route's ordinary and B-specific review, the versioned
`maxFileBytes` runtime ceiling is 262,144 bytes (256 KiB). The other ceilings
remain 65,536 manifest bytes, 32 members, 524,288 total authority bytes and
1,048,576 complete prompt bytes. The consumer must explicitly select all five
effective limits in the previous base policy. A lower selected limit remains
binding, and B cannot raise its own limit. The complete base set and the set
with the affected member replaced by its proposed bytes must each fit the
selected file and total-content limits. The complete eligibility prompt,
including all base authority bytes, proposed bytes, diff, ordinary result,
tag claim, metadata and instructions, must fit `maxPromptBytes`; exceeding it
leaves the review incomplete. This extension does not raise the limits of
the initial distributed-authority or local/manual routes.

The extension preserves `OWNER_ADDITION / G0` semantics: the annotated tag
binds exact B and its missing decision, principal authentication remains
`not_verified`, the tag-ref mapping is observed at verification time, and no
later canonical transition or continuing tag availability is inferred. B's
governance result is not a semantic `PASS` for B or A. A requires fresh review
after B becomes canonical. Existing v0.5 policy bytes, records, schemas and
historical results retain their original single-member interpretation and
limits; a verifier must reject ambiguous version mixing rather than upgrade
them by reinterpretation.

This target requires implementation, focused negative verification and the
synthetic fixture E2E below for v0.5.1 package release. It does not activate a
real consumer; representative LIVE Agency E2E remains a separate prerequisite.
Issue #120 owns legacy PR-head authority repair; consumer-specific decision
classification and rule amendments cannot replace the fixture A/B lifecycle.

#### v0.5.1 public fixture full-cycle release gate (owner decision)

The public `flair-agency/architecture-gatekeeper-v05-fixture` is the v0.5.1
release E2E. With synthetic data it must demonstrate:

1. Change A receives an ordinary `OWNER_DECISION` with its exact
   `ownerDecisionId`.
2. Authority-only B binds that decision, is assessed against the complete
   selected Authority Set, and reports `eligible` before merge, not semantic
   `PASS` for B or A.
3. The exact eligible B is adopted by an ordinary pull-request merge commit
   whose first parent is the recorded base, second parent is exact B, and tree
   equals B's tree.
4. A post-merge canonical readback verifies that the target contains that
   merge commit and the expected authority state.
5. A is reviewed freshly against the resulting canonical authority and returns
   `PASS` under the fixture's normal review policy.

Issues #119/#121 conditions still apply. A's earlier `OWNER_DECISION` remains
historical; fresh `PASS` is new. Fixture success proves no real consumer's
readiness, policy, owner authorization or host enforcement.

### OWNER_ADDITION adoption and assurance dimensions ([Issue #121](https://github.com/flair-agency/architecture-gatekeeper/issues/121) owner decision)

The scalar `G0` label is retained for compatibility with existing v0.5
`OWNER_ADDITION` and `OWNER_AMENDMENT` artifacts. It means only that the
annotated-tag actor's principal identity was not verified. It is not a total
governance-strength grade and makes no claim about exact-claim authorization,
quorum, policy protection, host merge enforcement, or a completed canonical
transition. Existing v0.5 policy bytes, artifacts, route behavior, and
historical results keep their original meanings.

Future governance reports must keep these assurance facts distinct:

- **Procedure and eligibility:** whether route-specific evidence and semantic
  checks are `eligible`, `ineligible`, or `incomplete` for the exact candidate.
- **Principal authentication:** whether an approved identity mechanism
  verified the relevant actor. Existing G0 reports `not_verified`; tagger
  name/email or a claim in the candidate does not change that state.
- **Exact-claim authorization:** whether a principal with the required owner
  authority authorized the bound claim. This is independent of actor
  authentication and requires its own selected evidence contract.
- **Quorum:** whether the number and relationship of authorized attestations
  selected by policy are satisfied. Quorum does not alter the strength of the
  identity mechanism for each attester.
- **Policy protection:** whether evidence establishes that the policy used for
  a decision was protected from candidate self-selection or alteration.
- **Host enforcement:** whether evidence establishes that the hosting service
  applied a merge rule to the exact target, required check and producer, with
  its bypass scope and observation time identified.
- **Canonical transition or placement:** whether a readback of the named
  target ref establishes that the exact authority state became canonical and
  what is present at observation time. This Git/readback fact does not by
  itself establish valid OWNER_ADDITION adoption.
- **Evidence freshness:** which bound evidence was checked and for which
  route-specific lifecycle boundary.

An unavailable source is reported as unavailable; a fact that was not
verified is not inferred from a green check. Reports bind their repository,
recorded base and candidate head, policy/report versions and digests, and
evidence identities. The status and provenance of each dimension remain
separate; no scalar grade may summarize them as an overall assurance level.

For the separately versioned v0.5.1 OWNER_ADDITION route, absence of verified
host merge enforcement does not by itself make an otherwise valid G0
procedure permanently `ADVISORY_ONLY`. A consumer must explicitly select the
route from the recorded base policy; B cannot enable it, weaken it, or select
policy from its own head. The report binds and identifies that base revision
and policy digest, while reporting `policyProtection=not_claimed` whenever
protection of that policy was not established. A required enforced route
cannot downgrade when its selected host evidence is absent, inaccessible,
stale or invalid.

Before merge, an eligible exact candidate's result is `eligibility=eligible`,
`adoption=pending`, and `canonical=pending`. Eligibility alone is neither
adoption nor canonical placement. A final `OWNER_ADDITION / G0` adoption
record is valid only when all of the following are established for the same
exact B:

- Its deliberate annotated G0 tag and AdditionRecord bind the required
  decision and match an ordinary completed `OWNER_DECISION` with the same
  `ownerDecisionId`.
- The ordinary review and separate B eligibility review both report exactly
  the complete selected-base `authorityIds` and the same verified selected-set
  digest; B's eligibility result is `eligible`.
- Evidence verifies that this exact eligibility result existed before merge
  and records its selected producer and completion time. Those facts come
  from a source selected by the recorded-base policy, never an
  author-controlled field or arbitrary saved green report.
- An ordinary PR merge commit has the recorded base as its first parent and
  exact B as its second parent, and its tree equals B's tree. Trusted host PR
  metadata binds that commit to the named B PR as merged before readback.
- A later readback identifies the observed target ref and verifies that it
  contains the merge commit and expected authority state.

The adoption record binds the repository, target branch, PR identity, base,
B, merge commit, its ordered parents and tree, target ref and observed target
commit, selected policy and Authority Set identities, Gatekeeper identity,
prompt, schema and validation input identities, tag object, eligibility
result, producer and timestamp. A missing, mismatched or post-merge-only
eligibility result leaves adoption incomplete. v0.5.1 supports this
merge-commit form; squash and rebase integration are unsupported until a later
route version defines and verifies their exact B-to-result binding.

Canonical placement and valid adoption are reported independently. If an
ineligible B is nevertheless merged and read back on the target, the report
may say `canonical=verified` while `adoption=invalid`; the readback must never
convert that change into a valid OWNER_ADDITION. A known ineligible B has
`adoption=invalid` even while canonical placement is pending; eligibility
alone never establishes the placement. After a valid adoption, A still
requires a fresh review against the resulting
canonical authority under the consumer's normal acceptance policy.

The v0.5.1 G0 route reports `principalAuthentication=not_verified` and reports
host enforcement as `unavailable` or `not_verified` according to observed
evidence. These are independent assurance dimensions: the procedural
adoption claim does not authenticate the owner/tag actor or claim that GitHub
prevented a disallowed merge. Conversely, unavailable host enforcement does
not invalidate the specifically evidenced procedural adoption above.

The new policy, evidence and report formats must have explicit versions
distinct from current v0.5. Existing v0.5 policy bytes, artifacts, route
behavior and historical results keep their original meanings; a verifier must
reject ambiguous version mixing and must not upgrade historical G0 results by
reinterpretation. This Issue #121 contract is limited to OWNER_ADDITION and
does not generalize to OWNER_AMENDMENT or other routes. It defines the target
contract, not an active route. Implementation, focused negative verification,
and the public fixture full-cycle E2E specified in the Issue #119 release gate
are required for the v0.5.1 package release. Passing that fixture does not
prove readiness or adoption for a real consumer or replace the protected
representative LIVE Agency end-to-end prerequisite for route activation. Each
consumer must separately select and verify the route under its own base policy
and governance.

Evidence lifecycle remains route-specific. Existing `OWNER_ADDITION / G0`
observes the mutable tag-ref mapping to the bound tag object at verification
time and makes no promise that the ref remains unchanged through a later
transition. This point-in-time semantics applies to historical v0.5 artifacts
and is not strengthened or weakened by the versioned Issue #121 route.
`OWNER_AMENDMENT` continues to require its bound evidence to remain valid
through the protected
canonical transition; its freshness requirement cannot be reduced to G0's
verification-time observation.

Issue #119 (complete multi-document Authority Set support) and Issue #120
(legacy PR-head authority failure) remain independent blockers for a LIVE
Agency consumer trial. Those trial-specific blockers are not part of the
v0.5.1 public-fixture release gate above. This assurance decision does not
resolve either issue or authorize a consumer-specific architecture.
