# Proposed amendment claim and evidence boundary for #20, #75 and #78

**Status: non-normative owner-review proposal.** This document does not amend
[`docs/architecture.md`](../architecture.md), select a protected policy, define
production evidence, or enable `OWNER_AMENDMENT / G0`. It identifies a gap in
the current *target* contract and asks the owner to resolve it before changing
Core behavior or assurance. `Architecture Gate / accept` remains unchanged.

## One amendment, with a claim and selected supporting evidence

The current target contract and [#75](https://github.com/flair-agency/architecture-gatekeeper/issues/75)
require an annotated tag and `AmendmentRecord` to identify a triggering
historical `BLOCK`. [#78](https://github.com/flair-agency/architecture-gatekeeper/issues/78)
inherits that requirement, as does the currently disconnected
`src/owner-amendment.mjs` verifier. It fits the original PR #73 case: Change A was
`BLOCK`ed under the old authority, then the owner chose a separate
authority-only Change B. The original `BLOCK` must remain historically true;
after B becomes canonical, A needs a fresh review.

An owner may also deliberately amend authority because a business or external
requirement changed **before** any conflicting implementation or `BLOCK`
exists. The current target contract cannot express that case. This proposal
treats deliberate revision of canonical authority as **one governance action**,
regardless of how the need was discovered. A versioned `AmendmentRecord` would
identify exact prior authority and authority-only Change B, state an
**Amendment Claim** about why the prior contract no longer expresses the
authoritative state to apply after B, and bind policy-allowed supporting
evidence and the owner decision. This changes a canonical assurance rule, so
the owner must authorize and record it before implementation.

Candidate semantics for owner review:

```text
previous canonical authority + previous protected policy
    + separate authority-only Change B
    + versioned Amendment Claim and owner decision
    + selected, verified supporting evidence
    + annotated tag and policy-required governance grade
  -> OWNER_AMENDMENT for B only
```

An historical `BLOCK` proves that a reviewed implementation conflicts with
the authority used for that review. It does **not** establish whether the
implementation or authority should change. If the owner chooses to revise
authority after a `BLOCK`, the evidence set needs both the verified mismatch
and an independent requirement, constraint, or owner decision explaining why
the proposed authority is now the one to adopt. The historical `BLOCK`
remains true under old authority. Change A stays rejected and needs fresh
review after B becomes canonical.

When an authoritative requirement changes first, the supporting evidence
instead binds the previous and new requirement states, their authority and
revisions, and the affected contract scope. The claim is that the prior
contract is now outdated relative to the state to apply after B; it need not
have been wrong when originally adopted. These are **evidence types for the
same claim**, not separate `BLOCK` and “proactive” acceptance routes.

| Circumstance | What evidence can establish | What remains an owner decision |
| --- | --- | --- |
| A was `BLOCK`ed under old authority | Exact validated mismatch, alongside a requirement or constraint supporting B | Whether authority rather than A should change, and B's new rule/scope |
| Requirement changes before any A or `BLOCK` | Authoritative old-to-new requirement delta and its relation to the old contract | Whether and how B should embody the new requirement |

## Evidence is typed and policy selected

The candidate Core record would bind Git revisions for prior authority and B,
affected authority identities, claim, owner decision, exact evidence digests,
evidence type/version, tag object identity and governance grade. The owner must
define the schema, the authority and provenance of the owner decision, and a
**closed set of initially accepted evidence types** in previous protected
policy. A generic `evidence[]` field or arbitrary owner/author-supplied text
must not suffice. For each allowed type, policy must identify its verifier,
required bindings, freshness and completeness conditions, and minimum grade
for the affected authority/scope. Missing, stale, unsupported or unverifiable
evidence fails closed, without trying another type or lower grade. Candidate B
cannot authorize its own evidence type, route, grade or scope. At G0, the tag
actor remains unverified; the tag would bind exact B, Amendment Claim digest
and purpose. The owner must approve the claim separately from any `BLOCK`
finding: a verified mismatch is not owner authorization to change authority.

The owner must decide a relevant-evidence completeness rule: when a known
`BLOCK`, requirement delta or other material fact pertains to the claim, what
must be disclosed and verified? The mere presence of a `BLOCK` does not prove
it caused B, and a “requirement change” label cannot justify hiding a relevant
`BLOCK`. A global search that proves no relevant `BLOCK` exists is not
established and must not be presumed. Instead, previous protected policy
needs a bounded, enforceable disclosure/verification rule for the selected
claim and scope. Do not activate a generalized route until that rule is
specified and tested.

**Compatibility:** Preserve the current BLOCK-required target and verifier
without silently reinterpreting old `AmendmentRecord` bytes. A new versioned
record and protected policy selection would be needed for the generalized
claim. During transition, an unknown version or unsupported evidence type
remains incomplete; omission cannot repurpose an old BLOCK record.

## Keep Core Git-based and host neutral

The hosting-independent objective is already explicit in #75: Core identity
uses Git revisions and authority evidence, while GitHub PRs and GitLab MRs are
adapters. The first production adapter may run on this public GitHub
Architecture Gatekeeper repository; that does not put GitHub Actions, PR IDs,
live merge refs or Checks into the Core record or acceptance semantics.

| Boundary | Candidate responsibility |
| --- | --- |
| Core | Git OIDs for B base/head and prior authority, authority identities, one versioned Amendment Claim with typed supporting evidence, `ReviewRecord` when selected, digests, validated decisions, grade, scope and stale-state rules. No PR/MR number or vendor-specific certificate field is a Core identity. |
| Evidence store and provenance adapter | Return exact bytes by digest, independently verified type-specific provenance facts, retention and mutation/deletion guarantees, or `INCOMPLETE`. |
| Change-state and governance adapter | Normalize current Git change state, tag-object/ref observations, and any selected actor evidence; report unverifiable or changed state without choosing an acceptance result. |
| GitHub adapter | Map PR, Actions attestation, artifact/archive, protected workflow, tag refs and required check behavior to the Core facts. Its initial capability may be restricted to open A PRs. |
| GitLab adapter | Map MR, CI evidence, protected tags and merge enforcement to the same Core facts; it need not copy GitHub mechanisms. This is a portability design check, not a claim that GitLab has been implemented or proved. |

An evidence store selected by policy must retrieve exact bytes by digest for
the required retention period, meet the policy's mutation/deletion protection,
and permit independent readback. Missing bytes or provenance yield
`INCOMPLETE`. Core should express revision and evidence invalidation without
requiring a GitHub live merge ref or a particular storage product. Each adapter
must demonstrate how it obtains fresh state and prevents stale acceptance.

## #83 as one historical-BLOCK evidence type

The [final #83 real-PR report](https://github.com/flair-agency/architecture-gatekeeper/blob/main/docs/investigations/2026-09-25-real-pr-block-probe-implementation.md)
proves a **test-only, public GitHub** primitive: exact bytes for a validated
`BLOCK`, signer workflow and protected source revision, run and attempt. The
certificate exposes no producer job ID; attribution depends on the inspected
protected workflow sequence. The test verifier never grants acceptance.
Actions artifacts expire, and closed fixture PR #94 lost its live merge ref
even though its historical merge object was retrievable during the probe.

If the selected evidence set cites a historical `BLOCK`, #20 should define a
general, versioned `ReviewRecord` and verified-evidence interface. The GitHub
adapter could use #83's attestation construction **only if** the owner accepts its
producer-provenance guarantee and an exact-byte archive passes protection,
retention and readback tests. A GitLab or Git-native adapter could supply
different proofs to the same Core interface. A record field, artifact name,
PR comment or run-level artifact metadata alone is insufficient.

The earlier [#20 decision proposal](https://github.com/flair-agency/architecture-gatekeeper/issues/20#issuecomment-5832523552)
and [feasibility findings](https://github.com/flair-agency/architecture-gatekeeper/issues/20#issuecomment-5832718814)
cover GitHub-specific options. They are downstream choices for the historical
review evidence type, not prerequisites for a claim based on a requirement
delta. In particular, “open Change A only” would be an **initial GitHub adapter
capability limit**, not a Core owner-amendment rule. Current `main` protection
does not enforce administrators, and no evidence archive protection or
retention has been proved.

## Owner decisions and sequencing

1. **Claim and owner decision:** Decide whether a deliberate authority-only B
   may be accepted without a prior `BLOCK`. Define one versioned Amendment
   Claim, how the owner decision/reason is authenticated and bound to prior
   and proposed authority, and how the annotated tag binds B and claim digest.
   Preserve the current BLOCK-required validator as v1; do not reinterpret old
   records. Record the new rule in canonical authority, then align #75/#78.
2. **Evidence policy and completeness:** Select an initial closed set of typed
   evidence, type-specific verifiers, permitted combinations, provenance,
   freshness/completeness rules, scope and minimum grade in previous protected
   policy. Define a bounded relevant-evidence disclosure rule without claiming
   that the system can prove no related `BLOCK` exists anywhere.
3. **Portability contract:** Confirm the Git-revision-based Core facts,
   evidence-store/provenance/change-state interfaces and host-adapter boundary.
   Review the proposed schema and acceptance semantics against a GitLab MR
   mapping before making GitHub mechanisms mandatory anywhere in Core.
4. **Historical review evidence, when selected:** Decide the acceptable producer
   provenance, durable exact-byte store and retention, closed-change freshness
   semantics, and supported deployment classes. The minimal GitHub adapter may
   initially support only this public repository and open A PRs, subject to
   protected policy and end-to-end proof. Other public or private consumers
   require their own adoption and availability proof.
5. **Tag and acceptance freshness:** Define host-neutral invalidation when
   the tag object/ref, B base/head, prior policy or related evidence changes.
   Prove each adapter's required merge check becomes stale or fails closed
   after tag-ref update/deletion. Do not enable G0 until that proof and the
   applicable owner-authorized contract are in place.

After those decisions, #20 can implement versioned evidence and independent
verification, and #78 can implement the chosen Amendment Claim and protected
routing. Test a BLOCK-related A→B claim with an independent reason to change
authority and a requirement-delta claim if both types are authorized, plus
missing/stale evidence, wrong type, tag and scope failures. A's historical
`BLOCK` remains unchanged. No production evidence route or G0 acceptance is
enabled by this proposal.
