# Supporting documentation reconciliation: main baseline

This inventory records the nonnormative documentation review for Issue #381.
The comparison baseline is `origin/main` at `3f71fece350c` (2026-10-07); the
worktree `HEAD` matched that commit after fetching `origin main`. The same source
was published as [`0.6.0-preview.3`](https://github.com/flair-agency/architecture-gatekeeper/releases/tag/v0.6.0-preview.3)
on 2026-10-07. The release reports a five-procedure synthetic preview matrix;
it does not report a real consumer adoption or protected acceptance result.

The selected authority is the complete six-member Set in
`.codex/gatekeeper/authorities.json`: `docs/architecture.md` and
`docs/architecture/{authority-set,owner-addition,owner-amendment,review-execution,self-profile}.md`.
Those six files govern the findings below. This inventory and the supporting
guides do not amend them.

| Baseline discrepancy or question | Source evidence | Disposition in this change | Applicable profile and limit |
| --- | --- | --- | --- |
| `docs/github-assurance.md` described a completed BLOCK as the universal `OWNER_AMENDMENT / G0` trigger, illustrated only that trigger, and said `completed-block-v1` remained selected until policy adoption. | `docs/architecture/owner-amendment.md` defines separate `completed-block-v1` and `completed-owner-decision-self-v1` profiles. `.codex/gatekeeper/ci-policy.json` selects the OWNER_DECISION profile at main baseline. | Scoped the prose and diagram to the BLOCK profile, named both profiles, and recorded the main baseline selection. A selected trigger producer is not a completed amendment acceptance cycle. | Self reference v0.6.0 policy; protected G0 acceptance remains subject to its E2E and transition gates. |
| `docs/owner-intervention.md` said the BLOCK profile did not cover `OWNER_DECISION` and implied that this trigger needed a future distinct profile. | `docs/architecture/owner-amendment.md` adopts `completed-owner-decision-self-v1`; `docs/architecture/self-profile.md` requires both BLOCK and OWNER_DECISION self cycles for v0.6.0. The main policy selects the OWNER_DECISION profile. | Clarified the two supported self trigger profiles, the current main selection, and the distinct procedural and preview paths. | Protected self profile; previous-base selection and full transition evidence still govern. |
| `docs/github-assurance.md` called a private GitHub Free procedural amendment route a future owner decision and presented a signed-Git design as an unadopted route proposal. | The selected `Issue #147` clause in `docs/architecture/owner-amendment.md` authorizes a separate procedural BLOCK profile but leaves profile name, wire formats and trusted backend unselected. `docs/architecture.md` separately authorizes `preview-unverified-procedure-v1`; `src/preview-lifecycle.mjs` implements its bounded API. | Corrected the guide to distinguish the authorized but unspecified Issue #147 target, the older signing proposal, the protected G0 target, and the implemented unverified preview. | Preview must be selected by predecessor governance and remains `UNVERIFIED`; it does not satisfy G0, host enforcement, or trusted producer claims. |
| `docs/integration-reference.md` said native self-review failed closed after `reviewTimeoutMs=180000`, which implied a package-enforced hard deadline. | `src/native-review.mjs` includes `reviewTimeoutMs` in prepare output but does not enforce it. `skills/architecture-review/SKILL.md` says an exact hard timeout is optional and host-specific; `docs/architecture/review-execution.md` assigns cancellation/termination properties to the host. | Replaced the hard-deadline statement with the actual host boundary and linked to the in-page Skill instructions and normative execution clause. | Native Skill execution; no hard wall-clock or physical-termination guarantee is claimed. Local async adapters and Gemini CLI have separate bounded execution behavior. |
| `README.md` described policy-selected Codex execution as unavailable to consumers but did not explain that this repository's own protected `main` policy selects staged values. | `.codex/gatekeeper/ci-policy.json` selects a 7-minute job, 5-minute step and `standard` Codex profile; `docs/architecture/review-execution.md` and the integration reference preserve the pending consumer hosted-verification requirement. | Clarified self staged selection separately from consumer support and acceptance. | #332 policy-selected execution; no general consumer route is enabled by the self setting. |
| `docs/integration-reference.md` said the local Hook always invokes Codex with its child-process sandbox, despite provider selection allowing Gemini on the local async path. | `docs/architecture/review-execution.md` specifies provider-specific local adapters; `src/local-reviewer-execution.mjs` selects the recorded provider; `README.md` already distinguishes Codex and Gemini Hook behavior. | Corrected the installation text to state the Codex child boundary and Gemini API boundary separately. | Local Hook only; this does not enable Gemini CI. |
| `docs/README.md` showed `OWNER_DECISION` only as a missing-decision addition path and omitted the existing-choice amendment trigger. | `docs/architecture/owner-amendment.md` allows a completed `OWNER_DECISION` to trigger an amendment when an existing choice must change; `docs/architecture/owner-addition.md` keeps missing-decision addition separate. | Expanded the diagram to show missing-choice addition, existing-choice amendment and BLOCK-triggered amendment as distinct paths. | Applicable trigger still comes from predecessor policy; the preview route remains `UNVERIFIED`. |
| README summarized preview API procedures without naming their exact predecessor-selected profile or clearly separating them from trusted governance. The integration reference called preview.3 a candidate although it has been published. | `package.json` is version `0.6.0-preview.3`; the release identifies source `3f71fece350c` and reports the synthetic five-procedure matrix, with all six assurance dimensions `UNVERIFIED`. | Named the profile and its selection rule in README; updated integration status to a published release and recorded the reported matrix digest without claiming an independent rerun or real-consumer use. | `preview-unverified-procedure-v1`; exact predecessor tuple only. Release and fixtures do not establish G0, `ACTIVE`, or protected acceptance. |
| `docs/github-assurance.md` described host settings observed through GitHub API “during this change” without a date, which could be read as current live verification. | The values were present in the docs at baseline `3f71fece350c`; this task did not query live repository protection or rulesets. The original API observation timestamp was not preserved in the baseline. | Marked the details as a historical snapshot reviewed against the 2026-10-07 baseline, disclosed the missing original observation time, and retained the instruction to inspect current host settings before relying on them. | Host branch/tag protection and bypass configuration; no current host-enforcement claim. |
| Whether the self-only original Fork denial and the broader Fork authorization target are both active. | `docs/architecture/review-execution.md` records Issue #350 as a self-only denial; Issue #331 remains an inactive shared target. `self-architecture-gate.yml` classifies and denies non-same-repository pull requests before privileged review; `docs/github-assurance.md` describes #331 as inactive. | No change required; retained the documented separation. | #350 applies only to this repository. #331 remains a consumer-selected target, not an active shared caller route. |
| Whether Gemini CI or the provider-independent CI targets are active on main. | `README.md` states Gemini CI is not activated; `.codex/gatekeeper/ci-policy.json` selects Codex, and `.github/workflows/architecture-gate.yml` wires the Codex Action. The policy resolver rejects unwired Gemini execution; the feature work tracked in #377/#378 is not main activation. | No activation claim added; kept the existing explicit inactive wording. | Gemini local/standalone behavior is distinct from protected Gemini CI; no Gemini CI route is selected. |
| Whether Actions timeout or cancellation guarantees physical termination of all child processes. | `docs/architecture/review-execution.md` requires fail-closed incomplete outcomes; `docs/integration-reference.md` says Actions cancellation/cleanup are best effort and a requested timeout proves no descendant termination. The workflow sets host job and step limits. | No correction required beyond removing the native Skill overclaim. The current wording keeps host control and process termination claims separate. | GitHub Actions Codex review; host time allocation does not attest descendant termination. |

## Review boundary

The changes are supporting-documentation corrections only. No member of the
selected Authority Set, provider implementation, workflow, package metadata,
configuration, or tests was changed. The link/anchor check and exact diff review
are recorded with the Issue #381 delivery; this inventory is evidence of the
source comparison, not a new acceptance rule.

## Issue #382 reader-goal map and section migration

The navigation pass starts from the supporting-documentation delivery at
`4caefe70bb3ef20458dc1c7d36b72c53e0e6c151`, followed by its public-anchor
compatibility correction at `ec7919d3ff37107ec44783ffda84e1ba703bdee1`.
The selected six-member Set above continues to govern route and assurance
descriptions. This map records reader goals and section locations; it does not
amend the contract or enable a route.

| Audience and goal | Primary entry | Secondary route or reference |
| --- | --- | --- |
| Consumer, first use: run one review against repository-owned architecture | [README quick start](../../README.md#quick-start) | [Manual review walkthrough](../integration-reference.md#manual-review) |
| Consumer, install or configure local review | [Local integration](../integration-reference.md#local-integration) | [Local reviewer execution](../integration-reference.md#local-reviewer-execution-composition) |
| Consumer, use a host-native Skill | [Codex Skill installation](../integration-reference.md#codex-skill-installation) | [Native Skill E2E evidence template](native-skill-e2e-template.md) |
| Consumer, assess CI or host responsibilities | [CI integration](../integration-reference.md#ci-integration) | [GitHub assurance](../github-assurance.md) and [caller boundary](../github-assurance.md#caller-authorization-and-host-integration-boundary) |
| Operator, recover an escalation or incomplete result | [Owner intervention](../owner-intervention.md) | [Preview support and recovery status](../integration-reference.md#preview-support-and-recovery-status) |
| Maintainer, develop or roll out the package | [Development guide](../development.md) | [Issue and pull request workflow](../issue-pr-workflow.md) |
| Maintainer, publish or plan a release | [Release runbook](../release.md) | [Release planning form](../../.github/ISSUE_TEMPLATE/release_planning.yml) |
| Architect or reviewer, find responsibilities and assurance rules | [Normative architecture contract](../architecture.md) | [Six selected members](../architecture.md), indexed by [contract navigation](../README.md#contract-navigation) |
| Maintainer, operate this repository's self-gate or troubleshoot reviewer host | [Self-gate Actions policy](../self-gate-actions-policy.md) | [Reviewer host permissions](../reviewer-host-permissions.md) |
| Researcher, inspect dated evidence and proposals | [Investigation archive](./) | This archive is context, not a canonical operating guide or authority amendment |

Every current guide in `docs/` has a primary role in the documentation map at
[`docs/README.md`](../README.md). The six canonical architecture members are
grouped under the design/assurance goal; investigations remain a dated archive.

| Baseline section or information | New location and treatment |
| --- | --- |
| README opening, `Requirements`, and `Quick start` | Condensed audience and route orientation; requirements remain visible, while the complete first-use command path lives at `docs/integration-reference.md#manual-review`. |
| README `Review paths`, `Local hook`, `Manual review`, `Codex Skill`, and `Pull-request gate` details | Heading fragments remain for incoming links; these sections now summarize applicability and link to the detailed integration reference. The CI provider, authorization, event-snapshot, execution boundaries, and bounded usage/tool-count Actions-log note remain in the existing CI and trust sections. |
| README PostToolUse pilot behavior, including the native-Windows limitation | Detailed opt-in behavior and platform limitation are retained at `docs/integration-reference.md#optional-asynchronous-posttooluse-screen`; the README now points there. |
| README self-only Fork and credential-migration sections | The Fork summary retains the separate same-repository PR procedure and no-transfer rule, with links to the self-only normative clause and GitHub assurance. The complete self credential migration procedure, Environment name, variable, non-fallback behavior, key-retention sequence, and separate App-receiver caveat are retained in the integration reference; the old README heading remains a pointer. |
| README assurance, documentation, and preview sections | Short assurance statement remains; guide selection points to `docs/README.md`; preview lifecycle and `UNVERIFIED` limits link to the detailed reference. Existing heading fragments remain. |
| Documentation-map purpose table | Recast by primary reader goal. Each top-level operational guide and the dated investigation archive has a discoverable role; contract navigation and the authority-change diagram remain distinct. The legacy Fork fragment and `two-recovery-flows` fragment are preserved. |
| Integration reference `Manual review` section | Moved to the beginning of the reference under the same heading/anchor and expanded into a version-pinned complete consumer setup: all five consumer inputs, explicit npm registry, package pin/lock, commit before review, Codex prerequisites, command, `reviewedRevision` comparison to `git rev-parse HEAD`, exit-0 decision outcomes, and exit-2 incomplete/failure outcomes. Subsequent local/Skill/CI reference details retain their existing headings. |

### First-review walkthrough verification evidence

The walkthrough targets the published `@flair-agency/architecture-gatekeeper@
0.6.0-preview.3` package, whose release identifies source commit `3f71fece350c`.
Its fixture uses one committed self-owned architecture document and committed
config, prompt, schema, reviewer settings, package manifest/lock, and
`node_modules` ignore rule. A disposable consumer repository at
`/private/tmp/agk382-first-review-run/architecture-review-demo` installed the
same published package archive whose lockfile integrity is
`sha512-nRiPFpR3Tz++N+cRP3oJ7mH4B9NGEaEsJLTIoTttwVzifkAOmeAkXwIOWzfKOXceYzjPjyjxSFAkMeASifqGbw==`.
The local test substituted that exact archive for the registry package
selector to avoid another registry fetch; it did not test npm registry
authentication. The
installed runtime entrypoint ran with a mock Codex executable. It returned
schema-valid `PASS`, `BLOCK`, and `OWNER_DECISION` responses, each with exit 0;
malformed JSON and schema-invalid output failed with exit 2. These runs validate
the documented fixture, package entrypoint, and response plumbing only. They
are not real model reviews, consumer architecture decisions, CI runs, or
acceptance evidence. The consumer demo authority and mock outcomes do not change
the package contract.
