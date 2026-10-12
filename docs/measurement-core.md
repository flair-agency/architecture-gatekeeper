# Optional diagnostic record core (#537, slice 1)

This internal foundation implements bounded private records, immutable attempt
phases, best-effort resumption and whitelist redaction under the responsibility
adopted in #552. It does not enable manual/Hook/native/CI collection or add a public
package entrypoint. Adapter, ledger-analysis/API/CLI and CI composition slices
follow separately; #537's enabled-host observations and pilot remain open.

Records are diagnostic observations, never authority, authenticated execution,
owner authorization or protected acceptance. Collection is opt-in at the core
call and defaults off. Failures return a no-op and warn; unobserved phases remain
gaps. Private POSIX directories must be canonical, mode0700 and outside the
reviewed worktree; Windows capture/export is unsupported. Record reads/writes
retain 256KiB, depth32 and 4096-entry limits. Admission/request/resumption preflight
remaining phases; 1KiB is reserved for terminal gaps. No atomic reservation or
hostile same-user isolation is claimed.

Collector digest conservatively binds package metadata and all .mjs/.mts runtime
implementation files, with deterministic relative names, direct regular reads,
4096-entry/depth8/per-file256KiB/total8MiB inventory. Relocation alone preserves
identity; differing or missing digests cannot resume an existing observation.
These hashes identify implementation bytes, not authenticated producers.

Risk → boundary → retained tests:

| Risk | Boundary | Tests |
| --- | --- | --- |
| Private finite I/O | diagnostic-path, directory enumeration | diagnostic-path and measurement-core-directory-limit: traversal/alias/link/UTF8, unrelated entries, exact cap and handle closure |
| Immutable lifecycle and bounded gaps | begin/request/finish/resume | request-state, core-terminal-bounds and resumption: nested snapshots, reentrancy, phase capacity, maximum timing/legacy reserve, torn terminal and matching collector |
| Shared phase consistency | core record and phase validators | core-phase-consistency: private/redacted identities, conflicting envelope/request, traversal budgets and terminal-only observations |
| Complete byte identity | actual source/emitted installed collector | runtime-identity: changed helper/adapter and typed-source bytes, unchanged relocation, inventory failures and two-process resumption |

Tests in this slice invoke actual record/phase validators directly. The original
full ledger-validation and CLI assertions from #541 are retained for the analysis
slice; they are not simulated by a fixture validator here.
