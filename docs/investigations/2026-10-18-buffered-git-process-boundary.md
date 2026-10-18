# Buffered Git process boundary (2026-10-18 JST)

This non-normative, partial #573 increment starts from adopted
`52cdf7d2c527bd0f1c065b5a85f770c8f8a46a07`. The initial
[I/O inventory](2026-10-18-git-filesystem-responsibility-inventory.md) and later
[reader comparison](https://github.com/flair-agency/architecture-gatekeeper/issues/573#issuecomment-6244100536)
retain the intentionally different reader policies.

## Bounded mechanism and caller ownership

`src/git/buffered-git.mts` owns only synchronous native Git invocation with a
caller-provided cwd and ordered argv, inherited environment, Buffer output and
the existing `2_000_000` Node subprocess buffer setting. Native exceptions pass
through. There is no new timeout, environment override, stdio policy, validation,
decoding, command selection, output destination, cleanup or public export.
The helper is not a path validator or a source of repository identity.

| Migrated caller | Invocation sites | Policy retained by caller |
| --- | --- | --- |
| `authority-validation/legacy-git-snapshot.mts` | `ls-tree`, `show` | Selection/path syntax, regular modes 100644/100755, exact entry/OID metadata, nonempty/post-read size check and SHA-256 result |
| `ci-review/legacy-ci-authority-preparer.mts` | `gitDiffNames` | Exact base-to-reviewed diff argv, UTF-8/NUL parsing, changed-authority rejection, fixed output and required preparation failure |
| `owner-addition/owner-addition-ci-operations.mts` | Existing private `git` wrapper | Command selection, its 100644-only committed-file policy, post-read limits, text decoding, procedure/output behavior and native failure |

These are four invocation expressions in three modules, not four commands at
runtime. The first three formerly omitted encoding; making Buffer encoding
explicit matches Node's existing default. No environment filtering or replacement
object policy is imported from other readers. No claim of a global deadline or
new filesystem protection follows from the configured output buffer.

The deadline/environment behavior of `authority-set.mts`, the 10-second
multi-authority runner, preview acquisition and the 30-second merge-group script
helper differs. They remain separate. This increment introduces no dependency;
it retains the existing synchronous Node/Git CLI contract rather than selecting
an asynchronous library or a different Git implementation. Broader library and
caller dispositions remain with #573.

## Invariant and verification map

| Invariant | Actual boundary / retained oracle |
| --- | --- |
| Ordered argv, cwd and inherited environment | New controlled executable test records actual argv/cwd, inherited marker and unchanged `GIT_NO_REPLACE_OBJECTS=0`; the driver starts in a different cwd so omitted binding fails |
| Raw bytes and native errors | Actual subprocess returns invalid UTF-8/NUL bytes as Buffer; nonzero fixture retains status 23 and exact stdout/stderr bytes |
| Existing capture bound | Actual subprocess accepts exactly 2,000,000 stdout bytes and reports Node's native ENOBUFS above it |
| Reader compatibility | Existing real-Git snapshot, legacy preparation and owner-addition suites retain selection/mode/size/digest/changed-authority and output assertions |
| Historical operation identity | Legacy preparer keeps original authorized 821c3ea operation hash; only its one delegated call is expanded from the actual, structurally checked helper AST, removing only explicit Buffer encoding to match the former default |
| All three caller bodies | External comparison expands all four actual helper calls and compares complete transpiled operation ASTs to the adopted base; native/helper import substitution is checked separately |
| Runtime identity | Existing preview identity regression adds the emitted helper; existing source/emitted owner-addition regression adds the helper pair, including exact digest, stale request/receipt rejection and fresh success |
| Flat compatibility fixture | Synthetic reconstruction copies/remaps the helper to a flat path, checks its digest in that identity, then removes its grouped directory; actual installed distribution keeps the emitted nested path |
| CodeQL route preservation | Existing regression assertions follow each snapshot/diff caller through the actual shared native sink; both snapshot commands retain every generic source independently, and original accessor baseline/model checks remain |

The source/compiled helper operations must match. The historical AST pin is not
replaced with a new digest. Its expansion rejects extra top-level operations,
different parameters/imports/options/encoding and additional delegated calls;
the original operation hash still checks the actual executable, buffer value
and surrounding preparation logic.

The controlled-executable tests also pass from a copied checkout path containing
spaces, `#` and non-ASCII characters. Four isolated helper changes (wrong cwd,
text decoding, widened buffer and swallowed native exception) each failed at the
intended retained assertion. The unmodified copy passed and copies were removed.
These are selected detection controls, not exhaustive mutation coverage or a
security assessment. Repository source and runtime files were not mutated.

The final focused Node 22.23.3 run passed all 35 selected cases in 19.780s, with
zero failures, cancellations or skips. The actual Git executable was 2.52.0.
These focused observations are separate from the final complete verification.

## Distribution and remaining work

The new internal module is emitted at `dist/git/buffered-git.mjs` through the
existing compiler configuration and included by the existing package `dist`
rule. Public exports, bins, caller input/output forms, injected environment and
runner-output ownership remain unchanged. The recursive runtime collector needs
no change. Final revision-bound strict/build/cycle/full checks, actual archive,
installed smoke (including the emitted identity fixture), CodeQL, independent
reviews, Native Skill and protected acceptance belong to the PR verification.
Earlier checks are not relabeled as new invocations.

#573 remains open/partial for other committed/working-tree/materialized/native/
diagnostic/host-inline boundaries, provenance-compatible metadata reuse and
separately justified mechanism/library selection. #566's native persistence
decision and live consumer/host assurance remain separate. No authority,
CodeQL model/query setting, alert disposition, credential or acceptance change
is introduced. Existing race/host limitations are not resolved or accepted by
this extraction.
