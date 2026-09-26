# Architecture Gatekeeper contract

This document is the normative architecture contract for Architecture
Gatekeeper. Implementation documents, examples, Issues and pull requests must
conform to it. When an implementation detail conflicts with this document, the
detail does not silently redefine the architecture; the contract must be
changed explicitly through owner review first.

## Why

Repositories accumulate architecture decisions in canonical documents, but
ordinary code review does not reliably detect when a proposed change moves a
responsibility across an ownership boundary, weakens an acceptance rule, or
introduces a capability that the repository has not authorized. Instructions
alone describe the intended architecture; they do not provide a repeatable
decision at design time, during implementation, and before merge.

Architecture Gatekeeper exists to make those semantic checks repeatable while
leaving architecture ownership with each consumer repository. Its success is
not “an AI job ran.” Its success is that a proposed change is evaluated against
explicit repository-owned authority, unresolved owner choices remain visible,
and an enforcing repository cannot accept evidence weaker than its protected
policy allows.

The mechanism must give developers useful feedback before CI without turning a
local review into a security claim it cannot support. It must also permit a
repository to require an independent CI boundary when that stronger assurance
is justified.

## What

### Consumer authority

Each consumer repository owns:

- the canonical architecture and responsibility boundaries;
- the files that constitute review authority;
- the reviewer prompt, decision schema and deterministic validation rules;
- model and reasoning selection;
- the target-branch assurance and acceptance policy.

Architecture Gatekeeper selects, transports and validates those inputs. It
does not infer a consumer's architecture from current implementation, package
layout, examples, or another consumer's policy.

### Target contract: distributed authority

A consumer may opt in to a versioned, finite Authority Set whose required
documents reside in one or more repositories. Authority topology is independent
of source layout and runtime dependencies. The consumer selects each member by
stable ID, repository identity, path and immutable revision. The selector is a
review input that identifies owner-adopted sources; it is not itself semantic
architecture authority. Links, dependencies and submodules do not implicitly
add members or establish precedence between them.

The existing `authorityFiles` decision field reports repository paths. An
opt-in distributed route reports stable source IDs in a separate `authorityIds`
field under its own decision schema. A self member's `authority-revision`
selector resolves to the protected base commit in CI or the single recorded
commit in local/manual review; its manifest does not pin a stale SHA.

An opt-in CI route claiming protected-authority assurance must select its
Authority Set and same-repository authority bytes from the protected base
revision, not the pull-request merge checkout. External revisions are
consumer-adopted snapshots: an upstream change has no effect until the
consumer updates its protected selection. A selection-change pull request is
reviewed under the previous protected selection; the new selection applies to
subsequent reviews after merge. Local/manual review selects configuration and
same-repository authority from its single recorded commit. Both routes use the
same Authority Set semantics but need not select identical snapshots, and a
local result remains development feedback under the current acceptance policy.

Before semantic review on an enabled route, Gatekeeper must resolve every
required member to a bounded, immutable regular-file snapshot, verify the
declared repository, revision and path, compute its content digest, and supply
the selected bytes and source IDs to the reviewer. The supported source types
and per-file, member-count and total-size limits must be explicit before the
route is enabled. A missing, inaccessible, malformed or unverifiable member
leaves the review incomplete, without a `PASS`, `BLOCK` or `OWNER_DECISION` and
without falling back to a smaller set. Authority content is never executed.
Source-read credentials are confined to materialization and are not exposed to
pull-request code or the semantic reviewer, which does not discover additional
authority through general repository access.

For every completed `PASS`, `BLOCK` or `OWNER_DECISION` on the enabled route,
deterministic validation requires the reported source IDs to equal the complete
required set. Omitted, duplicate or extra IDs invalidate the result as an
incomplete review. A material conflict among successfully loaded authorities
without an adopted precedence or refinement rule calls for `OWNER_DECISION`,
not an invented ordering. Report the selected-set identity and each member's
repository, resolved commit, path and content digest with the reviewed
revision. These same-run provenance details do not establish that the model
internally read every byte and are not independently reusable acceptance
evidence.

This target contract applies only after the route is implemented and explicitly
selected. Existing single-repository and CI compatibility routes retain their
current assurance claims; naming a protected architecture file in a prompt
alone does not satisfy the materialization requirement above. An enabled
enforced review cannot downgrade to an older route when resolution fails.

### Initial distributed-authority CI bounds (Issue #51 owner decision)

