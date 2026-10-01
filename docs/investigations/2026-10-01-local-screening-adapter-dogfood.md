# Local screening adapter dogfood (2026-10-01)

## Outcome

The synthetic adapter dogfood produced a validator-accepted `BLOCK` for the tracked `LocalLoader` change, and an identical candidate returned `unchanged`. A separate real Codex CLI `PostToolUse` run also returned a validated `BLOCK`, which arrived in the next user turn after the task had ended. These results demonstrate the adapter and asynchronous CLI delivery path against synthetic authority only; they do not establish real-project behavior, desktop delivery, or repository acceptance. The initial two reviewer attempts returned `incomplete` and are recorded below as historical attempts.

Each run used a disposable Git repository containing only synthetic authority, prompt, schema, validation policy, reviewer configuration, and a tracked candidate edit. The synthetic authority assigned local file reads to `LocalLoader` and outbound network calls to `RemoteProvider`. The candidate changed `LocalLoader` to call `fetch`. No project hooks, global Codex configuration, user files, or private project inputs were read or changed. Each fixture and its tracing files were removed after its run.

## Historical initial attempts (incomplete)

The first preparation attempt stopped before reviewer transport with the exact adapter result `Authority Set: member architecture-contract has unsupported revision.` Its trace wrapper recorded no Codex invocation. The fixture manifest used an unsupported synthetic revision string. The fixture was corrected to the `authority-revision` value used by the passing v2 test fixture; no reviewer call had occurred in that preparation attempt.

The first reviewer invocation used the adapter's existing `runCodexReviewer` transport. The committed synthetic v2 configuration used a self-only Authority Set, limits of 16 KiB manifest, 16 members, 64 KiB per file, 256 KiB total, and 512 KiB complete prompt, plus the package's deterministic decision validator and a small committed cross-field rule. It configured model `gpt-6.1-sol`, reasoning effort `medium`, and a 180,000 ms review timeout. The initial wrapper captured launch/configuration fields only; it did not preserve child status, stdout, stderr, or the temporary structured-output file before transport cleanup. The adapter returned `Architecture gate reviewer failed or returned invalid output.` The first attempt therefore could not identify the underlying cause.

After identifying this harness instrumentation gap, a second attempt used a wrapper self-tested to preserve exit status, stdout/stderr, output-file contents, PID, and timestamps before transport cleanup. The fixture was rebuilt from scratch with the supported synthetic revision. A prepared request and the actual transport prompt matched: request ID `5469ae411f275452be1cca6a94aac406f06524b4904c3b8dc4e51bd72823f02e`, reviewed revision `506fb1ebb5b09b323c14e750877317a9d0594e31`, candidate SHA-256 `86a86cb5948bcebf8c8ec7d714c8158e9f1e270e6c6088545159c3142f4df8aa`, authority-set digest `5ec42d0badaf503f3608891cad8683df20dbbe931234cbc19b0445a5ae9e7160`, manifest SHA-256 `7180f9f01836c69e601444680ad09d2dc82961a969743ddd9d8b9e3803804b1a`, and prompt SHA-256 `7d89641d4ae4461ccee50267c5ad1fc5cce8d88ca2b61d2539bafb4d399918aa` (2,203 bytes).

The second trace confirmed one child CLI launch with model `gpt-6.1-sol`, effort `medium`, `--ignore-user-config`, hooks disabled, read-only sandbox, approval policy `never`, and ephemeral execution. The child exited with code 1 after 172 ms, wrote no stdout or structured response file, and emitted stderr reporting that the CLI could not create PATH aliases (`Operation not permitted`), could not open the user's Codex state database because it was read-only (`attempt to write a readonly database`), and then failed to initialize its in-process app-server client (`Operation not permitted`). This establishes that the CLI process launched but failed during local initialization before returning a model result. It does not establish whether the database or app-server permission error alone was sufficient to cause the failure. The adapter again returned `incomplete` with `Architecture gate reviewer failed or returned invalid output.` No reviewer JSON reached the package validator. No duplicate-suppression follow-up occurred because the result was incomplete; there was no further reviewer attempt, fallback model, or host-native route.

## Captured evidence

