# Self reference and rollout contract

This is a required normative member of the Architecture Gatekeeper self Authority
Set. Read it with the [shared contract](../architecture.md) and every other
selected member; topic separation supplies no implicit precedence or route
activation. Setup and operating guidance are in the [documentation map](../README.md).

#### Target self-only GitHub Free/public reporter (Issue #210 A; owner decision)

Owner-adopted target A is for this public GitHub Free self-repository; it is not implemented/enforced and needs no hosted server, ChatGPT Cloud or WIF. For queued changes, only an unprivileged candidate `merge_group` job relays/wakes the protected-default-branch `workflow_run` receiver. It independently resolves live queue SHA/state, current protected base, exact queued PR/B, prior-base policy, full Authority Set and exact evidence, runs existing ordinary semantic, B/G0 and deterministic validators. Candidate workflows, success, artifacts and policy confer no authority. Only protected producers receive the review API and GitHub App private keys via a `main`-only Environment; the self-repository App has only `checks:write`. Reports bind verified results to exact queue SHA and App identity; host config expects that App as check source.

The same dedicated self-repository App also reports normal-PR results through a protected `pull_request_target` producer selected from the adopted protected base. It independently resolves the current base, exact PR head and test-merge subject, and reviews under the previous Policy and complete Authority Set. Ordinary acceptance requires unchanged old-selected Authority and a validated PASS. Both PR and Queue required checks expect the same dedicated App, and candidate/reviewer execution cannot receive its credentials.

Changes to old-selected Authority cannot use ordinary PASS; they require a governance route already selected by the previous Policy. OWNER_ADDITION adds only an identified missing decision without changing existing rules, under its existing scope, semantic eligibility, AdditionRecord and evidence requirements. It remains distinct from OWNER_AMENDMENT and does not acquire amendment-specific historical ReviewRecord, AmendmentRecord, attestation or through-transition tag requirements from this section. Its existing acceptance and readback requirements remain unchanged; this target does not opt the self repository into OWNER_ADDITION. OWNER_AMENDMENT changes existing rules and requires its previously selected trigger, scope, verified evidence and semantic eligibility. Its PR result permits Queue entry only; the required Queue producer independently revalidates the current base, exact B, evidence and transition. Neither amendment PR eligibility nor a candidate workflow result establishes canonical adoption. An ineligible amendment cannot fall back to OWNER_ADDITION.

Route classification uses the previous Policy and immutable base/candidate contents. A later tag cannot convert ordinary contents into an amendment or invalidate ordinary contents. Tags remain mandatory exact-B evidence for OWNER_AMENDMENT, with all existing producer, content, update/deletion protection and through-transition requirements. Tag absence and future non-creation are not ordinary acceptance guarantees. Policy/manifest configuration changes remain reviewed under the previous selection and cannot exempt changes to its selected Authority.

This document activates no route. Reviewed profile/policy adoption precedes staged activation. Before rollout-completion, verified-host-enforcement or release claims, require exact-context spoof rejection and both protected BLOCK/OWNER_DECISION E2Es: exact B, evidence/tag handoff, queue transition, canonical readback, fresh A review. Current `pull_request_target`-only route remains until reviewed adoption.

## Dogfooding and change discipline

### Development sequence and v0.6.0 self reference profile (owner decision)

First, establish and dogfood the smallest complete self-workflow; derive later
capabilities from concrete consumer use cases and required assurance. Do not
prebuild universal host, repository-plan, provenance, or Git-merge adapters for
speculative OSS use. This sequence neither weakens existing consumer policy nor
turns self-only results into general support claims.

