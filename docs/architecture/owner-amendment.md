# Owner amendment contract

This is a required normative member of the Architecture Gatekeeper self Authority
Set. Read it with the [shared contract](../architecture.md) and every other
selected member; topic separation supplies no implicit precedence or route
activation. Setup and operating guidance are in the [documentation map](../README.md).

### Target owner-amendment governance (Issue #75 owner decision)

`OWNER_AMENDMENT` is an acceptance result for a separate, authority-only
amendment Change B that changes an existing canonical architecture decision.
It is not a semantic-review decision and does not turn a historical `BLOCK` or
`OWNER_DECISION` into `PASS`. A prior `BLOCK` is a representative trigger, not
the definition of amendment. A completed `OWNER_DECISION` may also identify an
owner choice to change an existing decision; a missing-decision addition still
belongs to `OWNER_ADDITION`. The originally reviewed Change A remains rejected
until B becomes canonical and A receives a fresh review where A exists.

The procedures below are versioned trigger profiles: BLOCK evidence is
specific to its profile and is not required for all amendments. The supported
v0.6.0 self profiles are `completed-block-v1` for a completed BLOCK and
`completed-owner-decision-self-v1` for a completed OWNER_DECISION. Each profile
must specify exact completed review evidence, predecessor binding, owner
procedure, protected producer and transition checks. A tag or candidate claim
cannot infer or enable a profile; B cannot select its route or authorize its
adoption through proposed policy.

The owner adopts profile `completed-owner-decision-self-v1`. The exact
completed ReviewRecord digest identifies escalation/revision, not human choice
or identity. AmendmentRecord and deliberate annotated tag bind exact B, target
existing decision, trigger ReviewRecord digest, prior/resulting Sets and
purpose: proposed resolution, not authenticated approval. At G0,
`principalAuthentication` and `exactClaimAuthorization` are `not_verified`;
the owner procedure is prior-policy-authorized declaration and protected
adoption, not proof of owner approval. Stronger assurance needs a separate
verified route; no G0 fallback.