- Repository source revision: `71f93beace484604f448be12b505da0ab1ee837e`.
- Package version: `0.5.1`; Node.js `v22.22.0`; installed CLI version observed before the fixture run: `codex-cli 0.159.2`.
- Adapter module SHA-256: `e1790a7422b3a4fa9330ed2a3782aefd54f25f66ce665512a13d57341d832c49`.
- First synthetic fixture baseline revision: `8593218bce6f3baaf20f143811612cf930f7cff7`; second baseline revision: `506fb1ebb5b09b323c14e750877317a9d0594e31`.
- Candidate diff SHA-256: `86a86cb5948bcebf8c8ec7d714c8158e9f1e270e6c6088545159c3142f4df8aa`.
- First-attempt trigger was `2026-10-01T01:07:33.442Z`, snapshot `2026-10-01T01:07:35.443Z`, review start `2026-10-01T01:07:35.623Z`; harness elapsed was 2,708 ms with 53 ticks of its independent 50 ms timer.
- Second-attempt trigger was `2026-10-01T01:33:02.036Z`, snapshot `2026-10-01T01:33:04.039Z`, review start `2026-10-01T01:33:04.213Z`, and child completion `2026-10-01T01:33:04.405Z`. Harness elapsed was 2,426 ms with 47 ticks of its independent 50 ms timer.
- These timings show separate-process harness progress while the asynchronous adapter ran; they are not a measurement of Codex foreground-turn progress or model response latency.
- For these initial incomplete attempts, duplicate suppression after a completed semantic result was not measured.

The temporary project was exercised by calling the adapter API with the same CLI Hook transport it uses in an asynchronous command. This was not an installed Codex Hook delivery test: no host hook configuration was activated. Prior synthetic CLI host probing established active-turn/next-turn delivery behavior separately; desktop hook loading and delivery remain unresolved. The instrumented attempt identifies a local CLI initialization failure, but does not establish command-adapter semantic completion, user-visible timing, or architecture acceptance.
## Corrective run under normal host execution

The captured second-run errors identified a local execution-context restriction. With the coordinator-authorized task-specific outer execution, the same synthetic fixture and unchanged child restrictions were run once more: the child remained --ignore-user-config, hooks-disabled, read-only, approval-policy never, ephemeral, with model gpt-6.1-sol and effort medium. No global configuration or trust setting changed.

This attempt completed a semantic review. The real CLI child exited 0 after 10,132 ms and wrote structured JSON. The adapter returned BLOCK, and the existing package validation accepted it: the summary identified fetch(url) in src/local-loader.mjs as an outbound network request violating the synthetic authority, named architecture-contract, and reported tracked candidate diff as reviewed scope. The authority document and candidate diff were present in the actual transport input; the prompt hash matched the independently prepared request. This demonstrates one real adapter/transport result and validator completion against synthetic data. It is not architecture acceptance for a real project or proof of host Hook delivery.

An immediate identical adapter event returned unchanged with the same request ID, reviewed revision, and candidate digest. The trace still contained exactly one CLI child invocation, confirming duplicate suppression for this completed result.

- Synthetic baseline revision: ef719ddce795638cbdbd7f8863f5dbaff4d8517b.
- Request ID: ab3bd0bd4e8138a5edfd5a164517019a85387ab8cea8925354e331429fc48787.
- Candidate SHA-256: 86a86cb5948bcebf8c8ec7d714c8158e9f1e270e6c6088545159c3142f4df8aa.
- Authority-set digest: a1a51ac2782401f0ce3692a7e7d95f685371134902a326423623eced3fb870b4; manifest SHA-256: 7180f9f01836c69e601444680ad09d2dc82961a969743ddd9d8b9e3803804b1a.
- Prompt SHA-256: fb6ba3663a1767462b58025279642300b7da5dcf22869c4b2434d06a116c2ef1 (2,203 bytes).
- Trigger: 2026-10-01T01:35:56.745Z; snapshot: 2026-10-01T01:35:58.747Z; review start: 2026-10-01T01:35:58.928Z; review completion: 2026-10-01T01:36:09.127Z.
- Harness elapsed 14,631 ms with 287 independent 50 ms timer ticks. As above, this measures separate-process harness progress, not Codex foreground-turn responsiveness.
- One reviewer child was invoked; the same-event duplicate did not invoke another child. The first adapter result was BLOCK; the repeated event result was unchanged.
## Real CLI PostToolUse host-delivery probe

