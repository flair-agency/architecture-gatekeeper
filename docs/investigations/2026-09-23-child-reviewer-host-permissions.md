# Child-reviewer host-permission investigation (2026-09-23)

This is a dated observation, not a guarantee for other hosts or accounts.
For the current operational boundary, see
[Host permissions for child reviewers](../reviewer-host-permissions.md).

## Synthetic fixture and observations

The investigation used source checkout
`c5b6bbacc4f59c09ba4ad01341d65bf428919621` (`package.json` version
`0.4.0`) and the exact entrypoints `src/manual-review.mjs` and
`src/local-gate.mjs`. The Git repository root and effective working directory
were both `/private/tmp/architecture-gatekeeper-issue29-fixture`. It contained
only synthetic authority, prompt, schema and configuration. The fixed fixture
revision was `bd7f8534793047ddda0ea5a10afe1968ea117311`, selecting
`gpt-6-astra` with medium reasoning. Both paths received the task “Review a
synthetic documentation-only change.” The Hook additionally received a
synthetic session ID and `UserPromptSubmit` event. No production repository
content was part of the reviewer request.

| Invocation on this host | Gatekeeper and child observation | Process result |
| --- | --- | --- |
| Standalone CLI in the task's restricted workspace sandbox | Gatekeeper started; child failed before a decision. A direct child diagnostic in the same sandbox reported that the host Codex state database was read-only and the in-process client could not initialize. | Exit 2; stderr: `Architecture gate reviewer failed or returned invalid output.` No decision or `reviewedRevision`. |
| Automatic Hook with the same fixture and restricted sandbox | Gatekeeper started and the child failed before a decision. | Exit 2 with the same generic stderr; no Hook context or validated decision. |
| Standalone CLI after this host approved execution outside that workspace sandbox | Gatekeeper and child started. No interactive approval UI was shown during the command. | Exit 0; structured `PASS`, `authorityFiles: ["AGENTS.md"]`, `reviewedRevision: bd7f8534793047ddda0ea5a10afe1968ea117311`. |
| Automatic Hook after the same host authorization | Gatekeeper and child started. No interactive approval UI was shown during the command. | Exit 0; Hook context contained the same validated `PASS` and `reviewedRevision`. |

The restricted task profile allowed writes in the worktree and temporary
directory, but not in the host Codex state directory; network access was
restricted. The approved executions demonstrate success for this fixture, not
the exact sandbox or network grants of every host. “No approval UI was shown”
does not establish that no approval check occurred.

During this investigation, the host's automatic approval review separately
rejected a proposed broader standalone-CLI invocation against the actual
repository **before launching it**. Its stated reason was that a child reviewer
could transmit repository-derived inputs to an external model without specific
authorization. No Gatekeeper process or child reviewer started, and no semantic
decision exists for that attempt. The investigation then used the synthetic
fixture above; its authorization covered only that fixture's model request.
The operation requiring approval was the process launch and possible model
data flow, requested by the surrounding task host before execution. Denial
must leave the review incomplete; it must not be recorded as Gatekeeper
`BLOCK`.

A separate diagnostic on the same synthetic fixture selected `gpt-6-sol` at
revision `c1fbf1880af38d6af8b676895896e15adbdec04d`. The child started,
but this host's ChatGPT-authenticated Codex CLI returned HTTP 400 because that
model was unsupported for the account. That is model availability, not host
approval or a semantic decision. It does not imply the API-key CI route lacks
Sol support.

These results apply to the named host profile, runtime revision, fixture and
date. Other hosts may differ in approval UI, writable paths, credentials or
network policy. Do not alter host permissions or replace a failed child review
with an unvalidated result to make a local Gate pass.
