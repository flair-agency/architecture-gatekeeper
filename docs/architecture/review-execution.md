# Review execution contract

This is a required normative member of the Architecture Gatekeeper self Authority
Set. Read it with the [shared contract](../architecture.md) and every other
selected member; topic separation supplies no implicit precedence or route
activation. Setup and operating guidance are in the [documentation map](../README.md).

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

- When Codex is selected, the automatic command Hook may launch a read-only
  child `codex exec`, because
  a command hook has no native reviewer handle. Its process timeout and
  read-only sandbox remain required safeguards for this automatically invoked
  child process.
- The standalone terminal CLI selects the adapter from committed reviewer
  settings. When Codex is selected, it uses the same child transport, retaining
  its read-only sandbox and bounded process timeout. When Gemini is selected,
  it uses the asynchronous Gemini API adapter under the explicit provider
  settings and deadline; it does not launch a Codex child or claim that child's
  sandbox guarantees. The automatic Hook uses the same provider selection.
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

The native adapter's request and decision paths are host-managed session
inputs supplied by the trusted Skill execution side, not destinations selected
by candidate repository content, task text, or reviewer output. The Skill
execution side owns private temporary allocation, exact-request and decision
recording, and cleanup on success, failure, or cancellation. The native adapter
owns request construction and persistence and decision validation; it does not
attest the supplied paths' private allocation or isolate a hostile same-user
host. Exclusive creation and file permissions are supporting measures, not a
generic path sanitizer or proof of parent-directory privacy.

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

#### Target local provider-independent execution (Issue #265 owner direction)

Local callers depend on the shared review and execution contracts; composition
selects a supported adapter from reviewer settings at the same recorded
revision. Existing settings without a provider retain Codex compatibility.
Provider selection, model, provider-specific settings and deadline remain
explicit review inputs. Codex reasoning effort and Gemini thinking settings
are distinct; a mapping does not establish semantic equivalence. The adapter
must apply the selected settings or leave review incomplete, with no automatic
provider fallback or parallel result adoption.

Async adapters use explicit async APIs. Existing synchronous APIs remain
compatible and reject an unsupported async selection before starting it.
Execution reports identify the adapter-applied provider, requested model and
settings separately from any backend-reported model identity; they do not prove
backend internals or create reusable acceptance evidence. Schema, complete
selected authority and committed validation remain shared responsibilities.
Timeout, cancellation or unavailable credentials yield no semantic decision;
cooperative cancellation alone does not prove physical termination. Automatic
Codex child execution retains its sandbox and process bound. A Codex-native
Skill that cannot apply another provider's settings remains incomplete rather
than substituting its host model. This target enables no new route, changes no
CI credential boundary and preserves local development-feedback assurance.

### CI model review

CI model review provides an independent execution boundary. Protected-base
policy and instructions select the required assurance; pull-request content
cannot authorize its own weaker route. Review credentials remain isolated from
untrusted or unverified executable code, and model/API/billing failure remains
fail closed when CI model review is required.

#### Self-repository original Fork denial (Issue #350 owner decision, 2026-10-04)

This decision applies only to Architecture Gatekeeper's self-repository. The
repository accepts original Fork pull requests for contribution and review. It
records the required responsibility but does not establish that the runtime
implements or verifies it, and it changes no host settings. A workflow
triggered by an original Fork pull request must not invoke privileged
Architecture Gatekeeper execution, model review, provider/source-credential
access, OIDC token issuance, privileged write capabilities (including
attestation publication), or paid review dispatch, even when the triggering
actor or a commenter is a trusted maintainer. Maintainer approval, a previously
issued exact-HEAD grant, or Environment approval does not permit those
operations. This decision selects no App, broker, Environment grant, or
alternate authorization mechanism.

This restriction applies to privileged and paid review paths. It does not
prohibit credential-free CI or a credential-free diagnostic/check that reports
that the Fork change is unreviewed. Candidate code remains untrusted. No
unreviewed Fork may receive a semantic `PASS`, or satisfy a protected policy
that requires a completed semantic review through a skipped or neutral-success
check. When protected policy requires CI model review, the accept result is
incomplete/fails closed if no completed valid review exists. The existing
explicit `local-only` waiver retains its stated meaning; it is not a semantic
result for the Fork change.