A separate disposable Git fixture tested the installed `0.5.1` artifact through the actual Codex CLI asynchronous command-hook path. The fixture committed a synthetic v2 Authority Set, its prompt/schema/validator/reviewer config, the baseline `src/local-loader.mjs`, and a project-local `.codex/hooks.json`. The trusted handler matched `Bash|exec_command|apply_patch|Edit|Write`, used `async: true` and a 240-second timeout, and invoked a launcher outside the Git root that imported the installed package by its bare package name. The only working-tree change was the tracked synthetic LocalLoader edit. No user project content or candidate, global config change, trust bypass, desktop app hook, or real-project acceptance policy was involved.

The exact synthetic folder and the single new handler were reviewed and trusted through the normal CLI trust UI. The hook was later disabled through `/hooks`; the event list showed the handler installed but inactive before fixture cleanup.

The bounded CLI task ran as `gpt-6-luna` with low effort. It changed only `src/local-loader.mjs` to call `fetch(path)` and then ran `git diff --check`, which passed. The task did not wait for the architecture result. A PostToolUse event for the edit ran from `2026-10-01T01:58:25.294Z` to `01:58:38.065Z`. It returned a validated `BLOCK` for the synthetic candidate, stating that the local loader now issues a network request contrary to `architecture-contract` and RemoteProvider's responsibility. The result identified reviewed HEAD `e1e56ce9f4f6cd9c2a1680a98a136ee532cdd050`, request ID `8d71fdb9c2c8810c7ec54866072d0a3aadba175252805dd16e67c4870d02b95a`, and candidate snapshot SHA-256 `e0523ea677528d3e4b06e05b8f6b9455f48d76e8a9ba6f25f89139d8a7beda0e`. The actual Hook output contained the informational `additionalContext` and `systemMessage`, with no blocking decision or `continue: false`.

The edit's PostToolUse event captured the snapshot at `01:58:27.313Z`, started the semantic review at `01:58:27.505Z`, and completed it at `01:58:38.057Z`. The independent quick-check `Bash` event began at `01:58:27.968Z` and returned `queued-latest` at `01:58:27.988Z` while the review was active. This shows the quick check completed while the reviewer was still running; it does not measure total interactive latency. The semantic result was not visible in the original task's response. A single minimal next user turn then received and summarized the queued `BLOCK`, confirming the documented idle-delivery path. No further candidate edit or reviewer call was made.

The adapter's completed semantic result and full Hook JSON output were captured in the private external event trace. The child CLI trace wrapper was accidentally placed at `<temp>/hook-home/bin/codex` while the runner prepended `<temp>/bin` to `PATH`. The real CLI still returned a valid reviewer response through the normal transport, but that wrapper did not observe it. Therefore this probe does not claim a measured child-process count or captured raw child stdout/stderr/structured file; those remain unavailable. The package runtime's single reviewer call path produced the recorded validated result, but no independent child-process trace supports an exact launch-count claim.

The final runtime source SHA-256 was `cf7b5a64927b8fb15df6d9cae5c59963cb2cb96fbba1b5570d29d1a230738d1e`, matching the prepared native implementation-review snapshot; the fresh installed package tarball SHA-256 was `3f397e353fd2a2ff7187a34ac2416b8a2db355253182cdcd85f8b95d3568d0b3`. The native review covered the implementation and preceding documentation snapshot; this host-delivery observation was added afterward and is diagnostic evidence, not a new authority or acceptance claim. Desktop hook loading/delivery and actual-project behavior remain outside this probe.

## Actual Architecture Gatekeeper consumer loop

