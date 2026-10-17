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
| 587-08 | S:80 v5 output directory | Fixed runner-temp file operation |
| 587-09 | S:81 v5 evidence context output | Fixed runner-temp file operation |
| 587-10 | S:134 output directory | Fixed runner-temp file operation |
| 587-11 | S:135 eligibility prompt output | Fixed runner-temp file operation |
| 587-12 | S:136 eligibility schema output | Fixed runner-temp file operation |
| 587-13 | S:137 procedure output | Fixed runner-temp file operation |
| 587-14 | S:145 schema input | Fixed runner-temp file operation |
| 587-15 | S:147 v2 procedure input | Fixed runner-temp file operation |
| 587-16 | S:153 v5 context input | Fixed runner-temp file operation |
| 587-17 | S:155 v5 procedure input | Fixed runner-temp file operation |
| 587-18 | S:165 v5 eligibility evidence output | Fixed runner-temp file operation |
| 587-19 | M:21 Git cwd | CLI uses `trustedGitHubWorkspaceRoot`; public root remains caller capability |
| 587-20 | M:96 output directory | Fixed runner-temp file operation |
| 587-21 | M:97 eligibility prompt output | Fixed runner-temp file operation |
| 587-22 | M:98 eligibility schema output | Fixed runner-temp file operation |
| 587-23 | M:99 procedure output | Fixed runner-temp file operation |
| 587-24 | M:100 injected GITHUB_OUTPUT | Existing `appendGitHubOutput` uses the actual runner sink |

The revised disposition groups 21 file/directory operations under the closed
runner-temp table, two Git cwd operations at the CLI workspace boundary, and one
actual runner-output append. This mapping describes intended source behavior;
current integrated verification is pending.

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

Current integrated verification is **PENDING**. The coordinator will record the
actual source revision, focused and full checks, CodeQL results, and any
remaining hosted or protected evidence after integration. Prior evidence does
not waive a current failing check or authorize an acceptance route.
