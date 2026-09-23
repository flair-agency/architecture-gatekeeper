# Architecture Gatekeeper responsibility reassessment

Assessment date: 2026-09-23 (UTC). Status: **provisional assessment; native replacement is not yet validated**.

This report addresses [Issue #50](https://github.com/flair-agency/architecture-gatekeeper/issues/50), last updated at `2026-09-23T13:18:06Z`, including the distributed-authority requirement in [#51](https://github.com/flair-agency/architecture-gatekeeper/issues/51). The implementation baseline is Gatekeeper main `bf11b061ece6551991f234b528ad955fdd7623be`. The inspected local checkout `50d4d0c6a9613185b514da4cda6341cb92d8e6a3` differs from that baseline only by the unadopted #45 investigation document; that document is not treated as implemented behavior or adopted authority.

This is a recommendation, not an amendment to `docs/architecture.md`, permission to disable a required check, a decision on Provider PR #29, or a claim that all #50 acceptance criteria have been met. No model experiment or native review was initiated for this assessment.

## Recommendation

**Pursue a smaller, separable system; do not migrate required acceptance to native Code Review yet.** Codex Code Review already covers architectural reasoning sufficiently to invalidate the old product distinction of “implementation reviewer versus architecture reviewer.” The remaining case for custom software concerns protected input selection and acceptance semantics, not exclusive ability to understand architecture.

A thin authority/governance layer delegating semantic execution is the preferred experiment, not a proven deployable replacement. The publicly documented GitHub Code Review interface does not establish protected external-bundle ingestion, exhaustive decision semantics, or a result contract binding all adopted inputs. Those unknowns must not be filled with an adapter that converts a comment, an empty finding list, or a thumbs-up into `PASS`.

Retain the present enforced execution path while evaluating its replacement, but do not use that interim necessity to justify every local adapter, packaging route, Action optimization, or future evidence system. The current implementation also has an authority-completeness gap; retention is not a finding that it already satisfies #51.

Retirement remains a valid outcome under an explicit owner decision to use advisory AI plus GitHub controls and human architecture decisions. That changes the assurance contract for current enforced consumers. If independent automated architecture acceptance remains mandatory and the native interface cannot meet it, retain the smallest custom execution adapter that can; a distinct reviewer product and every current feedback surface do not follow from that requirement.

## Evidence standard and limitations

- **Documented**: primary product documentation or normative repository contract.
- **Observed**: inspected repository source, configuration, API response, or historical review result.
- **Inference**: assessment derived from those facts, not a product guarantee.
- **Untested/unknown**: no verified supported interface or controlled measurement.

The historical examples were not generated under a common protocol. They cannot establish recall, false-positive rate, repeatability, equal-input quality, or comparative cost. Model choice, including Astra, is not evidence of review correctness. Existing unit tests describe deterministic behavior; they cannot establish that a model consulted or correctly interpreted every authority.

## Findings and evidence

| ID | Finding | Classification and evidence | Consequence |
| --- | --- | --- | --- |
| E1 | Native Code Review supports consequential repository rules, including compatibility and data boundaries. | Documented: [custom review rules](https://developers.openai.com/blog/custom-code-review-rules-for-codex) and [GitHub review](https://learn.chatgpt.com/docs/third-party/github). | Semantic architecture review is not a distinctive Gatekeeper capability by itself. |
| E2 | Native review found concrete authorization/architecture defects in Provider #29. | Observed at `e5bf4fe4a5258219066d2cd85b2ef4e934b1a99e`: [concrete binding omission](https://github.com/flair-agency/live-agency-provider-lark-base/pull/29#discussion_r4081762238), [missing attachment reconciliation entries](https://github.com/flair-agency/live-agency-provider-lark-base/pull/29#discussion_r4081762245), and a [review-body finding about actual global operation order](https://github.com/flair-agency/live-agency-provider-lark-base/pull/29#pullrequestreview-5290177829). | Supports capability, not measured completeness. |
| E3 | The latest native completion and latest Gate decision concern different revisions. | Native summary reports `e5bf4fe`; current PR head is `9d6acdff1fb63bab072a9a2b10dd6ddaf1fe864c`; Gate reviewed merge `f8b6ba8421378c324cbb8096d83b584811a8ead3`. [Native summary](https://github.com/flair-agency/live-agency-provider-lark-base/pull/29#issuecomment-5750063304), [Gate result](https://github.com/flair-agency/live-agency-provider-lark-base/pull/29#issuecomment-5791976485). | Native result cannot be treated as current-head acceptance; these are not matched experiments. |
| E4 | Provider authority is explicitly cross-repository. | Observed: [protected Provider architecture at `a27633c`](https://github.com/flair-agency/live-agency-provider-lark-base/blob/a27633cd343eaab7f66d8624dca194c838fcee2b/docs/architecture.md) adopts LIVE Agency architecture-review control, knowledge ownership, record-read, and record-write contracts. | A fixture containing only the Provider document and write contract is not automatically the complete declared set. |
| E5 | Adopted parent authority permits internal lower-level writer reuse with a generic external prepared-intent boundary. | Observed: [parent PR #102](https://github.com/flair-agency/live-agency/pull/102), merged at `2026-09-23T10:59:47Z`, commit `c661e82fa8f485ee0256adc7da54d04dda0a991e`; [exact write contract](https://github.com/flair-agency/live-agency/blob/c661e82fa8f485ee0256adc7da54d04dda0a991e/docs/architecture/record-dataset-write-contract.md). | Packaging internal writers alone does not settle conformance to the full set; inspect escaping semantics and actual behavior. |
| E6 | Latest Gate BLOCK reports only local architecture/prompt files and objects to shipped history/avatar writers. | Observed: [Gate comment](https://github.com/flair-agency/live-agency-provider-lark-base/pull/29#issuecomment-5791976485), [run 35860161245](https://github.com/flair-agency/live-agency-provider-lark-base/actions/runs/35860161245). External parent contract is absent from the reported authority list. | Authority acquisition is independently defective/incomplete. This does not prove the PR should pass or that the model never saw any parent excerpt. |
| E7 | Gatekeeper's reusable evidence artifact is future work. | Documented: [normative contract](https://github.com/flair-agency/architecture-gatekeeper/blob/bf11b061ece6551991f234b528ad955fdd7623be/docs/architecture.md), [#20](https://github.com/flair-agency/architecture-gatekeeper/issues/20). | Do not count an unimplemented attestation system as an existing competitive advantage. |
| E8 | Local committed authority and CI protected authority are implemented differently. | Observed: local `src/review-contract.mjs` embeds committed authority snapshots; CI materializes protected prompt/schema/validation and instructs the reviewer to read protected authority. See source links below. | A common abstraction and complete materialization may be useful; identical guarantees cannot be assumed. |
| E9 | GitHub provides current-SHA checks, required reviews, stale-approval dismissal, and expected-app checks. | Documented: [protected branches](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches), [status checks](https://docs.github.com/en/pull-requests/how-tos/merge-and-close-pull-requests/troubleshooting-required-status-checks). | Delegate merge blocking to GitHub, but it does not derive semantic `PASS` or bind external authority versions. |
| E10 | One-owner operation constrains native approvals. | Documented: [authors cannot approve their own PRs](https://docs.github.com/en/pull-requests/how-tos/review-pull-requests/reviewing-proposed-changes-in-a-pull-request). Observed Gatekeeper main: zero required approvals, CODEOWNERS approval disabled, strict `architecture-gate / accept` from app 15368 required, admin enforcement disabled, no repository rulesets. | Replacing the gate with required human approval is not equivalent for owner-authored changes unless owner workflow/staffing changes explicitly. |
| E11 | Provider merge enforcement is not verified. | Observed `GET /repos/flair-agency/live-agency-provider-lark-base/branches/main/protection` returns HTTP 403 with a plan/public-repository requirement. | A failing accept job is visible, but do not claim verified branch protection on this consumer. |
| E12 | Current maintenance cost is observable. | [#19 latency baseline](https://github.com/flair-agency/architecture-gatekeeper/blob/bf11b061ece6551991f234b528ad955fdd7623be/docs/investigations/2026-09-23-architecture-gate-latency-baseline.md): 12 self-Gate attempts, median wall 2:26, integrity 51s, review 59.5s; three selected consumer runs 3:30–4:21. | These locate cost, not a native speedup estimate or an SLO. |
| E13 | Priority filtering is not sufficiently stable to serve as decision semantics. | GitHub review docs describe P0/P1-only reporting; observed Provider review includes P2 reconciliation and earlier P2 lockfile feedback. | Record discrepancy. Neither docs nor one observation establishes exhaustive architecture coverage. |

Provider review-comment API caution: `commit_id` in older inline comments had advanced to the current head, while `original_commit_id` remained the actually reviewed revision. Use `original_commit_id`, review-level commit, and timestamps; do not bind evidence using only the current inline-comment `commit_id`.

## Current implementation and requirements

The consumer requirement is architecture ownership with explicit escalation and an optional protected acceptance policy. Consumer choice is distinct from the shared package's current implementation. The Provider contract specifically chooses clean-checkout CI acceptance and no automatic prompt hook; local/manual feedback therefore does not justify automatic hooks in every consumer.

| Responsibility | Current owner and implementation | Native alternative and gap | Proposed boundary | Deletion candidate and residual cost |
| --- | --- | --- | --- | --- |
| Authority selection/materialization | Consumer chooses `authorityFiles`; local `review-contract.mjs` loads recorded objects and pinned submodule paths. CI uses protected prompt/schema/validation and checkout. Arbitrary external manifests are not implemented. | Repository files and scoped `AGENTS.md` are supported. Protected distributed-bundle injection, immutable selection, and mandatory consumption acknowledgement are unverified for GitHub Code Review. | Consumer owns adopted manifest/precedence. Use existing immutable local snapshots or a small materializer only where native supply fails. | Avoid automatic link crawling. Residual code: source identity/path validation, bounded fetching, digest manifest, missing-input failure. Costs: source authorization, pin updates, credentials, limits, reproducibility. |
| Semantic execution | Child `codex exec`, native-host Skill, CI Action fork; prompts/models chosen by consumer. | Native GitHub review detects architecture defects; [local `/review`](https://learn.chatgpt.com/docs/prompting#do-a-local-code-review) is documented. No confirmed native structured exhaustive decision interface. | Native feedback first. Retain only required acceptance adapter until replacement proves equivalence or owner changes assurance. | Conditional deletion: child transport, Hook/manual/native adapters, custom CI model invocation. Cost if retained: model lifecycle, credential isolation, timeouts, service failure and adapter compatibility. |
| Decision/escalation | `PASS/BLOCK/OWNER_DECISION`, schema, consumer validation, reporting. Missing/incomplete execution is separate failure. | Native findings/approvals can communicate unresolved decisions; no verified mapping to all contract states. | Owner retains semantic protocol; deterministic normalization only from a documented complete result. | Simplify schema if consumer flexibility proves unused, but do not replace unknowns with PASS. Residual cost: contract versions and escalation rules. |
| Evidence/provenance | Same-run outputs + reviewed SHA/digest/report metadata; local request digest. Independently accepted evidence is unimplemented. | GitHub review actor, review commit, timestamps, comments and states exist. They do not establish authority digest or full coverage. | Keep same-run evidence minimal. Define required facts before building reusable artifacts or signatures. | Defer #20's signing, local-attested routing, cross-run verifier. Residual cost only for required result identity/completion binding. |
| Acceptance | Protected branch policy resolution and always-run `accept` checks review/report results and PASS; `local-only` is waiver. | GitHub can enforce statuses and reviews but cannot manufacture meaningful review evidence. Neutral/skipped statuses may satisfy checks. | GitHub owns merge blocking. Small protected decision check only if accepted review source needs one. | Retire custom accept logic only after owner adopts equivalent native semantics or explicitly changes assurance. Keep source identity and failure tests. |
| Feedback surfaces | Hook, standalone CLI, native Skill, CI summary/sticky comment; npm and Skill distribution. | Local `/review`, repository instructions and GitHub review UI cover common early/PR feedback. Design questions can remain normal Codex tasks. | Select per-consumer surface from demonstrated workflow need. | First deletion experiment: redundant local transports/distribution; then sticky reporting if native result suffices. Residual cost: short guidance and any authority preparation required by local work. |

Source locations at the assessed main revision:

- [Local contract and committed-input selection](https://github.com/flair-agency/architecture-gatekeeper/blob/bf11b061ece6551991f234b528ad955fdd7623be/src/review-contract.mjs) (especially lines 13–19, 29–37).
- [CI workflow](https://github.com/flair-agency/architecture-gatekeeper/blob/bf11b061ece6551991f234b528ad955fdd7623be/.github/workflows/architecture-gate.yml) (protected input materialization 139–156; model adapter 164–184; acceptance 211–249).
- [Policy resolver](https://github.com/flair-agency/architecture-gatekeeper/blob/bf11b061ece6551991f234b528ad955fdd7623be/src/resolve-ci-policy.mjs), [reporting](https://github.com/flair-agency/architecture-gatekeeper/blob/bf11b061ece6551991f234b528ad955fdd7623be/src/ci-report.mjs), [Action provenance verifier](https://github.com/flair-agency/architecture-gatekeeper/blob/bf11b061ece6551991f234b528ad955fdd7623be/src/verify-codex-action.mjs).
- [Native Skill](https://github.com/flair-agency/architecture-gatekeeper/blob/bf11b061ece6551991f234b528ad955fdd7623be/skills/architecture-review/SKILL.md), [package publication workflow](https://github.com/flair-agency/architecture-gatekeeper/blob/bf11b061ece6551991f234b528ad955fdd7623be/.github/workflows/publish-package.yml).

The ten runtime modules total 540 physical lines; the three workflows total 339 and the Skill 60, excluding tests, fixtures, examples, provenance manifests, and documentation. The compressed coding style makes physical line count a poor complexity measure. The savings are elimination of integration paths and their release, credential, failure, and maintenance obligations; they cannot be credibly expressed as saved engineering hours from this evidence.

## Distributed-authority experiment: what must be demonstrated

Source topology is not authority topology. Git submodules are one way to resolve pinned sources, not a mandate to nest every authority under one root.

For Provider #29, construct a bounded, explicitly selected set using the protected Provider architecture at `a27633c` and owner-confirmed immutable revisions of all four adopted external sources. The write contract refinement at `c661e82` is known adopted evidence, but an experiment must still record the exact chosen set and relationship rules. Do not recursively promote every link in those documents to authority. Do not silently choose “parent wins.” The Provider explicitly delegates to its adopted parent contracts; unresolved conflicts beyond that delegation require an owner decision.

The native-only route to test is **materialization without custom semantic execution**:

1. Supply a declared, immutable authority snapshot through a supported native review input surface. Repository-contained snapshots with scoped guidance are a plausible candidate. A comment pointing to a URL, cloud setup-script capability, or an API/CLI output schema is not proof of GitHub Code Review support.
2. Show which revision selects that snapshot and what happens when a PR changes the manifest, snapshot, or guidance. A blob being pinned is insufficient if the PR chooses which blob the reviewer trusts.
3. Show from result/transcript evidence that all required sources were made available and materially consulted. Quoting filenames is weaker than source-dependent findings on deliberately discriminating fixtures.
4. Remove a required source, create an unresolved conflict, cancel the review, and change the head or adopted authority. No route may produce accepted evidence in those conditions.
5. Establish a supported result/completion interface and bound identity before integrating a required check.

This assessment verified published repository-guidance and one-off focus interfaces, but did **not** verify a protected authority-bundle upload or attachment interface for GitHub Code Review. It therefore cannot mark this experiment passed. No finding here establishes that such an interface is impossible or absent from every account; the claim is limited to verified evidence.

## Comparison matrix and outstanding measurements

| Case | Evidence obtained in this assessment | Status and required next run |
| --- | --- | --- |
| Clear architecture violation | Native P1 binding and global operation-order findings on Provider `e5bf4fe`. | Observed historical capability; repeat on fixed fixtures with common authority. |
| Safe change | Native “no major issues” at `e607240` and `a8f3437`; no independently adjudicated safe ground truth. | Untested as false-positive measurement. |
| Missing owner decision | Current contract requires `OWNER_DECISION`; native handling unmeasured. | Controlled fixture with unresolved responsibility required. |
| Unrelated change | No matched native experiment. | Required negative control. |
| Guidance/authority self-modification | CI code separates protected prompt/schema and disables checkout AGENTS loading; local committed snapshot tests exist. | Native base/head selection and resistance untested. |
| Changed head / stale review | Native result at `e5bf4fe` while current Provider head is `9d6acdff`. | Observed stale-result example; acceptance adapter must reject it. |
| Incomplete/service-failed review | Historical self-Gate baseline has review failure and rerun. | Native cancellation/failure result contract untested. |
| Distributed authority | Provider protected contract declares external sources; Gate report omits them. | Materialization requirement demonstrated; full-set paired review unrun. |
| Missing required authority | Current Provider review lacks reported external sources; required-set enforcement was not present. | Deliberate missing-source fail-closed experiment required. |
| Unresolved authority conflict | No controlled case. | Explicitly contradictory sources without precedence required. |
| Same input repeatability | No repeated identical native/CI cohort. | Run each fixture at least three times; report all runs. |
| Latency | Gate baseline: self median 2:26; selected consumers 3:30–4:21. Native request-to-result examples below. | Historical descriptions only; compare equal fixtures and record queue/execution separately where exposed. |
| Cost | API spend and native credits per compared fixture unavailable. | Unknown, not zero. Record actual usage or state that it is unavailable. |

Historical native request-to-result times from Provider #29 are 3:48 (`e607240`, 16:58:33–17:02:21 on September 21), 5:08 (`a8f3437`, 07:58:18–08:03:26 on September 23), and 6:44 (`e5bf4fe`, 11:02:51–11:09:35 on September 23). These include queue time and different changes/focus prompts; they do not establish that either product is faster. [Request and no-findings history](https://github.com/flair-agency/live-agency-provider-lark-base/pull/29).

Each future run should record fixture ID, expected behavior and owner adjudication, repository/base/head/merge SHAs, complete Authority Set identities and digests, guidance revision, native mechanism/settings where visible, start/completion/cancellation state, all findings and escalation, misses/false positives, consumed credits or API tokens where available, and manual intervention. Do not grade Provider #29 simply as expected PASS: it is a context-completeness fixture with genuine defects already observed.

A minimal experiment batch contains the ten distinct cases above with matched native and Gatekeeper inputs and at least three repeats for semantic cases. Setup validation must first prove how native review receives the bundle. Creating synthetic PRs before confirming that capability creates notifications and costs without resolving the central contract question. Local fixtures and retrospective observations cannot substitute for these native runs.

## Compare the three outcomes

| Outcome | Advantages | Requirement it cannot currently be shown to meet | Adoption condition |
| --- | --- | --- | --- |
| Retire Gatekeeper | Removes model adapters, packaging, fork/integrity, custom acceptance and reporting maintenance. Native review plus deterministic tests is simpler. | Current independent automated architecture acceptance, complete protected external authority, and one-owner escalation are not equivalently demonstrated. | Owner explicitly adopts advisory/human assurance or native capabilities pass the complete requirement set. |
| Thin authority/governance layer + native semantic review | Concentrates custom work on bounded authority and policy; removes duplicated reviewer infrastructure. | Supported protected input delivery and trustworthy native completion/decision evidence remain unverified. | Full-set, self-modification, missing/conflict, stale/incomplete, and semantic comparison fixtures pass. |
| Minimal retained execution | Preserves explicit schema, protected inputs, independent run and fail-closed acceptance; currently compatible with enforced consumers. | #51 is still unimplemented; model consultation and semantic quality are not guaranteed. | Owner confirms independent automated gate remains needed and native evidence gap persists; retain only required paths, not the whole current stack by default. |

An advisory thin layer is feasible at weaker assurance than an authoritative thin layer. Those are different products. Do not present the former as satisfying the latter by attaching a success status to completed native feedback.

## Owner decisions needed before migration

1. Whether each consumer still requires independent automated architecture acceptance, or whether advisory native feedback plus deterministic checks and recorded owner decisions is sufficient.
2. Whether the one-owner workflow may require another reviewer or a separately controlled owner-decision mechanism. Self-approval, a review comment, and an AI decision are different trust claims.
3. Which external authorities are adopted at which immutable revisions, how supersession works, and which unresolved conflicts block adoption.
4. Whether structured three-state decisions, recorded reviewer/model identity, and proof of required-input consumption are mandatory acceptance facts or only useful feedback.
5. Which local surfaces are truly needed: automatic hook, explicit design review, uncommitted review, and standalone terminal use are distinct requirements.
6. Whether branch protection is available/enabled for every enforcing consumer; a failing job alone is not a verified merge barrier.

These are proposed explicit contract decisions. The assessment itself makes none of them on the owner's behalf.

## Migration, validation and rollback

1. Record consumer assurance needs and the chosen owner decisions in canonical authority. Keep current required checks active throughout the assessment.
2. Prepare a bounded complete Authority Set and fixture corpus; validate the native input and result interfaces before writing any adapter.
3. Run native and current review as shadow comparisons on identical revisions and record the matrix above. If native cannot ingest protected authority, stop that migration branch; do not replace it with guessed comment parsing.
4. Pilot native local feedback for a consumer that does not require automatic hooks. Remove a local adapter only after its specific design-time and implementation workflow is exercised. Preserve authority preparation where still required.
5. If acceptance equivalence is demonstrated, deploy the candidate protected check in observation mode, then obtain owner adoption and switch required checks atomically to avoid an enforcement gap. Confirm expected app/workflow identity and always-run behavior for failures/skips.
6. Delete unused runtime entrypoints, packaging, CI invocation, fork provenance, reporting and their tests/docs together. Retain a known exact release/workflow pin until the pilot is stable. If custom execution survives, remove only unused paths and keep its current credential boundary.

Rollback restores the previously reviewed exact workflow/runtime pins and required-check selection through protected owner change. Failed service calls, missing authority or invalid native evidence must never automatically reactivate a weaker route. Rollback cannot erase the #51 gap: a restored current gate still needs complete authority for any fixture that requires it.

## Related issue dispositions

| Work | Recommended disposition |
| --- | --- |
| [#19](https://github.com/flair-agency/architecture-gatekeeper/issues/19) latency | Keep baseline/measurement; pause new optimization until the retained execution boundary is chosen. Re-measure only the retained path. |
| [#45](https://github.com/flair-agency/architecture-gatekeeper/issues/45) integrity fast path | Pause implementation/expansion. #47/#48 are not adoption of authorization. If CI execution is deleted, supersede this work; if retained, evaluate whether its complexity earns measured savings. |
| [#20](https://github.com/flair-agency/architecture-gatekeeper/issues/20) evidence | Narrow to acceptance facts and invalidation requirements first. Defer local attestation, signing and cross-run verifier until a real consumer needs reusable evidence. A native review adapter still requires a supported evidence contract. |
| [#51](https://github.com/flair-agency/architecture-gatekeeper/issues/51) distributed authority | Keep as demonstrated requirement. First assign ownership through the materialization-with-native experiment; do not assume it requires a new general Gatekeeper subsystem. |
| [#1](https://github.com/flair-agency/architecture-gatekeeper/issues/1) rollout | Avoid broad rollout while target responsibilities are unsettled. Pilot by actual assurance need and topology, with branch-protection availability checked. |
| [#40](https://github.com/flair-agency/architecture-gatekeeper/issues/40) upstream Action | Conditional on retaining CI invocation. Continue necessary operational maintenance only; do not migrate a dependency solely to preserve a path likely to be retired. Existing lifecycle/credential checks remain until removal. |

No issue status or scope was changed by this report.

## Assessment completion

Completed: six-way responsibility decomposition; documented/observed native capability assessment; current-versus-target distinction; distributed authority diagnosis; historical negative/stale evidence; concrete deletion candidates; three-outcome comparison; owner decisions, migration and rollback; explicit related-issue recommendations.

Not completed: matched live native comparisons; complete distributed Authority Set delivery without custom semantic execution; native self-modification/missing/conflict/cancellation experiments; measured miss/false-positive/repeatability/cost comparisons. Consequently #50 should remain open and the target boundary remain provisional until those experiments or an explicit owner decision to change assurance resolve the outstanding questions.
