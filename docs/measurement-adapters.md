# Optional local/native observers (#537, slice 2)

Depends on the diagnostic record core. Adds default-off manual, UserPromptSubmit,
PostToolUse and native prepare/validate observers; offline ledger/CLI and CI
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
PostToolUse full findings before rendering and dedup/stale snapshots, early Hook
input gaps, context/output failure with original exceptions/exit/output, native
prepare retry/resumption and actual native stdout failure. Typed-source and
emitted identities remain core checks. Static child fixture programs pass data
as arguments instead of constructing executable Hook source.
