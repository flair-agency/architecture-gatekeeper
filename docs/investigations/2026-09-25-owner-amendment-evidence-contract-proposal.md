# Proposed owner-amendment and evidence boundary for #20, #75 and #78

**Status: non-normative owner-review proposal.** This document does not amend
[`docs/architecture.md`](../architecture.md), select a protected policy, define
production evidence, or enable `OWNER_AMENDMENT / G0`. It identifies a gap in
the current *target* contract and asks the owner to resolve it before changing
Core behavior or assurance. `Architecture Gate / accept` remains unchanged.

## Resolve the trigger before choosing evidence technology

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
exists. The current target contract cannot express that case. The owner has
raised this as a scope concern; this proposal recommends making an historical
review an **optional, verifiable related record**, rather than a universal
precondition for an owner amendment. This changes a canonical assurance rule,
so the owner must authorize and record it in `docs/architecture.md` before
implementation. The existing BLOCK-triggered route remains the only described
target until then.

Candidate semantics for owner review:

```text
previous canonical authority + previous protected policy
    + separate authority-only Change B
    + versioned AmendmentRecord and valid per-amendment annotated tag
    + policy-required governance evidence/grade
    + optional related ReviewRecord, verified if present
  -> OWNER_AMENDMENT for B only
```

The `AmendmentRecord` would bind B, prior authority, affected scope, reason or
decision reference, and the annotated tag. `relatedReview` would be optional:
when it identifies a historical `BLOCK`, the verifier must authenticate the
exact `ReviewRecord` and ensure it pertains to the prior authority and stated
change. Omitting `relatedReview` must not let a caller falsely describe a
known `BLOCK` as absent, rewrite a `BLOCK` as `PASS`, or accept implementation
Change A. The owner must decide the required decision/reason evidence for a
proactive amendment and whether protected policy may require a related review
for particular scopes. A tag still binds exact B and the amendment purpose;
the tag's actor remains **unverified at G0**. No grade or route is enabled by
default, and candidate B cannot authorize its own grade or scope.

**Compatibility proposal:** Preserve the present BLOCK-related record and
verifier semantics as a legacy version/mode. Introduce a new, explicitly
versioned proactive mode only after the owner authorizes it; never reinterpret
an existing BLOCK-triggered record as proactive merely because its review
field is absent. A candidate discriminated record could use
`triggerKind: prior_block | proactive_owner_decision`, with the former requiring
the verified historical `ReviewRecord` and the latter requiring the selected
owner decision/reason evidence. The exact field names and version are still
undecided. Previous protected policy must select permitted mode, scope and
grade. An unsupported, missing or ambiguous mode fails closed. This lets the
existing BLOCK route continue unchanged while a proactive route is specified,
implemented and dogfooded separately.

| Amendment circumstance | Candidate handling | Assurance question |
| --- | --- | --- |
| A was `BLOCK`ed under old authority | Related exact `BLOCK` record required when invoked; keep A rejected and review A anew after B | What policy or record establishes that B is responding to this A? |
| Requirement changes before any A or `BLOCK` | No historical review required; B carries deliberate owner decision/reason evidence | What evidence and protected scope make this a valid intentional amendment? |

## Keep Core Git-based and host neutral

The hosting-independent objective is already explicit in #75: Core identity
uses Git revisions and authority evidence, while GitHub PRs and GitLab MRs are
adapters. The first production adapter may run on this public GitHub
Architecture Gatekeeper repository; that does not put GitHub Actions, PR IDs,
live merge refs or Checks into the Core record or acceptance semantics.

| Boundary | Candidate responsibility |
| --- | --- |
| Core | Git OIDs for B base/head and prior authority, authority identities, versioned `ReviewRecord`/`AmendmentRecord`, digests, validated decisions, amendment grade, scope and stale-state rules. No PR/MR number or vendor-specific certificate field is a Core identity. |
| Evidence store and provenance adapter | Return exact bytes by digest, independently verified producer/provenance facts, retention and mutation/deletion guarantees, or `INCOMPLETE`. |
| Change-state and governance adapter | Normalize current Git change state, tag-object/ref observations, and any selected actor evidence; report unverifiable or changed state without choosing an acceptance result. |
| GitHub adapter | Map PR, Actions attestation, artifact/archive, protected workflow, tag refs and required check behavior to the Core facts. Its initial capability may be restricted to open A PRs. |
| GitLab adapter | Map MR, CI evidence, protected tags and merge enforcement to the same Core facts; it need not copy GitHub mechanisms. This is a portability design check, not a claim that GitLab has been implemented or proved. |