Determine the base/head repository relationship from trusted host metadata
bound to the exact repository and pull request, using the immutable numeric
repository IDs. When the valid base and head repository IDs differ, classify
the pull request as an original Fork (cross-repository) and deny the privileged
path, regardless of actor. Do not substitute author association, usernames,
repository-name strings, branch names, or candidate claims. Missing, null,
malformed, inconsistent, or unavailable IDs produce an unknown/incomplete
classification and never enable a privileged path. The Fork restriction cannot
be disabled by pull-request content or event claims.

A maintainer may inspect a Fork contribution and manually select or modify
needed changes on a same-repository branch, then open a new ordinary
same-repository pull request. The new pull request receives a separate review
under its own exact base/head and the existing protected-base policy. This
promotion is an admission choice for review, not evidence that candidate code
is safe or trusted. No result, approval, or acceptance transfers to the
original Fork pull request. A human-facing link to the source Fork pull
request and a brief description of the selected changes are useful context;
this decision requires no new promotion record format, storage, or retention
rule.

The detailed Issue #331 exact-HEAD authorization and Issue #345 Environment/
grant designs below remain deferred, inactive targets. Their recorded choices
and historical review results remain intact; they do not authorize
implementation or operation under this self-only policy. A consumer's separate
architecture and protected policy remain consumer-owned and are not changed by
this self-repository decision.

#### Deferred target Fork PR review authorization (Issue #331 owner direction, 2026-10-04; inactive)

This detailed design remains a future, inactive target. It does not authorize
privileged or paid execution for original Fork PRs in the self-repository under
the current policy above. Other consumers require their own protected policy
selection.

For an explicitly selected public-repository profile, the original Fork PR
remains directed at `main`; a maintainer's authorization permits a
consumer-funded model review of that PR's exact HEAD. Architecture Gatekeeper's
GitHub integration supplies the bounded authorization mechanism. The consumer
selects the supported profile, approver and producer policy, and funding scope
through its authorized prior configuration. Candidate event metadata,
workflow changes, or submitted approval claims cannot select that policy or
authorize credential use. The trusted integration verifies repository, PR,
and exact HEAD bindings before provider-credential acquisition or issuance and
renewal capabilities become available to the selected job or launcher
interfaces, and before any paid model request is dispatched. A changed HEAD
requires new authorization. After authorization, provider credentials and
applicable issuance or renewal capabilities remain confined to the selected
trusted launcher/proxy interfaces and are not supplied to the reviewer. These
are interface-boundary claims for the selected profile, not a claim of
universal same-user host isolation. The review and result remain on the
original PR.

Permission to spend on review is separate from approval of the change,
authentication of an owner outcome, trust in candidate code, semantic review,
evidence, and acceptance. Preserve protected input selection, consumer-selected
authentication, and credential isolation, including credential issuance and
renewal interfaces. Pending, denied, revoked, stale, or incomplete
authorization produces no semantic review result and cannot satisfy a required
review through skipped or neutral-success semantics; an explicitly selected
`local-only` waiver retains its existing meaning. Make only profile-specific
trust claims; service failure does not enable a weaker route. This high-level
target leaves existing routes unchanged. The initial public-Fork Environment
profile target below explicitly refines this high-level target by selecting its
Environment design direction and initial funding/lifecycle bounds. Concrete
consumer configuration, host proof, implementation, support and activation
remain pending. This profile adds no API-key onboarding or WIF activation and
does not change Issues #218, #219, or #20.

#### Deferred owner-selected initial public-Fork Environment profile target (Issue #331, 2026-10-04; inactive)

The detailed design and previously selected funding/lifecycle bounds below are
retained as historical target detail. They are deferred for the self-repository
by the current policy above and grant no current authorization to run this
profile.

