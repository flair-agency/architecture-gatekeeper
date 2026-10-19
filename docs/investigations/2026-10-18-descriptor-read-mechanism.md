# Shared descriptor byte-read mechanism

This partial #573 increment starts at adopted #614, `440b4da5ac1909346721d9031192c5be53a1dc84`.

This change factors one synchronous byte-copy loop into `src/io/read-descriptor.mts`. It accepts an already-open descriptor and a caller-allocated buffer, reads from the descriptor's current position with `readSync(..., null)` until EOF or capacity, optionally reports each positive read immediately, and returns only the actual-byte prefix. It does not open, close, allocate, validate, decode, translate errors, or compare metadata. The helper relies on the ordinary Node `readSync` contract that a result is an integer between zero and the requested length. It adds no dependency.

The three callers retain their distinct policy:

- `diagnostic-path.mts` allocates `maximumBytes + 1`. Its optional observer remains before limit checks and UTF-8 decoding, so observer exceptions propagate unchanged and the caller's `finally` still closes the descriptor. The actual-byte limit check and fatal UTF-8 decode remain in the diagnostic reader.
- `measurement.mts` runtime inventory allocates `min(MAX_BYTES + 1, stat.size + 1)`. It still adds actual bytes to the aggregate after reading, rejects length above the prior stat size, the per-file maximum, or total-byte limit, then hashes the returned bytes. As before, a shorter read than the prior stat size is accepted. Its `finally` owns close.
- `ci-review/codex-pass-producer.mts` allocates its selected `limit + 1` buffer. It still requires exact equality with pre-read stat size and enforces its limit before fatal UTF-8 decoding with BOM preservation. Its `finally` owns close.

The tests in `test/descriptor-read.test.mjs` exercise actual descriptor content, initial offset, caller capacity, partial reads, EOF/empty buffers, per-read observer delivery, unchanged observer and I/O exceptions, descriptor lifetime, and the real diagnostic reader's callback/close ordering. Filesystem interception runs in subprocesses to isolate Node's builtin bindings. Emitted collector and preview identity tests include `io/read-descriptor.mjs`; source preview identity asserts and mutates `io/read-descriptor.mts`, then checks that the earlier request and receipt are rejected while a fresh pair remains valid. These are source/test claims only until the coordinator runs the focused checks.

## Verification map and limits

| Invariant | Production owner and retained check |
| --- | --- |
| Current position, finite caller buffer, partial reads, immediate observation and unchanged errors | `io/read-descriptor.mts`; the new descriptor tests use real file descriptors with isolated short-read and exception interceptors, including a diagnostic caller observer abort and its actual close. |
| Diagnostic accounting and optional gap behavior | `diagnostic-path.mts` and measurement directory loading; existing diagnostic-path and measurement fault/budget tests retain their own path, decoding, aggregate and optional-failure assertions. |
| Required fixed job-local inputs and complete decision validation | `ci-review/codex-pass-producer.mts`; `codex-pass-publication.test.mjs`, especially `actual producer reads fixed bounded regular files and emits only narrow validated metadata`, retains actual producer execution and rejection checks. |
| Complete runtime membership and stale-input rejection | Collector identity tests mutate the emitted helper; preview identity tests mutate source and emitted helper bytes, reject earlier requests/receipts and validate fresh pairs. The synthetic flat-layout fixture copies and remaps the actual helper explicitly rather than retaining an uncounted nested module. |

Node's standard `fs.readSync` API remains the mechanism, on the existing Node >=22 support floor. The extraction adds no filesystem capability or dependency; caller-owned buffers and native descriptor/error behavior remain directly expressed. This is a bounded choice to retain the existing mechanism, not a new third-party library evaluation or completion of #573's broader library criterion.

No path, host, race, or permission guarantees change. Existing stat/open ordering and its platform limits remain with callers. `authority-validation/prepare-authority-set.mts` is intentionally unchanged because its `readBounded` implementation participates in the separately pinned preparation-format fingerprint; its dependency/fingerprint compatibility is a separate follow-up under #573. Other Git/filesystem mechanisms, metadata reuse and the broader inventory remain open under that issue. This note does not claim package adoption, full-suite success, or protected acceptance.