This repository (public GitHub Free) is the v0.6.0 reference: its previous-base
policy may select v0.5.x `OWNER_ADDITION` for missing decisions or protected
`OWNER_AMENDMENT / G0` adoption for changing existing ones, without routine
admin bypass. Final v0.6.0 must prove completed `BLOCK` and `OWNER_DECISION`
amendment cases, including the Issue #137 self contract change under prior
protected-base policy. Both preserve historical semantic results and establish
exact B, protected evidence, canonical readback, and fresh review where
applicable. A numbered preview may distribute improvements to existing
supported paths for feedback with new `OWNER_AMENDMENT` and App routes inactive;
it makes no rollout, enforcement, or completion claims for those new targets.
Final v0.6.0 still requires both cases. The first BLOCK-triggered deployment selects the
following existing host primitives, subject to the validation requirements
above and an explicit previous-base policy opt-in:

| Concern | Self reference selection |
| --- | --- |
| Initial `BLOCK` transport | Exact, versioned ReviewRecord in a GitHub Actions artifact |
| Producer provenance | GitHub artifact attestation over those exact bytes, verified against the selected protected producer workflow, revision, run and attempt |
| Transition evidence | Versioned annotated amendment tag targeting exact B and binding the completed ReviewRecord bytes, the verifiable attestation bundle bytes and AmendmentRecord; the tag ref is protected against update and deletion |
| Protected B transition | Required check on a `merge_group`, GitHub merge queue using a merge commit, and post-merge canonical readback; the merge commit retains exact B as its second parent |
| Git history | Linear history is not a requirement of this self profile; required checks and PR protection remain |

```mermaid
flowchart LR
    A[A reviewed] --> BL[Completed BLOCK]
    BL --> E[Actions artifact bytes + verified attestation]
    E --> T[Protected versioned annotated tag targets exact B and binds record, bundle, AmendmentRecord]
    T --> Q[Required merge_group check revalidates tag ref, evidence, prior policy, and exact B]
    Q --> M[Protected transition; merge commit retains exact B]
    M --> C[Canonical readback]
    C --> R[A reviewed afresh]
```

At the protected-tag handoff, the Actions artifact must be retrievable and its
attestation verifiable. The exact completed ReviewRecord bytes and attestation
bundle bytes must be copied into the tag and bound by its AmendmentRecord.
The verifier must establish byte-for-byte identity and validate the producer
provenance before relying on the tag. After that verified handoff, the original
Actions artifact need not remain available through B's canonical transition;
the protected tag becomes the transition evidence source. Its versioned tag
object must target exact B, bind the exact evidence and applicable previous
protected-base policy, and its remote ref must be protected against update and
deletion. The final required `merge_group` validation and host ordering must
establish those properties through the protected canonical transition; a
point-in-time read or successful check alone is insufficient. Missing or
unverifiable source evidence before handoff, tag content, tag-ref protection,
policy, or transition ordering leaves B `INCOMPLETE`. A queue check rerun by
itself does not establish evidence validity through transition. A fresh
completed `BLOCK` requires B's AmendmentRecord and tag to be rebound to that
new evidence. The first BLOCK-triggered deployment must demonstrate the
complete A → BLOCK → tag handoff → B → canonical → A fresh-review cycle before
reporting `OWNER_AMENDMENT / G0` for that case. This is necessary but
insufficient for v0.6.0: the OWNER_DECISION-triggered self contract-update
case must also complete the protected path. This profile selects no
private-repository provenance adapter, linear-history rewrite binding, or
squash/rebase adoption route. G0 still reports principal authentication as
`not_verified`.

Dogfooding means exercising every major path the repository requires of
consumers, not merely invoking the reusable CI workflow. Before broader rollout
of a path, at least one representative repository must exercise, as applicable:

- local pre-push and explicit manual review;
- configuration and committed-authority selection;
- packaged installation and real executable entrypoints;
- all structured decisions and deterministic validation;
- evidence creation and invalidation;
- protected-policy acceptance verification;
- CI model review and reporting.

Architecture-changing work follows this order:

1. state the owner decision in this contract or another named canonical owner;
2. review the conceptual responsibility and trust boundary locally;
3. implement the smallest conforming mechanism;
4. dogfood the affected path before push;
5. use CI as an independent acceptance check, not as the first design review.
