# Issue #75: GitHub tag-push attribution probe

This is an observation-only PoC for a possible GitHub `Attestation Adapter`.
It does not create `OwnerAttestation`, change the Architecture Gate, emit an
acceptance check, or authorize a contract amendment. The workflow has no token
permissions, uses only public read-only API calls, and responds only to tags in
`issue75-attest-poc/*`.

The candidate action is an **annotated tag push**, not the tagger name or email
inside the Git object. The tag message for this PoC explicitly says it is not
an approval. The workflow records the initial GitHub Actions actor ID and the
push event's sender ID, plus the event's commit SHA. It queries the current
tag ref and annotated tag object separately to record that object's OID and
peeled target commit.

This checks what GitHub actually supplies for one push path. It does **not**
prove that an actor ID identifies a human owner for all credential types.
GitHub documents a deploy-key exception: the Actions UI may attribute a push
to the administrator who registered the key. A production adapter would have
to reject such paths through supported event metadata or an independently
enforced tag-creation policy. A `create` webhook has a `pusher_type`, but its
event must be correlated with the exact tag object; this draft workflow cannot
test that event because `create` workflows run only from the default branch.

In the first successful observed annotated-tag push, the event's `after` was
the **tag object OID**, while `GITHUB_SHA` was the peeled target commit. The
workflow therefore compares the event OID with the later API query of the tag
ref. This is stronger than comparing only the target commit: a replacement tag
with different text but the same target has a different OID. The observation
still does not prove a general supported contract for every tag-push path or
exclude a ref update between the event and API query. The workflow reports
that comparison rather than calling it a verified attestation. A real adapter
would need to retrieve the exact event object by OID, reject ref replacement
or deletion according to an explicit policy, and run a protected verifier with
a required check bound to the current base and head. A tag push workflow that
runs from a candidate tag is itself not a protected acceptance verifier.

The experiment is intentionally separate from the signed-tag PoC in draft PR
#76. That PoC authenticates a Git object using an owner-controlled signature;
this one observes GitHub's account attribution for a push. Neither is yet the
selected v1 owner-attestation mechanism.

## Procedure and evidence

1. Create an annotated experimental tag at this PoC commit, with a message
   such as `Issue #75 attribution probe only; not owner approval`.
2. Push only that tag to the repository. Do not use a release namespace or a
   real amendment/review identity.
3. Inspect the `Issue 75 tag push probe` Actions run and record its run URL,
   event actor/sender IDs, queried tag object OID and target commit below.
4. Compare the run with the GitHub account and credential path actually used
   for the push. One successful personal-account observation does not validate
   deploy-key, GitHub App, automation-token or rerun paths.

The probe's actual result will be recorded here after the push. The test tag
can then be removed; removing it does not undo a historical push event, but
may make the tag object harder to retrieve later. The Action run and this
record are diagnostic evidence only, subject to GitHub retention.

## Observations