The owner selects the initial funding and lifecycle bounds for a public-Fork
profile: one ordinary semantic review execution per grant, restricted to run
attempt 1. Additional `OWNER_ADDITION` or `OWNER_AMENDMENT` eligibility
dispatch is outside this scope and leaves required review incomplete; it cannot
be skipped or neutralized into success. Every retry requires a new workflow
run and new authorization, even for the same HEAD. When cancellation or the
consumer-selected expiry is observed, stop further admission and paid dispatch.
This offers no atomic revocation-versus-spend ordering, cannot undo an already
dispatched request, and does not guarantee descendant termination. Missing
required authorization/profile selections, including snapshot lifetime, leave
execution incomplete. A numeric dollar cap is optional; omitting it does not
make authorization incomplete, and any configured cap remains consumer-owned.

The initial Environment-based design target is a credential-free approval
workflow, a trusted verifier that produces a same-run grant bound to the exact
repository, PR, full HEAD, run/attempt and protected review snapshot, and a
separate credential-capable launcher that may acquire credentials or dispatch
only after validating that grant. Environment approval alone is not
authorization. The approval job receives no provider/source secrets, inherited
secrets or OIDC issuance capability. Keep the pinned upstream Codex Action and
its safeguards; any external-actor override must be protected,
grant-verified and limited to the exact single login, never a wildcard or
candidate-selected value. Publicly readable review inputs are in scope; private
sources requiring credentials remain unsupported and fail closed.

The last trusted admission check must occur after any job-queue delay but
before provider credentials or issuance capabilities become available to the
credential-capable job/launcher, and be repeated immediately before paid
dispatch. A first workflow step after GitHub has supplied credentials is too
late. If the selected host cannot provide this ordering, the profile remains
unsupported and inactive.

This target does not select consumer principals or numeric actor IDs, a
snapshot lifetime, Environment configuration, bypass or required-check policy.
The protected prior policy must provide the required authorization and profile
selections, including snapshot lifetime; missing these required values leaves
execution incomplete. A numeric dollar cap is optional; omitting it does not
make authorization incomplete. Any configured cap remains consumer-owned and
is not a new universal requirement of this target. It also
does not select an additional App, PAT or other
credential-bearing metadata-readback capability. Before support or activation,
prove the effective job token can read the required approval and Environment
metadata, and verify protected caller/check producer identity, delayed Fork
check association, immutable merge/input freshness, credential non-inheritance
and lifecycle negatives, including controlled Fork A (unapproved) → A
(authorized) → B (unapproved) evidence. If any required readback is unavailable,
or a candidate can spoof the selected required check, remain inactive; a new
capability or reporter route needs a separate owner decision and canonical
boundary. Selecting this target proves none of these conditions.

The reusable workflow currently retains a compatibility input that can read the
prompt and schema from the reviewed checkout while a consumer bootstraps its
first base-owned instructions. That route provides model review but does not
claim protected-instruction assurance. A privileged caller that requires
protected acceptance must select protected review instructions, as this
repository's self-review does.