An evidence store selected by policy must retrieve exact bytes by digest for
the required retention period, meet the policy's mutation/deletion protection,
and permit independent readback. Missing bytes or provenance yield
`INCOMPLETE`. Core should express revision and evidence invalidation without
requiring a GitHub live merge ref or a particular storage product. Each adapter
must demonstrate how it obtains fresh state and prevents stale acceptance.

## #83 as an optional historical-BLOCK evidence path

The [final #83 real-PR report](https://github.com/flair-agency/architecture-gatekeeper/blob/main/docs/investigations/2026-09-25-real-pr-block-probe-implementation.md)
proves a **test-only, public GitHub** primitive: exact bytes for a validated
`BLOCK`, signer workflow and protected source revision, run and attempt. The
certificate exposes no producer job ID; attribution depends on the inspected
protected workflow sequence. The test verifier never grants acceptance.
Actions artifacts expire, and closed fixture PR #94 lost its live merge ref
even though its historical merge object was retrievable during the probe.

If an amendment cites a historical `BLOCK`, #20 should define a general,
versioned `ReviewRecord` and verified-evidence interface. The GitHub adapter
could use #83's attestation construction **only if** the owner accepts its
producer-provenance guarantee and an exact-byte archive passes protection,
retention and readback tests. A GitLab or Git-native adapter could supply
different proofs to the same Core interface. A record field, artifact name,
PR comment or run-level artifact metadata alone is insufficient.

The earlier [#20 decision proposal](https://github.com/flair-agency/architecture-gatekeeper/issues/20#issuecomment-5832523552)
and [feasibility findings](https://github.com/flair-agency/architecture-gatekeeper/issues/20#issuecomment-5832718814)
cover GitHub-specific options. They are downstream choices for the optional
historical-review path, not prerequisites for every proactive amendment. In
particular, “open Change A only” would be an **initial GitHub adapter
capability limit**, not a Core owner-amendment rule. Current `main` protection
does not enforce administrators, and no evidence archive protection or
retention has been proved.

## Owner decisions and sequencing

1. **Amendment trigger and versioning:** Authorize or reject a general deliberate
   authority-only amendment path without a prior `BLOCK`. If authorized,
   specify required proactive decision/reason evidence, versioned mode
   discrimination and when protected policy may require a related review.
   Preserve the current BLOCK-required route. Record the revised rule in
   canonical authority, then align #75 and #78.
2. **Portability contract:** Confirm the Git-revision-based Core facts,
   evidence-store/provenance/change-state interfaces and host-adapter boundary.
   Review the proposed schema and acceptance semantics against a GitLab MR
   mapping before making GitHub mechanisms mandatory anywhere in Core.
3. **Historical review route, when used:** Decide the acceptable producer
   provenance, durable exact-byte store and retention, closed-change freshness
   semantics, and supported deployment classes. The minimal GitHub adapter may
   initially support only this public repository and open A PRs, subject to
   protected policy and end-to-end proof. Other public or private consumers
   require their own adoption and availability proof.
4. **Tag and acceptance freshness:** Define host-neutral invalidation when
   the tag object/ref, B base/head, prior policy or related evidence changes.
   Prove each adapter's required merge check becomes stale or fails closed
   after tag-ref update/deletion. Do not enable G0 until that proof and the
   applicable owner-authorized contract are in place.

After those decisions, #20 can implement versioned evidence and independent
verification, and #78 can implement the chosen amendment record and protected
routing. Test both a BLOCK-related A→B case and, **if authorized**, a proactive
B case, plus missing/stale evidence and tag failures. A's historical `BLOCK`
remains unchanged. No production evidence route or G0 acceptance is enabled by
this proposal.