The first CI implementation supports GitHub repositories only. A consumer that
selects this route must declare all five effective limits in its protected-base
policy: `maxManifestBytes`, `maxMembers`, `maxFileBytes`, `maxTotalBytes`, and
`maxPromptBytes`. There are no implicit defaults, and a pull request cannot
raise these limits for its own review. The recommended initial consumer profile
is respectively 16,384 bytes, 16 members, 65,536 bytes, 262,144 bytes, and
524,288 bytes. These recommendations do not activate the route by themselves.

The versioned Gatekeeper runtime ceilings, in the same order, are 65,536 bytes,
32 members, 131,072 bytes, 524,288 bytes, and 1,048,576 bytes. Neither workflow
inputs nor environment variables may raise these ceilings. Changing them
requires review and release of the Gatekeeper runtime. Missing, invalid or
over-ceiling effective limits fail closed before authority materialization.
The prompt limit applies to the complete review prompt, including selected
authority content. The existing protected-base selection, immutable revisions,
complete-set validation and offline review boundary continue to apply.

### Initial local distributed-authority bounds (Issue #51 owner decision)

The first local/manual Authority Set route supports same-repository (`self`)
members from the one recorded Git commit only. It is opt-in through committed
consumer configuration. The configuration selects a committed manifest and
declares all five effective limits named above; the same versioned runtime
ceilings apply. The complete prompt, including the task and any Hook context,
must fit `maxPromptBytes`. Missing, invalid or over-ceiling limits leave the
review incomplete before semantic review.

For local `self`, the configured repository name labels the current Git root;
the local same-user trust boundary does not attest its GitHub origin. The
reviewed commit and object bytes are verified within that root, and local
provenance must not claim a stronger repository-identity guarantee.

An external member selected by a local manifest is not silently omitted or
replaced with a working-tree copy. Until an explicit local source-access and
credential boundary is adopted, that selection leaves local review incomplete.
This initial route does not request a source-read credential or use one to
resolve authority. Local child execution may inherit the host environment;
this route does not claim isolation from credentials that the host already
supplies. Any later external-source route must define how source credentials
are withheld from the semantic reviewer before it is enabled. A local result
remains development feedback, not merge-acceptance evidence. Existing consumers
that have not selected this route keep the legacy `authorityFiles` behavior.

### Shared mechanism

The shared package owns reusable mechanics:

- selecting repository-declared inputs from a recorded revision;
- invoking a separate semantic reviewer whose role is limited to review and
  does not include changing the reviewed repository;
- validating structured decisions and consumer-declared invariants;
- producing or verifying architecture evidence when an explicit evidence
  contract is implemented and selected;
- reporting an authoritative acceptance result according to protected policy.

Semantic review may return `PASS`, `BLOCK`, or `OWNER_DECISION`.
`OWNER_DECISION` is an escalation that requires a decision to be recorded in
canonical consumer authority. These are review decisions, not the complete set
of acceptance outcomes. `OWNER_DECISION` is not an alternate form of acceptance.

### OWNER_ADDITION / G0 route for missing decisions (Issue #111)

An `OWNER_DECISION` rejects the reviewed change A until the missing
architecture decision is canonical and A receives a fresh review. A consumer
may separately opt in to a predecessor-B governance result called
`OWNER_ADDITION / G0`. It is not a semantic `PASS` for B or A, and it does not
change or erase A's prior `OWNER_DECISION`.

The route applies only when the **previous protected-base policy** opts in and
identifies the authority eligible for this procedure. The previous protected
Authority Set must contain exactly one `self` member, and its path must match
the policy's selected authority path. The candidate B cannot enable the route
or change its policy. B contains only the missing architecture decision being
added to that authority. It cannot change an existing rule, include
implementation or workflow changes, or assert that work was completed. The
route does not accept unrelated unresolved choices or contradictions with the
protected authority. A historical `BLOCK` ReviewRecord is not required; this
is distinct from the `OWNER_AMENDMENT` route.

An ordinary completed `OWNER_DECISION` must carry a protected structured
`ownerDecisionId`. The annotated tag's versioned `AdditionRecord` binds
`missingDecision.id` to that ID. B-specific eligibility review must verify the
ID match and decide that B adds that missing choice without contradicting
existing authority or introducing unrelated unresolved choices. The pure G0
artifact procedure validates the binding; it cannot infer those semantic
properties from authority text. This binding does not require retaining a
historical `BLOCK` or a reusable historical review artifact.