Owner trusts `openai/codex-action` at the workflow pin; retires integrity jobs
(#40, 2026-10-02).

#### Target provider-independent CI execution boundary (Issue #332 owner decision, 2026-10-04)

Prioritize a narrow shared CI execution boundary before provider-specific
activation. Protected consumer policy at the recorded protected revision owns
reviewer/provider, model, provider-specific settings and applicable execution
limit selection. The protected caller materializes and applies that exact
selection with complete revision-bound inputs and verifies agreement before
execution; it cannot substitute its own selection. Runtime identity and
credential provisioning retain their existing protected host responsibilities.
A selected execution adapter applies those inputs and
exposes bounded response material or an incomplete execution outcome. It does
not select authority, translate settings, switch providers, validate semantic
decisions or authorize acceptance. Shared validation owns schema, selected
authority and consumer rules; reporting, protected evidence binding and
acceptance remain outside the execution adapter.

The invoking host owns deadline and cancellation dispatch. Adapters own only
processes and resources under their actual control. Record observed completion
or failure and bounded nonsecret diagnostics; missing lifecycle facts remain
unknown. A requested cancellation, Action step outcome or cooperative deadline
is not proof of descendant termination, runner recovery or exact kill time.
Execution completion is separate from validated semantic completion: exit zero,
a response file or an execution receipt alone grants no PASS or acceptance.
Required review remains incomplete after failed/cancelled execution, missing
response or failed decision validation.

Preserve the immutable upstream Codex Action and its existing timeout, sandbox,
credential and cleanup safeguards. A workflow `uses:` Action remains a
host-specific adapter; the shared boundary need not invoke it through a Node.js
function or claim that a wrapper can kill its descendants. Connect common
input/result handling first, then the already-selected Gemini execution profile.

This target adopts no generic host framework, new credential privilege,
portable acceptance evidence, automatic fallback, parallel result adoption,
Gemini/governance activation or release gate. It does not declare the hung
incident fixed. Concrete integrations require verification before route-support
claims; this owner decision does not itself activate them.

#### Target API WIF CI authentication boundary (Issue #218 owner decision, 2026-09-30)

GitHub Actions may use OpenAI API WIF for API auth only; it differs from managed-workspace Codex WIF (ChatGPT auth). OIDC request capability, assertion and exchanged API token stay in trusted CI, isolated from reviewer/tools, PR code and package lifecycle scripts. Only prior protected policy may select WIF; candidates cannot select or enable it. Missing/invalid/unavailable selection leaves review incomplete: no API-key fallback or weaker acceptance. Keys remain until WIF is implemented, verified and policy-selected. No reviewer/input/decision/evidence/acceptance/v0.6.0 change; inactive.

#### Target multi-provider credential-isolated review proxy boundary (Issue #252 owner decision, 2026-10-02)

CI may use a credential-isolated review proxy: the trusted launcher owns
credentials and supplies them privately to the proxy. The launcher must withhold
provider credentials and OIDC/token-renewal capabilities from the runner’s
environment, arguments, and any other explicitly supplied launch interface.
This includes credential-file selectors and handles granting access to a
credential or renewal service; withholding an exchanged token alone is
insufficient when a renewal capability would still be passed to the runner.
The proxy binds only to an ephemeral loopback endpoint and limits
credential-bearing dispatch to allowed methods/model routes on selected official
provider hosts within launcher-selected project, region and model scope;
arbitrary destinations, scope mismatches and redirects fail closed. The runner
consumes responses for deterministic schema and authority validation.

This target claims credential non-inheritance and constrained proxy dispatch,
not restricted direct runner networking, same-user host isolation, or provider
assurance equivalence. Credential non-inheritance does not make independently
available host capabilities inaccessible: an authenticated Cloud SDK installation,
credential files readable by the same OS user, or host identity services may
remain accessible. Preventing their use requires separately selected and verified
host isolation. Protected acceptance requires explicitly adopted consumer policy
and verified route-specific execution evidence; this text activates no route.
Implementation details are in the
[proxy specification](../investigations/2026-10-02-credential-isolated-review-proxy-boundary.md);
it cannot independently amend this contract.

#### Target Gemini CI authentication selection (Issue #252 owner decision, 2026-10-04)

The first Gemini CI integration targets Vertex AI authenticated through Google
Cloud Workload Identity Federation. The trusted CI side obtains the GitHub OIDC
assertion and exchanges it for scoped, short-lived Google credentials; only the
credential-isolated launcher/proxy uses the resulting provider credential.
The reviewer runner does not inherit the assertion, provider credential or
renewal capability through any explicitly supplied launch interface, under the
proxy boundary above. Authentication failure leaves the selected review
incomplete; it does not enable API-key authentication or another provider.

This selects the authentication direction, not a deployed consumer profile.
Exact Google identity bindings, project, region, credential lifetime/renewal
and operational limits still require explicit
selection and verification before activation. Codex remains supported; standby
or parallel result adoption is separate work. This decision does not activate
Gemini CI, establish semantic quality, or change acceptance and release gates.

#### Target Gemini CI execution selection (Issue #252 owner decision, 2026-10-04)

Use Gemini CLI with a controlled, revision-bound workspace, launcher-owned
configuration and explicit read-tool allowlist. Candidate control/instruction
files remain complete evidence with original path/revision identity, never
automatically loaded CLI configuration or protected instructions. Candidate
workspace configuration cannot enable tools, hooks, skills, extensions or MCP.
The launcher/proxy retains Vertex WIF credentials under the boundary above.
CLI exit zero alone is insufficient: schema/authority validation is mandatory;
timeout, cancellation, authentication or invalid output leaves review incomplete.
This claims no candidate-code execution, Codex equivalence or host isolation,
and activates no acceptance route. Owner adopts `gemini-3.8-flash` with
`thinkingLevel: MEDIUM` as the initial CI profile, without `thinkingBudget`.
Before activation, explicitly select and verify the remaining deployment settings
and obtain authenticated route evidence for quality, cost, latency and decision
consistency; determinism is not promised.

#### GitHub step-output sink (owner decision, 2026-10-03)

The GitHub-specific step-output adapter treats `GITHUB_OUTPUT` as a trusted
sink supplied by the invoking GitHub runner. It reads that environment value
directly; it exposes no caller-selected sink or runner-temp argument and does
not require the sink to be below `RUNNER_TEMP`. The invoking execution must
preserve this runner-provided value rather than derive it from candidate code,
repository content, request JSON, or model output.

The adapter requires an absolute canonical path to an existing regular file,
rejects symbolic links and hardlinks, and checks the opened file's identity
before appending bounded command-protocol data. These checks do not authenticate
an attacker-controlled environment or establish same-user host isolation.
Publication supplies no semantic acceptance authority and activates no CI
route. This decision does not change the fixed runner-temp paths used for
protected review inputs and other temporary artifacts.

#### Target: legacy v1 CI authority repair (Issue #120 owner decision)

The LIVE Agency #106 trial exposed a false acceptance: an enforced legacy v1
review treated candidate-edited authority and unsupported completion claims as
canonical. The owner explicitly authorized a fail-closed repair for v0.5.1 on
2026-09-26, including a compatibility break for existing enforced v1 consumers.
This is the target contract, not active acceptance behavior. It becomes
applicable only after PR #126's implementation and focused regression tests are
integrated. Until then, this text does not establish that the v1 runtime
enforces these requirements. Historical v1 reports are not retroactively
reclassified.

For an enforced v1 review, the recorded base policy must select a nonempty,
bounded `authorityFiles` list of canonical repository paths, plus canonical
`promptPath` and `schemaPath` values. It must include `validationPath`, either
set to a canonical JSON path for additional decision validation or explicitly
to `null` when no additional validation is selected. The caller's
`validation-path` input must match this recorded-base value exactly. Missing,
malformed, or mismatched validation selections fail before review. The workflow
must read the selected policy, instructions and authority bytes from that same
recorded base, validate regular-file snapshots, and make their identities
visible in the report. The candidate cannot choose a different base file
through caller-supplied paths or change the policy, instructions, or validation
rules used for its review; candidate-modified authority cannot be treated as
adopted.
Under this target, the ordinary v1 accept path must fail closed when any
selected authority is changed by the candidate, the selector or required
snapshot is absent or invalid, or the decision omits or adds a selected
authority path. A separate previous-base-authorized addition route remains
available for an eligible authority-only B; an ordinary v1 `PASS` cannot
substitute for it.

Previously valid enforced v1 policies without these base-selected inputs, or
without a matching caller validation selection, cease to qualify for acceptance
when this target is implemented. A candidate PR cannot enable its own
acceptance by adding the fields to its head; the consumer must first adopt the
base policy and a base-owned caller under its own governance. A caller loaded
from a pull-request merge commit can itself be candidate-controlled, including
its selected reusable-workflow revision. Until the caller and required check
producer are controlled by the applicable host mechanism, the workflow result
alone cannot claim protected merge enforcement or a protected canonical
transition. Missing host-enforcement evidence is reported as its own assurance
dimension; it does not by itself require permanent `ADVISORY_ONLY` treatment of
a procedural OWNER_ADDITION result. The separately versioned Issue #121 route
defines the evidence and selection rules for that outcome and does not weaken
this legacy v1 fail-closed target.

CI execution is one evidence source, not a prerequisite for every repository
to obtain local/manual review. Repositories may select a local-only guardrail,
an explicitly defined locally attested route, CI model review, or policy-based
routing among supported routes. The trust claim must match the selected route.
