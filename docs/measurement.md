# Architecture drift measurement (diagnostic pilot)

Issue [#537](https://github.com/flair-agency/architecture-gatekeeper/issues/537)
tracks implementation **and** the live evaluation. This implementation supplies
opt-in collection, redacted export, explicit case adjudication and reproducible
offline metrics. It does not complete the four-week pilot or establish a causal
percentage of drift prevented. Measurement is diagnostic data, independent of
ReviewRecords, owner authorization, eligibility, acceptance and actual integration.

## Local opt-in

Create a private, canonical directory outside **every reviewed worktree**. Do
not use a tracked directory or a symlink. Capture and directory export are
supported on POSIX hosts only: the collector requires mode 0700 and records
use 0600. On Windows they are explicitly unsupported because POSIX mode bits
cannot verify Windows ACL privacy. Opt-in capture produces a diagnostic gap
without changing required review behavior; directory export reports the
unsupported platform. Offline dataset analysis remains available on Windows.
Paths must be beneath the actual host's canonical home,
working or temporary directory (also `/tmp` or `/var/tmp` on Unix). Caller
options and injected CI environment objects cannot add a permitted root.
Host roots are resolved independently and only until a matching root is found;
a missing HOME, TMPDIR or working directory cannot veto another valid root.
Conventional Unix temporary roots also permit their canonical locations; supplied
parent aliases remain rejected.
Custom mounts outside these locations are rejected; choose a supported storage
location. Parent symlink aliases are rejected even within a permitted root.
These I/O checks do not authenticate callers or isolate a hostile same-user
process. Set the variables in the actual CLI/Hook host environment:

```sh
mkdir -m 700 "$HOME/agk-measurement"
export AGK_MEASUREMENT_DIR="$HOME/agk-measurement"
export AGK_MEASUREMENT_CHANGE_ID=owner/repository#537
architecture-review 'Review the proposed change'
architecture-measurement export "$AGK_MEASUREMENT_DIR" > export.json
```

`AGK_MEASUREMENT_CHANGE_ID` is an owner-supplied evolving change identity, at
most 200 characters. Use the same value locally and in CI only when the link
is known. A requestId, HEAD, path or similar text does not establish that two
changing candidates are the same change. Omit uncertain links. Export hashes
change IDs; use that exported ID in the population/case ledger. Worktree and
session identities are hashed locally; they are correlation aids, not attestations.
The JS manual/Hook APIs also accept `measurement: { directory, changeId }`.

Recording is default-off. Failed logging emits a fixed warning on stderr and
preserves verdicts, exceptions, exit behavior and Hook output. Full validated
findings are saved privately before PostToolUse output truncation. No prompts,
tasks or diffs are stored verbatim; their selected identities are recorded.
Private findings and scopes can still contain sensitive content. Owners control
access, exports and deletion; no automatic remote upload is performed locally.

## Version 1 record and supported boundaries

Each attempt uses a random UUID and immutable `<UUID>.start.json`, optional
`<UUID>.prepared.json`, and `<UUID>.terminal.json` files. The common envelope is
`{version:1, kind:"agk-diagnostic", attemptId, phase, route, startedAt, runtime,
repositoryId, changeId, sessionId, correlation, context}`. Prepared records bind
requestId, recorded revision, prompt/schema digests, authority provenance,
requested reviewer settings, selected committed config/validation digests where available, and route-specific scope. Terminals add completion
time, elapsed time, state, full validated decision, available execution metadata,
feedback observations and collection gaps. UserPromptSubmit records publication after context storage and rendering/return
(or CLI output acceptance). Persistence or output failures retain an error with
unknown publication; a valid blocking verdict remains a completed review with
unknown result publication. Native CLI publication is finalized after successful stdout output; output failure
retains the validated decision with unknown publication. Manual and PostToolUse CLI publication similarly
waits for their output boundary. Delivery remains unknown.

Runtime package/version and collector
hash identify the observer; the hash binds package metadata and the complete
loaded runtime inventory (`.mjs` and, in source development, `.mts`, including
imported helpers and route adapters), using
relative names so relocation alone does not change it. Inventory is bounded to
4,096 entries, depth 8, 256 KiB per file and 8 MiB total, with direct regular
file reads; an unavailable identity remains a nonblocking recording gap. These
three whitelisted fields are retained in every exported phase. Resumption only
continues an observation whose collector digest matches the current runtime;
Native selection excludes unmatched collectors before choosing an unfinished
preparation. Historical single-module digests cannot establish this binding. Missing or malformed identity values become null; arbitrary
runtime fields are omitted. They do not authenticate the entire local runtime.

The recorder retains a bounded JSON snapshot of the initial envelope and the
first successfully persisted request. Later request calls are ignored; failed
preparation remains retryable before finish. Caller mutation cannot rewrite
the retained request or scope. Prepared/terminal request conflicts, including
redacted identities, are rejected by dataset validation. These checks establish
data consistency, not authenticated execution. The same bounded phase checks
apply when CI or native capture resumes private records. Resumption refuses
mismatched attempt IDs/phases, conflicting envelopes, malformed preparation
and already completed attempts. Native selection also excludes an attempt when its
terminal exists but is torn, oversized or otherwise unreadable; that evidence is
not rewritten. Absent preparation remains an explicit gap.
Timestamp fields must be parseable strings, so JSON numeric date coercion cannot
change their meaning during export.

| Route | Observed scope | Limits |
| --- | --- | --- |
| Manual | Committed review inputs and proposed task digest | A task review does not establish that uncommitted implementation was reviewed. |
| UserPromptSubmit | Proposed task, recorded HEAD, hashed session | Internal result availability is observed; Hook discovery, host delivery and task correction are unknown. Known input-parse/event/root failures remain error observations with unknown request identity. A non-PASS remains blocking under the existing Hook contract. |
| PostToolUse | Existing tracked patch SHA-256, requestId and recorded HEAD | Queued, unchanged, deduplicated, incomplete and stale-HEAD cases remain separate. Untracked/oversized/unsupported inputs retain the existing incomplete result, including CLI stdin overflow before semantic screening. Inactive Hooks and later working-tree edits are not observed. |
| Native Skill | Preparation and later validation linked by private request location and requestId | Start/prepared persists without validation. Validation observes a valid response, not actual host settings, execution, delivery or action. Known preparation errors are recorded. Unreadable or structurally invalid request files leave independent error observations with unknown request identity; later retries retain that history. |
| CI ordinary review | Exact run/attempt, merge/base/head, protected workflow identity, selected inputs and validated response | Capture uses an already selected validation runtime. A route with no such runtime has no review-phase capture; diagnostics do not add checkout/build steps. Preparation failure and whole-run cancellation can leave no record. Owner-addition/amendment secondary reviews are outside this collector. |
| CI outcome | Policy/review/report/accept **job outcomes**, separately | Job success does not prove feedback publication or merge. Actual integration requires a population/audit record. |

CI completion also requires success of the policy-selected ordinary execution
observation, as well as all selected decision/authority/consumer validators.
Skipped steps qualify only when explicitly unselected; failed, cancelled or
missing required observation leaves the diagnostic review incomplete. Optional
CI directory bootstrap rejects an in-worktree path before creating it. Later
publication and acceptance remain separate job observations.

A terminal is never synthesized as PASS. Starts without terminals are `missing`
in aggregation; torn/malformed files contribute export `gaps`. Errors and
incomplete observations are not semantic BLOCKs. A stale reviewed snapshot can
retain its old decision privately while its terminal remains incomplete and
cannot count as a completed review of the new candidate.

`feedback.publication = returned-to-caller` means the API made the result
available at its return boundary. Host-visible delivery and developer/agent
response stay `unknown`, including session termination. Correlate real-host
observations owned by #244 separately; this collector cannot infer them.
Elapsed time is observer-wall time, including preparation, queueing or native
host delay. It is not provider execution time, developer waiting, usage or cost.

The cap is 256 KiB per JSON file and 4,096 directory entries (roughly 1,365
complete attempts). Start/prepared writes reserve 1 KiB within the file cap
for a terminal retaining the immutable envelope and first durable request.
Oversized decision, execution, publication or observation capture becomes an
explicit incomplete gap with bounded empty result fields; non-JSON or too-deep
finish payloads also become an explicit gap. Whole-record nesting is checked
before storage. A legacy envelope/request that leaves no terminal space cannot
be resumed without contradicting earlier phases, so resumption refuses it and
retains the prior evidence. Caller getter and storage failures can still leave
a missing terminal. Admission checks room for start, preparation and terminal;
preparation checks room for preparation and terminal, and resumption checks its
remaining phases. These capacity checks do not atomically reserve storage across
concurrent writers; subsequent storage exhaustion remains a collection gap.
At the directory limit logging warns and stops; it never silently deletes
older attempts. Directory enumeration stops at the first overflow entry, counts
all names before record filtering and closes its handle even when export fails.
A directory at 4,096 entries remains exportable when its matched records fit
the cumulative 4 MiB raw-byte loading budget; larger entry counts are rejected,
including when excess entries are not record filenames. Actual bytes are counted
before UTF-8 decoding or JSON parsing, including invalid UTF-8, malformed JSON
and partially failed reads. At most one extra bounded read can occur before
overflow detection. Overflow rejects the whole load; native resumption becomes
a no-op rather than selecting from a partially inspected history. Export/archive and delete
privately under an owner retention
policy before reaching the cap. Parsing rejects symlinks, hard-linked input
files, oversized files, duplicate keys and nesting beyond 32 levels. These
bounds do not provide tamper resistance, workstation containment or a runtime
sandbox. Do not treat a locally edited ledger as trusted acceptance evidence.

Native request and decision files remain host-managed Skill session inputs.
The diagnostic storage allowlist does not restrict those required review paths;
trusted hosts may allocate private sessions on other mounted locations. Native
I/O retains the existing host-allocation trust boundary independently of whether
measurement is enabled.

## CI opt-in and retention

Both reusable workflows accept `measurement-enabled: true` (default false).
The self caller selects it only when repository variable
`ARCHITECTURE_GATE_MEASUREMENT` equals `true`; this change does not set that
variable or weaken Fork admission. Reviewer collection executes the pinned,
relocated protected runtime when existing execution/validation selection already
requires it. Measurement alone does not select runtime checkout, relocation or
build inside the reviewed workspace. A route with no selected runtime skips
review capture; this is a coverage gap, not proof that review did not run.
A separate `measurement`
job observes job outcomes **after** `accept`; acceptance does not depend on it.
No reviewer/provider setting, credential or permission is added. The independent
outcome job declares `permissions: {}` and fetches the public workflow runtime
anonymously from its full SHA, with credential helpers/headers and prompting
disabled. Node setup receives an explicitly empty token and uses no package-manager
cache. Private or non-github.com runtime retrieval is unsupported by this optional
job and leaves a diagnostic gap; it does not fall back to source credentials.

Artifacts `agk-measurement-review-<run>-<attempt>-<capture-UUID>` and
`agk-measurement-outcome-<run>-<attempt>-<capture-UUID>` retain whitelist-only exports for 30
days. They contain opaque identities, CI revision/run bindings, states,
semantic decision kinds, finding counts, collector package/version/hash and job
outcomes. Private summaries,
finding text, authority names, model settings and paths are excluded. Full CI
findings exist only in the runner-private diagnostic files for that job; they
are **not** uploaded or recovered by the later outcome job. Adjudicate cases
using original review material when available, and mark unavailable material
unresolved. Redacted exports alone cannot establish defect validity.
Hashes may permit correlation or guesses; opt-in is still an owner privacy
choice. Archive artifacts before expiry if the evaluation requires them.

Artifact names include the run/attempt and the collector's UUID attempt ID,
so repeated or matrix invocations of a reusable workflow retain separate review
and outcome exports. An upload requires its collector's published attempt ID;
missing capture identity leaves a collection gap. Artifact naming does not copy
caller job labels or matrix values.

Reconcile every planned run/attempt against downloaded artifacts. Reruns have
separate run-attempt bindings. Compare the owner-frozen population and GitHub
run inventory to exports; absent artifacts are missing observations, not absent
violations. No-record eligible changes appear as `coverage.noObservation`.
Collector starts with no terminal appear in `coverage.states.missing`. The
independent outcome artifact can record review failure/skipping even when the
review collector did not start. Entire-run cancellation may lose both. This
implementation does not poll GitHub or infer cancellations from silence.

## Case ledger, blind audit and aggregation

Create a bounded version-1 dataset JSON (up to 256 KiB and depth 32).
The parsed-object API applies the same whole-dataset limits and snapshots plain
JSON data before validation; accessors, custom prototypes and serialization
hooks are rejected. Optional undefined object properties are omitted.
Every case and audit evidence entry must satisfy the same bounded, nonblank
primitive reference rules as initial/final/authority references.

Example:

```json
{
  "version": 1,
  "plan": {"windowStart":"2026-10-12", "windowEnd":"2026-11-09", "seed":"freeze-before-audit", "eligibility":"all non-draft proposed changes in the window"},
  "records": [],
  "population": [
    {"changeId":"exported-change-id", "eligible":true, "cohort":"natural", "domain":"self", "initialRef":"initial snapshot or commit", "finalRef":"final integrated commit or unknown"}
  ],
  "cases": [],
  "audits": []
}
```

Combine artifact/local export `records` by explicit attempt IDs. Identical
whole-record duplicates (including records whose JSON object keys differ only
in order) are normalized to one observation before phase validation and
aggregation; any differing field makes the duplicate conflicting and invalid.
Normalization returns a dataset view and does not mutate the caller's export.
Sum each export's `gaps` into dataset `collectionGaps` and keep it in pilot reporting;
it cannot be assigned to a known attempt. Freeze the population, initial/final
revision references, eligibility rules, time window and seed **before** audit.
Population/case identities, assessor identities, sampling seeds and references
must be nonblank opaque strings of at most
200 characters without control characters; optional unknown references may be
null or absent. The packet copies only checked IDs and initial/final references.
Owners must supply outcome-neutral reference labels and material: structural
checks do not certify semantic blinding.
Include PASS, incomplete, unsupported and unreviewed changes. Do not select
only reported findings. Separate `natural` from `fixture`, and `self` from
`consumer`; aggregate defaults to natural/self.

```sh
architecture-measurement sample dataset.json freeze-before-audit 20 > audit-packet.json
architecture-measurement aggregate dataset.json natural self > report.json
```

Sampling ranks eligible IDs by SHA-256 of seed plus change ID. The audit packet
contains only change IDs and initial/final references, hiding AGK outcomes.
Use an independent assessor and the applicable authority at each revision;
record whether blinding was actually achieved. Sampling does not execute the
audit. Freeze the packet and record exclusions rather than replacing difficult
cases. Use a census or a documented probability sample to make population
claims; generated rates are descriptive counts with explicit denominators,
not confidence bounds or causal estimates.

Each case has one owner-adjudicated `caseId`, `changeId`, `kind`
(`architecture-violation`, `proposed-task`, `authorized-evolution`, `ordinary-bug`),
`adjudication` (`valid`, `false-positive`, `unresolved`), `disposition`
(`corrected`, `withdrawn`, `integrated-violation`, `authorized-evolution`,
`rejected-proposal`, `unresolved`), `findingRefs: [{attemptId,index}]` (zero-based),
`adjudicator`, and `evidence` references. Known dispositions also require
`initialRef`, `finalRef`, `authorityRef`. Undetected audit cases have no finding
references. Put repeated/local-to-CI reports of one root cause into the same
case; exact request hashes can suggest repetition, but root-cause association
requires adjudication. Leave ambiguous associations unresolved. Duplicate
case IDs, a finding assigned more than once and invalid finding references are rejected. A later PASS never
changes the case disposition automatically. A valid architecture-violation case
cannot also classify its disposition as authorized evolution or a rejected
proposal; those stay separate from implemented violations. An integrated
violation disposition requires a valid architecture-violation case. Every known
case initial/final reference must match the corresponding known frozen population
reference, whether or not an audit is present. Missing references stay unknown. Finding references require an exact recorded
change ID; observations with uncertain change linkage remain unlinked coverage
gaps. Each known initial/final reference of an audit-linked case must also match
the audit snapshot, even when the population does not freeze those references.

An audit has `changeId`, `blinded`, `auditor`, `initialRef`, `finalRef`,
`authorityRef`, nonempty `evidence`, `initialViolationCaseIds` and
`finalViolationCaseIds`. Audit case IDs must name explicitly valid architecture
violation cases for that same change. This records an assessor's judgment;
JSON validation does not independently prove it. Owner evolution and rejected
proposals remain separate from correction of implemented violations.

| Metric | Numerator / denominator |
| --- | --- |
| Precision | Valid detected architecture cases / adjudicated detected architecture cases |
| Valid-finding resolution | Corrected or withdrawn detected valid cases / detected valid cases with corrected, withdrawn or integrated-violation outcome |
| Integrated drift incidence | Audited final changes with a valid violation / audited changes |
| Recall | Detected initial audited violation cases / all initial audited violation cases |
| Local early resolution | Resolved valid cases first detected locally and explicitly adjudicated `resolvedBeforeCI:true` / resolved valid cases |

First detection uses linked completed results' `completedAt` instants, not
execution start order. Each case reports `firstDetection` as `local`, `ci`,
`ambiguous` or `unknown`. Equal earliest local/CI completion times are ambiguous:
they stay in the resolved-case denominator, are excluded from the local-early
numerator and appear in `counts.ambiguousFirstDetectionCases`. Equal times among
local routes alone still establish a local first detection. No linked result
means unknown. These unauthenticated observer timestamps do not prove host
clock synchronization, feedback delivery or actual correction chronology;
`resolvedBeforeCI:true` remains an independent adjudicated input.

Every `finalViolationCaseIds` reference must name a valid architecture case
with `integrated-violation` disposition. Conversely, an audited change's known
valid architecture cases with that disposition must appear in its final list,
including undetected cases. A corrected, withdrawn, omitted or otherwise
conflicting case classification is rejected before metrics are computed.
Unaudited changes retain unknown drift incidence. Finding references must name
completed review results with a recognized decision and an in-range count;
`ci-outcome` job observations cannot supply findings. When both private findings
and an exported count are supplied, their counts must agree.

A zero denominator produces `null`, never 0% or 100%. Reports include unresolved
cases, blind-audit counts, unlinked attempts, terminal-without-start gaps,
coverage states, completed-attempt counts by scope, repeated attempts and wall-time samples.
`coverage.unlinkedAttempts` counts distinct review attempts whose change identity is
missing or absent from the entire declared population, regardless of the
selected cohort/domain. Like `collectionGaps`, it is a dataset-wide diagnostic;
known links to another cohort/domain or an ineligible change do not count as
unlinked. Separate `ci-outcome` job observations are excluded from review-attempt
counts. The other attempt coverage and metrics use the selected eligible
cohort/domain. Coverage `reviewed` counts changes with any completed Gate; consult
`completedByScope` to distinguish proposed tasks from implementation snapshots. Cases first proposed
in a task, authorized evolution, fixtures and ordinary bugs do not inflate
architecture-correction metrics. Usage, cost, developer waiting, host delivery
and agent response are unknown without separately attributable observations.

## Rollout evidence still required by #537

Local tests and installed-package fixtures establish implementation behavior,
not natural dogfood effectiveness. The issue remains open for real enabled
self-CI success/non-PASS and cancellation/rerun observations, active-host delivery
and termination checks with #244, one naturally occurring independently
confirmed defect, a frozen blind-audit cohort and the four-week pilot report.
No automatic remote settings activation or paid comparative experiment is
included. Pilot ownership remains open. Preserve required Gates during the
pilot; diagnostic metrics cannot authorize integration.