G0 requires a deliberate annotated Git tag object that targets the exact B
commit and whose annotation binds the addition to the selected authority and
missing decision, including its `ownerDecisionId`. The verifier checks the tag
object's bytes, computes and records its object ID (OID), confirms the object
targets B, and records the policy and authority state used for verification. A
Git object OID identifies those exact tag-object bytes. The tag ref that points
to the object is mutable: a read that the ref resolves to that OID establishes
only the observed mapping at read time, not that the ref cannot later move or
be deleted.

G0 makes no claim that Gatekeeper authenticated the tagger, pusher or owner, and
does not require an identity provider, a separately authenticated exact-claim
receipt, a revocation service, or a guarantee that a later tag-ref change
invalidates a green check. The result is procedural and auditable; it must not
be described as strong owner authentication or as proof that the tag remained
available through a later transition. Required verifier or service failure
remains fail closed. Privileged credentials cannot be exposed to or used to
execute B's pull-request code or package lifecycle scripts.

After B becomes canonical, A must receive a fresh review against the new
protected base under the consumer's normal acceptance policy. That review may
still return `BLOCK` or another `OWNER_DECISION`; G0 does not accept A. An
owner-authorized administrative exception remains under the consumer's
existing governance and outside this Gatekeeper result.

The deterministic verifier and protected reporting path are implemented. The
route is conditionally available only when the previous protected consumer
policy explicitly selects it and all verifier requirements above pass. This
repository's current protected policy does not select the route, so it remains
inactive for self-review. A first-time policy adoption may use the one-time,
owner-controlled administrative exception described by the consumer's existing
governance, after code review and fixture E2E have completed; that exception is
separate from Gatekeeper acceptance and does not itself enable the route for a
review. No release or consumer activation is claimed until the E2E and release
steps are complete. The original live-agency B is ineligible: its assertion
that migration and cutover were complete is a work-completion claim, not the
missing architecture decision. A repaired B may add the prospective
responsibility decision only; A still needs evidence of completed migration if
its acceptance depends on it.

### Target owner-amendment governance (Issue #75 owner decision)

`OWNER_AMENDMENT` is an acceptance result for a separate, authority-only
amendment Change B. It is not a semantic-review decision and does not turn a
historical `BLOCK` into `PASS`. The originally blocked implementation Change A
remains rejected until B becomes canonical and A receives a fresh review.
An `OWNER_DECISION` result is not eligible for this route.

The first implementation may accept Change B at governance grade `G0` when
the **previous protected-base policy** explicitly authorizes that grade for
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

The value of this route is procedural: it replaces a recurring, unstructured
merge exception with a separate amendment Change, an annotated tag binding
that change to the exact triggering `BLOCK`, protected acceptance conditions
and an audit record. That improvement in process traceability must not be
described as improvement in per-change owner authentication; the latter
requires a higher-grade identity-verifying adapter.

For this route, the triggering `BLOCK` is one specific, completed ReviewRecord
for the identified Change A, generated before B's protected canonical
transition. “Exact” requires validating the ReviewRecord bytes and producer
provenance bound by B's AmendmentRecord; it does not require retaining the
first or earliest `BLOCK` ever produced for A. Stale, unrelated, incomplete or
unverifiable evidence cannot trigger `OWNER_AMENDMENT`.

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
new identity, not restoration or proof of the old ReviewRecord. It must be
generated under the applicable previous protected-base authority/policy, and
the repository, immutable base/head tuple and other required review inputs
must align with the identified A. If they do not align, the reviewed change
has a different A identity and B must identify it as such. B's AmendmentRecord
and every tag, evidence receipt or exact-claim authorization bound to the old
triggering `BLOCK` must be regenerated or reauthorized for the new identity.
Only a completed `BLOCK` supports this recovery; `PASS`, `OWNER_DECISION`,
refusal or incomplete review does not. The new bindings and evidence must be
validated through B's protected canonical transition.

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
current target contract's triggering-`BLOCK` requirement or authorize the
broader generalized Amendment Claim evidence model proposed in #107.

Even at `G0`, the protected verifier must validate a versioned ReviewRecord
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

### Governance assurance dimensions and advisory procedural route ([Issue #121](https://github.com/flair-agency/architecture-gatekeeper/issues/121) owner decision)

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
- **Canonical transition:** whether separate host evidence establishes that
  the exact candidate became canonical. A configured rule or successful check
  alone is not a transition receipt.
