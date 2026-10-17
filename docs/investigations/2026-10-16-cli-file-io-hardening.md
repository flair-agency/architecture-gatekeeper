# CLI file I/O scope under #419 / #412

The earlier generic artifact-file hardening proposal is superseded by the
consumer owner's direction in
[#591, comment 6235948030](https://github.com/flair-agency/architecture-gatekeeper/pull/591#issuecomment-6235948030).
The current change is limited to the internal CI artifact boundary: fixed
runner-temp files, the existing `appendGitHubOutput`, and the existing trusted
workspace accessor at the CLI boundary. It does not change canonical authority,
CodeQL settings or models, alert thresholds, native code, or protected
acceptance requirements.

## Current boundary and compatibility

The legacy v1 preparer uses these five closed root-level runner-temp names:

| File | Use |
| --- | --- |
| `architecture-gate-prompt.md` | Legacy prompt snapshot |
| `architecture-gate-decision.schema.json` | Legacy decision schema snapshot |
| `architecture-gate-decision.validation.json` | Optional legacy validation snapshot |
| `architecture-gate-legacy-prompt.md` | Composed legacy review prompt |
| `architecture-gate-legacy-provenance.json` | Legacy provenance record |

The owner-addition routes use the fixed child
`architecture-gate-owner-addition` with only `eligibility-prompt.md`,
`eligibility.schema.json`, `procedure.json`, `evidence-context.json`, and
`eligibility-evidence.json`. All three shipped workflows run the four affected
prepare/validate steps with `working-directory: ${{ runner.temp }}` and invoke
the pinned runtime by absolute path.

The helper validates `RUNNER_TEMP === process.cwd()` and uses closed relative
filename literals for filesystem operations. The other mapped CI operations
continue to use their existing fixed runner-temp child and file table. Where an
output selection is exposed, callers may pass its fixed filename or that
filename's absolute path under the current directory; the selection is checked
before I/O and never becomes the filesystem path. Ordinary retries overwrite
these fixed files. Buffer, URL, numeric descriptor, and arbitrary external
artifact destinations are outside these internal interfaces.

The two Git `cwd` annotations are separated from artifact destinations. The
CLI obtains its workspace through the existing `trustedGitHubWorkspaceRoot`
accessor. The public preparation function still accepts a generic `root`
capability from its caller; the CLI accessor does not authenticate arbitrary
callers or establish a general repository trust model. Existing Git arguments,
policy checks, snapshots, decision checks, and provenance semantics remain in
place.

The GitHub output operation continues through the existing
`appendGitHubOutput`, which selects the actual runner-provided output sink. It
does not preserve an injected arbitrary `env.GITHUB_OUTPUT` destination.

No claim is made about hostile same-user concurrency or race freedom. The fixed
name table narrows the artifact selection contract; it is not an isolation
boundary between processes with the same filesystem access.

## All 24 original annotations

IDs retain the original hosted annotation order from CodeQL check
`115914629156` on `ef10890135c5250393a6c4138731e8144726aae3`, not GitHub alert
numbers. L/S/M identify the legacy, single-owner, and multi-authority
implementations. The line numbers identify the original reviewed #587 source.

| ID | Original operation | Current disposition |
| --- | --- | --- |
| 587-01 | L:88 prompt output | Fixed runner-temp file operation |
| 587-02 | L:89 schema output | Fixed runner-temp file operation |
| 587-03 | L:92 validation output | Fixed runner-temp file operation |
| 587-04 | L:110 complete prompt output | Fixed runner-temp file operation |
| 587-05 | L:117 provenance output | Fixed runner-temp file operation |
| 587-06 | L:136 provenance input | Fixed runner-temp file operation |
| 587-07 | S:25 Git cwd | CLI uses `trustedGitHubWorkspaceRoot`; public root remains caller capability |
| 587-08 | S:80 v5 output directory | Fixed runner-temp child creation |
| 587-09 | S:81 v5 evidence context output | Fixed runner-temp file operation |
| 587-10 | S:134 output directory | Fixed runner-temp child creation |
| 587-11 | S:135 eligibility prompt output | Fixed runner-temp file operation |
| 587-12 | S:136 eligibility schema output | Fixed runner-temp file operation |
| 587-13 | S:137 procedure output | Fixed runner-temp file operation |
| 587-14 | S:145 schema input | Fixed runner-temp file operation |
| 587-15 | S:147 v2 procedure input | Fixed runner-temp file operation |
| 587-16 | S:153 v5 context input | Fixed runner-temp file operation |
| 587-17 | S:155 v5 procedure input | Fixed runner-temp file operation |
| 587-18 | S:165 v5 eligibility evidence output | Fixed runner-temp file operation |
| 587-19 | M:21 Git cwd | CLI uses `trustedGitHubWorkspaceRoot`; public root remains caller capability |
| 587-20 | M:96 output directory | Fixed runner-temp child creation |
| 587-21 | M:97 eligibility prompt output | Fixed runner-temp file operation |
| 587-22 | M:98 eligibility schema output | Fixed runner-temp file operation |
| 587-23 | M:99 procedure output | Fixed runner-temp file operation |
| 587-24 | M:100 injected GITHUB_OUTPUT | Existing `appendGitHubOutput` uses the actual runner sink |

The revised disposition groups 21 file/directory operations under the closed
runner-temp table, two Git cwd operations at the CLI workspace boundary, and one
actual runner-output append. This mapping describes the implemented boundary; the revision-specific
verification below does not claim hostile same-user isolation or adoption.

## Risk / production boundary / ordinary regression map

| Risk or invariant | Production boundary | Retained ordinary coverage |
| --- | --- | --- |
| Artifact destinations stay within the fixed runner-temp names | Legacy, single-owner, and multi-authority CI preparation/validation paths | Normal fixed-name reads and writes; exact fixed selection accepted; arbitrary output selection rejected |
| Retry behavior remains usable | Fixed runner-temp writer | Repeated preparation overwrites the same fixed files |
| Legacy policy and provenance semantics remain bound to recorded inputs | Legacy preparation and decision validation | Base-policy selection, authority-change rejection, provenance contents, valid and invalid decision authority selection |
| Selected Git snapshots retain regular-file checks | Legacy preparation | Selected input symlink cases remain covered |
| GitHub output stays on the runner-owned sink | Existing `appendGitHubOutput` boundary | Existing output append behavior and CLI boundary fixture |
| CLI repository root uses the established accessor | Legacy and owner-addition CLIs | Existing CLI/workflow structure coverage |

The former tests for arbitrary output directories, Buffer/URL/fd compatibility,
and ad hoc alias/race scenarios are not part of this owner-approved boundary.
No new exploit reproduction or same-user concurrency claim is included.

## Historical evidence and current verification

The earlier proposal at `e47e6ea` reported 27 JavaScript findings, zero Actions
findings, and nine new HIGH findings. Those results describe the superseded
generic helper approach and are retained as history only. They do not establish
the status of the owner-approved fixed runner-temp implementation.

The fixed-boundary JavaScript candidate `821c3eade2d4a48c28e75393bb80ec8ff0184719`
passed strict typecheck, build, source cycles, and 54 focused CLI/runtime identity
checks. Its fresh full suite passed **2048/2048**, no failures, skips or
cancellations, exit 0 in 623.3 seconds (Node 22.23.3, concurrency 2).
Unsupported generic artifact path/fd scenarios were removed following the owner
direction, while policy, provenance, selected snapshot, malformed decision and
runtime identity checks remain. Counts are not a coverage or security guarantee.

Its source-only official CodeQL 2.27.2 run extracted 723 JavaScript/TypeScript
files and 12 workflows. The unchanged three model regressions passed, including
generic caller-root negative flows. Results: **16 JavaScript findings, zero
Actions findings**. Comparison to `e47e6ea` retained all 16 unrelated results,
removed the nine generic-helper findings (296–301 arbitrary paths; 302–304
numeric descriptor branches) and the two owner Git-cwd results, and added none.
No query, model, threshold, alert dismissal or suppression was changed. This is
local scan evidence; a successful hosted PR check is still required.

The actual archive SHA-256 is
`fa62653f808b90879cd8ee5269aa0e5033afd55048cf9d3246d04eb64014b2ad`.
All 227 emitted modules match the archive and clean offline installation; it has
249 entries, eight bins, nine exports and no runtime dependencies/authored MTS.
Installed smoke passed in 124.2 seconds with unchanged 120-second group limits.
All 26 checked normative/model/configuration files match the adopted base.

The separate final-three TypeScript candidate `7db3b05` passed strict/build,
source cycles and 55 focused compiler/CLI/runtime identity checks. Full operation
AST pins use the fixed-boundary JavaScript baseline; policy-byte BinaryLike
inputs and external transport callback contracts remain supported. A subsequent
regression-coordinate correction `49873f5` changes the pinned sink location to
the actual SARIF line, preserving the assertion that generic roots are detected.
Its official CodeQL rerun is pending; earlier evidence is not relabeled.

## Approved v2 publication and adoption hold

The owner approved bounded chunked publication in the follow-up conversation.
The v2 procedure still selects the actual runner-created output sink through
`appendGitHubOutput`; its encoded value must fit the existing consumer limit of
65,536 base64 characters. One complete ASCII `procedure_base64=...\n` line is
appended in consecutive fragments of at most 16,384 bytes, with no newline
between fragments. The helper's per-call bound and all other callers remain
unchanged. This preserves supported large v2 metadata without introducing a
larger helper limit or accepting an injected destination. An append failure
fails preparation; a partial command-file line is not acceptance evidence.

Normal regression coverage uses 32 committed authority members with long paths,
checks complete output/consumer roundtrip and append retry behavior, and retains
the existing consumer's 65,536-character boundary. It adds no attack/race
reproduction. This publication change has its own current-candidate verification;
the earlier results above remain bound to their original revisions.

Both #591 and #587 remain on merge hold; main remains 93/96 adopted. A local
96/96 implementation is not adoption. Fresh final-candidate checks, Native and
hosted Code/Security Review, and non-skipped protected review/accept are required.
The existing exact event base/head merge-parent guard must succeed; its previous
failure is not waived or worked around. Filesystem concurrency limits above
remain; no hostile same-user isolation or complete race freedom is claimed.
