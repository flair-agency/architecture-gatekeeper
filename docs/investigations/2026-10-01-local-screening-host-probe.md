# Local screening host probe (2026-10-01)

## Question

Can this Codex host start a model-free asynchronous command hook and deliver
its result during or after an active turn, and is there a host-native API that
can mechanically dispatch the `architecture-review` Skill?

The purpose of a local screen is development feedback. It must not hold up
ordinary work while its reviewer runs. This probe does not change the
screening, evidence, acceptance, or consumer-policy contract in
[`architecture.md`](../architecture.md).

## Findings

| Status | Finding |
| --- | --- |
| Supported by official documentation | A command hook with `async: true` runs in the background while Codex continues. For a running turn, the result is made available after the current model request and tool calls finish, at the next model request in that turn. When idle, it waits for the next user turn and does not start one. An async hook cannot block or control the triggering action. The session can run up to eight background hooks concurrently; session termination cancels unfinished hooks and discards undelivered output. |
| Observed on this host | Installed CLI is `codex-cli 0.159.2`; its feature list reports `hooks` as stable and enabled. The generated app-server protocol schema includes `hooks/list`, hook-started and hook-completed notifications, `skills/list`, `thread/start`, and `turn/start`. It exposes no dedicated hook-execution or Skill-dispatch request. `skills/list` enumerates Skills; starting a turn still invokes a model. |
| Observed on this host | In an isolated, private synthetic Git fixture, the CLI required whole-folder trust, followed by ordinary review/trust of the exact project hook definition. The reviewed definition was one asynchronous `UserPromptSubmit` shell handler. `/hooks` showed it installed and active; before session exit, the exact handler was deactivated in `/hooks` and the event list showed it installed but inactive. |
| Observed on this host | A 1.2-second hook returned a random nonce absent from the submitted prompt. The model quoted that nonce in the same turn, establishing active-turn context delivery for this CLI session. |
| Observed on this host | With a 9-second hook and a 2-second shell timing tool in one turn, the tool ran while the hook was still executing. The turn's final response contained `NONE`; a later user turn quoted the previous hook's nonce. This demonstrates non-blocking tool progress and delayed/idle delivery, but also that useful screening feedback may arrive too late for the task that triggered it. |
| Unverified | Delivery in the Codex desktop app, actual end-of-session cancellation/discard, delivery from a real Gatekeeper decision, and host-native Skill reviewer dispatch. The CLI test did not invoke the semantic reviewer or change any Gatekeeper policy. |

## Evidence and method

Official behavior was checked against the [Codex Hooks documentation](https://learn.chatgpt.com/docs/hooks), especially “Where Codex looks for hooks,” “Review and trust hooks,” and “Run hooks in the background.” The docs state that project-local hooks load only when the project `.codex` layer is trusted; each non-managed hook must be reviewed and trusted against its current definition hash. They also document active-turn safe-point delivery, idle next-turn delivery, concurrency, and cancellation at session end.

The installed CLI reported version `0.159.2`. Its top-level help did not
offer an interactive hook-management subcommand; `codex exec --ignore-user-config`
is non-interactive and does not provide the `/hooks` review flow. The current
user `config.toml` and `hooks.json` were checked for hook definitions; neither
contains any. No existing global hook source was invoked for this probe.

The app-server JSON schema was generated with the installed CLI into a private
temporary directory and inspected for hook, Skill, thread, and turn methods.
This is protocol-surface evidence, not a runtime dispatch experiment. The
schema provided hook listing and lifecycle notifications, but no request to
run a hook or mechanically execute a Skill. `turn/start` is the available
model-turn entrypoint, so it does not provide a model-free way to create the
active-turn delivery condition.

The test used one CLI session in a private synthetic Git fixture, with the
selected `gpt-6-luna` model at low reasoning effort. The hook wrote UTC
start/end timestamps and event names to a private log, slept, and returned a
fresh random nonce via `additionalContext`; the nonce was not placed in the
prompt. The model was asked to quote any context the hook supplied. The first
run slept 1.2 seconds. The second and final useful run slept 9 seconds and a
shell command recorded its own start/end timestamps around a 2-second delay.

For the second run, hook timestamps were `2026-09-30T19:11:50.414Z` and
`2026-09-30T19:11:59.415Z`. The shell tool ran from
`2026-09-30T19:11:54.291846Z` to `2026-09-30T19:11:56.297134Z`, fully
overlapping the hook. The final response did not contain the nonce. On the
next user turn, the model quoted `cf5a17f653ceec41`, the nonce from that
completed hook. This is direct CLI evidence of asynchronous overlap. Its final response
did not receive the result because the hook completed after that turn ended.

On the third submitted turn, the model quoted the completed second-turn
hook's nonce, demonstrating delivery after the session had gone idle. That
third turn also started a new 9-second hook, which completed at
`2026-09-30T19:13:32.165Z`. No fourth turn was started to request its output;
the session was then exited. The documented session-end discard behavior was
not independently confirmed from model output and remains documentation-only.

The first run's hook ended at `2026-09-30T19:05:14.348Z`; a timing tool in
that turn started at `2026-09-30T19:05:18.285789Z` and ended at
`2026-09-30T19:05:20.295951Z`. Its nonce was also returned in the same turn.
Because the hook completed before the tool started, this run alone would not
have established concurrent progress; the second run supplies that evidence.

The CLI required a local state database write at startup, so it was retried
with an approved per-command sandbox escalation. No global configuration,
trust file, trust-bypass flag, or host permission policy was edited. The exact
temporary hook was turned off through the `/hooks` UI before exiting. The
temporary fixture, scripts, hook configuration, log, nonce, and generated
protocol schemas were removed; the fixture paths were verified absent. The
host may retain a dormant trust record for the removed temporary folder and
handler hash. No global trust database was edited to remove it.

## Decision input

The documented and observed CLI route supports asynchronous local feedback
without delaying tool work. However, the experiment also shows a productivity
limit: a reviewer result that completes after the active task's final response
may be seen only on a later user turn. Hook runtime and delivery timing should
therefore be treated as screening behavior, not a reason to stall ordinary
work or as proof that the current task was screened before completion.

This evidence applies only to the installed CLI route and a synthetic hook.
Desktop-app delivery, an actual Gatekeeper reviewer decision, and native Skill
dispatch remain separate questions. Do not treat hook execution or nonce
delivery as a Gatekeeper review result, evidence, or acceptance.