The first tag-push run failed before reading the event because the workflow
used an empty `github.event_path` expression. The supported runner environment
variable `GITHUB_EVENT_PATH` fixed the probe; the failed run did not produce an
attestation observation. [Failed run](https://github.com/flair-agency/architecture-gatekeeper/actions/runs/35987189282).

The next annotated tag push completed successfully on 2026-09-24.
[Successful run](https://github.com/flair-agency/architecture-gatekeeper/actions/runs/35987274483).

| Observation | Value |
| --- | --- |
| Repository ID | `1379218762` |
| Event ref | `refs/tags/issue75-attest-poc/push-f7d37c1` |
| Event `created` / `forced` | `true` / `false` |
| Event `after` | `fce5aa20a0af85c987123e8fcc749d41428d8770` |
| Queried annotated tag object OID | `fce5aa20a0af85c987123e8fcc749d41428d8770` |
| Tag target commit / `GITHUB_SHA` | `f7d37c1723a876f01cae01a39c4d6aa2dd3d7874` |
| Event sender ID/type | `2765097` / `User` |
| Initial Actions actor ID/login | `2765097` / `naokikimura` |
| Run attempt / triggering actor | `1` / `naokikimura` |
| Ref stable across the two API queries | `true` |

The event `after` matched the exact annotated tag object queried through the
API. This is evidence for **this** GitHub user push, not proof of a human-only
authentication guarantee, deploy-key exclusion, or protected acceptance. The
workflow was then updated to compare event and tag-object OIDs explicitly.

A third tag push exercised that comparison and completed successfully.
[OID-comparison run](https://github.com/flair-agency/architecture-gatekeeper/actions/runs/35987457636).
For `refs/tags/issue75-attest-poc/push-10a5f83`, event `after`, the locally
created annotated tag object, and the queried tag object all equaled
`9f7d5bee693df863ae1522dc33587309fd185b35`. The tag targeted commit
`10a5f83eeb1d0b180d9c3f8fc960487bfee26055`, which was also `GITHUB_SHA`.
The event sender and initial Actions actor were again user ID `2765097`;
`created=true`, `forced=false`, `current_ref_object_matches_event_oid=true`,
and `ref_stable_during_queries=true`.

**Result:** two successful user-push observations support the feasibility of
binding a GitHub tag-push event to an immutable annotated tag object by OID.
They do not establish that the authenticated push actor was a human owner
rather than a credential attributed to that account. Before adopting this as
an attestation adapter, test credential and rerun cases, identify a supported
way to exclude non-human pushes, define ref update/deletion policy, and move
verification to a protected acceptance workflow. This experiment does not
resolve those production requirements or amend the architecture contract.

## Separate process policy from attester authentication

An amendment's **approval process** and the **authentication mechanism** for
the attester are independent design axes. Process policy decides whether a
single owner may explicitly self-attest, whether an independent approver is
required, and which exact amendment and review must be covered. An
attestation adapter establishes what an external action proves about the
actor, evidence and binding. The core acceptance verifier should apply the
protected process policy to normalized, verified adapter output; it must not
infer a stronger process guarantee merely from the adapter type.

For example, a GitHub approval adapter might authenticate a separate
authorized reviewer, while a GitHub tag-push adapter might authenticate an
owner's explicit self-attestation. A signed-tag adapter is another candidate
authentication mechanism for that same self-attestation process. Conversely,
if protected policy requires a distinct approver, using a signed tag does not
waive that requirement. None of these adapters is validated for production by
this PoC.

The adapter boundary should carry at least the authenticated principal, the
exact amendment revision and triggering review identity, the evidence
identity, and the mechanism and assurance facts needed by protected policy.
It must not accept caller-declared identity or a bare `verified: true` value
as proof. The protected policy selects permitted adapters and required
assurance; an unsupported, stale or incomplete adapter result fails closed.

In a single-owner repository, the proposer and attester may be the same
principal. Neither a signed tag nor a GitHub tag push creates an independent
approver or proves human deliberation. A signed tag proves use of a signing
credential; a GitHub tag push reports an account associated with the push.
Whether a particular credential path sufficiently authenticates the explicit
self-attestation is an adapter and protected-policy question. A deploy-key or
automation push must not silently acquire a stronger claim by being attributed
to the owner account.

`OWNER_AMENDMENT` can remain one governance result while evidence records the
process and authentication guarantees separately. Selecting acceptance rules
or a production adapter would amend the normative contract and is outside
this observation-only PoC.

## Adapter selection and chain-of-responsibility boundary

A chain of responsibility can help **dispatch** evidence to its matching
adapter, but must not decide acceptance by trying mechanisms until one
succeeds. The protected policy first selects which mechanism identifiers are
permitted for the chosen amendment process and what assurance each must
provide. Evidence names its mechanism; only the matching, policy-permitted
adapter may validate it. The verifier then checks the normalized result
against the process rule and exact current change/review state. This also
allows a deployment to enable one adapter initially without changing the core
contract when another is added later.

The dispatch outcomes need distinct meanings: no matching mechanism,
verified evidence, invalid evidence, and adapter unavailable/incomplete.
Invalid or unavailable evidence selected for an amendment must not trigger an
automatic fallback to a weaker mechanism. If a policy intentionally allows
alternative evidence, the alternatives and the rule for combining them must
be explicit in protected policy, not determined by adapter order. A future
deployment that requires two independent attestations likewise needs an
explicit combination rule rather than a first-success chain.

For this PoC, no selection policy or adapter chain is implemented. The
tag-push workflow only reports observed facts; it cannot grant acceptance.
