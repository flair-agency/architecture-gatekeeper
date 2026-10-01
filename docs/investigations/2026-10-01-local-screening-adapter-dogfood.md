# Local screening adapter dogfood (2026-10-01)

## Outcome

The bounded command-adapter dogfood did not produce a semantic review result. The adapter returned `incomplete`; this record preserves the observed result and does not treat the attempt as `PASS`, `BLOCK`, or `OWNER_DECISION`.

The fixture used a disposable Git repository containing only synthetic authority, prompt, schema, validation policy, reviewer configuration, and a tracked candidate edit. The synthetic authority assigned local file reads to `LocalLoader` and outbound network calls to `RemoteProvider`. The candidate changed `LocalLoader` to call `fetch`. No project hooks, global Codex configuration, user files, or private project inputs were read or changed. The fixture and tracing files were removed after the run.

The first preparation attempt stopped before reviewer transport with the exact adapter result `Authority Set: member architecture-contract has unsupported revision.` Its trace wrapper recorded no Codex invocation. The fixture manifest used an unsupported synthetic revision string. The fixture was corrected to the `authority-revision` value used by the passing v2 test fixture; no reviewer call had occurred in that preparation attempt.

The single authorized reviewer invocation then started through the adapter's existing `runCodexReviewer` transport. The committed synthetic v2 configuration used a self-only Authority Set, limits of 16 KiB manifest, 16 members, 64 KiB per file, 256 KiB total, and 512 KiB complete prompt, plus the package's deterministic decision validator and a small committed cross-field rule. It configured model `gpt-6.1-sol`, reasoning effort `medium`, and a 180,000 ms review timeout.

The tracing wrapper delegated the transport's exact argument vector to the installed Codex CLI once. It observed `--ignore-user-config`, hooks disabled, read-only sandbox, approval policy `never`, and ephemeral execution, together with the configured model and effort. This establishes one child CLI launch, not that a service accepted a request or that a model generated a response. The adapter returned the exact incomplete summary `Architecture gate reviewer failed or returned invalid output.` The transport did not retain the underlying CLI exit status or stderr in the diagnostic record, so the more specific cause is unavailable; no host or runtime cause is inferred. No reviewer JSON was returned to validate; the adapter exposed no request ID or reviewed revision in this incomplete response. The one reviewer invocation was not retried, and no fallback model or host-native route was used.

## Captured evidence

- Repository source revision: `7d10e50c44d757203bd731be33b44efdf8928438` (the implementation under test was the uncommitted worktree source).
- Package version: `0.5.1`; Node.js `v22.22.0`; installed CLI version observed before the fixture run: `codex-cli 0.159.2`.
- Adapter module SHA-256: `e1790a7422b3a4fa9330ed2a3782aefd54f25f66ce665512a13d57341d832c49`.
- Synthetic fixture baseline revision: `8593218bce6f3baaf20f143811612cf930f7cff7`.
- Captured tracked candidate diff SHA-256: `86a86cb5948bcebf8c8ec7d714c8158e9f1e270e6c6088545159c3142f4df8aa`.
- The adapter recorded trigger time `2026-10-01T01:07:33.442Z`, snapshot time `2026-10-01T01:07:35.443Z`, and review-start time `2026-10-01T01:07:35.623Z`. The enclosing harness finished after 2,708 ms and its independent 50 ms timer advanced 53 times. This demonstrates progress in the separate harness process during the asynchronous child run; it is not a measurement of Codex foreground-turn progress or model response latency.
- The repeated identical event was not sent because the first result was incomplete. Therefore this run does not measure duplicate suppression after a completed semantic result.

The temporary project was exercised by calling the adapter API with the same CLI Hook transport it uses in an asynchronous command. This was not an installed Codex Hook delivery test: no host hook configuration was activated. Prior synthetic CLI host probing established active-turn/next-turn delivery behavior separately; desktop hook loading and delivery remain unresolved. This attempt likewise does not establish command-adapter semantic completion, user-visible timing, or architecture acceptance.
