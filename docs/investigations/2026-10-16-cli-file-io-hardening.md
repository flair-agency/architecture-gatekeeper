# CLI artifact I/O hardening under #419 / #412

The owner approved rejecting dangerous linked/nonregular artifact inputs and
outputs on 2026-10-16 (Asia/Tokyo), while retaining caller-selected locations,
native input forms and injected `env.GITHUB_OUTPUT`. This is a separate risk
correction before the final-three TypeScript migration in #587. It changes no
original96 migration count, selected authority, CodeQL model/query, provider,
permission, input limit, reviewer setting or protected acceptance requirement.

## Implementation and compatibility

The three existing flat implementations use `runner-paths/artifact-file-io.mts`
for artifact files and output directories. Existing fixed-temp and GitHub output
helpers cannot directly replace these operations: their closed path tables or
actual-process environment selection would change the caller-selected APIs.
The new helper follows their descriptor-checking approach without adding a new
storage selection, trusted accessor, sanitizer model or custody claim.

The helper rejects leaf symlinks, hardlinks, linked parents (including repeated
or trailing separators), and nonregular files. It opens without truncation,
checks the opened file's type/link count/inode, and rechecks path/parent identity
before data access. Missing writes use exclusive creation; file operations use
no-follow/nonblocking flags where supported. Directory creation checks existing
ancestors before mkdir and the resulting chain afterward. Caller-owned numeric
descriptors remain open at their original offset and are not truncated.
An open-then-unlinked regular descriptor remains usable; pathname-based opens
still require one link and multiply linked descriptors are rejected.

Valid string, Buffer, URL, relative and caller-selected external paths remain
usable. Buffer paths retain native non-UTF-8 POSIX filename bytes. Ordinary
existing-file modes and overwrite/retry semantics remain, as does missing-file
creation for multi-authority `env.GITHUB_OUTPUT` with the original 0666/umask
mode. That injected sink can differ from actual `process.env.GITHUB_OUTPUT`;
the latter is not substituted. Git root selection and all preceding policy,
snapshot, tag, decision and provenance checks retain their meaning.

The approved compatibility break includes intentionally linked/special-file
paths and linked parents. On hosts whose conventional temporary path is an
alias, callers must select its physical directory. This imposes no new
checkout/temp containment rule or filename allowlist.

## All 24 original annotations

IDs are the hosted annotation order from CodeQL check `115914629156` on
`ef10890135c5250393a6c4138731e8144726aae3`, not GitHub alert numbers. L/S/M refer
to the legacy, single-owner and multi-authority implementations respectively.
The line numbers identify the original reviewed #587 source, not this patch.

| ID | Original operation | Current disposition |
| --- | --- | --- |
| 587-01 | L:88 prompt output | Checked artifact write |
| 587-02 | L:89 schema output | Checked artifact write |
| 587-03 | L:92 validation output | Checked artifact write |
| 587-04 | L:110 complete prompt output | Checked artifact write |
| 587-05 | L:117 provenance output | Checked artifact write |
| 587-06 | L:136 provenance input | Checked artifact read |
| 587-07 | S:25 Git cwd | Caller-selected root retained; existing snapshot checks retained |
| 587-08 | S:80 v5 output directory | Checked directory creation |
| 587-09 | S:81 v5 evidence context output | Checked artifact write |
| 587-10 | S:134 output directory | Checked directory creation |
| 587-11 | S:135 eligibility prompt output | Checked artifact write |
| 587-12 | S:136 eligibility schema output | Checked artifact write |
| 587-13 | S:137 procedure output | Checked artifact write |
| 587-14 | S:145 schema input | Checked artifact read |
| 587-15 | S:147 v2 procedure input | Checked artifact read |
| 587-16 | S:153 v5 context input | Checked artifact read |
| 587-17 | S:155 v5 procedure input | Checked artifact read |
| 587-18 | S:165 v5 eligibility evidence output | Checked artifact write |
| 587-19 | M:21 Git cwd | Caller-selected root retained; existing snapshot checks retained |
| 587-20 | M:96 output directory | Checked directory creation |
| 587-21 | M:97 eligibility prompt output | Checked artifact write |
| 587-22 | M:98 eligibility schema output | Checked artifact write |
| 587-23 | M:99 procedure output | Checked artifact write |
| 587-24 | M:100 injected GITHUB_OUTPUT | Checked append to the original injected sink |

The 21 artifact operations and one injected append now reject the reproduced
static aliases/special files and the tested open-time substitutions. This does
not mean that 22 CodeQL result identities disappear: taint can remain at shared
helper sinks because destination selection is intentionally preserved.

The two Git cwd annotations represent an existing caller capability. Arguments
are passed separately to Git; canonical policy paths, exact regular Git tree
entries, SHAs and tag/provenance bindings are checked by existing code. Inspected
protected workflows choose the checkout and fixed runner-temp output paths;
candidate/reviewer content does not choose these locations there. This does not
authenticate an arbitrary environment, repository or Git executable/object store.
No new workspace model is used to mark these roots trusted.

## Risk / production boundary / regression map

| Risk or compatibility invariant | Production boundary | Verification |
| --- | --- | --- |
| Aliased snapshot/provenance outputs | Legacy public prepare and validate CLI | Sentinel files stay unchanged on link rejection; normal native destinations remain usable |
| Aliased eligibility files and directory | Single-owner prepare/validate CLI, multi-authority public prepare | Real Git/tag fixtures exercise output rejection and schema/procedure/context input rejection |
| Injected sink must remain selected | Multi-authority public prepare | Process output A stays unchanged while injected B receives append; missing ordinary B is created |
| Truncation/open-time substitution | Artifact helper | Deterministic leaf replacement, new hardlink and parent replacement fail before data access |
| Repeated separators must not hide a link | Artifact helper | Raw string/Buffer repeated-separator file paths and trailing-separator directory paths reject |
| Native path/fd compatibility | Artifact helper and legacy API | Relative, string, Buffer, URL, non-UTF-8 POSIX names, fd offsets/lifetime, modes and append/overwrite controls |
| Special file must not block | Artifact helper | FIFO/device/directory rejection with bounded child execution |

The initial independent review found a real repeated-separator parent-link
bypass. The added regressions failed against the initial emitted helper and
passed after trailing separators were removed from each checked ancestor,
preserving roots and unnormalized `..` components. Keep this failure as history;
the initial helper is not treated as a successful security correction.

## Remaining limits and acceptance

There is no atomic directory-relative open transaction in the portable Node
calls used here. Parent replacement during creation can leave empty files or
directories before a subsequent check rejects the operation. Filesystem changes
after the final check, including a newly added hardlink, remain possible for an
actor with sufficient access. No hostile same-user isolation, general Git-store
defense, authenticated artifact custody or complete race freedom is claimed.
Caller-selected ordinary file destinations remain capabilities; untrusted
callers must not be mistaken for authenticated invocation.

Current initial verification: strict/build/source cycles passed; focused helper
and three production suites passed 62/62, zero failures/skips, 8.88 seconds
(Node 22.23.3, concurrency 2). These results precede final committed-head full,
CodeQL, package, independent/Native and hosted/protected verification. Those
remaining results must be recorded at their actual revisions before adoption.
No local result waives a failing hosted check or authorizes #587 adoption.