- **Evidence freshness:** which bound evidence was checked and for which
  route-specific lifecycle boundary.

An unavailable source is reported as unavailable; a fact that was not
verified is not inferred from a green check. Reports bind their repository,
recorded base and candidate head, policy/report versions and digests, and
evidence identities. The status and provenance of each dimension remain
separate; no scalar grade may summarize them as an overall assurance level.

Following the owner selection recorded in Issue #121, this contract defines a
separately versioned **advisory-only procedural route** for repositories that
cannot establish host merge enforcement but still want a recorded procedure
evaluation. This route is distinct from protected-policy acceptance. A
consumer owner must explicitly select it in consumer canonical authority or
its governance record, and each run reads the selected policy bytes only from
the recorded base revision, never from candidate B. Bind and report that base
revision and policy digest. This selection and binding do not establish that
the base, policy or route selection is protected; the report must say
`policyProtection=not_claimed`.

The advisory outcome is `ADVISORY_ONLY`, a top-level reporting result distinct
from semantic `PASS`, `BLOCK` and `OWNER_DECISION` decisions and from
`OWNER_ADDITION / G0` acceptance. It may state that the route's procedure was
eligible, but it must report
`hostEnforcement=not_verified` or `unavailable` and
`canonicalTransition=not_verified`. It does not assert that B was accepted,
that a host would block an unaccepted B, or that B became canonical. A
separately named informational report may complete successfully; the advisory
result must not satisfy or be presented as the required
`Architecture Gate / accept` check. If an implementation cannot keep the
informational result distinct from that check, the accept path must return
non-success.

Advisory selection is explicit and never a fallback. Candidate B cannot enable
the route, weaken its requirements, or select policy from its own head within
the same run. If the recorded base policy selects an enforced route and its
required host evidence is absent, inaccessible (including plan-restricted
HTTP 403), stale, or invalid, that run is incomplete and cannot downgrade to
advisory. When the advisory route itself is selected, lack of host-enforcement
evidence is reported as not verified or unavailable and cannot be converted
into a protected acceptance claim. Other required procedure evidence must
still validate; its absence makes the procedure incomplete or ineligible.

New advisory policy and report formats must use explicit versions distinct
from current v0.5. Consumers that have not selected the new version keep their
existing behavior. A new verifier must reject ambiguous mixing of legacy and
new fields; it must not upgrade old G0 artifacts, policy bytes, or historical
results by reinterpretation. A successful advisory report means only that the
selected advisory evaluation completed with its recorded inputs. It does not
imply that the decision was protected or that any later merge is valid.
This is a target contract, not an active route. It becomes available only
after the versioned policy and report, deterministic evaluation, and
non-accepting reporting path are implemented and tested. Until then, existing
acceptance behavior remains in force.

Evidence lifecycle remains route-specific. Existing `OWNER_ADDITION / G0`
observes the mutable tag-ref mapping to the bound tag object at verification
time and makes no promise that the ref remains unchanged through a later
transition. This point-in-time semantics applies to historical v0.5 artifacts
and is not strengthened or weakened by the advisory route. `OWNER_AMENDMENT`
continues to require its bound evidence to remain valid through the protected
canonical transition; its freshness requirement cannot be reduced to G0's
verification-time observation.

Issue #119 (complete multi-document Authority Set support) and Issue #120
(legacy PR-head authority failure) remain independent blockers for the LIVE
Agency trial. This assurance decision does not resolve either issue or
authorize a consumer-specific architecture.

### Three separate concepts and target contracts

The architecture separates three concerns, even though the current CI path
does not yet implement them as independent artifact contracts:

1. **Review execution** evaluates a change and produces a structured decision.
2. **Architecture evidence** binds that decision to the reviewed repository,
   revision, mechanism and policy inputs.
3. **Acceptance verification** decides whether the current change has evidence
   permitted by protected-base policy.

An implementation may combine these concerns in one workflow, but must not
collapse their meanings. In particular, executing a review does not itself
grant merge acceptance, and CI is not the definition of architecture review.

## Conceptual operation

```text
design or implementation change
             |
             v
      review execution
      /              \
 local/manual       CI model review
      \              /
       architecture evidence
               |
               v
 protected-policy acceptance verification
               |
      accept valid PASS evidence, or (when enabled) accept a
      separate eligible B through OWNER_ADDITION / G0
      (when implemented and enabled) or OWNER_AMENDMENT;
      otherwise do not accept
```

