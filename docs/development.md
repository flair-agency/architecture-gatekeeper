# Development guide

This guide describes repository implementation and verification practices.
The normative architecture and assurance contract is in
[`architecture.md`](architecture.md) and its five required normative members;
this guide does not amend that Set.

## Information placement

Choose the destination from what the information governs and how long it
applies, not merely because the Owner stated it.

| Information | Existing destination |
| --- | --- |
| Lasting product responsibilities, trust boundaries, route/assurance conditions and compatibility semantics | Relevant member of the complete Canonical Authority Set, through its predecessor-authorized adoption process |
| Actual consumer/runtime selection | Relevant Policy/configuration, under its existing authorization and compatibility rules |
| Release scope, date, order and milestone | Release planning Issue; reusable publication steps belong in `docs/release.md` |
| Bounded operation approval and exact PR/run identities | Existing operational approval, PR or investigation record with the required access and evidence controls |
| Rationale, investigation, benchmarks and observed run/readback history | Issue/PR comments or non-normative evidence documentation, as appropriate |
| Current Issue problem, outcome, scope, acceptance criteria and completion state | Issue Description, including current checkboxes and evidence links; dated decisions, reasoning, execution updates and history belong in comments |

Before adding normative text, distinguish a lasting rule from a planned or
observed action. Would it remain a requirement if the release/date/PR/run
changed? Does it define a capability's conditions, or only when work should
finish? Check the existing owner document before duplicating or overriding it.
Versioned formats, legacy evidence meanings and incident-specific security
constraints can be normative; do not relocate them just because they name a
version or past event.

