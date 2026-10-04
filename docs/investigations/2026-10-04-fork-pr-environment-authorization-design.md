# Fork PR Environment authorization design proposal

Status: **INACTIVE TARGET / DESIGN AND VERIFICATION PROPOSAL**, 2026-10-04. For
[Issue #331](https://github.com/flair-agency/architecture-gatekeeper/issues/331),
this document records conditions and evidence gaps; it is not implementation,
support evidence, or permission to configure or activate a route. [PR #341](https://github.com/flair-agency/architecture-gatekeeper/pull/341)
merged at `2026-10-04T07:34:30Z` as
`2bdc1fedf51df729823b595e1eb2af03fc3a10db`, recording the inactive high-level
target. The owner has authorized the following initial profile choices for the
proposed canonical clause; adoption of this additional clause is pending: one
ordinary semantic review execution per grant; no additional eligibility
dispatch; retries use a new run and new approval; and observed cancellation or
expiry stops further admission/dispatch. Required authorization/profile choices,
including snapshot lifetime, must come from protected consumer policy; any
numeric dollar limit remains consumer-owned and is not a new universal target
requirement. The Environment-backed approval,
verified same-run grant, and separate credential-capable launcher remain an
inactive, verification-conditional target. Consumer-selected numeric approvers,
snapshot lifetime, budget amount, and host policy remain unset; an additional
App/PAT/readback capability has not been selected.

## Recommendation and assessment boundary

**Owner-selected initial direction (target only):** for an original public
Fork PR targeting `main`, use a secret-free GitHub Environment approval
workflow, a strict same-run repository/PR/full-HEAD/run/attempt/snapshot grant,
and separate credential-capable execution admitted only after grant
verification. Permit one ordinary semantic review execution per grant on
attempt 1. Additional eligibility dispatch is outside the selected scope and
must leave required review incomplete. Any retry requires a new workflow run
and new explicit approval. Stop further admission/dispatch when cancellation
or expiry is observed. These selections do not constitute implementation,
support, or activation; concrete consumers still select their permitted
approvers, snapshot lifetime, authentication, and host rules. A consumer may
also select an optional numeric funding limit; this target does not require a
universal dollar cap.

An enforcing profile remains pending proof of protected caller/check producer,
delayed Fork check association, credential boundary, and lifecycle negatives.
Preserving same-run result semantics does not prove host merge enforcement.
If candidate workflows can spoof the selected required check, concrete protected
reporter/required-workflow support under #210/#219 is a dependency; this proposal
does not activate those routes or substitute advisory acceptance dynamically.
Operational authorization belongs to the GitHub host integration, outside Core.
Preserve adopted #332 execution/validation separation and the immutable Codex
Action safeguards.

## Read-only baseline and limits

The historical runtime/host baseline below was observed at `bc4c5ea264b4db2c8aad860af4a97eb35ba605e3`, including adopted #332. After
#341 integration, the complete six-member Authority Set was read from
`2bdc1fedf51df729823b595e1eb2af03fc3a10db`. Latest main for this proposal is
`773217b3dcff225f69c3bda07079d61b49651e21`; its changes since that Set read
add #340 execution-result and #343 execution-observation source/tests, and the
manifest and six members are byte-identical. AGENTS.md and the development guide were also read.
Target adoption and the new profile-direction record do not activate this proposal.

- [PR #330 run 37175166014](https://github.com/flair-agency/architecture-gatekeeper/actions/runs/37175166014),
  attempt 1, and accept check `111356380511` were observed on PR HEAD
  `61519a66359a38067d888830ed5f90926edbb0ee`; this is one same-repository
  `pull_request_target` association, not delayed approval or Fork E2E.
- Baseline GET of `architecture-gate-self-protected` returned Environment ID
  `23381880643`, only `branch_policy`, `can_admins_bypass: true`, and no required
  reviewers. GET run `37175166014/approvals` returned `[]`.
- Caller YAML has no Fork funding gate, but the pinned Codex Action checks original
  `GITHUB_ACTOR` write/maintain/admin permission before model execution. Empty
  `allow-users` and false `allow-bots` are its defaults. Therefore caller YAML
  alone does not prove external PRs automatically spend model budget. The current
  workflow's credential check occurs earlier than that Action guard.
- Current policy/review checkouts use mutable `refs/pull/N/merge`. Recording that
  checkout's SHA does not verify its parents against current/event base and HEAD.
  Parent validation in the owner-addition job is later than ordinary review.
- Current inline-report live-HEAD checks protect comment delivery; they do not
  invalidate the semantic conclusion or ordinary final acceptance.

## Platform and credential facts

Environment rules pass before GitHub sends a job to a runner; Environment secrets
then become accessible. Native approval identifies the run and selected
Environment(s), not an explicit repository/PR/HEAD funding claim. One of up to six
configured reviewers can approve. Branch rules match the run's `GITHUB_REF`, so
`main` restriction is not itself proof of exact PR authorization.

Runner source at `d7bc179baf11a02110b46cfbbc4040f74ac3f60a` initializes job variables
from `AgentJobRequestMessage.Variables` and constructs the secrets context during
`InitializeJob`. It supplies no later first-secret-reference release boundary.
The closed GitHub server's filtering of unused Environment secrets is unproven:
do not claim that a job with no secret expressions receives none. A later live
HEAD read cannot retract credentials already supplied at job initialization.

The approval workflow must therefore receive no provider/source secrets through
`workflow_call`, use no `secrets: inherit`, and reference a genuinely credential-free
approval Environment. Its jobs have no OIDC issuance capability. Explicit reusable
workflow secret passing separates it from a subsequent selected credential workflow;
an Environment can independently supply secrets and must be checked separately.
Provider credentials may remain in a repository secret explicitly passed only to
that later workflow, or a separate selected provider Environment. No weaker auth
fallback or new API-key onboarding/WIF activation is introduced.

Permission gap: List environment secrets requires fine-grained `Environments: read`; Get an environment needs `Actions: read` or
public-resource unauthenticated access. Workflow `GITHUB_TOKEN` permissions omit `environments`. Necessary metadata readback with an
actual job token is unproven: do not infer access from actions/deployments read. Unreadable metadata leaves topology exclusion
unverified. An additional App/PAT/readback capability needs separate owner selection, canonical boundary and credential proof; none is
added here. This is a capability gap, not a demonstrated platform impossibility.

Claim selected-interface non-exposure before a verified grant and reviewer
non-inheritance afterward, not general runner/same-user isolation. Preserve the
pinned Action's separate proxy-start credential input, read-only sandbox,
drop-sudo, timeout, protected argument handling and cleanup. Reviewer tools receive
neither provider credentials nor applicable issuance/renewal interfaces.

## Finite profile, grant and operator workflow

1. Protected trusted code snapshots repository IDs, PR number, Fork repository ID,
   full HEAD A, base, immutable merge M, protected policy/input/runtime/caller
   identities, run ID/attempt, request identity and a bounded snapshot digest.
   The digest covers stable captured request/config/input identities, excluding
   the derived grant, approval receipt and approval comment. The later mandatory
   comment commits this existing snapshot and its exact selected scope, avoiding
   a circular identity. Use read-only GitHub access and trusted runtime; execute
   no candidate content.
2. Preflight summary and approval-job display name state repository, PR, full A,
   execution scope and expiry basis. Link to exact commit/run material. The fixed
   Environment name and default approval wording alone are insufficient.
3. Approver copies a strict commitment into the deployment approval comment:
   `AGK-SPEND-v1 repoId=… pr=… head=… run=… attempt=1 snapshot=… scope=…`.
   This is explicit funding authorization, separate from PR approval or adoption.
   Controlled UI proof must establish that full material is available before click.
4. After the secret-free approval job starts, verify complete bounded API history,
   selected Environment/settings, approved actor numeric ID, exact comment,
   attempt 1, fixed topology and live bindings. Emit only a same-run grant.
5. A separate credential-capable job/called workflow is admitted only after this
   grant passes. It permits exactly one ordinary semantic review execution on
   run attempt 1; any conditional eligibility dispatch is out of scope and leaves
   required review incomplete. Every credential-bearing job independently
   rejects attempt >1 before admission. Revalidate grant/live state/materialized
   inputs after any job-queue delay at the final trusted boundary before
   credential/issuance capabilities become available, and again before paid
   dispatch, then use the immutable upstream Action. A first job step after
   GitHub has supplied credentials is too late; if the selected host cannot
   provide pre-availability revalidation, this profile is NO-GO. This is an
   execution count, not a bound on provider API requests or consumer dollars.
6. Report authorization pending/denied/stale/expired/incomplete separately from
   semantic completion. Required review is never satisfied by a skipped or neutral
   success. Report/accept recheck live bindings and selected producer assurance.

| Grant property | Proposed bounded rule | Proof or limitation |
| --- | --- | --- |
| Identity | Exact repository ID/PR/full HEAD/run/attempt/snapshot/scope | Strict schema; reject unknown, missing, duplicate or mismatched fields |
| Platform record | Exactly one approved record for selected approval Environment | Reject multiple, duplicate, conflicting relevant history; never latest-wins |
| Actor | Prior-selected numeric user IDs, agreeing with Environment roster | No event author-association inference; team policy needs separate membership proof |
| Topology | Exactly one job uses approval Environment, one run, attempt 1 | Caller/workflow identity protected and verified; no matrix/dynamic extra approval jobs |
| Bypass | `can_admins_bypass == false` plus matching normal approval | Missing/true/unreadable fails closed; bypass alone grants nothing |
| Time | Record approval time unavailable; retain trusted `verifiedAt` | Expiry measured from trusted run/snapshot creation, not inferred approval time |
| Attribution | Run-specific grant and logical fixed gate identity | REST/GraphQL review history lacks approval attempt/job/deployment ID |
| Consumption | One ordinary semantic review execution, on attempt 1 in this run | No additional eligibility dispatch, provider-request count, dollar limit or cross-run spending ledger is selected |

REST review history supplies actor, state, comment and Environment identities.
GraphQL DeploymentReview adds an ID but no approval timestamp or direct
attempt/job/deployment binding. The finite topology avoids requiring those
unavailable facts; do not report them as authenticated. Settings/readback before
and after approval does not prove arbitrary intervening administrator changes.
Stronger historical-policy or atomic guarantees require another selected mechanism.

The pinned Action still checks the triggering actor, not the Environment approver.
For external actors, explicitly select a grant-verified single-login `allow-users`
override with strict username validation; never `*`, substituted `GITHUB_ACTOR`,
or a candidate-selected override. This profile integration needs canonical
selection and pinned-source fixture/E2E proof; preserve the Action itself.

## Owner-selected initial funding scope

| Existing paid site in architecture-gate.yml | Execution meaning |
| --- | --- |
| Ordinary `review`, around line 306 | Ordinary semantic review |
| `owner-addition`, around line 530 | Conditional missing-decision eligibility review |
| `owner-amendment-semantic-eligibility`, around line 749 | Conditional amendment eligibility review |

The owner selects **one ordinary semantic review execution per grant** as the
initial profile scope. Conditional `owner-addition` and
`owner-amendment-semantic-eligibility` dispatches are not authorized by this
grant. If either is required, stop incomplete before that additional dispatch;
do not skip or neutralize required review to claim success. Existing governance
meanings remain unchanged. This execution-slot bound does not count provider
HTTP/model requests or set a consumer's dollar budget. Each consumer's numeric
funding limit, if any, remains an optional protected prior-policy choice; the
one-execution bound is not an HTTP-request or dollar cap.

## Immutable review inputs and state transitions

Resolve M before waiting, retain its immutable object, require exactly two parents
`(base, A)`, and after approval check out that M rather than silently follow the
mutable merge ref. Verify actual checkout SHA/parents/tree and current PR/base,
protected caller/runtime/policy/instruction/schema/validation/Authority Set identities
before dispatch. Materialize the complete selected inputs from bound protected
revisions and verify settings agreement. HEAD spend identity and current review
input/merge freshness are separate; a funding grant cannot repair stale inputs.

Initial evidence is limited to a public fixture and public/read-only self authority bytes. Preflight commits immutable source
IDs/revisions and available public input digests; after grant, admitted trusted materialization validates all exact bytes, digests and
protected settings before model dispatch. Credential-requiring private external Sets are outside this first profile and fail closed.
Existing source-read credential routes and consumer ownership are unchanged; no general private support.

| State or trigger | Proposed behavior |
| --- | --- |
| Unapproved A | Visible wait; no credential execution admitted, no semantic result |
| Approved A, current bindings | Admit selected execution slots once; review immutable M containing A |
| B pending/before grant validation | A snapshot stale; B needs a new snapshot/grant |
| B after grant/before dispatch | Live launcher check stops dispatch; A grant never permits B |
| B during execution/report | Preserve historical A facts; no current acceptance of B |
| Run cancellation/expiry observed before admission/dispatch | Stop; no further dispatch |
| Post-grant queue delay | Revalidate after delay and before credential/issuance availability; stale, cancelled or expired grant denies admission |
| Cancellation during execution | Record request/observed outcome; cannot undo already dispatched spend |
| Full/partial rerun | Attempt >1 rejected at every credential/dispatch/accept boundary |
| Concurrent/repeated trigger | Each run requires its own explicit grant; concurrency is not a spend ledger |
| Close/draft/reopen | Stop on observed close/draft; reopened run requires fresh grant even for A |
| Base/policy/runtime/input update | Stale materialization/result; fresh snapshot/review required |

Every retry starts a new workflow run and requires a new Environment approval,
even for the same HEAD. A GitHub rerun with attempt greater than 1 cannot reuse
the grant. The event or operator interface that starts a fresh run is not selected
here. The consumer's protected policy must select a bounded snapshot lifetime;
there is no default duration, and missing expiry selection leaves execution
incomplete.

The selected behavior for revocation/expiry is to stop further admission and paid
dispatch when cancellation or expiry is observed at grant validation and again
immediately before dispatch. This is best-effort observed ordering: state may
change between checks. It offers no atomic revocation-versus-spend guarantee,
cannot undo a request already dispatched, and does not guarantee termination of
an in-flight request or descendant process. No extra App, PAT, exact-revoke
record or broker capability is selected. A stronger guarantee would require a
new owner decision, canonical boundary and proof.

## Ordered nonpaid fixture gates after profile selection

Canonical target adoption alone authorizes no fixture workflow/settings changes.
After owner choices and concrete profile are recorded, authorize a controlled public
Fork fixture with zero provider/source credentials, read-only GitHub tokens and a
protected nonpaid stub. Synthetic decisions never supply production acceptance.
Run these gates in order; retain exact revisions, API readbacks and nonsecret traces.

| Order / gate | Required observation and negative | GO / NO-GO boundary |
| --- | --- | --- |
| 1. Credential-free approval | Inspect effective caller/called-workflow sources, explicit secret arguments, Environment secret metadata and permissions: no supplied provider/source secrets, no inherit, empty approval Environment, no `id-token: write`. Observe unapproved A cannot reach stub admission. Use trusted presence/capability assertions without printing secret values; closed-server unused-secret filtering is not assumed. | GO only for the demonstrably credential-free topology and verified metadata readback; standard-token capability is unproven (permission gap above). Any selected credential/issuance route before grant, or inability to verify exclusion, stops this candidate. Zero real credentials do not prove later authenticated-launcher isolation. |
| 2. Exact approval commitment | Before clicking, capture UI showing repository/PR/full A, immutable snapshot, scope and lifetime basis. Verify complete bounded run-approval history, numeric actor/selected roster, Environment ID/settings and exact strict comment. Test absent/wrong/extra/duplicate/conflicting records, unauthorized actor, unreadable data and bypass; no latest-wins or inferred approval time/attempt ID. | Exactly one verifiable normal approval binds this run/snapshot/scope. Any ambiguity or missing full commitment stops this candidate; one fixed gate/attempt 1 is required. |
| 3. Original Fork/check producer | Delay A at approval, then observe released job/check-suite/check-run full SHA and original PR association; B stays unapproved. Create a candidate same-context check negative under fixture authority and inspect the selected host rule's actual result. | Wrong/missing delayed association stops this same-run reporting layout. Accepted spoof or unproven producer protection leaves enforcing support NO-GO pending concrete #210/#219 support; funding fixture evidence cannot substitute advisory review. |
| 4. Pinned actor guard | Exercise the permission routine at the existing Action pin without a model request: default external actor denied; verified single triggering-login override succeeds. Reject wildcard, substituted identity and candidate-selected or forged-grant overrides before invocation; preserve existing safeguards. | Inability to admit the authorized actor through this exact protected override, or unauthorized admission, stops this candidate. Source-only tests require later controlled Action integration proof. |
| 5. Immutable M/lifecycle order | Trace preflight → grant validation → delayed-job pre-admission revalidation → credential capability availability → immediate pre-dispatch → report/accept. Verify M's actual SHA/parents `(base,A)`/tree and full protected inputs. Change HEAD/base/policy, cancellation and expiry during a post-grant job-queue delay as well as at wait, pre-dispatch and in-flight boundaries; test full/partial rerun, close/draft/reopen and concurrent runs. | Stale/B/reused-grant/cancelled/expired dispatch or acceptance stops this candidate. Attempt >1 must fail before every credential admission, dispatch and acceptance; observed cancellation/expiry stops later dispatch. A first job step after credential injection is too late. If pre-availability revalidation cannot be proved, NO-GO. Unobserved races and already-dispatched spend remain outside the proposed guarantee. |

Verify the selected scope at all three existing paid sites: only one ordinary
semantic execution may dispatch per grant; any extra eligibility dispatch stops
incomplete and cannot skip into acceptance. Preserve #332
execution/validation separation. Verify observed cancellation/expiry stops later
dispatch; do not infer atomic revocation or guaranteed in-flight termination.

These fixtures establish only the recorded host/admission properties. Real
credential-boundary proof and controlled authenticated Fork A unapproved → A
approved → B unapproved evidence remain support prerequisites. Preserve selected
mandatory review throughout; an enforcing profile cannot dynamically downgrade.

Implementation seams after selection: protected caller; separate secret-free
reusable authorization workflow and GitHub-specific verifier; policy selection; all credential/paid sites in architecture-gate.yml; immutable materialization;
ci-report.mjs and ci-enforced-acceptance.mjs. No generic host framework is proposed.

## Primary sources and fixed evidence

- [Environment rules and secrets](https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments)
- [Job release boundary](https://docs.github.com/en/actions/concepts/workflows-and-actions/deployment-environments)
- [Approval UI](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/review-deployments)
- [REST run approvals and pending deployments](https://docs.github.com/en/rest/actions/workflow-runs)
- [REST Environment readback](https://docs.github.com/en/rest/deployments/environments)
- [Environment secret metadata permissions](https://docs.github.com/en/rest/actions/secrets#list-environment-secrets) / [Workflow token permissions](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#permissions)
- [GraphQL DeploymentReview](https://docs.github.com/en/graphql/reference/deployments#deploymentreview)
- [Reusable workflow secret passing](https://docs.github.com/en/actions/how-tos/reuse-automations/reuse-workflows#passing-secrets-to-nested-workflows)
- [Rerun identities](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/re-run-workflows-and-jobs)
- [PR-target events](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#pull_request_target)
- [Current PR-target security/event policy](https://docs.github.com/en/actions/reference/security/securely-using-pull_request_target)
- [Runner initialization, pinned revision](https://github.com/actions/runner/blob/d7bc179baf11a02110b46cfbbc4040f74ac3f60a/src/Runner.Worker/ExecutionContext.cs#L844)
- [Runner secret context, pinned revision](https://github.com/actions/runner/blob/d7bc179baf11a02110b46cfbbc4040f74ac3f60a/src/Runner.Worker/Variables.cs#L145)
- [Codex Action inputs/proxy, existing pin](https://github.com/openai/codex-action/blob/86365089eb2b84e0a8fb0717b304f8bdcb13b20e/action.yml)
- [Codex actor guard, existing pin](https://github.com/openai/codex-action/blob/86365089eb2b84e0a8fb0717b304f8bdcb13b20e/src/checkActorPermissions.ts)
- [Codex reviewer launch, existing pin](https://github.com/openai/codex-action/blob/86365089eb2b84e0a8fb0717b304f8bdcb13b20e/src/runCodexExec.ts)