### Local and manual review

Local and manual review are first-class development paths. They exist to find
responsibility and trust-boundary problems before code is pushed. The runtime
uses repository-owned configuration and authority from a recorded commit,
assigns the reviewer a review-only role, and keeps task text and working-tree
content in the untrusted evidence domain. Execution adapters apply the
safeguards available in their environment; enforcement mechanisms are not
uniform semantic requirements.

The local trust boundary assumes the same user, Git executable, object store,
installed runtime and Codex environment. Local review is not a filesystem
monitor, Git transaction manager, malicious-operator defense, or proof that the
operator could not bypass their own tools.

A local decision is development feedback unless protected-base policy
explicitly permits a defined evidence format and the authoritative verifier
validates it. A bare or author-controlled `PASS` is never sufficient.

Local review uses a shared semantic contract with separate execution adapters.
The shared contract records one Git revision, reads configuration, prompt,
schema, reviewer settings and authority from that revision, constructs the
review request, and deterministically validates the returned decision. It does
not choose how every host obtains that decision.

- The automatic command Hook may launch a read-only child `codex exec`, because
  a command hook has no native reviewer handle. Its process timeout and
  read-only sandbox remain required safeguards for this automatically invoked
  child process.
- The standalone terminal CLI explicitly uses the same child transport when no
  Codex host task exists, retaining its read-only sandbox and bounded process
  timeout.
- The Codex-hosted Skill prepares the revision-bound request, applies its
  recorded model and reasoning effort to a separate host-native reviewer whose
  role is limited to review and does not include changing the reviewed
  repository, then asks the shared runtime to validate the returned JSON. A
  host that cannot provide the recorded model or reasoning effort leaves the
  review incomplete and fails closed. Host-enforced read-only sandboxing and an
  exact hard timeout are environment-specific controls, not conditions for a
  native Skill review to be complete; the host's task lifecycle may provide
  cancellation or other bounds. The Skill does not re-enter Codex through a
  nested command.
- CI retains its independent model-review adapter and exact-SHA-pinned reusable
  workflow.

For a native Skill, the review-only role is part of the semantic contract, while
physical write denial and exact hard-timeout enforcement are execution
controls. This role assignment does not prove that a host technically
prevented writes; the local trust boundary does not attest host internals.
Host sandboxing, process approval, credentials and permission to send review
inputs to a model service are outside the semantic decision contract. A host
refusal before a validated structured decision leaves the review incomplete; it
is not a `BLOCK` decision. Gatekeeper must not weaken host policy to start a
reviewer or reinterpret that refusal as an architecture judgment.

The recorded revision selects inputs; it is not a workstation integrity lock.
Authority snapshots are included in the reviewer request from committed Git
objects. The runtime neither compares those objects with working-tree bytes nor
monitors whether `HEAD` changes while a review is running.

### CI model review

CI model review provides an independent execution boundary. Protected-base
policy and instructions select the required assurance; pull-request content
cannot authorize its own weaker route. Review credentials remain isolated from
untrusted or unverified executable code, and model/API/billing failure remains
fail closed when CI model review is required.

The reusable workflow currently retains a compatibility input that can read the
prompt and schema from the reviewed checkout while a consumer bootstraps its
first base-owned instructions. That route provides model review but does not
claim protected-instruction assurance. A privileged caller that requires
protected acceptance must select protected review instructions, as this
repository's self-review does.

CI execution is one evidence source, not a prerequisite for every repository
to obtain local/manual review. Repositories may select a local-only guardrail,
an explicitly defined locally attested route, CI model review, or policy-based
routing among supported routes. The trust claim must match the selected route.

### Current acceptance mechanism

The current `ci-enforced` path executes the model review and acceptance flow in
one workflow run. The accept job consumes protected policy resolution, review
status and the reported structured decision from that run. The reviewed SHA and
decision digest are reporting metadata; they are not yet a standalone,
versioned evidence artifact that another verifier can independently accept.

The current `local-only` policy is an explicit protected-base waiver of CI model
review. Its accept job records the selected waiver and succeeds without a review
result or structured decision. It does not reinterpret a local `PASS` as merge
evidence, and it supplies no claim that a model review ran. Replacing that waiver
with locally produced acceptance evidence requires the Issue #20 evidence and
verification contract first.

