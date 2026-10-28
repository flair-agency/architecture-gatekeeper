# Optional local/native observers (#537, slice 2)

Depends on the diagnostic record core. Provides default-off manual, UserPromptSubmit
and native prepare/validate observers; offline ledger/CLI and CI
composition follow separately. Consumers own private storage and opt-in via
AGK_MEASUREMENT_DIR or supported local options. Required native host-managed
request I/O is preserved; diagnostic storage restrictions do not constrain it.

Observers record actual request/scope and validated semantic results. Hook
context/output and CLI stdout acceptance occur before terminal publication.
Publication failure preserves a validated decision with unknown publication and
an error observation. Expected Hook BLOCK remains a completed semantic review
with unknown result publication. Delivery and host execution remain unknown;
these observations cannot satisfy required review or protected acceptance.

Risk → public boundary → verification: adapter-isolation and actual native CLI
fixtures cover disabled/invalid/throwing capture options, prior transport prompt,
early Hook input gaps, context/output failure with original exceptions/exit/output, native
prepare retry/resumption and actual native stdout failure. Typed-source and
emitted identities remain core checks. Static child fixture programs pass data
as arguments instead of constructing executable Hook source.

## Consumer opt-in and retention

Capture requires a POSIX host, a canonical private mode-0700 directory outside
every reviewed worktree and direct mode-0600 records. Use a host home or temporary
location, without parent symlink aliases. Windows capture is unsupported and
leaves a gap; required review is unchanged. Set `AGK_MEASUREMENT_DIR` in the
actual CLI/Hook host, optionally `AGK_MEASUREMENT_CHANGE_ID` (owner-supplied, at
most 200 characters). The local APIs accept `measurement: { directory, changeId }`.
For example, create `mkdir -m 700 "$HOME/agk-measurement"`, then run
`AGK_MEASUREMENT_DIR="$HOME/agk-measurement" architecture-review 'Review the change'`.

Records can retain private findings and scope; no local automatic upload is added.
Consumers own access, disclosure and deletion. Storage is capped at 256 KiB per
record and 4,096 entries. A full directory leaves collection gaps and does not
delete old evidence; archive/delete privately before exhaustion. No atomic
capacity reservation, tamper resistance or hostile same-user isolation is claimed.
Offline export and dataset analysis are supplied by the next dependent slice.
Warnings are best-effort even when stderr is unavailable. Reviewer options retain
lazy property reads and the original getter receiver; diagnostic filtering does
not eagerly enumerate an otherwise-valid Proxy.

Native prepare records known preparation errors before request construction.
A failed request-file read creates a separate error observation with unknown
request identity; it cannot safely resume the earlier request's preparation.
Decision-file reads resume the known preparation first. Stage-specific failures
retain their required errors, and later retries do not rewrite terminal history.

The PostToolUse execution adapter and its live observers are retired from current
source. Existing version-1 PostToolUse records still load, export and participate
in offline analysis under their original semantics. The record reader and route
value remain unchanged; no replacement producer or compatibility layer is added.
See the [pilot cutoff and remaining collection scope](https://github.com/flair-agency/architecture-gatekeeper/blob/main/docs/investigations/2026-10-29-posttooluse-retirement.md).
