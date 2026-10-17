# Merge-group Git process wrapper extraction

This bounded #573 outcome consolidates only the identical process wrapper used
by the merge-group gate and ordinary-review CLI. It does not select a general
Git API or change either caller's commands, parsing, failure translation, or
workflow activation.

## Call-site contract

| Caller | Inputs and use | Process contract | Output, errors, lifetime |
| --- | --- | --- | --- |
| `scripts/owner-amendment-merge-group-gate.mjs` | `git(args)` accepts the caller's ordered string array. It reads `GITHUB_WORKSPACE` when each call is made and prefixes `-C <workspace>`. Commands include `rev-parse`, `show`, `fetch`, and arguments passed to injected handoff/change/evidence readers. | `execFileSync('git', argv, { encoding: 'buffer', maxBuffer: 2 MiB, timeout: 30 s, stdio: ['ignore','pipe','pipe'], env: { ...process.env, GIT_NO_REPLACE_OBJECTS: '1' } })`. | Returns raw stdout Buffer; native child-process exceptions are caught and translated only at existing call sites. No wrapper-owned temporary data or cleanup. `fetch` may update Git's object store/FETCH_HEAD; this helper does not make calls read-only. |
| `scripts/owner-amendment-merge-group-ordinary-review.mjs` | Same `args` shape, invocation-time workspace binding and prefix. The function is injected as `runGit` into the ordinary review preparation API. | Byte-for-byte equivalent options and argv construction as the gate. | Raw Buffer and native exceptions pass to the existing consumer, which owns per-command `--no-replace-objects`, Git output validation, byte limits, and strict UTF-8 decoding. No wrapper-owned temporary data or cleanup. |

The shared helper preserves just this process boundary. In particular, it does
not add validation, decode bytes, normalize errors, choose commands, or change
the callers' separate preparation budgets. The ordinary-review adapter separately
validates tree entry shape/mode and declared blob size before reading bytes;
the gate's exact `rev-parse`/policy checks and fetch remain in the gate. Other
injected Git readers retain their own command/output contracts. The nearby
`scripts/owner-amendment-semantic-eligibility-producer.mjs` wrapper is excluded:
it uses a 2 MiB Buffer process but has no explicit timeout.

## API choice and retained checks

Node's built-in `execFileSync` plus the Git CLI already provide the required
argv-only invocation, Buffer output, inherited environment, bounded output,
timeout, stdio selection, and native failure object. `package.json` pins no
dedicated subprocess or Git wrapper library. This change makes no claim about
any unexamined library version; adopting one would add dependency and behavioral
comparison work without reducing the two identical wrappers further.

`test/owner-amendment-merge-group-git.test.mjs` executes the extracted helper
against a controlled executable. It checks argument/workspace binding, the
replacement-object override even against a conflicting inherited value,
non-UTF-8 raw output bytes, native nonzero
status/stderr, and the existing 2 MiB output cap. An isolated copied-helper
mutation changes the replacement-object binding and demonstrates that the
focused contract assertion detects it. The existing production CLI suites
remain in place: `test/owner-amendment-merge-group-route-composition.test.mjs`
retains gate route and failure behavior; `test/owner-amendment-merge-group-ordinary-review.test.mjs`
retains prepare, validate, and exact-tuple mismatch coverage. The helper test
does not wait 30 seconds to re-test the timeout; the exact unchanged timeout
option is preserved in the one implementation. No claim is made about active
workflow use or live protected-host behavior.
