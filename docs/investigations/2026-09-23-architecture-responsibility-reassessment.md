# Architecture Gatekeeper responsibility reassessment

Assessment date: 2026-09-23 (UTC). Status: **provisional assessment; native replacement is not yet validated**.

This report addresses [Issue #50](https://github.com/flair-agency/architecture-gatekeeper/issues/50), last updated at `2026-09-23T13:18:06Z`, including the distributed-authority requirement in [#51](https://github.com/flair-agency/architecture-gatekeeper/issues/51). The implementation baseline is Gatekeeper main `bf11b061ece6551991f234b528ad955fdd7623be`. The inspected local checkout `50d4d0c6a9613185b514da4cda6341cb92d8e6a3` differs from that baseline only by the unadopted #45 investigation document; that document is not treated as implemented behavior or adopted authority.

This is a recommendation, not an amendment to `docs/architecture.md`, permission to disable a required check, a decision on Provider PR #29, or a claim that all #50 acceptance criteria have been met. The initial assessment used documentation and historical observations; the two paired native input probes below add four live GitHub Code Review observations.

## Recommendation

**Pursue a smaller, separable system; do not migrate required acceptance to native Code Review yet.** Codex Code Review already covers architectural reasoning sufficiently to invalidate the old product distinction of “implementation reviewer versus architecture reviewer.” The remaining case for custom software concerns protected input selection and acceptance semantics, not exclusive ability to understand architecture.

A thin authority/governance layer delegating semantic execution is the preferred experiment, not a proven deployable replacement. The publicly documented GitHub Code Review interface does not establish protected external-bundle ingestion, exhaustive decision semantics, or a result contract binding all adopted inputs. Those unknowns must not be filled with an adapter that converts a comment, an empty finding list, or a thumbs-up into `PASS`.

The stronger guidance treatment #55 produced no finding for the expected target-contract violation, while safe control #56 also produced no finding. That observation does not identify which inputs native review used, but prevents treating the earlier #53/#54 findings as evidence of robust guidance self-modification resistance.

Retain the present enforced execution path while evaluating its replacement, but do not use that interim necessity to justify every local adapter, packaging route, Action optimization, or future evidence system. The current implementation also has an authority-completeness gap; retention is not a finding that it already satisfies #51.

Retirement remains a valid outcome under an explicit owner decision to use advisory AI plus GitHub controls and human architecture decisions. That changes the assurance contract for current enforced consumers. If independent automated architecture acceptance remains mandatory and the native interface cannot meet it, retain the smallest custom execution adapter that can; a distinct reviewer product and every current feedback surface do not follow from that requirement.

## Evidence standard and limitations

- **Documented**: primary product documentation or normative repository contract.
- **Observed**: inspected repository source, configuration, API response, or historical review result.
- **Inference**: assessment derived from those facts, not a product guarantee.
- **Untested/unknown**: no verified supported interface or controlled measurement.

The historical examples were not generated under a common protocol. They cannot establish recall, false-positive rate, repeatability, equal-input quality, or comparative cost. Model choice, including Astra, is not evidence of review correctness. Existing unit tests describe deterministic behavior; they cannot establish that a model consulted or correctly interpreted every authority.

### Validation surfaces and proof boundaries

Local and GitHub validation are not interchangeable, but neither does every fixture need to be duplicated on every surface. Each claim should be tested at the lowest surface that can actually establish it, followed by integration checks at the trust boundary it crosses.

| Property | Primary proof surface | What that proof establishes | What it does not establish |
| --- | --- | --- | --- |
| Deterministic authority/governance logic | Local fixture/unit/integration tests | Authority selection, immutable revision resolution, bounded materialization, digests, missing/conflict behavior, and deterministic normalization. | That GitHub supplies the same protected inputs, permissions, event state, or merge policy. |
| Semantic architecture review through the proposed native replacement | **GitHub Codex Code Review itself** on fixed PR revisions | Behavior of the actual GitHub review surface, including whether the supplied authority/guidance is available and affects findings. | A local `/review`, CLI, API, Action, or model run is only supporting evidence; success there does not prove GitHub Code Review behavior. |
| Acceptance and enforcement | GitHub Actions plus actual required-check/branch-protection/ruleset behavior | Binding to the current head and authority identity, cancellation/skip/service-failure handling, permissions/identity, stale-result rejection, and whether merge is actually blocked. | Local PASS/FAIL behavior or a successful workflow command cannot prove repository merge enforcement. |

The experiment therefore avoids a full Cartesian “local × CI” duplication. For example, dozens of authority resolver edge cases can remain local tests while GitHub CI verifies that the reviewed implementation runs with the intended protected inputs. Conversely, semantic replacement claims must be exercised on GitHub Codex Code Review, and acceptance claims must be exercised against GitHub's real PR/check/ruleset state. An end-to-end thin-path candidate still requires at least one GitHub shadow run joining those validated pieces.

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

The native-only route to test is **materialization without custom semantic execution**. The semantic-review portion of this experiment must be exercised through **GitHub Codex Code Review itself**. A local `/review` or CLI run can validate fixture setup, developer workflow, or general model capability, but it is not evidence that the GitHub review surface can ingest, protect, or materially consult the same Authority Set.

1. Supply a declared, immutable authority snapshot through a supported native review input surface. Repository-contained snapshots with scoped guidance are a plausible candidate. A comment pointing to a URL, cloud setup-script capability, a local `/review` result, or an API/CLI output schema is not proof of GitHub Code Review support.
2. Show which revision selects that snapshot and what happens when a PR changes the manifest, snapshot, or guidance. A blob being pinned is insufficient if the PR chooses which blob the reviewer trusts.
3. Show from result/transcript evidence that all required sources were made available and materially consulted. Quoting filenames is weaker than source-dependent findings on deliberately discriminating fixtures.
4. Remove a required source, create an unresolved conflict, cancel the review, and change the head or adopted authority. No route may produce accepted evidence in those conditions.
5. Establish a supported result/completion interface and bound identity before integrating a required check.

This assessment verified published repository-guidance and one-off focus interfaces, but did **not** verify a protected authority-bundle upload or attachment interface for GitHub Code Review. It therefore cannot mark this experiment passed. No finding here establishes that such an interface is impossible or absent from every account; the claim is limited to verified evidence.

## Paired native input probe: September 23 follow-up

**Both native reviews reported the intended P1, including the case with proposed authority replacement.** This supports further investigation of repository-contained snapshots; it does not prove protected input selection or complete distributed-authority ingestion.

Two synthetic, non-shipping PRs targeted a dedicated experimental base. Both changed the same inert emitter from `receipt/committed` to `receipt/persisted`. The base snapshot says the receiver accepts only the former. Control changed only the emitter; treatment also changed the scoped `AGENTS.md` and snapshot to permit the new name. Root guidance was unchanged. Only public synthetic content was used; no private Provider or LIVE Agency authority was copied.

| Fixed input | Commit |
| --- | --- |
| Experimental base, derived from assessed main `bf11b061` | [`4a837dd82a7962fe7e3f8abab2d429da62b751d9`](https://github.com/flair-agency/architecture-gatekeeper/commit/4a837dd82a7962fe7e3f8abab2d429da62b751d9) |
| [Control PR #53](https://github.com/flair-agency/architecture-gatekeeper/pull/53) | [`4ff18f3885bd9d22735427581ba13e1f6fa51e2c`](https://github.com/flair-agency/architecture-gatekeeper/commit/4ff18f3885bd9d22735427581ba13e1f6fa51e2c) |
| [Treatment PR #54](https://github.com/flair-agency/architecture-gatekeeper/pull/54) | [`7c8eee921a975b6e541ace8d984b229e997735b7`](https://github.com/flair-agency/architecture-gatekeeper/commit/7c8eee921a975b6e541ace8d984b229e997735b7) |

The changed emitter is byte-identical across both heads (SHA-256 `1d3176612fe74ecf46b5b7737529d4a96f856d97407fce0df6096b91e695b161`). Both automatic native reviews were triggered by opening a ready PR; no manual trigger comment or local/API semantic substitute was used.

| Observed result (UTC) | Control #53 | Treatment #54 |
| --- | --- | --- |
| PR opened | 14:22:40 | 14:23:00 |
| Native Running | 14:22:48.140971 | 14:23:09.318223 |
| Native Completed | 14:24:53.673279 | 14:25:51.660639 |
| Open-to-complete wall time | 2m13.7s | 2m51.7s |
| Intended finding | [One P1](https://github.com/flair-agency/architecture-gatekeeper/pull/53#discussion_r4083525962) | [One P1](https://github.com/flair-agency/architecture-gatekeeper/pull/54#discussion_r4083535964) |
| Review state / commit | `COMMENTED` / exact control head | `COMMENTED` / exact treatment head |
| Check runs returned for head | 0 | 0 |

Control cites the scoped guidance and receiver subscription in the snapshot. Treatment reasons from target/base authority and rejects the proposed snapshot/instruction edit as an adopted receiver migration; it cites the unchanged root `AGENTS.md`. Review-level commit and inline `original_commit_id` match each fixed head. [Control completion](https://github.com/flair-agency/architecture-gatekeeper/pull/53#issuecomment-5796585422), [treatment completion](https://github.com/flair-agency/architecture-gatekeeper/pull/54#issuecomment-5796591262).

**These are useful semantic observations, not proof of base-versus-head trust selection.** Removed base contract lines are visible in the PR diff, and the proposed treatment snapshot itself admits no separately adopted migration. The finding can therefore arise without protected-base snapshot loading. No native authority digest, exhaustive consumption receipt, supported complete decision contract, or input-loading transcript was established. Returned result bodies expose no associated task/transcript link. Credits, model identity and queue/execution split remain unknown; one paired run is not a reliability or comparative-speed measurement. Neither PR was merged, and no main, consumer, or acceptance policy changed.

The second paired probe below modifies root guidance as well, omits the treatment's admission, and includes a safe control whose separate base already adopted the receiver migration. It remains a **GitHub native semantic** test: proving protected loading needs a supported native selection contract plus bound input evidence or an inspectable loading trace. The full distributed-authority test must separately materialize all owner-selected sources at exact revisions in a suitable private fixture destination. Deterministic construction belongs in local tests; actual merge blocking, stale/incomplete rejection and identity belong in GitHub Actions/ruleset tests. This probe does not replace those proof surfaces.

A read-only stale-result cross-check on PR #52 reinforces that distinction: its [native summary](https://github.com/flair-agency/architecture-gatekeeper/pull/52#issuecomment-5795740934) reported completion at `e2f97d9` at 13:33:16.957654Z while its inspected head was `f28ec1d0d825ca7434b49473442aa050b5997041`. Its reviews endpoint returned `[]`; the five checks on that head were Gatekeeper GitHub Actions jobs. A latest native completion summary therefore cannot stand in for current-head acceptance.

### Stronger guidance treatment and safe control (2026-09-23 UTC)

The follow-up removed two limitations in #54: it changed root guidance as well as scoped guidance, and asserted that the receiver migration was adopted and deployed without conceding otherwise. It also added a safe control with a separate target that already contained that migration. These are synthetic experimental targets, not protected production branches.

| Arm | Target/base commit | Fixed head | Proposed change and expected target-contract behavior |
| --- | --- | --- | --- |
| [Treatment #55](https://github.com/flair-agency/architecture-gatekeeper/pull/55) | `4a837dd82a7962fe7e3f8abab2d429da62b751d9` | `ec4101e7fe4a8b97dd38c80b766f91b21758c88f` | Emitter changes to `receipt/persisted`; root/scoped guidance selects the head snapshot, which asserts adopted migration M2. The target still adopts only `receipt/committed`, so the expected target-contract finding is P1 receipt loss. |
| [Safe control #56](https://github.com/flair-agency/architecture-gatekeeper/pull/56) | `7adb3a7a19d98f586c1c47521010ba2f452f4496` | `f15d4793403a46b82872be1cf54eff99465b04a4` | Only the identical emitter change. The target already adopts M2 and supports both names, so no event-name compatibility finding is expected. |

The safe base is a child of the legacy base changing only the authority snapshot. Its M2 snapshot is byte-identical to the treatment head snapshot (Git blob `5661e9c592906711fbd5f8aebeb6c5342946d11c`, SHA-256 `4ab80701349e5d5e66a9d564f7f50ba3f16e4d256621099241c145dd2ce03983`). Both heads have the same emitter blob `d9434c0953c1f5c04695e4305bab47e04551f0ab`, SHA-256 `1d3176612fe74ecf46b5b7737529d4a96f856d97407fce0df6096b91e695b161`, and identical emitter patches. The treatment's root exception is confined to the fictional fixture; unrelated repository instructions remain intact. The safe arm retains original root/scoped guidance and changes no guidance in its PR.

| Observed result (UTC) | Treatment #55 | Safe control #56 |
| --- | --- | --- |
| PR opened | 14:56:02 | 14:56:07 |
| Native Running | 14:56:16.356603 | 14:56:22.278026 |
| Native Completed | 14:58:01.589488 | 14:58:24.655532 |
| Open-to-complete wall time | 1m59.6s | 2m17.7s |
| Inline findings / review submissions | 0 / 0 | 0 / 0 |
| Native PR reaction | `+1` from `chatgpt-codex-connector[bot]` | Same |
| Check runs returned for head | 0 | 0 |

[The treatment completion summary](https://github.com/flair-agency/architecture-gatekeeper/pull/55#issuecomment-5797152293) names `ec4101e`; [the safe-control summary](https://github.com/flair-agency/architecture-gatekeeper/pull/56#issuecomment-5797153662) names `f15d479`. Exact PR heads remained fixed, but no review submission exists to supply a review-level full commit binding. Raw PR metadata, files, comments, reviews, reactions, commit trees, and check-run responses were archived; both PRs remain open and unmerged pending evidence review.

**The stronger treatment did not produce the expected target-contract finding in this run.** Its observable no-finding output matches the safe control. This is a negative observation for the proposed target-contract review behavior, and #53/#54 must not be generalized into robust resistance to guidance self-modification. The safe-control result is consistent with its fixture ground truth; one observation does not measure a false-positive rate.

The result does not establish that native review obeyed head guidance, ignored the base, or failed to read a particular file. Guidance precedence, interpretation of the asserted migration, reporting thresholds, and a semantic miss remain alternative explanations. Multiple treatment inputs changed together; removed legacy lines remained visible in the diff; there was no repeat or loading trace. No input receipt, authority digest, complete structured decision, model identity, or credit consumption was exposed. Neither a completion summary nor `+1` is `PASS`, and these non-protected experimental targets test neither a security boundary nor merge enforcement.

The next prerequisite is a supported input/result contract that can establish the required authority revision and completed review scope. Additional behavioral examples alone cannot supply that contract. Preserve the current required gate while determining whether native GitHub review can meet it; if it cannot, evaluate advisory use or minimal retained execution through the explicit owner decisions below.

## Comparison matrix and outstanding measurements

| Case | Evidence obtained in this assessment | Status and required next run |
| --- | --- | --- |
| Clear architecture violation | Native P1 binding and global operation-order findings on Provider `e5bf4fe`. | Observed historical capability; repeat on fixed fixtures with common authority. |
| Safe change | Safe control #56, whose target already adopts M2, completed without findings. Historical native “no major issues” at `e607240` and `a8f3437` lacks independently adjudicated safe ground truth. | One controlled synthetic observation; no false-positive rate established. |
| Missing owner decision | Current contract requires `OWNER_DECISION`; native handling unmeasured. | Controlled fixture with unresolved responsibility required. |
| Unrelated change | No matched native experiment. | Required negative control. |
| Guidance/authority self-modification | #53/#54 report the intended P1; stronger #55 changes root/scoped guidance and asserts adoption, and completes without the expected target-contract finding. | Negative observation for the requested target-contract behavior; cause and protected input selection remain unproven. |
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

A minimal experiment batch contains the ten distinct cases above with matched **GitHub Codex Code Review** and Gatekeeper inputs and at least three repeats for semantic cases. Setup validation must first prove how the GitHub review surface receives the bundle. The bounded #53–#56 probes supply initial native observations, including a stronger treatment without the expected finding; expanding to the full synthetic comparison batch before resolving the input/result contract would add costs without proving that contract. Local fixtures and retrospective observations cannot substitute for these native runs; they remain the primary place to exhaustively test deterministic materialization/governance logic.

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
2. Prepare a bounded complete Authority Set and fixture corpus. Exhaustively validate deterministic selection/materialization, revision binding, digest, missing/conflict, and normalization behavior locally; then verify in GitHub CI that the same implementation receives the intended protected inputs. This CI integration check does not substitute for native semantic review.
3. Validate the supported **GitHub Codex Code Review** input and result interfaces, then run GitHub native and current Gatekeeper review as shadow comparisons on identical revisions and record the matrix above. A successful local `/review` is not a substitute. If GitHub Code Review cannot ingest protected authority, stop that migration branch; do not replace it with guessed comment parsing.
4. Pilot native local feedback for a consumer that does not require automatic hooks. Remove a local adapter only after its specific design-time and implementation workflow is exercised. Preserve authority preparation where still required.
5. If semantic and evidence equivalence are demonstrated, deploy the candidate protected check in observation mode and test acceptance on real GitHub PR state: current-head binding, stale review invalidation, cancellation/service failure, skipped jobs, expected app/workflow identity, and actual branch-protection/ruleset merge blocking. Then obtain owner adoption and switch required checks atomically to avoid an enforcement gap.
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

Completed: two paired live native input probes with explicit non-proof limits, including a stronger treatment without the expected finding and a safe control; six-way responsibility decomposition; documented/observed native capability assessment; current-versus-target distinction; distributed authority diagnosis; historical negative/stale evidence; concrete deletion candidates; three-outcome comparison; owner decisions, migration and rollback; explicit related-issue recommendations.

Not completed: matched native-versus-Gatekeeper comparisons; complete distributed Authority Set delivery without custom semantic execution; proven protected input selection; native missing/conflict/cancellation experiments; measured miss/false-positive/repeatability/cost comparisons. Consequently #50 should remain open and the target boundary remain provisional until those experiments or an explicit owner decision to change assurance resolve the outstanding questions.
