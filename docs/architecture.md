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

The mechanism may return `PASS`, `BLOCK`, or `OWNER_DECISION`.
`OWNER_DECISION` is an escalation that requires a decision to be recorded in
canonical consumer authority. It is not an alternate form of acceptance.

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
valid `G0` result. Higher-grade identity adapters verify actor evidence and
return authenticated principal facts, not acceptance results or grades. An
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
      PASS / BLOCK / OWNER_DECISION
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
   without changing that historical `BLOCK`. `OWNER_DECISION` rejects until
   the decision is recorded in canonical authority and a new review produces
   acceptable evidence.
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
- Issue #75 defines the owner-amendment governance route. Issue #78 develops
  its core and explicit `G0` policy path; Issue #79 investigates a later
  production attestation adapter for a higher grade.

Those Issues may refine implementation choices, measurements and rollout. They
must not be used as implicit amendments to this contract.
