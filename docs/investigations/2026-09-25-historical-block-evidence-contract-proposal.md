# Proposed historical `BLOCK` evidence contract for #20 and #78

**Status: non-normative owner-review proposal.** This document does not amend
[`docs/architecture.md`](../architecture.md), select a protected policy, define
production evidence, or enable `OWNER_AMENDMENT / G0`. Every recommendation
below remains an owner decision. The existing `Architecture Gate / accept`
behavior stays in force.

## Existing authority and evidence

The architecture contract already separates review execution, evidence and
acceptance. Future evidence must be versioned and bind the repository, reviewed
base/head, Gatekeeper, canonical authority, review inputs and validated decision.
Protected-base policy alone selects evidence routes; a changed bound state
invalidates evidence. The approved *target* G0 procedure allows only a separate,
strictly authority-only Change B under **previously protected** policy. It keeps
Change A's historical `BLOCK` unchanged, requires an annotated tag, and makes
no claim that Gatekeeper authenticated its actor.

[Issue #83's public real-PR probe](2026-09-25-real-pr-block-probe-implementation.md)
proved exact-byte attestation of a validated `BLOCK` with signer workflow,
protected source revision, run and attempt. The certificate has no producer job
ID; that claim depends on the inspected protected workflow sequence. The
test-only verifier returns `VERIFIED_TEST_ONLY_BLOCK` or `INCOMPLETE`, never an
acceptance result. Seven-day Actions artifacts are not durable evidence.
Closed fixture PR #94 lost its live merge ref, although the PR API and Git API
still returned its historical merge object and exact base/head parents on
2026-09-25. Their continued availability is not a retention guarantee.

## Candidate initial boundary for owner consideration

For the first **public** consumer only, consider a protected CI `BLOCK`
`ReviewRecord` whose exact bytes are attested and durably archived. Keep the
route disabled until a production contract, archive protection and retrieval,
independent verifier, and end-to-end A→B test exist. Initially require Change A
to remain **open** with a live merge ref while B is verified. This avoids
inventing a closed-PR freshness rule from the #83 fixture. Private/internal
consumers and closed A PRs remain unsupported by this route until separately
proved and explicitly selected. No failure may trigger a weaker route.

### Proposed evidence and provenance rule

A versioned `ReviewRecord` would bind the exact repository, Change A base/head
and reviewed merge Git OIDs, complete protected Authority Set and review-input
digests, Gatekeeper and protected workflow revision, validated `BLOCK` decision
and digest, and producer run/attempt. B's `AmendmentRecord` and annotated tag
would bind the exact record digest, B revision, authority and amendment purpose.
The read-only verifier would obtain expected A/B identities independently from
protected Git state and current host API, verify the record's exact bytes and
attestation subject digest, certificate signer/source/run/attempt, protected
workflow structure at the signed revision, merge parents and protected inputs.
An artifact name, record field, PR comment, or run-level artifact metadata alone
would not authenticate the producer. Missing or mismatched claims yield
`INCOMPLETE`, not a historical `BLOCK` eligible for B.

**Owner choice:** Is certificate identity plus the reviewed workflow's sole
attesting producer job sufficient without a certificate job-ID claim? Requiring
an independently authenticated job identity is stronger but needs another
producer mechanism; #83 found no such claim in this certificate.

### Proposed exact-byte archive rule

One option is a content-addressed record file in a **separately reviewed,
protected Git evidence location**, with archive readback matching the attested
SHA-256 before B may reference it. The archive supplies availability; the
attestation and verifier supply provenance. A managed immutable object store is
an alternative with potentially stronger deletion controls but more operations
and cost. Neither option has been proved here. This repository's `main`
currently blocks ordinary force pushes/deletion and requires the architecture
accept check, but its protection does **not** enforce administrators, and no
evidence branch/ruleset exists. Git blob API exact-byte retrieval was shown
only with the merged #104 report, not an archived production record. The owner
must select a storage authority, retention period, protection/bypass rules,
readback and recovery procedure. A missing, deleted or expired byte source
must be `INCOMPLETE`; a digest alone is insufficient.

### Proposed freshness rule

For open A, check PR base/head, live merge OID and its two parents against the
record both before and after verification. If these or protected inputs change,
the old record cannot justify B. For B, verify the annotated tag object's
immutable OID, target, purpose and triggering record digest; resolve the remote
tag ref and bind the required check to its OID plus current B base/head and
previous protected policy. Demonstrate that tag-ref update/deletion invalidates
a successful check before enabling the route. A protected immutable tag
namespace is another option, conditional on verified host rules and a recovery
procedure. Candidate B cannot authorize its own G0 policy.

**Owner choice for closed A:** Initially exclude it, or specify an independently
verifiable historical PR state and merge-object retention rule. The #94 PR API's
historical merge SHA and currently retrievable Git object are useful evidence,
but there is no live merge ref or demonstrated long-term availability. Decide
also whether closing/reopening A without revision change invalidates evidence.

### Proposed deployment rule

Test the public attestation route first. Private/internal availability depends
on GitHub entitlement and a separate live verification; if unavailable, select
a separately specified trusted producer route in protected policy. Never pick
an alternate route in response to runtime failure of the selected route.

## Decision and implementation sequence

| Decision needed from owner | Candidate initial choice | Alternative / cost |
| --- | --- | --- |
| Producer provenance without certificate job ID | Signed workflow revision plus inspected sole attesting job | Stronger job-authenticated source; new feasibility work |
| Exact-byte storage and retention | Protected Git archive after protection, readback and retention proof | Managed immutable store; more operations and cost |
| Change A lifecycle | Open A with live merge ref only | Closed-A historical rule; more identity and retention proof |
| Tag freshness | Re-resolve tag ref and invalidate stale required check | Immutable protected tag namespace; host rule and recovery proof |
| Deployment class | Public first user only | Private/internal after entitlement and live proof |

Once the owner records selected rules in canonical authority, #20 can implement
the production record, archive/retrieval and independent verifier with negative
tests for signer, source, attempt, bytes, Git revisions, protected inputs and
missing evidence. #78 can then consume only verified historical `BLOCK` in its
tagged authority-only B path, prove a complete A→B case and stale-state/tag
rejections, and leave A subject to fresh review after B becomes canonical.
Until those gates pass, keep production G0 and any new evidence acceptance
route disabled.

Related discussion: [#20 owner-decision proposal](https://github.com/flair-agency/architecture-gatekeeper/issues/20#issuecomment-5832523552),
[#20 read-only feasibility findings](https://github.com/flair-agency/architecture-gatekeeper/issues/20#issuecomment-5832718814),
[#78](https://github.com/flair-agency/architecture-gatekeeper/issues/78),
and [PR #104](https://github.com/flair-agency/architecture-gatekeeper/pull/104).