Keep current Issue fields and completion checkboxes accurate as work changes;
link the supporting decision/checkpoint comments rather than copying their
chronology into the Description. Reconcile changed work definitions in place.
This guidance neither amends existing Canonical obligations (including current
release conditions) nor waives their adoption process. Relocation must preserve
required evidence and access controls; never move private approvals or secrets
into a public or less-protected record. Use the existing
[PR review guidance](issue-pr-workflow.md#prepare-a-pull-request) to review placement.

## Repository layout

This is a Node.js ES module package. Its supported Node version is declared by
`package.json#engines`. Editable runtime source is in `src/`; all production modules and entrypoints
are authored in `.mts` and checked by the strict TypeScript project. `npm run build` emits the runtime
package into ignored `dist/`. Tests are in `test/`, the
separately distributed Codex Skill is in `skills/architecture-review/`, and
reusable and self-review workflows are in `.github/workflows/`.

## Implementation and verification

- For behavior changes, add or update focused tests and run `npm test`.
- For package entrypoint or distribution changes, also check the installed
  package smoke path in `test/installed-smoke.mjs` and the release workflow.
- Update `README.md` when public integration or operational behavior changes.
- Follow the [release runbook](release.md) when freezing, publishing, or verifying a package release.
- Start release planning with the [Release planning issue form](../.github/ISSUE_TEMPLATE/release_planning.yml); it records scenarios and agreement before the runbook's publication steps.
- Use the [issue and pull request workflow](issue-pr-workflow.md) to record scope, acceptance criteria, verification, and remaining work.
- Keep the Skill, CLI, CI adapter and self-review configuration aligned when a
  shared contract changes.

## Risk-based verification

For a changed parser, validator, orchestration path or CLI, record a concise
risk/invariant → production boundary → retained test map in the PR or linked
investigation. Identify external synthetic responses, actual production calls,
unit/composition/distribution scope and remaining live-host proof. Test counts
and global coverage are diagnostic context, not completion evidence. Use
source-only coverage to identify unexecuted boundaries; keep its exact command,
revision and paths rather than comparing unlike percentages.

Before reusing a shared helper, check its accepted input shape, byte/depth/range
preconditions, error and termination behavior, and whether parsing or decoding
occurs before its limits. Preserve malformed-input and bounded-execution
regressions. A type annotation does not supply those properties. Exercise
representative invalid bindings and observable failed output at their owning
production boundary. Critical regressions should demonstrate detection through
selected isolated mutations or equivalent meaningful negative fixtures; remove
mutation copies afterward. Prefer deterministic clocks for deadline logic,
while retaining bounded real execution where scheduling is the property tested.

When replacing a case, map each useful assertion to retained coverage and state
uncovered paths. No test-count reduction target applies. Workflow checks parse
target jobs/steps; exact action pins and existing selected expressions remain
useful assertions. Run the focused structure suite for fast feedback:

```bash
node --test test/workflow-structure.test.mjs
```

When request or receipt identity binds runtime implementation bytes, exercise
the actual emitted and installed layouts. A grouped `.mjs` implementation must
be covered by the identity collected at its real path; prove both that a fresh
request/receipt validates and that changing a covered implementation byte
invalidates an earlier request and receipt. Keep such mutations inside isolated
package copies so repository runtime files are never altered by the test.

Static YAML analysis does not execute GitHub expressions or establish host
protection. Keep existing live-proof owners and release obligations separate.

The coordinator verifies shared-helper assumptions, cross-file dependencies,
public/direct entrypoints, source/generated identities and distribution after
bounded worker changes. Obtain independent integrated code review and the
applicable architecture review on the final candidate; worker verification is
not protected acceptance. Record focused/full runtimes, actual package results
and unresolved limits. The entrypoint and workflow investigations under
`docs/investigations/2026-10-08-*.md` provide concrete #415/#416 examples.
The [#418/#412 final integration index](investigations/2026-10-18-quality-program-final-integration.md)
maps these practices to existing checks and revision-bound evidence, including
their local, hosted and protected limits.

The [initial Git/filesystem inventory](https://github.com/flair-agency/architecture-gatekeeper/blob/d80e44683e356c1d91b9639d1e4df96aa337125a/docs/investigations/2026-10-18-git-filesystem-responsibility-inventory.md)
maps existing I/O owners and differing caller contracts for #573. It selects no
shared API or library and does not complete that refactor.

## Early review-input capacity feedback

Before requesting a model review or starting the full test/CodeQL/package path,
check capacity for a committed change using Node 22.18 or newer and the locked
development dependencies (`npm ci --ignore-scripts` once). No build, reviewer,
provider credential, network acquisition or heavy verification is needed for
this development command:

```bash
npm run review:capacity -- --base <base-commit> --head <candidate-commit>
```

The invoking checkout must already be the exact two-parent reviewed merge,
with ordered parents `[base, candidate]`. `--reviewed <ref>` defaults to `HEAD`;
references resolve once to full immutable commits. Uncommitted/untracked edits
are excluded. For feedback before push, make a local preview in an isolated
worktree, leaving the development branch unchanged:

```bash
capacity_tool="$(git rev-parse --show-toplevel)"
capacity_base="$(git rev-parse origin/main)"
capacity_head="$(git rev-parse HEAD)"
git worktree add --detach ../agk-capacity-preview "$capacity_base"
cd ../agk-capacity-preview
git merge --no-ff --no-edit "$capacity_head"
node "$capacity_tool/scripts/review-capacity.mjs" --base "$capacity_base" --head "$capacity_head"
```

Use an up-to-date fetched base and a distinct committed candidate with actual
changes. Resolve conflicts normally before checking; an absent or non-merge
snapshot is undetermined. The command itself writes no worktree, refs, prompt
files or retained diagnostic records. Remove the preview worktree when finished.
This is a source-development command, not an installed package executable.

Initial coverage is AGK's ordinary Codex self-CI input format, targeting `main`
and using a self-only version-1 Authority Set under an enforced v2 policy. The
local repository name is a label, not authenticated GitHub origin or same-repo
admission. The report binds base, candidate and reviewed merge, policy revision,
path/digest and selected limit. It reads literal inputs/defaults from the base's
self caller and reusable workflow, resolves protected policy with the production
resolver, and materializes the complete selected base authority with the
production materializer. It shares the exact context assembler with production.
Neither working-tree policy nor an injected limit can replace these inputs.

The initial tool conservatively recognizes the fingerprinted preparation files
and workflow format delivered with it, plus the byte-equivalent predecessor
context implementation. Any other format, an altered local tool dependency,
legacy/procedural/Gemini policy or external authority is undetermined until
separately supported. A fresh base/candidate/policy always gets a new result;
there is no result cache. A later GitHub merge revision, base or selected runtime
can differ from the local preview: rerun for that snapshot. Feedback supplies no
host protection, review completion or merge evidence. Local Git, object store,
configuration and tool execution retain the existing same-user trust boundary.

JSON output distinguishes these states and exit statuses:

| State | Meaning and next action | Exit |
| --- | --- | --- |
| `fit` | Exact prompt is below 90% of the selected limit. Continue normal review and verification. | 0 |
| `approaching-limit` | Exact prompt is at least 90%, and no larger than the hard limit. Consider a coherent smaller scope before adding input. | 0 |
| `exceeded` | Either complete bounded assembly was measured above the hard limit, or a conservative lower bound already proves the final prompt must exceed it. Reshape the change and check again; production still refuses it. | 1 |
| `undetermined` | A selection, revision, source, encoding, supported format or bounded preparation could not be completed. Resolve the cause; never interpret this as fitting. | 2 |

The 90% rule is optional development guidance, not a policy limit or required
check. Exactly-at-limit is approaching and production remains permitted at that
size. No state is semantic PASS/BLOCK/OWNER_DECISION or authorization to merge.
Do not raise limits, trim required input or bypass checks in response.

For exact results, `totalBytes` measures final UTF-8 prompt bytes after JSON
escaping and context attachment. Instructions, rendered complete authority and
task context components sum to that same total. Remaining capacity may be
negative. The selected hard limit applies to that prompt; the separately passed
output schema's bytes/digest are reported separately and are not added to it.
No token/cost estimate or provider transport-payload limit is inferred.

When a validated instructions-plus-authority prefix alone exceeds the selected
limit, or captured complete paths / valid diff text prove a lower bound above
the limit after a bounded Git output overflow, the result remains
`exact: false`, with `totalBytes` and `remainingBytes` null and a numeric
`lowerBoundBytes` plus a bounded `stage` label. No partial prompt, diff, or path
payload is returned. A lower bound uses only already captured complete path
records or valid diff text; an incomplete final path or UTF-8 character is
excluded. NUL-containing diff data, malformed UTF-8, stderr-only overflow,
other process errors, or captures without a sufficient usable lower bound
remain `undetermined`. The result describes only a capacity fact;
it does not claim full prompt validity or that other unsupported or unavailable
inputs would succeed.

Summaries omit prompt, diff, authority and schema contents, provider settings,
credentials and local paths. Changed filenames are hidden by default. Add
`--public-paths` only when the candidate names are suitable for disclosure; this
shows up to five unambiguously matched simple public paths ranked by their
JSON-escaped patch payload bytes, a subset of task context rather than extra
prompt components. Quoted/ambiguous paths may have no per-file attribution;
the complete prompt and total are still measured. This does not authorize
publication of private changes or authority.

Preparation retains the selected manifest/member/file/authority/prompt bounds.
Git commands have finite output bounds and a 10-second per-command maximum;
there is no claim of a global process deadline. Initial diagnostic reads of
workflow/runtime-format files are bounded at 262144 bytes each and policy,
schema and validation at 65536 bytes each. These are local preparation bounds,
not new protected schema or policy limits. Failures without a provable complete
prompt lower bound remain undetermined; no unavailable input is omitted.

The retained capacity tests model #541's scope-growth problem: growing
investigation text overtakes implementation as the largest patch contributor
and exceeds the same selected limit; separately scoped implementation and
bounded investigation changes each agree with real production-prepared sizes
and fit. This is a synthetic feature checkpoint, not a replay of #541's hosted
review, automatic splitting, review-quality score or completion of #537's pilot.
The tests also instrument the actual CLI to forbid non-Git subprocesses and
network/model calls, exercise exact/advisory boundaries, private sentinels,
unsupported preparation and retained production rejection. Other local, Hook,
native and provider routes, automation and broader I/O extraction remain outside
this initial #576 delivery; #573 is independent.

## Keeping the Gemini branch synchronized

At Gemini development milestones, compare `feature/gemini-ci` with the current
`main` and merge adopted main changes through an isolated synchronization PR.
Resolve behavioral differences in the typed implementations, preserving flat
entrypoints, main fixes and the feature's bounded Gemini implementation. Use
normal merge history; do not rewrite branches used by parallel work.
Synchronization does not renew execution approval or transfer a historical
review to a new source tuple.

The 2026-10-12 synchronization combines the main typed report helpers and Codex
PASS retrieval with the feature's Gemini projection and filesystem guards.
The report entrypoint retains the feature's optional report-publication fetch
callback and exported `main`; protected Codex display retrieval continues to use
the original full Fetch transport. The older zero-argument/private report CLI
and unchanged-AST statements below describe the main migration before this
behavioral integration. The synchronization tests bind the combined source and
emitted AST and retain both providers' publication and negative cases.

## TypeScript source and runtime distribution

### Earlier implementation checkpoints

These are historical implementation checkpoints. Self App/Queue, tag handoff,
attestation and portable amendment-evidence modules described below have been
retired; they are not current APIs or instructions to restore that mechanism.
The current self procedure is documented in [owner-intervention.md](owner-intervention.md).

Earlier slice statuses and counts are historical; the current inventory below supersedes them.

The integrated #419 slices type OWNER_ADDITION validation, execution-result
states, tag/artifact/ZIP leaves, GitHub association/CLI/source/event helpers,
PR/run and live queue context, self-amendment scope, and amendment canonical
readback, OWNER_ADDITION post-merge readback and self-only GitHub App reporting.
The GitHub ruleset readback, owner-amendment Git change reader, handoff Git
context, annotated-tag transport and review-input path helper are integrated.
The committed-file reader is integrated under
`src/authority-validation/legacy-git-snapshot.mts`, retaining its flat exports
and regular-file selection, Git arguments, byte limits and digest behavior.
Its ordinary string, numeric and Buffer contracts do not authenticate caller
selection or authorize review acceptance.
The JSON Schema validator is integrated under
`src/authority-validation/json-schema.mts`, retaining its two flat function
exports, supported dialect, property rereads, budgets, memo behavior and
exceptions. Input-preserving generics and nullable numeric options describe
existing operations; they do not infer instance types from schemas or certify
caller-owned mutable properties.
The existing multi-authority provenance helper is integrated under
`src/authority-validation/multi-authority-provenance.mts`, retaining its four
flat function exports, exact-key and digest checks, property rereads and
exceptions. Its contracts describe same-run metadata operations and caller
identity; they do not establish authentication, immutable snapshots or
independent acceptance evidence.
The prepared CI decision validator is integrated under
`src/ci-review/prepared-ci-decision.mts`, preserving its flat function export,
explicit input set, UTF-8 and byte ceilings, JSON depth and duplicate-key
checks, and protected-material composition. External parsed decisions remain
unknown; descriptive input contracts do not authenticate caller-selected
materials or authorize acceptance.
The current CI helper stack types `ci-decision-kind`, `verify-legacy-validation-selection`, `ci-execution-observation`.
Flat facades retain their original direct-run guards and export surfaces.
Ordinary routing returns an unknown reread; legacy path selection returns its
checked string or null. Types describe existing operations and supply no
authentication or acceptance evidence.

The current review-input stack types `validate-decision`,
`validate-authority-set-decision`, `preflight-authority-set-review`,
`prepare-review-file-context`, `prepare-review-context`,
`materialize-review-workspace`, and `review-security-proxy`.
The materializer migration is deferred: hosted HIGH217 assigns a new identity
to an existing generic CLI risk. Its original `.mjs` implementation and risk
remain; no dismissal or model expansion is made. Flat exports, CLI dispatch
and runtime operations remain intact. Untrusted JSON and unchecked property
rereads retain unknown types; types do not prove authority provenance, risk
reduction or protected acceptance.

The current authority-contract stack types `review-contract`, `resolve-ci-policy`, `prepare-authority-set`, `owner-addition-adoption`, `owner-decision-addition`.
Flat facades retain public exports and the original CLI guards; policy CLI stays in its original flat file. Grouped authority runners
preserve asynchronous dispatch and runtime operations. External
JSON and unchecked property rereads remain unknown. Adoption eligibility is
unknown because the existing validator rereads a caller-owned result; adoption
and canonical states remain separate literal states. The legacy CI preparer
remains at its flat path with its original Git, filesystem and CLI operations;
only its existing exact `authorityFiles` decision check is extracted to
`src/ci-review/legacy-authority-decision.mts`. Parsed decisions and provenance
observations remain unknown, and the helper returns an unknown observation. A
local source-only CodeQL comparison reports 57 of 58 prior fingerprints and all
58 flows; hosted CodeQL analysis and model regression passed in #548. This partial extraction does not
claim fingerprint equivalence, risk removal, authentication, owner authorization,
immutable evidence or protected acceptance. The multi-authority addition
migration also remains partial; no model expansion or alert dismissal is made.

The current BLOCK handoff stack types `owner-amendment-block-handoff`,
`owner-amendment-block-handoff-compose`, and `owner-amendment-block-handoff-orchestrator`.
Flat exports retain their existing callers. The grouped implementations preserve
exact record/bundle binding, artifact and producer verification, protected
builder invocation, and annotated-tag transport/readback. Generated digests and
tag-message bytes are typed; coercible SHA inputs and external property rereads
retain their existing runtime meaning. Preparing or transporting a tag does not
establish semantic eligibility, owner authorization or acceptance.

The integrated handoff slice types `owner-amendment-owner-decision-handoff`,
`owner-amendment-owner-decision-handoff-cli`, and `owner-amendment-handoff-cli`.
The two flat CLI facades retain their original direct-execution guards and
dispatch; grouped implementations preserve artifact/provenance verification,
exact B checks before tag mutations and after BLOCK tag readback, and Git
subprocess options. External JSON and reread environment fields remain unknown.
Transport results describe existing states; they do not authenticate a principal
or authorize an exact claim.

The next record/context slice types `owner-amendment-owner-decision-record`,
`owner-amendment-owner-decision-amendment-record`, and
`owner-amendment-owner-decision-context-verifier`. Flat exports retain their
callers. The grouped implementations preserve existing record-key validation, exact decision
and Authority Set digest bindings, byte/depth limits, property rereads and
exceptions. External parsed values and unchecked rereads remain unknown;
computed digests and generated bytes describe the existing operations. Producer
context getters can change enumerable keys before the original spread, including
adding a `toJSON` that mutates the constructed record during its existing size
check. Input context keys remain required; every returned record observation is
optional/unknown. No snapshot or new runtime guard is added. Neither
record construction nor context verification authenticates the owner's identity,
authorizes the owner's choice or establishes semantic eligibility or acceptance.

The next BLOCK record/bridge slice types `owner-amendment-block-record`,
`owner-amendment-record-builder`, and `owner-amendment-merge-group-block-bridge`.
Flat exports retain their callers. Grouped implementations preserve exact BLOCK
decision and evidence bindings, byte limits, canonical serialization, property
rereads and merge-group B selection. Callback contracts preserve synchronous,
Promise and thenable composition. External observations and unchecked Buffer
method results remain unknown. Constructing records or selecting evidence does
not authenticate owner authorization or establish protected acceptance.

The merge-group evidence slice types `owner-amendment-merge-group-b-context`,
`owner-amendment-merge-group-evidence`, and
`owner-amendment-merge-group-ordinary-review`. It preserves exact queue/base/B
selection, protected tag and producer evidence binding, fresh ordinary review
inputs from the current protected base, and deterministic PASS validation. These
existing stages keep distinct results; typing adds no acceptance route. External
API results, parsed JSON and changing accessor observations remain unknown;
callback contracts retain the original synchronous and asynchronous behavior.

The semantic producer slice types `owner-amendment-semantic-eligibility`,
`owner-amendment-merge-group-acceptance`, and
`owner-amendment-semantic-producer-attempts`. Public collaborator contracts
distinguish synchronous semantic preparation from awaited run/job observations.
The existing defaults, property rereads, canonical receipt construction and
pre-transition verification remain unchanged. External array method results
remain unknown; these types confer no owner authorization or adoption authority.
Constructor collaborators and required operation inputs are enforced through
public signatures while original runtime defaults retain their error behavior.
The frozen producer methods are readonly. The same required-input correction
covers ordinary-decision, tag-readback, tag-attempt, semantic-tag and BLOCK
semantic-record entry points found by the contract audit.
Verifier runtime identity requires repository and revision fields. Successful
producer collaborators require the complete existing binding fields, including
nested protected selections; external observed field values remain unknown.

The CI predicate/Authority Set slice types `ci-enforced-acceptance`,
`ci-procedural-authority-change`, and `authority-set`. Flat command guards and
environment/output operations remain at their original paths. Protected review
status and conclusion are required public inputs; the original runtime default
and conditional observations remain unchanged. Existing routes,
selected-authority comparison, manifest parsing and member materialization keep
their original operations. External observations, including a content getter's
later length and procedural Git arguments, remain unknown. These types add no
accepting amendment route or authority rule.

The amendment-core slice types canonical procedure parsing, digest calculation,
G0 procedure validation and tag-envelope checks. Flat exports and original
runtime operations remain unchanged. External readbacks stay unknown; owned
parsed records and computed digests have explicit contracts. Types confer no
owner authorization or new accepting route. The owner-addition CI and GitHub
owner-addition provenance relocations were deferred in historical Draft #520
after hosted CodeQL failures. That combined candidate is now closed as
superseded: #521 adopted the amendment core, #578 the complete provenance
verifier, and #587 the complete owner-addition CLI operations with #591's
owner-approved fixed runner-temp boundary. Closing #520 adopts no code and
dismisses no alert. The final integration index records 96/96 adoption and
remaining limits; the old failed checks remain historical failures.

The Gemini CLI slice types response extraction, process supervision and parent
proxy-session composition. Flat exports, original error paths and defaults remain
unchanged. Required byte limits and process inputs have explicit contracts;
thinking controls require the existing model-specific budget or level branch.
Unknown process observations, nullable child outcomes and mutable returned
results retain their actual boundaries. Deadline, cancellation, workspace-control
and credential-confinement checks retain their original operations.

The internal-adapter slice types the Codex transport, materialized Gemini CLI
session and protected prepared-review adapter. Required request, workspace,
protected prompt/schema and credential inputs have explicit contracts, with
mandatory model-specific thinking controls. Parsed Codex output remains unknown.
Flat exports, read-only invocation, validation, proxy scope and cleanup preserve
their original operations. The parent proxy composes the typed session directly.

The local-review and runner-path slice types local reviewer composition and
fixed runner temporary paths. The complete native CLI candidate moves to
`local-review/native-review.mts`; its executable flat facade retains the exact
direct-run guard and catch. Required async
deadlines, synchronous versus awaited callbacks and complete envelope fields
have explicit contracts. External decisions, JSON and manifest readbacks remain
unknown; exact byte reads return Buffer and successful paths return strings.
Native CLI guards and operations, runtime default adapters,
deadline/cancellation, closed path tables and GitHub output checks retain their
original operations.
The approved runner environment accessor remains at its original model path.
The runner-accessor candidate moves its implementation to
`github/github-runner-env.mts`, retaining a distinct no-argument string-returning
flat wrapper at that model path. The complete original runtime AST is pinned
for typed source and emitted implementation, including the single environment
read, short-circuit check and original error. The unchanged CodeQL model must
remove only the flat wrapper flow; a new direct-implementation probe must retain
its unmodeled finding. Types and the wrapper authenticate no environment.

The local entrypoint slice types the Hook and manual-review adapters and the
PostToolUse screening path. Sync reviewer callbacks reject known Promise and
thenable results; async callbacks retain their awaited result and complete
envelope contracts. External Hook JSON, context readbacks and decisions remain
unknown until the existing runtime checks. The Hook direct-run guard stays in
the flat executable facade. Manual review keeps its unconditional module-load
dispatch through a side-effect facade; importing that command still executes it.
Debounce, stored context, refusal, deadlines and cancellation keep their original
operations. Typed options do not validate external decisions or authorize PASS.

The CI composition slice types the existing procedural acceptance predicate
and the CI report's parsers, rendering and delivery helpers. The predicate's
literal outcomes describe routing only; they do not authenticate an execution
or establish protected acceptance. Report JSON and coercion-only observations
remain unknown, while parser-owned branches and locally constructed results
have explicit types. Fetch contracts retain native fetch and minimal synthetic
GET/acknowledgement responses. The report CLI and its filesystem output sinks
remain at the original flat path with their original operations; that original
module is only partially migrated. Flat entrypoints and guards remain intact.

The GitHub command slice types the existing ruleset-readback CLI and adds a
checked JavaScript return contract to the runner-environment accessor. Ruleset
readback retains unconditional module-load execution, credential revocation
before storage, bounded readbacks and the original private file modes. The
runner accessor stays at its approved model path and returns only the string
established by its existing runtime check; this does not authenticate provenance.

After the adopted complete native migration, two checked JavaScript bridges remain
at their existing source paths: snapshot materializer and CI report.
The report CLI's public `main`, adopted in #582, accepts an optional
`ReportFetch` and retains its `Promise<void>` completion contract. Erased operation views retain the original error-message
reads, inline-item operations and optional findings-length read; external
observations remain unchecked. These views do not validate an error, guarantee
an iterable result or authorize a decision. The original optional chain,
exports, direct-run guard and adopted runner/report filesystem checks remain intact.
Actual-config compile-only probes exercise the public function without adding
an argv parameter. Complete helper and CLI operation pins, relocated import checks,
the exact flat guard and fourteen export identities bind the source and emitted
candidate to adopted #583/#581 composition. These checks
do not prove CodeQL flow preservation; official model/flow verification remains
required for the candidate. The native CLI preserves its existing optional
string-array arguments, working directory and async completion contract. Its
complete adopted functions are pinned after type erasure, including measurement,
required prepare/validate I/O and distinct original-host versus injected argument
selection. External JSON remains unknown; erased property-read views add no
validation. All three original native accessor flows and explicitly injected
negative flows remain checked at the actual grouped production sinks. The
adopted model packs are unchanged. This migration adopts no stream protocol,
persistence transfer or new transport ceiling from Issue #566. The materializer now
uses fixed runner-temporary output selectors with the existing filesystem writer. These CI
operations accept only fixed string names or the exact absolute path resolved
from the runner-temporary working directory; native Buffer, URL, descriptor and
other caller-selected destinations are outside this interface. The workflows
set `working-directory: ${{ runner.temp }}` for the legacy and owner-addition
prepare/validate steps in the self, consumer and provider workflows. This is the
owner-approved design recorded in [PR #591](https://github.com/flair-agency/architecture-gatekeeper/pull/591#issuecomment-6235948030).
In the adopted 86/96 baseline, four originals have partial helper migrations.
The CI report keeps its flat CLI and filesystem operations; multi-authority
orchestration keeps its adapter while delegating selected eligibility helpers.
Owner-addition CI delegates only the post-parse single-member selection while
retaining its Git reads, file writes and command dispatch. The GitHub
OWNER_ADDITION provenance migration, adopted in #578, moves its complete verifier to
`github/github-owner-addition-provenance.mts`, including fetch, token, artifact
selection, digest binding and evidence validation. Its flat entrypoint is a pure
re-export, and the bounded ZIP parser remains in its existing typed leaf.
External JSON and property rereads remain unknown. Readonly result views do not
freeze observations or authenticate producer identity. Complete original runtime
operations are pinned after type erasure in source and emitted output; exact
public-head CodeQL, installed identity and protected acceptance remain required.
These types describe existing parsed bytes and selected-member
results; they do not authenticate provenance or establish acceptance. The legacy CI
preparer is also partial: its decision check is extracted, while Git, filesystem
and CLI operations remain at the original path.

The 57-of-58-fingerprint local CodeQL comparison above concerns that legacy
decision helper, not a move of the snapshot materializer sink. All 58 flows
remain present; hosted CodeQL analysis and model regression passed in #548
with the selected model unchanged. The materializer remains a checked JavaScript bridge at its original
path with its original path-like output behavior.

The [96-module source map](investigations/2026-10-08-source-layout-typescript-map.md)
retains the inventory, runtime limits and #423 preview-lifecycle boundary.
The internal-adapter candidate has 75 of the original 96 modules typed and
21 remaining. The local-review/runner-path slice has 77 original modules in
`.mts` and 19 original modules outside the typed migration. This local
entrypoint foundation has 80 `.mts` modules and 16 original modules remaining.
This CI composition candidate brings the count to 81 `.mts` modules and
15 originals remaining; the partially typed report is included in the latter.
The GitHub command candidate has 82 original modules fully migrated to `.mts`
and 14 originals not fully migrated. The runner-accessor candidate adds one
complete typed implementation, reaching 83/96 fully migrated and 13 originals
not fully migrated. The complete GitHub provenance migration was adopted in
#578, bringing the inventory to 84/96 and 12 unfinished originals.
The complete native migration was adopted in #563, reaching 85/96 and 11
unfinished originals. Of those 11, two have checked JavaScript contracts
(snapshot materializer and CI report), and five have partial helper
migrations (CI report, owner-addition finalizer, multi-authority orchestration,
owner-addition CI and the legacy authority
decision check). CI report belongs to both categories; together they cover six
distinct originals. The other five remain JavaScript modules
outside these migrations. These source-layout counts do not change the
selected CodeQL model or establish acceptance evidence.
The complete finalizer migration, adopted in #581, moves its remaining API, parser and CLI body
to `src/owner-addition/finalize-owner-addition.mts`, retaining the existing
record builder and nine flat exports. It preserves the full risk-corrected
operations, original flat guard condition, inline CLI behavior and external
property rereads; callback results and parsed observations remain unknown.
The preceding resource correction was adopted in #579; #581 reached 86/96 with 10
unfinished originals: two checked JavaScript contracts and four partial helper
migrations cover five distinct originals, with the other five owned separately.
The complete report candidate moves the remaining reporting CLI, descriptor-based
filesystem checks and masked Gemini projection reads to
`src/ci-review/ci-report-entrypoint.mts`. It preserves the optional transport,
global Fetch for protected Codex retrieval, original property reads, existing
bounds, error ordering, fourteen flat exports and exact flat direct-run guard.
Parsed JSON remains unknown; erased read views establish no validation or
authentication. Actual source/emitted operation pins, compile-only native/sync/
async/thenable composition, real build dependencies and stale/fresh identity
checks cover the new leaf. Its own current-tree CodeQL, package, full and
protected verification remain required before adoption. Adoption would reach
87/96 with nine unfinished originals: one checked JavaScript contract and three
partial helper migrations cover four distinct originals, plus five parallel-owned
originals. This does not authorize changes in provider or acceptance policy.
No migration count advances from a private candidate or local review. The
native stream/persistence proposal in #566 remains unapproved.
Migration is partial and does not change consumer architecture or assurance policy.

### Current original96 inventory and implementation boundaries

The fixed denominator is the original 96-module [source map](https://github.com/flair-agency/architecture-gatekeeper/blob/main/docs/investigations/2026-10-08-source-layout-typescript-map.md); new ordinary-Gemini and measurement modules are outside it. The earlier checkpoint section records historical slice statuses and counts. The [exhaustive current inventory](https://github.com/flair-agency/architecture-gatekeeper/blob/main/docs/investigations/2026-10-14-original96-typescript-inventory.md) supersedes those partial-implementation descriptions.

Main `512d8329de077c81e87a44a856e9e76448106181` contains **96/96 adopted** original migrations after normal adoption of #591 and #587. The final-three reviewed head `53bd4c96b6ab62367de47f607e59eb000530443a` and adopted main have exactly the same tree, `644f753c0f57fb80d42463e953e1865209727010`. The earlier post-#589 baseline `2769e3f` contained 93/96. The [final integration index](investigations/2026-10-18-quality-program-final-integration.md) records the source/package verification, fresh revision-bound reviews and protected accept, and merge readback separately. The fixed runner-temp scope follows [the owner decision in PR #591](https://github.com/flair-agency/architecture-gatekeeper/pull/591#issuecomment-6235948030); types and source organization establish no new assurance.

| Original | Complete #587 implementation |
|---|---|
| prepare-legacy-ci-authority | `src/ci-review/legacy-ci-authority-preparer.mts` |
| owner-addition-ci | `src/owner-addition/owner-addition-ci-operations.mts` |
| owner-addition-multiauthority | `src/owner-addition/owner-addition-multiauthority.mts` |

These leaves retain the existing preparation, Git reads, selected-authority checks, adapter invocation, output publication and synchronous/asynchronous CLI dispatch. Internal CI artifact operations now use fixed runner-temp names and accept only the corresponding fixed string selector or its exact absolute path resolved from the runner-temp working directory; arbitrary raw artifact paths and injected `GITHUB_OUTPUT` destinations are outside this interface. The three production workflows set that working directory for legacy and owner-addition prepare/validate steps. Multi-authority `policyBytes` still accepts Node `BinaryLike` inputs for its native digest operation; Buffer, Uint8Array, string and DataView support applies to policy bytes, not artifact paths. The environment and optional external-fetch callback inputs remain operation inputs; parsed JSON and external callback observations remain unknown until existing runtime checks, and erased contracts add no authentication or trust.

Four original flat files retain top-level function declarations: `ci-procedural-authority-change.mjs` (thin CLI), `github-runner-env.mjs` (distinct native source barrier), `prepare-review-context.mjs` (thin CLI), and `validate-decision.mjs` (thin CLI). Other wrappers also retain top-level native I/O and direct-run guards; the four-function count is not an all-native-I/O count. Flat identities, provider/protected-policy checks and native operations remain controlling.

Historical evidence for the earlier `6eedd95c00799d8958537114aea6f1fde8cf33f5` snapshot includes source-only CodeQL results of 40 JavaScript findings, no Actions findings, zero normalized changes against `5835fb7d1b6d6505390a9ca38fd1aad43ee2dda9`, and 24 generic CLI result relocations against the preceding scan at `7e008eadcbf764ef7635541ef7de154c3cee4d26`. These counts and its prior review describe that earlier snapshot only; they do not establish the current fixed runner-temp candidate's CodeQL status, zero findings, risk disposition, or hosted result. The 24 relocated identities do not establish identical fingerprints or removed risk. The 100-path fixture cap preserves query/model semantics and positive/negative assertions; no model expansion, dismissal, or bypass is implied.

Historical verification for `6eedd95` includes strict/build/cycles, 104 focused compiler/runtime/identity checks, byte identity of 230 emitted files to archive `290ce96d1ebb6c8cc9ee3d3b37d12f90bb7ad94aceabcadbd51a74dfc1f1dd47`, and the 2052-test full run at `6ab7076`. Those results are tied to their original revisions. Subsequent fixed-boundary evidence is revision-bound: `7db3b05` passed strict/build/cycles and 55 focused compiler/CLI/identity checks; `49873f5` passed source-only official CodeQL and the unchanged three-model regressions (733 JS-family files, 12 workflows, 16 unchanged JS findings, zero Actions findings). Integration head `014085e`, with identical src/test/script/workflow bytes, passed strict/cycles and a fresh full suite of 2056/2056, zero failures/skips/cancellations, in 483.9 seconds. All 230 emitted files match its actual 252-entry archive and offline installation; installed smoke passed in 109.2 seconds. The archive SHA-256 is `ba2e7d0200ca92e06c03af2fbdb553bbd512df9dfe3b133750ec1dabc2347f19`, identifying that earlier package. Its protected review stopped at the exact event base/head merge-parent guard, so that run established no acceptance. The later bounded-output correction, final verification and normal adoption are recorded separately in the [final integration index](investigations/2026-10-18-quality-program-final-integration.md); the earlier results are not relabeled. Six normative members and selected model packs remain unchanged. #566's native stream/persistence proposal remains unapproved.

Editable runtime modules, including flat API facades and CLI/native entrypoints,
use `.mts` under `src/`. Strict NodeNext compilation uses `rootDir: src`,
`outDir: dist`, and `rewriteRelativeImportExtensions: true`; the project includes
only `src/**/*.mts` and does not enable `allowJs`. Relative imports and
re-exports name their physical `.mts` source. The compiler erases types and
rewrites these references to `.mjs` in the generated runtime distribution.
Tests and development scripts outside `src/` may remain JavaScript.

`npm run check:typescript` checks the same strict project without emitting.
`npm run build` clears ignored `dist/` and emits `.mjs`; package aliases,
exports, bins and their flat emitted paths remain unchanged. The existing
source-import regression checks the complete authored tree, rejects production
JavaScript, and verifies type-only erasure and emitted module targets. Audit
`import.meta.url`, relative resources and child-script locations when changing
source paths; the Gemini launcher selects the sibling `.mts` runner for direct
source execution and the sibling `.mjs` runner in the emitted package.
The [remaining-source migration inventory](investigations/2026-10-27-remaining-source-typescript.md)
accounts for the implementation baseline separately from the historical
original96 migration.

Direct execution or import from `src/` requires native TypeScript loading.
Use Node 22.18 or newer on the Node 22 line for default type stripping; earlier
supported Node 22 versions should run the emitted `dist/` tree for development
commands. Installed commands and modules execute JavaScript and require no
TypeScript compiler.
The [Node 22.18 TypeScript documentation](https://nodejs.org/download/release/v22.18.0/docs/api/typescript.html)
describes the native loading behavior.

Install locked development dependencies with lifecycle scripts disabled, then:

```bash
npm ci --ignore-scripts
npm run check:typescript
npm run build
node scripts/check-source-cycles.mjs
npm test
```

Installing this repository from an exact Git commit runs its `prepare` script
and builds `dist/`, so the installed package's public commands and exports are
present. CI and release workflows continue to install with lifecycle scripts
disabled and invoke the build explicitly before packing. Registry archives
include the already-built `dist/` files and do not need an install-time build.

The committed tsconfig uses strict checking, `noImplicitAny`,
`noEmitOnError`, and NodeNext ESM resolution. TypeScript 6.0.3 and Node 22 types
pinned at 22.20.5 are development-only. CI and release jobs use Node 22, install
the lockfile with lifecycle scripts disabled, and build before runtime tests
and package creation. Registry packages contain the emitted runtime and need
no install-time or publish-time compilation; exact Git dependency installs
run `prepare` to build it. There are no checked-in generated runtime files.
Registry credentials remain in their existing later steps.

External JSON, environment, API and evidence values remain `unknown` until
existing runtime checks establish their usable shape. Preserve check order,
coercion/error compatibility, exact-key restrictions, byte/depth limits and
provenance/authenticity verification. Localized return assertions must describe
which completed runtime checks establish the shape; assertions and brands are
not evidence validation. Never create a no-op assertion function that appears
to validate input. Compile-negative fixtures use the actual tsconfig, reject
unexpected diagnostics and identify the intended field/argument failure.
Execution-result types distinguish completed observations with bounded response
bytes from incomplete observations without those bytes. General host outcomes
remain unknown because an accepted accessor may change across the original two
reads; the completed branch narrows only its captured success/available facts.
The retired self G0 tag-attempt, tagged-envelope, artifact/attestation and
GitHub App ruleset-readback implementations described in earlier checkpoints
are not present in the current source tree. The current protected-PR amendment
helper is `src/ci-review/self-amendment-pr.mts`, reached through
`src/self-amendment-pr.mts`; it is not a public package export or standalone CLI.

The authority-source fetch contract preserves synchronous, Promise and thenable
responses and reader results, optional signal/headers, bounded decoding, request
counts and existing timeouts.
Captured validated request strings and computed Buffer output are typed; parsed
JSON stays unknown. The readback callback composes that streaming response with
its JSON operation; standard fetch and direct shared callback composition are
compile-tested. Event and readback properties that are reread stay unknown;
readback describes canonical placement only, separate from eligibility and
acceptance.

OWNER_ADDITION readback preserves its existing PR/ordered-parent/tree/ancestry/
authority-byte checks and performs no network I/O. It reports observed placement
facts for a separate adoption evaluator. Reporter callbacks retain standard
fetch and synchronous/Promise/thenable JSON responses. External inputs, payloads
and output metadata reread after validation stay unknown; exact name/repository
constants and computed digests are typed. Publishing assumes a protected caller
already validated the result and does not authenticate that precondition.
Neither result type supplies owner authorization, producer provenance or route
activation. Focused accessor regressions retain existing observable rereads.

Runtime coverage follows the emitted and executed `dist/**/*.mjs` files. Report
those exact paths without counting source files as runtime coverage. CodeQL
analyzes authored `.mts` and Actions source, including the existing JavaScript
tests and development scripts. Generated
`dist/` is git-ignored; confirm its treatment from the actual CodeQL extraction
before making a coverage claim about emitted files. Review authored and emitted
locations as corresponding evidence, not independent coverage; retain hosted
extraction/query results before claiming analysis of the final candidate.
Installed consumers receive the `dist/` JavaScript and need no TypeScript compiler; verify archive contents
and clean/offline installation.

## Artifact file I/O checks

Legacy authority and owner-addition CI artifact operations use the existing
`src/runner-paths/runner-temp-path.mts` helper. The three production workflows
(`architecture-gate.yml`, `architecture-gate-consumer.yml`, and
`architecture-gate-providers.yml`) run the legacy and owner-addition prepare and
validate steps with `working-directory: ${{ runner.temp }}`. The helper confirms
that `RUNNER_TEMP` equals the process working directory and derives its storage
root from the real process working directory.

Output selectors are fixed strings. Legacy authority accepts only each known
relative output name or the exact absolute path resolved from the current
working directory. Owner-addition accepts its fixed child name or that child's
exact resolved absolute path. Files beneath those selections are fixed by closed
path tables; arbitrary caller-selected Buffer, file URL, descriptor or external
destination forms are not part of these CI interfaces. GitHub workflow output is
written through the existing `appendGitHubOutput` function, which obtains the
runner-created `GITHUB_OUTPUT` path through the trusted runner environment
accessor. It does not accept an injected output path as an operation argument.

The helper retains checks for direct regular files, single-link identity and
symbolic-link substitution at the operations it performs. These checks support
the fixed runner-temporary interface; they do not establish complete race
freedom. Portable Node filesystem calls do not provide a directory-relative
atomic open transaction, so a same-user actor able to change the runner
filesystem concurrently may still race between checks and filesystem operations.
The design does not claim isolation from hostile same-user concurrency or
artifact custody. See the owner-approved [PR #591 decision](https://github.com/flair-agency/architecture-gatekeeper/pull/591#issuecomment-6235948030).

## Static source import cycles

`node scripts/check-source-cycles.mjs` checks the fixed `src/` tree containing
authored runtime `.mts` files. Acorn parses runtime ESM; the
pinned TypeScript compiler API parses authored syntax. Neither parser loads or
evaluates candidate modules. Value-bearing relative imports and re-exports
contribute graph edges. An authored `.mjs` specifier resolves to a sibling
`.mts` source when present for compatibility with NodeNext resolution; new
source references name the physical extension directly. The checker rejects duplicate authored/runtime module
paths so source and emitted peers cannot mask each other.

The check rejects cycles, invalid syntax, missing relative targets, symbolic
links, escapes from the fixed root, import-equals forms and unsupported source
suffixes. `src/` supports `.mjs` and `.mts`. Pure type-only imports/re-exports
have their target safety checked but do not create runtime cycle edges. The
strict compiler still owns type resolution and semantic checking. Arguments
cannot select another root; fixtures use isolated checkout copies. Dynamic
imports, computed/CommonJS loads, bare packages and external package graphs
remain outside this static relative-edge scope. Parser/tool success supplies
development verification, not protected acceptance or consumer architecture
authority.

## Architecture changes and rollout

Record any required owner decision in the complete selected architecture Set
(the relevant normative member) before changing
architecture or assurance responsibilities. Follow its
[dogfooding and change discipline](architecture/self-profile.md#dogfooding-and-change-discipline)
for local/manual, packaged and CI paths as applicable before broader rollout.

## Local CodeQL

Run these commands from a source checkout (Node.js 22.18 or newer on the Node
22 line):

```bash
npm run codeql
```

Install the [official CodeQL bundle](https://docs.github.com/en/code-security/how-tos/find-and-fix-code-vulnerabilities/scan-from-the-command-line/set-up-codeql-cli)
for your OS, including the standard query packs. Add its `codeql` directory to
`PATH` (`codeql.exe` on Windows). No npm dependencies need installing. If the CLI is missing, the command
exits with installation guidance before creating a scan directory. Supported
systems follow CodeQL's official requirements; allow several GB of disk space.
The command analyzes JavaScript/TypeScript and Actions with the default suites,
including the local threat model used by CI. Repository-owned model packs under
`.github/codeql/extensions/` represent the selected GitHub runner output
boundary and the owner-selected workspace boundary for two legacy GitHub CLI
entrypoints, plus the two original native session path accessors adopted in
PR #574. Direct arguments and explicitly injected native API arrays remain
unmodeled. Local analysis explicitly loads all three packs that GitHub default
setup discovers from this directory, using the platform path delimiter for
`--additional-packs`.

Before scanning the repository, the command runs the standard path-injection
query with and without the selected models against generated fixtures. The output
regression retains unrelated environment, CLI, other-accessor and checked-path
findings. The workspace regression copies the production accessor and CLI
entrypoints, then checks flows through actual Git snapshot and legacy authority
operations. It retains direct workspace environment reads, other environment
and CLI sources, same-file alternate exports, caller-selected roots, copied
same-named accessors, and generic reader/preparer API flows, including the
preparer's `git diff` working directory. Native regressions trace all three
production request/decision sinks, retain explicitly injected arrays at those
sinks, and retain direct argv/environment, copied accessor, generic helper and
candidate/reviewer-value flows. Shared sink alert identity may persist
because those negative flows remain; SARIF counts do not claim a production
finding reduction. Model or query incompatibility fails the regression and
stops analysis. `npm run codeql:model` runs only this regression; the CI
`codeql-model` job runs it with the official CodeQL CLI independently of the
existing default-setup scan. The fixture, baseline/modeled SARIF, and regression result are
retained alongside the whole-tree results. Hosted model loading still requires
verification in the subsequent GitHub CodeQL run.

Each invocation retains SARIF results,
CodeQL database logs, and `summary.json` under
`~/.local/share/architecture-gatekeeper/codeql/scan-*`. The resolved output
directory must be outside the repository. These artifacts
can be large and are retained until explicitly removed.

A successful command means analysis completed, not that findings are absent.
Review findings and compare with the prior run before committing; whole-tree
results can include findings outside the PR diff. Record the CLI/query versions
when comparing with CI. This command is development tooling, not a published
package entrypoint or protected acceptance decision.