Local/manual decisions are currently development feedback only. No current
policy accepts an author-supplied local decision in place of the required CI
model review. Issue #20 owns the unimplemented evidence format, attestation
decision, protected routing rules and deterministic CI verifier.

### Target evidence and acceptance contract

Any future architecture evidence format must be versioned structured data and
bind at least the repository identity, reviewed base and head, Gatekeeper
identity, canonical authority and review-input identities, and the validated
decision. Changes to bound state must invalidate the evidence.

Whether local evidence requires signing, which identities are trusted, and
which changes require CI model execution are protected policy decisions. These
decisions must be specified before an evidence route is accepted; service
failure cannot activate a weaker route dynamically.

`Architecture Gate / accept` remains the authoritative required check wherever
a repository enables it. Today it verifies the same-run enforced result. If
Issue #20 adds other evidence routes, it must verify their evidence and
protected policy explicitly. It never silently reinterprets `BLOCK`, accepts
`OWNER_DECISION`, or treats report delivery as acceptance.

## Normative invariants

Every implementation and rollout must preserve these invariants:

1. Consumer repositories own architecture; the shared mechanism owns no
   consumer-specific semantic decision.
2. Review execution, evidence, and acceptance verification remain distinct
   concepts; new evidence routes must give them explicit contracts even when
   one workflow implements more than one.
3. Local/manual review remains independently usable and is not merely a CI
   helper.
4. Authority, prompt, schema, validation and reviewer selection are explicit
   inputs. Any route that claims protected-instruction assurance binds them to
   the protected revision; working-tree or pull-request copies cannot silently
   replace that protected authority.
5. Any independently reusable evidence introduced by Issue #20 is invalid
   after a bound revision or relevant policy/authority identity changes.
6. Protected-base policy alone selects acceptable current or future evidence
   routes and required assurance.
7. API, billing, credential, timeout or service failure never downgrades
   assurance dynamically.
8. `BLOCK` rejects the reviewed change. A separate authority-only amendment
   may be accepted through an explicitly enabled `OWNER_AMENDMENT` route
   without changing that historical `BLOCK`. `OWNER_DECISION` rejects the
   reviewed change. A separately adopted missing decision may become canonical
   through an explicitly enabled protected route; the original change still
   requires a fresh review and acceptable evidence.
9. Privileged credentials are not exposed to pull-request code or package
   lifecycle scripts. Credential-bearing third-party actions remain part of the
   selected CI trust boundary and follow its explicit supply-chain policy; this
   contract does not claim that every current action reference is immutable.
10. Distribution identities and executable entrypoints are exact, reviewable
    and reproducible; distribution mechanics do not define architecture.
11. The mechanism claims only the trust guarantees actually supplied by its
    execution route.
12. New consumer requirements are dogfooded through the corresponding shared
    path before broad rollout.

## Non-responsibilities

Architecture Gatekeeper does not own:

- filesystem or Git transaction monitoring;
- rollback, path leasing, object-store defense or workstation security;
- general code correctness, style, testing or vulnerability review;
- deployment, publication, service or business-operation authority;
- consumer architecture creation by inference;
- human owner decisions that are absent from canonical authority.

Other controls may provide these capabilities. Their existence must not be
misrepresented as an Architecture Gatekeeper guarantee.

## Dogfooding and change discipline

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

## Relationship to tracked work

- Issue #1 rolls the mechanism out per consumer. Each adoption selects its own
  authority and assurance policy under this contract.
- Issue #19 improves latency and routing without weakening these invariants.
- Issue #20 specifies the evidence format, attestation choice, protected-policy
  routes and model-free CI verification needed to fully separate review
  execution from acceptance verification.
- Issue #111 defines the missing-decision adoption problem. Its `OWNER_ADDITION
  / G0` mechanism is implemented in v0.5 and available only when a previous
  protected consumer policy selects it; this repository's self policy remains
  unselected. The candidate is bound to B by an annotated tag object. It does
  not require the historical `BLOCK` evidence or exact-claim authorization
  mechanisms of `OWNER_AMENDMENT`. The mechanism is not owner-authenticated,
  and implementation changes after B becomes canonical require a fresh review.
- Issue #75 defines the owner-amendment governance route. Issue #78 develops
  its core and explicit `G0` policy path; Issue #79 investigates a later
  production attestation adapter for a higher grade.

Those Issues may refine implementation choices, measurements and rollout. They
must not be used as implicit amendments to this contract.