B-specific semantic eligibility is a common `OWNER_AMENDMENT` invariant,
independent of trigger. Review the exact authority-only B against the full
previous protected policy and Authority Set; confirm it materially addresses
its declared trigger and amends only its target decision; exclude unrelated
changes, implementation/workflow/executable-policy edits and unsupported
completion claims, and leave resulting authority coherent. Assess resulting
rules without requiring agreement with superseded rules. This does not impose
a universal one-file limit or decision ID. Before merge, a trusted producer must
issue versioned eligibility evidence binding exact B, trigger profile and
ReviewRecord digest, AmendmentRecord, and previous policy/Set; validate record
bytes and producer provenance. `merge_group` deterministically revalidates
eligibility, trigger evidence, protected tag and transition, failing closed on
missing, stale, mismatched or unverifiable evidence. The profiles retain their
own trigger-specific evidence and semantic questions: this profile preserves
the historical `OWNER_DECISION` and assesses resolution of its escalation;
the BLOCK profile below requires a completed BLOCK and assesses resolution of
the identified conflict. Only previous-base policy opts in and scopes a route;
B cannot self-authorize. Bootstrap is limited by [B1–B8](../architecture.md#canonical-authority-lifecycle); contract entry alone enables no route.

#### Self-v1 semantic eligibility input and receipt (owner decision)

The closed `owner-amendment-semantic-eligibility-v1` format reports semantic
eligibility for exact B only; it is not `PASS` or `OWNER_AMENDMENT`, does not
rewrite the trigger result, and does not authenticate an owner or authorize an
exact claim. Those assurances remain `not_verified`; this decision enables no
route.

The previous-base policy selects the trigger profile, authority scope, trusted
producer, and required `ownerAmendment.maxPromptBytes` (no default; positive
safe integer, at most the 1,048,576-byte runtime ceiling). B cannot set or
raise it. The complete prompt must fit. The protected producer supplies the
exact raw UTF-8 policy, full Authority Set and member bytes, repository/base/B,
all changed authority paths' before/after bytes and complete diff, trigger
ReviewRecord bytes and AmendmentRecord bytes, and annotated-tag identity. It
materializes the exact completed trigger ReviewRecord, verifies its selected
profile, digest, predecessor bindings, and trusted producer provenance before
constructing the prompt, then includes its decoded content as untrusted data.
The record supplies escalation/revision context only; it neither states owner
choice nor replaces canonical authority. The producer verifies all input
bindings before review. It also validates the AmendmentRecord's profile schema,
exact-byte digest, and applicable repository/base/B, trigger, target authority,
and before/after bindings before prompt construction. The prompt includes both
decoded records as separately identified untrusted data; the AmendmentRecord's
target and purpose are proposed claims, not owner choice or approval. Policy,
authority, and record content are data, not instructions. No one-file limit
applies. IDs follow protected manifest order.
`authoritySetDigest` is SHA-256 of compact UTF-8 JSON for the ordered member
descriptors `{id,repository,resolvedCommit,path,byteLength,sha256}`.

The closed decision object has exactly `version`, `kind`, `eligibility`,
`triggerProfile`, `authorityIds`, `authoritySetDigest`, and `checks`;
`version=1`, `kind=owner-amendment-semantic-eligibility-decision`, and
`eligibility` is `ELIGIBLE` or `INELIGIBLE`. Profile, complete ordered IDs,
and set digest equal the input. `checks` has exactly these boolean fields:
`materiallyAddressesTrigger`, `amendsOnlyTargetDecision`,
`excludesUnrelatedChanges`,
`excludesImplementationWorkflowAndExecutablePolicyEdits`,
`excludesUnsupportedCompletionClaims`, `resultingAuthorityIsCoherent`, and
`assessesResultingRulesWithoutRequiringAgreementWithSupersededRules`.
`ELIGIBLE` requires all checks true; `INELIGIBLE` records at least one false
check and cannot produce eligible evidence. Duplicate, extra, missing,
malformed, or mismatched fields leave review incomplete. The receipt records
the semantic determination; deterministic validation does not prove its
semantic correctness.

A completed decision has a version-1 `owner-amendment-semantic-eligibility-receipt`
in canonical UTF-8 JSON: recursively Unicode-code-point-sorted object keys,
array order preserved, compact separators, one final LF. Reject duplicate
keys and unknown, missing, noncanonical, or invalid fields at every level.
The exact top-level field set is `version,kind,eligibility,repository,baseSha,
bSha,triggerProfile,triggerReviewRecordSha256,amendmentRecordSha256,
policyRevision,policySha256,authoritySetDigest,authorityIds,changes,diffSha256,
promptSha256,schemaSha256,decisionSha256,model,reasoningEffort,gatekeeper,
tag,producer`;
`policyRevision=baseSha`. All `*Sha256` fields hash the named exact raw bytes
(decision bytes use the canonical decision encoding); `authoritySetDigest`
uses the member-descriptor algorithm above. `changes` is an ordered array of exact
`{path,beforeSha256,afterSha256}` objects. `tag` is exactly
`{tagRef,tagObjectOid,observedTagRefOid}`, binding the protected ref, exact
annotated object and observed ref mapping; it makes no claim the mutable ref
cannot later move or disappear. `producer` is exactly
`{workflowPath,workflowSha,workflowRef,runId,runAttempt,jobId}`, identifying
the selected protected workflow and exact job execution. `gatekeeper` is
exactly `{repository,revision,package}`: the canonical Gatekeeper repository,
full immutable Git commit SHA of the runtime source, and either `null` for
direct Git execution or an exact `{name,version,integrity}` package identity.
For package execution, these values identify the selected package and its
registry-read version and integrity, as required by the package distribution
contract. This is distinct from producer workflow/job identity. `model` and
`reasoningEffort` record the exact values selected by the previous-base
policy. The verifier matches runtime identity, producer, model, and effort to
their protected selections. Producer provenance must authenticate separately
before acceptance; fields alone do not authenticate the producer. It requires
every receipt identity/digest to match the protected selection and review
input. Only a validated `ELIGIBLE` receipt can serve as input to a separately
implemented acceptance route; it never reports `OWNER_AMENDMENT` or
authorizes B.

For BLOCK-triggered amendments, the exact completed `BLOCK` must identify the
conflict that B's semantic eligibility assesses. Preserve that historical
result; B never changes it to `PASS`. The first BLOCK-triggered implementation
may accept Change B at governance
grade `G0` when the **previous protected-base policy** explicitly authorizes
that grade for
the affected authority and amendment scope. `G0` still requires a deliberate,
per-amendment annotated-tag artifact. The verifier must check its immutable
object identity, exact B revision, amendment purpose and triggering `BLOCK`
identity. `G0` means the tag's creator or pusher is **not authenticated as the
owner** by Gatekeeper. Tagger name/email and author-supplied claims do not
establish identity. The resulting record must say `OWNER_AMENDMENT / G0`, name
the protected policy revision and tag object OID, and report that principal
authentication was not verified. A change cannot lower its own required grade
or select its own acceptance policy. No grade or amendment route is enabled
by default.

The `G0` option reflects the first user's existing owner-controlled exception
operation: Gatekeeper does not currently authenticate the owner behind each
amendment. Making `G1` mandatory from the outset would exclude single-owner
and other repositories that cannot yet provide a supported identity-verifying
mechanism. `G0` gives those repositories a formal, auditable procedure without
falsely claiming that each tag was pushed by the owner. It does not remove the
repository's responsibility to control who can merge under its hosting rules.

The value of this BLOCK-triggered route is procedural: it replaces a
recurring, unstructured merge exception with a separate amendment Change,
an annotated tag binding
that change to the exact triggering `BLOCK`, protected acceptance conditions
and an audit record. That improvement in process traceability must not be
described as improvement in per-change owner authentication; the latter
requires a higher-grade identity-verifying adapter.

For this route, the triggering `BLOCK` is one specific, completed and
verifiable ReviewRecord for the identified Change A, generated before B's
protected canonical transition. “Exact” requires validating the ReviewRecord
bytes and producer provenance bound by B's AmendmentRecord; it does not
require retaining the first or earliest `BLOCK` ever produced for A. A
readable record without valid producer provenance, or a digest without the
record bytes, is insufficient. Stale, unrelated, incomplete or unverifiable
evidence cannot trigger `OWNER_AMENDMENT`.

The evidence supporting B must remain valid through B's protected canonical
transition. A successful required check or a readback performed when that
check runs does not alone establish that the same evidence remains valid at a
later transition. The selected host integration must establish freshness and
ordering through that transition. If the triggering ReviewRecord or its
provenance, binding, or applicable previous protected-base authority/policy
cannot be validated at transition, B is incomplete and this route must not
authorize it. Expiry or later unavailability after a completed transition
does not retroactively invalidate that `OWNER_AMENDMENT` under this
acceptance-time evidence contract. Retention of B's acceptance record and any
post-transition audit material is a separate protected-policy choice.

If the bound triggering `BLOCK` is lost before B's transition, that pending
attempt cannot proceed on the missing record. Where the previous
protected-base policy permits recovery, a fresh review may produce a new
completed `BLOCK` for the identified Change A. This is new evidence with a
new identity, not restoration or proof of the old ReviewRecord; review
execution cannot be assumed to reproduce its exact bytes. It must be
generated under the applicable previous protected-base authority/policy, and
the repository, immutable base/head tuple and other required review inputs
must align with the identified A. If they do not align, the reviewed change
has a different A identity and B must identify it as such. B's AmendmentRecord
and every tag, evidence receipt or exact-claim authorization bound to the old
triggering `BLOCK` must be regenerated or reauthorized for the new identity.
Only a completed `BLOCK` supports this recovery; `PASS`, `OWNER_DECISION`,
refusal or incomplete review does not. The new bindings and evidence must be
validated through B's protected canonical transition.

Gatekeeper validates the selected evidence while a pending B is adopted; it
does not prescribe a universal storage backend or indefinite retention of
every earlier `BLOCK`. The consumer's protected policy and host integration
select a source that can supply the exact record bytes and verifiable producer
provenance through B's transition, and define the availability horizon and
later audit retention. Missing evidence cannot be replaced by a claim that a
previous review probably returned `BLOCK`. A first production deployment
still needs a concrete authorized evidence source and a proven final
validation/transition ordering; allowing a new `BLOCK` does not itself prove
either condition.

### Target procedural BLOCK amendment profile (Issue #147 owner decision)

The owner authorizes a separately versioned procedural `OWNER_AMENDMENT`
profile triggered only by a completed `BLOCK` for the originally reviewed
Change A. Its profile name and wire formats remain unassigned until their
versioned contracts are defined. This target does not reinterpret either
existing G0 profile or Issue #121's addition-only procedure. Consumer-selected
assurance does not universally require host merge enforcement; an enforced
route retains every selected protection and cannot downgrade to this route.

Before use, the previously adopted consumer policy and governance must select
this profile, eligible authority scope, full Authority Set, required validators,
trusted producer and custody, and owner integration/readback procedure. B cannot
select or weaken its own rules. This decision extends no existing policy's
affected-member scope and activates no self or consumer route.

The trigger must be one specific completed, validated BLOCK ReviewRecord for
identified A, with exact original bytes and authenticated producer provenance
binding repository, base/head/reviewed revisions, prior policy and complete
Authority Set, review inputs, runtime, producer execution and completion.
PASS, OWNER_DECISION, refusal, preparation rejection or incomplete review cannot
trigger this profile. Digests, mutable comments, unsigned artifacts and readable
logs alone are insufficient; later signing cannot retroactively authenticate an
untrusted historical execution. The selected source must preserve verifiability
through adoption. Loss before adoption stops the attempt; recovery, only where
previous policy permits it, requires a new completed BLOCK and regeneration of
every dependent binding. History is preserved, not restored or rewritten.

Authority-only Change B materially resolves the bound conflict and changes only
the prior-selected eligible authority scope. It contains no implementation,
workflow, executable-policy, publication payload or unrelated completion claim.
The separately supplied AmendmentRecord binds exact repository/base/B, trigger,
target decision and affected members' before/after identities. This target does
not authorize adding a record file to B; any such inclusion requires an explicit
versioned scope contract. B-specific semantic review receives the full previous
policy and Authority Set, exact proposed authority bytes and diff, both records
and every required validator; all complete-set and fail-closed rules remain.

Before integration, the selected trusted producer issues a versioned exact-B
eligibility receipt binding those inputs, semantic result, runtime, producer,
completion time and assurance. Every bound change invalidates that receipt.
Eligibility reports adoption and canonical placement pending; it authorizes
neither A nor a claim of completed adoption. Selected evidence and live bindings
must remain valid through the owner procedure and final adoption validation.

The owner integrates eligible B by the selected ordinary procedure. A normal
merge commit may preserve exact B as its second parent, recorded base as its
first parent and B's tree as its resulting tree; the integration commit need not
equal B's commit identity. Trusted integration metadata and subsequent target
readback must establish the selected exact B-to-integration binding and expected
authority bytes. Other integration forms require their own defined, verified
binding; none is inferred here. The final versioned adoption record binds the
repository/target, base/B, integration and observed target identities, policy and
full Set, affected members, trigger/AmendmentRecord/eligibility identities,
producer, timestamps and assurance. Missing, stale or mismatched evidence leaves
adoption incomplete; canonical placement is reported independently, never used
to repair invalid adoption. After valid adoption, review A afresh under the
resulting canonical authority and ordinary policy; fresh PASS is not guaranteed.

The trusted private-repository provenance backend remains unselected. A signed
attestation adapter or independent trusted host/custody requires a separately
owner-selected contract and demonstrated capability, credentials, authentication,
retention and readback boundaries. No backend is selected by availability or
fallback. Reports keep procedural adoption, principal authentication, exact-claim
authorization, policy protection and host enforcement distinct and make only
verified claims. Implementation, negative fixtures and a finite predecessor-
authorized production adoption trace remain required; this text grants no
backend use, LIVE adoption, publication permission or activation.

### Separate exact-claim authorization and revocation (owner decision)

`G0` remains a procedural governance grade with
`principalAuthentication=not_verified`. It does not itself prove that an
authorized owner approved the substance of an amendment. If an
owner-approved, versioned Amendment Claim route is later defined,
authenticated authorization of its exact claim is a **separate assurance**
from `G0` and from authentication of the annotated tag actor. Neither `G0`
nor any higher tag-actor governance grade is redefined by this assurance;
the observed grade and exact-claim authorization result must be recorded
independently. The previous protected-base policy may select or require the
additional assurance for an affected authority and amendment scope;
candidate Change B cannot waive or add it for itself. Failure,
unavailability or incompleteness of a required authorization cannot fall
back to `G0` alone or another weaker route.

When selected, the authorization must establish that a principal with the
required owner authority approved the **exact** claim identity, including
its bound prior and proposed authority revisions, amendment purpose and
supporting evidence identities. A change to any bound claim content requires
new authorization. A general PR/MR `APPROVED` state, annotated-tag actor,
mutable review body or author-supplied statement is not by itself proof that
the principal approved that exact claim at the time of authorization. The
claim identity must not depend on the later authorization receipt that
references it.

Ordinary revocation of an exact-claim authorization is prospective. If it
occurs **before the protected canonical transition** for B, adoption must be
prevented, even if an earlier required check reported success. A successful
check is not the canonical transition. After a completed protected canonical
transition, a later ordinary revocation does not erase that historical
acceptance; it prevents future or otherwise unconsumed use of the revoked
authorization. Evidence discovered later to have been invalid **at the time
of acceptance** (for example, forgery or lack of authority) is a separate
correction or incident matter, not an ordinary revoke and not an automatic
rollback rule.

This states the assurance and time semantics, not an enabled mechanism.
The exact receipt, identity-verification adapter, revocation source, and
host-specific ordering between final validation and protected merge remain
unselected and unproven. A host adapter must provide an immutable commitment
to the exact claim at authorization time and demonstrate that revocation or
claim change after a green check cannot permit a later canonical transition.
No exact-claim authorization route may be enabled until those properties and
the selected policy are proved end to end. This decision does not remove the
current BLOCK-evidence profile's trigger requirements or authorize the broader
Amendment Claim evidence model proposed in #107.

In the BLOCK-evidence profile, even at `G0`, the protected verifier must
validate a versioned ReviewRecord
for the exact historical `BLOCK`, an AmendmentRecord binding B to that review
and the authority being amended, the current repository/base/head and
authority identities, and the strict authority-amendment scope. It must reject
unrelated implementation changes in B, stale or unrelated review evidence,
and changed bound state. The check is successful only for B; it cannot accept
A using B's amendment result. A qualifying B may have been authored by a
non-owner: `G0` makes no author-identity claim. Repository merge permissions
and branch rules control who can actually merge it and are separate from the
Gatekeeper grade.

The annotated tag is procedural evidence at every enabled grade. Tag-content
and revision verification are core requirements, separate from verifying the
actor behind the tag. The `G0` route selects a Null **identity-authentication**
adapter: it reports no verified principal, while the core still requires a
valid tag artifact. A missing, malformed, stale or unverifiable tag is not a
valid `G0` result. Where a higher grade is selected, an external identity
provider is the source of actor attribution. Its adapter validates and
normalizes the provider's evidence for the exact tag; the protected core
checks that principal against the owner policy. The adapter does not itself
establish a human's identity or return acceptance results or grades. An
invalid, unavailable or incomplete selected higher-grade adapter result cannot
trigger a `G0` fallback. The tag object's remote availability and tag-ref
update/deletion must have an enforceable freshness rule before the tagged
route is enabled; a stale successful check cannot remain authoritative after
its bound evidence changes. A higher-grade adapter that relies on a push
event must additionally bind that event to the exact tag object.
Future grades may express one authenticated owner or a distinct-principal
quorum; the core must keep the number/relationship of attesters separate from
the strength of each authentication mechanism. Mechanisms and any alternatives
are selected by protected policy, never by a first-success fallback chain.

This is a target contract, not an active acceptance route. It becomes active
only after the evidence format, deterministic verifier, protected routing and
current-state checks are implemented and tested. Until then, existing
acceptance behavior remains in force. Enabling `G0` for this repository for
the first time cannot be justified by the candidate policy in that same
change; its adoption follows the existing owner-controlled exception process.
