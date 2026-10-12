# Issue #537 measurement implementation verification

This is the consolidated development investigation for PR #541, not protected
acceptance, deployment or causal pilot evidence. It replaces repeated per-run
chronology with the review history and retained risk/boundary/test map.
[The complete earlier chronology](https://github.com/flair-agency/architecture-gatekeeper/blob/ae9dd1639263da2e980b5f27022c7c470940c9fd/docs/investigations/2026-10-11-drift-measurement-537.md)
is preserved in Git and a private host copy; no prior failed evidence is erased.
The six canonical authority members are unchanged from actual base
`1054d1ba88db7bf1fc20af4d182eb614d31c6f01`.

## Authority and remaining field evidence

The owner-authorized diagnostic responsibility was adopted through #552, whose
main merge is `9aab98128788f944d75017b64119915500c98bc2`. Its authority readback
SHA-256 is `b79d3abf7619f6f7891a937a9dbbf7f65757ebcc0b7f804ca844ab9dace381a3`.
Implementation does not amend the selected Authority Set or infer consumer policy.

#537 remains open for real enabled CI/Hook observations, independently
adjudicated natural cases, independent blind audit and the four-week pilot.
An earlier PR-description closing keyword accidentally closed #537; it was
reopened. No completion, causal prevention rate or release is established here.

## PR #541 review-history invariant audit (2026-10-12)

The 27 cloud code-review findings comprise three P1 and twenty-four P2. Our
classification is trust/responsibility (5), identity/consistency (14), finite
limits/host assumptions (7), and statistics (1). CodeQL annotations are separate
static-analysis evidence, not included in that count.

| Finding | Family | Boundary/problem | Correction |
| --- | --- | --- | --- |
| [Comment](https://github.com/flair-agency/architecture-gatekeeper/pull/541#discussion_r4243913805) | trust | Diagnostic responsibility | Canonical adoption in #552 precedes implementation |
| [Comment](https://github.com/flair-agency/architecture-gatekeeper/pull/541#discussion_r4243913808) | identity | Conflicting phases | Shared bounded envelope/phase comparison |
| [Comment](https://github.com/flair-agency/architecture-gatekeeper/pull/541#discussion_r4243933053) | trust | Native host paths | Restore host-managed required I/O; diagnostics do not constrain scratch |
| [Comment](https://github.com/flair-agency/architecture-gatekeeper/pull/541#discussion_r4244203165) | identity | Skipped selected validators | Require selected checks to succeed; unselected checks skip |
| [Comment](https://github.com/flair-agency/architecture-gatekeeper/pull/541#discussion_r4244203173) | statistics | Even median | Average both middle intervals |
| [Comment](https://github.com/flair-agency/architecture-gatekeeper/pull/541#discussion_r4244413077) | identity | Artifact collisions | Capture UUID names/guards across repeated invocations |
| [Comment](https://github.com/flair-agency/architecture-gatekeeper/pull/541#discussion_r4244676972) | trust | Blocking outcome job | Isolate the whole optional job, preserve required jobs |
| [Comment](https://github.com/flair-agency/architecture-gatekeeper/pull/541#discussion_r4244826892) | trust | Diagnostic checkout changes evidence | Keep required checkout/runtime selection unchanged |
| [Comment](https://github.com/flair-agency/architecture-gatekeeper/pull/541#discussion_r4244826896) | identity | Prepared request mutation | Own the first durable snapshot; prevent reentrant replacement |
| [Comment](https://github.com/flair-agency/architecture-gatekeeper/pull/541#discussion_r4245202720) | identity | Identical duplicates | Deduplicate identical phases; reject conflicts |
| [Comment](https://github.com/flair-agency/architecture-gatekeeper/pull/541#discussion_r4245983197) | limits | Windows leaf links | Explicit unsupported capture/export on Windows |
| [Comment](https://github.com/flair-agency/architecture-gatekeeper/pull/541#discussion_r4245983202) | limits | Windows privacy | Do not claim POSIX modes establish Windows privacy |
| [Comment](https://github.com/flair-agency/architecture-gatekeeper/pull/541#discussion_r4245983216) | identity | Exported collector identity | Retain checked identity on every phase |
| [Comment](https://github.com/flair-agency/architecture-gatekeeper/pull/541#discussion_r4247420379) | limits | Unrelated directory entries | Bound every enumerated entry, not just matching filenames |
| [Comment](https://github.com/flair-agency/architecture-gatekeeper/pull/541#discussion_r4247657299) | identity | Execution before completion | Bind every selected ordinary stage to completion |
| [Comment](https://github.com/flair-agency/architecture-gatekeeper/pull/541#discussion_r4247657309) | identity | Resolved final violations | Bidirectional case/final-audit consistency |
| [Comment](https://github.com/flair-agency/architecture-gatekeeper/pull/541#discussion_r4248090925) | limits | Unavailable unrelated roots | Resolve alternatives independently and short-circuit |
| [Comment](https://github.com/flair-agency/architecture-gatekeeper/pull/541#discussion_r4248148231) | trust | Repository-token defaults | No token permission; anonymous fixed-SHA bootstrap and empty setup token |
| [Comment](https://github.com/flair-agency/architecture-gatekeeper/pull/541#discussion_r4248283395) | identity | Absent authority provenance | Leave unknown source/run identities unset |
| [Comment](https://github.com/flair-agency/architecture-gatekeeper/pull/541#discussion_r4248419785) | limits | Oversized terminal fallback | Bound every result field and immutable whole-record envelope |
| [Comment](https://github.com/flair-agency/architecture-gatekeeper/pull/541#discussion_r4248692670) | limits | Terminal capacity | Admission/resumption phase-space preflight and legacy byte budgets |
| [Comment](https://github.com/flair-agency/architecture-gatekeeper/pull/541#discussion_r4248971131) | identity | Completed native retry masks preparation | Exclude terminated attempts before selecting unfinished preparation |
| [Comment](https://github.com/flair-agency/architecture-gatekeeper/pull/541#discussion_r4249084203) | limits | Hook stdin overflow omitted | Retain CLI incomplete and adjacent parser/event/root error observations |
| [Comment](https://github.com/flair-agency/architecture-gatekeeper/pull/541#discussion_r4249165892) | identity | Structured blind references | Validate bounded primitive refs and whitelist copied output |
| [Comment](https://github.com/flair-agency/architecture-gatekeeper/pull/541#discussion_r4249641792) | identity | Collector dependency/adapter coverage | Digest full emitted runtime and package metadata; bind resumption to matching collector |
| [Comment](https://github.com/flair-agency/architecture-gatekeeper/pull/541#discussion_r4249827714) | identity | Typed source omitted from collector inventory | Bind `.mts` source as well as emitted/legacy `.mjs` bytes |
| [Comment](https://github.com/flair-agency/architecture-gatekeeper/pull/541#discussion_r4249827724) | identity | Hook publication finalized before context/output | Defer terminal until the owning public adapter stores and produces its result |

The repeated pattern is a shared invariant missed at another concrete boundary:
selected CI stages, resumption, early returns, export and analysis. This means
local patch verification did not establish integrated completeness. Some findings
are independently uncovered old defects: the latest native-selection-only change
`91c16f2` did not modify the PostToolUse or sampling paths flagged next. One fix
also introduced a new CodeQL path sink; `73f2ae9` corrected it with the existing
bounded direct-file reader. Review PASS is not proof that no defect remains.

The late token P1 existed from the original diagnostic job. Earlier semantic
summaries and tests incorrectly treated minimal `contents: read` permission as
sufficient. The adopted contract prohibits adding diagnostic token permission;
both workflows now enforce it, including action token defaults. This is a
correction to the earlier interpretation, not a new owner rule.

## Invariants and production checks

Test names below refer to `test/<name>.test.mjs`. Synthetic reviewer responses
and owner-supplied ledgers exercise actual emitted/installed production functions
and CLIs. Parsed workflow checks do not execute GitHub expressions or establish
host protection. Source-only fixture results do not authenticate producer execution.

| Risk / invariant | Production boundary | Retained verification and limit |
| --- | --- | --- |
| Optional diagnostics cannot fail or satisfy required review | Recorder, local/Hook/Gemini/native adapters, CI bootstrap and outcome job | `measurement-adapter-isolation`, `measurement`, `workflow-structure`: invalid/throwing selectors, disabled capture, original BLOCK/informational results and bootstrap/dependency guards; no protected acceptance inference |
| Actual scope/prompt and one immutable lifecycle | Start/request/finish, PostToolUse snapshot, native pairing | `measurement-request-state`, `measurement-resumption`, `measurement-phase-consistency`: first durable request, nested mutation, reentrancy, bounded envelope comparison, missing/malformed prep, mismatched ID/phase and completed replay; full findings before renderer truncation |
| Native selection must find an unfinished original | Native prepare/validate and resumption | `measurement`, `measurement-resumption`: actual same-path/same-ID failed retry followed by original BLOCK validation, four terminal-state variants and all-completed refusal; required exclusive native I/O retained |
| Every selected ordinary CI stage must succeed | Both workflow finish bindings and collector | `measurement-ci-validation-outcomes`: five stages, all 32 selection combinations and per-stage failed/missing/skipped/cancelled results; actual decision-kind failure and matching-response control |
| Collected response matches validated output and invocation | CI collector, checked runner output, UUID artifact names | `measurement-ci-artifact-identity`, `measurement`: absent/malformed/duplicate-key/oversized/different decisions, repeated collectors and caller sink refusal; actual hosted matrix behavior remains pilot work |
| No invented unknown provenance | CI start/finish and redaction | `measurement-ci-missing-identities`: absent/empty modern/legacy sources, precedence, partial/invalid run IDs and observed empty prompt digest control |
| No diagnostic repository-token permission/default | Both outcome workflow jobs and anonymous fixed-SHA bootstrap | `measurement-ci-no-credentials`, `workflow-structure`: permissions {}, empty setup-node token, no cache, disabled credential helpers/headers/config/prompting, malformed source and wrong SHA; actual public repo fetch; private/other hosts remain nonblocking gaps |
| Bounded private filesystem access | Diagnostic path and direct reader, capture/load/export | `diagnostic-path`, `measurement-directory-limit`, `measurement`: traversal, sibling prefix, aliases, symlink/hardlink/nonfile/UTF-8/duplicate-key checks, all-entry count and handle closure; Windows capture/export unsupported; no hostile same-user isolation claim |
| Unrelated host roots do not become dependencies | Independent root alternatives before I/O | `diagnostic-path`, `measurement`: five-root fault matrix, missing HOME/TMPDIR/cwd and actual capture/export/aggregate/sample service-account fixtures; selected required roots retain failure behavior |
| Every result field fits bounded terminal storage | Recorder finish and immutable start/prepared envelopes | `measurement-terminal-bounds`: oversized/cyclic/BigInt/deep/throwing decision, execution, observation and publication, one-time snapshot, 1 KiB reserve and whole-record depth; legacy refusal never rewrites stored evidence |
| Sufficient remaining phase capacity | Capture admission, request and resume | `measurement-terminal-bounds`, `measurement-directory-limit`: start3/request2/resume2-or1/finish1 slot preflight, 4,093 success and 4,094/4,095 admission refusal, full 4,096-entry export; longest marker/max-Date legacy byte negative; not an atomic reservation across writers |
| Early Hook failures remain observable | PostToolUse overflow and UserPromptSubmit parser/event/root paths | `measurement`, `measurement-adapter-isolation`: actual ASCII/UTF-8 overflow, exact byte limit, output/exit/exception preservation, private-directory refusal, unavailable cwd and no reviewer dispatch; unknown request/decision remain null |
| Export includes only checked whitelist identity | Redaction, export CLI and artifact transport | `measurement`: private narrative/task/prompt/diff/model/authority/path exclusions, exported collector identity, actual installed CLI/API; consumers own retention/disclosure |
| Identical duplication differs from contradictory evidence | Dataset normalization and shared phase validator | `measurement-duplicate-observations`, `measurement-phase-consistency`: identical phases dedup; conflicting immutable values, malformed phase sets and bounded comparisons rejected; terminal-only remains explicit missing-start |
| Adjudication and final audit agree in both directions | Dataset validator, aggregate/sample CLIs | `measurement-population-links`, `measurement-ledger-cli`: resolved final violations, omitted detected/undetected integrated cases, invalid finding refs/decision/counts, unaudited unknown denominators and failed stdout; owner evidence is not inferred from PASS |
| Blind output cannot copy structured outcomes | Population/case/audit refs and sampler output projection | `measurement-population-links`, `measurement-ledger-cli`: objects/arrays/scalars/blank/oversized/control refs rejected; accessor substitution and extra outcome fields cannot enter packet; owners still provide semantically neutral IDs/material |
| Metrics respect population and interval meaning | Aggregator and deterministic sampling | `measurement-population-links`, `measurement-latency`, `measurement-detection-order`: eligible cohort/domain vs complete link population, special keys, numeric timestamp refusal, odd/even/empty/negative intervals and local-to-CI order; descriptive metrics do not measure causal effectiveness |
| Emitted and installed APIs retain identity | Build, package exports/bins and installed smoke | Type-positive/negative suites and `preview-runtime-identity`: all new module bytes invalidate stale requests/receipts; actual installed measurement CLI/public export; runtime identity grants no owner authorization |

## Candidate verification and negative evidence

Executable candidate `ae9dd1639263da2e980b5f27022c7c470940c9fd`, actual base above:

- Strict build/type checking passes; static relative source-cycle check reports
  97 runtime `.mjs` and 100 authored `.mts`, no cycles. Six authorities match base.
- Focused command `node --test test/measurement*.test.mjs test/diagnostic-path.test.mjs test/workflow-structure.test.mjs test/local-post-tool-screen*.test.mjs`:
  166 pass, zero fail, one Linux-only skip (167 total; 8.014 s).
- Full `TMPDIR=/private/tmp/pr-541-test-root npm test`, after all build/pack steps:
  1,651 pass, zero fail, one skip (1,652 total; 235.420 s).
- Meaningful published-runtime negatives: seven new Hook cases and both packet
  cases fail on `91c16f2`; all five native retry cases fail on `cc91487`; five of
  eighteen capacity cases fail on `9b10d25`; twelve of fifteen identity/terminal
  cases fail on `5feb347`. Retained prior positives and genuine production calls
  remain; temporary mutation copies are removed.
- Archive SHA-256 `fd66e4141bf2c5d228969ddcf6d9d035334912d71075ac621303d95bb83ef548`:
  all 218 files match source/build bytes; empty-prefix offline install with scripts
  disabled succeeds; 35 selected installed Hook/packet/terminal/native regressions
  pass in 1.235 s. This investigation is excluded from the package file whitelist.
- Independent CLI `/review` on complete actual-base diff, `gpt-6.1-sol` / low,
  read-only: no actionable regression; it did not execute tests.
- Installed native architecture Skill E2E, separate host-native task
  `/root/final_architecture_review`, exact `gpt-6.1-sol` / medium: actual returned
  PASS validates. Full six authorities and all changed lines across 44 files with
  one unchanged context line were supplied; prompt 510,028 bytes. No physical
  write-denial or hard host timeout is claimed. Exact request/prompt/schema,
  actual decision, validation and provenance are in a private host record;
  original session cleanup completed. This is local feedback, not CI acceptance.
- Current-head hosted CodeQL assessment and unchanged model regression pass.
  Hosted full/package smoke and cloud review are checked separately in PR status.
- The synchronize event fails exact merge-parent binding before model dispatch.
  The fresh Ready event at run `38267812378` passes binding but stops before
  reviewer dispatch because final task context exceeds the existing 524,288-byte
  prompt ceiling. It is incomplete execution, not semantic BLOCK or PASS.

Earlier failures remain explicitly scoped: a full test overlapped npm-pack
prepare rebuilding `dist/`, causing seven ENOENTs; the isolated run passed.
The complete local installed smoke on `643dbcf` reached the unchanged 120-second
runtime-identity API deadline after earlier paths passed, so it was not complete
smoke success. Later `cc91487` passes complete hosted full/package smoke in run
`38259649452` and fresh protected acceptance in `38259922152`; neither is current
candidate evidence. No deadline, CodeQL query/model/suppression, review setting,
parsing budget or protected parent/acceptance guard is weakened.

Earlier official source-only CodeQL comparisons retained all 58 baseline flows
and fingerprints with no additions/removals; generic native host paths preserve
the inherited invoker-selected-path risk. Successful analysis is not zero risk,
and diagnostic path checks are not broad taint/authentication barriers.

## Delivery-scope retrospective

Four boundaries should have been delivered as independently reviewable slices:

1. Lifecycle/storage/export contract and bounded failure/negative fixtures.
2. Manual, Hook, native and CI adapters against that contract, one entrypoint at a time.
3. Dataset validation, descriptive aggregation and blind sampling against owned inputs.
4. Package/CI delivery and real host composition.

The current 44-file PR mixes these concerns, and accumulating run chronology
also pushed its protected review context over the fixed prompt ceiling. This
consolidation removes duplicate narrative while retaining the full finding list,
boundary/test map, failures and evidence provenance; original chronology remains
in Git and private host evidence. It changes no runtime, package bytes, authority
or accepting route. Future splits need independently reviewable outcomes and
verification, rather than merely splitting files. Repeated prior PASS does not
establish convergence; final current-head cloud and protected results must be
observed before reporting completion.

## Complete collector identity correction (2026-10-13)

The consolidated head `3e8b0cb` passes hosted full tests (1,652 pass, zero
fail/skip, 290.278 s), complete pack/install/smoke in run `38268562618`, CodeQL
assessment and model regression, and fresh protected review/report/accept in
run `38268701134`. The next cloud review nevertheless identifies a concrete
identity gap: retaining a digest of `measurement.mjs` alone does not distinguish
changes in its dependencies or route adapters at the same package version.
This belongs to the existing implementation-identity family, not a defect
introduced by the document-only consolidation.

Collection now hashes package metadata and every emitted `.mjs` implementation
using deterministic relative names and byte digests. This conservatively binds
the entire installed runtime, including indirect helpers and all route adapters,
without exporting file names or claiming authentication. Inventory checks all
entries, bounds count/depth/per-file/total bytes and closes handles on failure.
It does not borrow the diagnostic storage-root constraint for installed runtime
files. Existing record and review budgets stay unchanged. Native selection
filters foreign collector digests before selecting an unfinished preparation;
direct resumption refuses mismatched or missing identity without rewriting phases.

Risk → boundary → tests: `runtime()` capture and exported phase identity are
exercised by `measurement-runtime-identity` in isolated complete installation
copies. Seven helper/adapter/transitive byte changes keep the version fixed but
change collector identity; relocation retains it. Oversized, total-byte, entry,
depth and symlink inventories remain nonblocking gaps. Actual two-process manual
and native resumption works unchanged, then refuses a changed installed helper.
`measurement-resumption` retains the original same-collector preparation when a
newer unfinished foreign-collector observation exists. These are implementation
identity checks, not hostile-host isolation or producer authentication.

Related suite: 182 pass, zero fail, one Linux-only skip (183 total; 12.413 s).
The published `3e8b0cb` installed runtime fails fourteen of fifteen isolated
identity/inventory/resumption cases; the relocation/unchanged control passes.
An initial focused run's manual-resume fixture omitted its required directory
argument; it was corrected and both positive and negative runs repeated. That
failed fixture run is retained and is not successful evidence. Current-candidate
full, installed and independent/protected reviews are recorded separately in PR
verification before reporting completion.

## Source-mode identity and outer publication (2026-10-13)

Cloud review on `70f4681` identifies two remaining concrete boundaries. The
collector inventory omitted typed files in the supported direct-source path,
so a `.mts` adapter change did not alter identity. It now includes typed sources
as well as `.mjs`, retaining finite inventory and direct reads. An actual
`node --experimental-strip-types` production capture in an isolated complete
source copy detects both typed adapter and typed collector mutations.

Private local helpers also finished a Hook terminal before context persistence
and public return. Their completion is now deferred to the outer adapter: failed
context storage, rendering or output produces an unpublished error; successful
Hook return publishes after storage, while an expected BLOCK remains a completed
review with unknown result publication. Required exceptions, exit statuses and
output are preserved. The same audit covers manual result selection, manual CLI
output and normal/overflow PostToolUse CLI publication. Stream acceptance does
not prove delivery, which remains unknown.

Risk → public boundary → test: `measurement-adapter-isolation` exercises actual
context mkdir failure and sync Hook stdout failure with capture off/on; exception
constructor/message and child exit/output remain equal. It covers successful
PASS, expected BLOCK, manual result-selection failure, and actual PostToolUse CLI
normal/overflow write failures. Source-mode identity has its own actual execution
fixture in `measurement-runtime-identity`. Related suite: 190 pass, zero fail, one
Linux-only skip (191 total; 11.984 s). Old `70f4681` source and installed-package
negatives are retained separately; current full/distribution/independent/protected
results must be recorded in PR verification.

## Deadline and semantic split (2026-10-13 01:00 JST)

At the owner's deadline, PR #541 still had unresolved native stdout-finalization
and generated Hook fixture CodeQL findings; local PASS did not establish protected
acceptance. The original Draft preserves its history and tested head. Successors
isolate (1) private record core, (2) local/native observers, (3) dataset analysis and
public API/CLI, and (4) optional CI observation. Dependent Drafts require parent
adoption, retargeting and current main-policy checks before merge readiness.

The adapter successor finalizes native observations after stdout succeeds and
retains validated PASS/BLOCK with unknown publication on write failure. A static
child Hook fixture replaces generated executable test code. Independent core
review also found that a torn/oversized terminal could hide an older unfinished
native attempt; bounded direct reads now exclude any existing unreadable terminal
without rewriting it. Real fault regressions cover these cases. These corrections
do not change review decisions, selected authority, deadlines, limits or acceptance.

All original mixed-suite assertions are preserved at their owning production
boundary. Core, adapter, analysis and CI tests execute without future-module
imports. The union retains the original intended runtime apart from the stated
corrections. Four-week pilot and enabled-host effectiveness remain #537 work.

Split-scope reviews additionally exposed omitted-cwd containment, warning-sink
failures, eager reviewer-option enumeration, missing packaged adapter guidance
and native decision-file reads preceding diagnostic resumption. Each repair
stays in its owning core/adapter/CI slice. Native missing, malformed and nonfile
decisions now retain error observations before a later successful retry; required
validation and exclusive request allocation are unchanged. Fault regressions
fail the prior installed runtime and pass the corrected source/installed runtime.