The first actual-consumer automatic review ran in an ordinary checkout using
the existing committed Authority Set, prompt, schema, validation and reviewer
settings. The owner explicitly authorized sending the AGK diff and existing
review inputs to the configured OpenAI reviewer. The reviewed change was one
wording replacement in this investigation; the run used source commit
`c00f1d3091a398b8c1c25ab8f2247a6936a39992` plus a local unpublished Hook/setup
commit `81f08d0b4e8b0d76dd289d376e78b9576848e9c2`. The setup commit is not part
of this package change. See the [Issue #244 run record](https://github.com/flair-agency/architecture-gatekeeper/issues/244#issuecomment-5926730201).

CLI `0.159.2` showed the exact project hook installed and active after normal
project-trust review. Three eligible Bash events returned `unchanged`, started
one review, and returned `queued-latest`; only one actual reviewer child ran.
The reviewer used `gpt-6.1-sol` at medium effort with read-only sandboxing,
approval policy `never`, hooks disabled, and a 180-second bound. Validation
returned `PASS`. Review ran from `07:20:21.436` to `07:20:48.540` UTC, while
later Bash verification continued. The queued event returned in about 23 ms;
the parent turn ended before review completion.

On the next no-tool user turn, informational context arrived at `07:22:19.517`
UTC. The parent reported the result, summary, revision, request and snapshot
identities, and `newerCandidatePending: true` at `07:22:24.515`. This confirms
next-turn delivery for this run; it did not wake an idle session. The request
ID was `3c996b4318c4d5f3cca19b7e70c673b37d294b0a6f9b1747afc03e557f082367`
and the snapshot digest was
`089dc68333ee4cbcc71dc6f2927a6fc833c9f660532549dfb04a4bbec542bf34`.

This is one usable actual-consumer loop, not exhaustive stability evidence,
protected acceptance, or a cost measurement. The parent model's reasoning
effort and per-review token use were unavailable. The result remains
development feedback under the local-review contract.

## Additional CLI dogfood and lifecycle evidence (#244)

The following later observations are recorded from the #244 evidence comments [5925013415](https://github.com/flair-agency/architecture-gatekeeper/issues/244#issuecomment-5925013415), [5925318479](https://github.com/flair-agency/architecture-gatekeeper/issues/244#issuecomment-5925318479), the correction [5925336420](https://github.com/flair-agency/architecture-gatekeeper/issues/244#issuecomment-5925336420), and the feedback-consumption probe [5925695936](https://github.com/flair-agency/architecture-gatekeeper/issues/244#issuecomment-5925695936). They concern disposable synthetic fixtures and local CLI behavior. They do not establish a real consumer's architecture, acceptance policy, or a general desktop delivery guarantee.

### Two actual semantic reviews in new CLI sessions

On CLI `0.159.2` with Node `22.22.0`, source revision `effd5e2`, and runtime source digest `cf7b5a64927b8fb15df6d9cae5c59963cb2cb96fbba1b5570d29d1a230738d1e`, the source API `runPostToolScreenHook` invoked actual semantic reviews against the synthetic fixture. The fixed hook definition digest was `e661014ce3fa24cdc30ac01c8d9132e90e806ad4a7c63744cdd4e2717e338335` and the runner digest was `692efd6f95de20837989e8a42af69694f8cf74639369f07333ff6c0c579bec76`. The reviewer was `gpt-6.1-sol` at `medium` effort with a 60-second timeout; the child request used read-only sandboxing, approval policy `never`, ignored user configuration, disabled hooks, and ephemeral execution. The two decisions came from the actual CLI reviewer child, not fixture-generated reviewer output, and were delivered as feedback in the next tool-free turn.

The exact hook definition was reviewed and trusted once during setup. The same unchanged definition then ran in a fresh CLI session without asking for trust again. Five repeated Bash events comprised three `unchanged` results with no reviewer child and one reviewer invocation for each changed synthetic candidate. The normalization case returned a validated `PASS` in 13.495 seconds; the cache-ownership case returned a validated `OWNER_DECISION` in 14.607 seconds. Both results appeared as context in the next tool-free turn. No additional visible approval prompt appeared. These observations establish neither host enforcement attestation nor model usage or exact child PID accounting: usage was unavailable, the wrapper PID had exited, and child exit status was zero, but the actual child PID was not captured. Trust persistence across this tested fresh session is an observation for this definition and setup, not a promise that every future desktop or CLI session will behave identically.

The reviewer returned `OWNER_DECISION` for cache ownership because the synthetic authority left the intended owner unresolved. That result is an escalation to canonical owner authority; it is not a `PASS`, an acceptance, or permission to make the ownership choice in this package.

### Asynchronous lifecycle and parent context

A separate model-free lifecycle fixture used a case-dependent delay: 12 seconds for ACTIVE and IDLE, and 30 seconds for END, under a 45-second Hook timeout. The fixed hook definition had digest `9305eb95784204a3b50d33a191811b3085497f2b6cda59992f33d395e4c6a405` and the runner digest was `e95ad7fe4acfff749dffb5975da695a7ea2a5e0d098cc0609a0c084755813685`. In the active-turn case, later Bash actions started while the hook was pending and completed normally; the hook completed afterward and its output was available as pending context. In the idle case, the hook completed after the turn ended and waited for a later user turn. In both cases the hook run itself made no model call. The parent turn returned `None` when asked to report the nonce. That is a non-reporting observation: it does not establish transport failure because saved rollout records show the hook context was injected before the parent was asked in both active and idle cases. The parent question was necessarily a model turn and ran as `gpt-6-luna` at low effort.

For the active case, the hook entered at `05:15:44.630Z`; two Bash actions started at `05:15:46.576Z` and `05:15:48.837Z` and both completed while the hook remained pending; the hook completed at `05:15:56.638Z`. For the idle case, the hook entered at `05:18:19.290Z` and completed at `05:18:31.296Z` after turn end. The saved rollout record `01a0f5e2-b2aa-7be2-8293-546d59adef1d` shows the injected active context at `05:17:05.294Z` and idle context at `05:19:08.184Z`; both preceded their respective user questions, whose parent responses contained `None`.

In a separate END case, the runner entered at `05:22:39.574Z`; the session exited about six seconds later. No completion or signal was observed for over 30 seconds, and a subsequent process check returned `NoSuchProcess`. This supports that the runner was gone without a completion record. It does not prove the exact cancellation mechanism, whether Codex cancelled it, or whether output was discarded. The initial `None` result likewise does not prove failure. The fixture was removed; global configuration was not changed. The normal disable step was not confirmed after the END case.

These lifecycle results show that async screening can overlap later work and that feedback may arrive through later context after a turn. They do not promise that all future desktop sessions load hooks, deliver results at a particular point, or report a result through the parent model. Host lifecycle, context delivery, model reporting, and semantic review remain separate observations.

### Feedback-consumption probe with a deterministic reviewer stub

A separate archived temporary run exercised source revision `c400aee` and
`runPostToolScreenHook` through the actual installed CLI Hook path. It used the
deterministic reviewer stub already supplied to the archived runner, so its
synthetic `BLOCK` and `OWNER_DECISION` outputs are adapter/context-delivery
observations, not semantic model reviews. No actual semantic reviewer ran. An
untracked file was added for the final trigger, which produced `incomplete`
and no semantic decision.

The installed CLI was `0.159.2`; normal project trust and an active
asynchronous `^Bash$` handler with a 90-second timeout were used. The runner
digest was `1150122dc7106fa5554cd34a48dd76d0f702b439d6a08602a1092e0f38976fca`
and the Hook definition digest was
`7830d55dcef707b2f34136665cad09430f787249bfafc79a766f139524ac4732`. Across
four user turns, the first turn triggered two Bash events. The first synthetic
review returned `BLOCK` after about 10 seconds while the second, later change
was queued. The queued event returned no Hook output at `05:47:43.274Z`; the
first result completed at `05:47:47.224Z` with 1,013 bytes of output and
`newerCandidatePending: true`. Its reviewed revision was
`e7b9f4161e80e964ee3cd503ff1289030b0e0993`, request ID
`31254687c6ab68762473760d18a67f3136c7ddffcc1a1b1b4bbe4aac4b2b73a9`, and
snapshot digest
`c9c34a150bdcb3c8a5aa4df01474cac2cd6dbcb17f8736a9e4faa0392700849c`. The
first turn ended before review completion, so no result was present in
that turn's final response. In turn two, the exact context was present. The
final response accurately described the synthetic `BLOCK` and snapshot and
stated `newerCandidatePending: true`, then correctly limited that finding to
the captured revision and affected synthetic change; it did not claim coverage
of the later synthetic change.

Turn three produced a synthetic `OWNER_DECISION` result at `05:51:39.061Z`
with 1,012 bytes of output, request ID
`790b965fedaa4e44355726fc0ccf47f548d2c6c36c8f083c731036d2b6ddcaad`, and
snapshot digest
`cb7286d62d6a8d862965120d703f823fbb1a9073a2ffecf65e9862e77619172e`. That
turn ended before completion. In turn four's initial
final response, the owner-decision summary remained unresolved. The untracked
candidate then triggered the Hook; 12 ms after that initial reply, context
reported `incomplete`, and the same turn's final response correctly reported
`incomplete` with no semantic decision. Thus the run recorded three statuses
across four parent turns and four Hook events, including the queued event. No
fifth turn was run.

During that run an interim model response claimed there was no Bash tool and
ended without a tool call. A distinct later task did execute a real host Bash
event that ran the Hook. This discrepancy does not prove host tool
unavailability or establish autonomous correction.
The record shows prompted recognition of delivered context in later turns;
it does not establish autonomous feedback consumption, an actual fix, or
guaranteed delivery to every future session. The runtime reported aggregate
parent-turn usage labels `total=19517`, `input=18890`, `cached input=175872`,
and `output=627`; these raw labels are preserved without normalization.
Status-specific usage and actual semantic-review cost were unavailable. This
probe used the CLI TUI, not the desktop app. The Hook was shown disabled with
Active 0 before the session closed, and the fixture was deleted.

## Model-free child transport failure and timeout check

A separate private synthetic v2 consumer fixture exercised the current source adapter and `runCodexReviewer` with a fake executable named `codex` at the head of a private `PATH`. The fixture used one committed self-only `architecture` Authority Set, synthetic `AGENTS.md`, prompt, schema and reviewer settings, plus tracked candidate edits. Its committed `reviewTimeoutMs` was the contract minimum of 1,000 ms. The fake child never contacted a provider: in `nonzero` mode it exited 23 without structured output; in `timeout` mode the child blocked beyond the configured bound; in `valid` mode it wrote a fixed synthetic JSON decision to the transport's output path. The adapter ran through `runPostToolScreenHook`'s actual source API and shared transport and validator. This was not a Codex-host-triggered Hook event, a real CLI launch, a real host-permission refusal, or semantic model review.

The nonzero case completed in 534 ms and returned `incomplete` with the generic reviewer-failure summary and a 605-byte Hook JSON body. The child had exited, no `decision` or `continue` field appeared, and no completed request identity, active lock, latest marker or recovery lock remained. Replaying the unchanged candidate with the fake structured response took 270 ms; the shared validator accepted that fixture response as `PASS` and recorded an identity. This `PASS` only exercises deterministic validation of the fixture JSON and is not a model judgment.

A distinct tracked candidate then reached the fake child timeout. The adapter returned `incomplete` in 1,223 ms. The child start was recorded, its post-wait completion was absent, and checking its PID after the adapter returned showed that it had been terminated. The active lock and markers were gone; the prior candidate identity remained unchanged. Retrying that same candidate with the fake structured response took 282 ms, validated the fixture JSON, and recorded a different request identity. Thus neither nonzero transport exit nor timeout was cached as a completed review, and a later eligible event can retry. Failure and success Hook payloads contained no semantic `decision` or blocking `continue` field; observed sizes were 605 and 738 bytes respectively.

The source checkout HEAD at fixture execution was `ed73e7289e95b6efea1c1b8e1b07cf2ef17cfec2`; this identifies the local source revision used by the probe, not an installed-package run or a claim about later integration. The synthetic fixture baseline revision was `2dfa0eba56a0769f60452db3889ee84033cd1572`; its final tracked candidate patch was 176 bytes with SHA-256 `2e0e678e5c7316bdf3e3206bf4474018eb072ce4ebcf4382347ceb86aea030d8`. The source module SHA-256 was `cf7b5a64927b8fb15df6d9cae5c59963cb2cb96fbba1b5570d29d1a230738d1e`, and `src/codex-transport.mjs` was `8e2866f9bdbcb5b269cce7fee4e4061c7cd8068f78ecd822fbcbbd460e70b7c8`. All four fake child processes were gone after completion. The transport temporary directory had no remaining `architecture-gate-*` request directories; its parent `TMPDIR` did contain an `xcrun_db` entry during the run, so this record does not claim that `TMPDIR` itself was empty. The entire private fixture, shim, driver and trace directory was removed afterward.

This verifies the adapter's mapping of a child nonzero result and a bounded `spawnSync` timeout to informational incomplete output, lock cleanup, and retry eligibility without model calls. It does not verify a Codex host refusing to start the command, cancellation by Codex at session termination, or model/provider behavior on refusal or timeout. Those are separate host/provider outcomes and are not inferred from the fake child.

## Model-free SessionStart lifecycle probe (inconclusive)

An isolated fixture with a single project-local `SessionStart` hook (`matcher: startup`, `async: true`) was opened in Codex CLI `0.159.2`. The normal CLI UI reviewed and trusted that exact fixture and hook; `/hooks` showed it installed, active and trusted. No user prompt was submitted and no model turn was requested. After closing the pre-trust session, a new CLI session was opened. The handler's start marker did not appear before normal session exit, and its 30-second completion marker was absent. The TUI displayed warning-count badges, but no fixture-specific saved CLI log or expanded warning detail was available to identify their cause. Thus this run does not establish whether the hook command failed to launch or `SessionStart` was not dispatched, and it does not demonstrate async cancellation or output discard. The fixture and session were cleaned up, so no project hook remains; no global configuration was changed. The scoped trust entry granted through the normal UI may remain dormant. This generic lifecycle probe is separate from the successful `PostToolUse` delivery observation above.
