# Reviewer execution options for Gemini CI: Vertex AI with WIF

Status: staged delivery; execution profile selected by the owner on 2026-10-04.
This document records the user's selection of
Vertex AI with Google Cloud Workload Identity Federation (WIF) as the provider
and authentication direction for Issue #252. It is not canonical architecture,
consumer CI policy, implementation, route activation, or acceptance evidence.
The canonical contract remains [`../architecture.md`](../architecture.md),
which requires protected consumer selection and verified route-specific
evidence before protected acceptance can rely on this route.

## Observed implementation at `origin/main` 121c154

The current protected self-review policy is CI policy v2. It selects Codex
(`gpt-6.1-sol`, medium reasoning), a protected Authority Set manifest and
limits, plus owner-amendment settings. `src/resolve-ci-policy.mjs` does not
select a reviewer provider or an authentication route. The reusable
`.github/workflows/architecture-gate.yml` requires `OPENAI_API_KEY` and invokes
the pinned `openai/codex-action`. It does not invoke the Gemini launcher.
Therefore the protected route remains Codex-only.

The workflow checks out the pull request merge commit and supplies that
workspace to Codex under a read-only sandbox. It separately materializes
protected prompt, schema, validation policy and selected authority content.
The Codex process also has repository/Git visibility through its workspace; the
current route does not promise that it can inspect only a serialized list of
files.

The Gemini implementation is available as a package runtime. The launcher
starts a loopback proxy and creates an allowlisted child environment, while
the runner supports request JSON, preflight and deterministic response
validation. The CI workflow does not call either component. The current
launcher resolves Google Cloud credentials in its trusted parent process,
supports bearer credentials for Vertex, and constrains the proxy to a selected
model, project and region. No protected CI policy currently selects Vertex,
WIF or any Gemini endpoint.

`src/prepare-review-context.mjs` currently prepares a bounded prompt by
appending a textual base-to-reviewed-merge diff and changed paths. It verifies
the three revisions and merge parents, excludes untracked files, rejects
binary/invalid text, and enforces the selected prompt limit. It does not create
individual before/after file snapshots or package protected references as a
separate input packet. The consumer workflow invokes this helper; the legacy
reusable `architecture-gate.yml` does not. Neither workflow dispatches Gemini.

## Optional snapshot context helper

`src/prepare-review-file-context.mjs` provides an internal, currently unwired
preparation helper. Trusted orchestration supplies exact merge revisions,
explicit base reference paths and all three limits. It returns full before/after
regular UTF-8 file snapshots, Git object IDs and content digests; absent sides
are `null`. It reads committed objects, not working-tree files, and rejects
unsupported file modes, invalid text, missing objects and exceeded limits.
The complete serialized result, including metadata and JSON escaping, is bounded.

This provider-independent helper supports at most 32 changed-path/reference entries, 131,072
bytes per blob and 524,288 bytes per serialized context. Callers must explicitly
select limits at or below those runtime caps. These are internal preparation
bounds, not newly adopted consumer policy or replacements for `maxPromptBytes`.
A future composer must additionally bound the complete prompt and verify the
protected selection and complete Authority Set. The helper does not establish
repository-origin identity, infer required references, execute a reviewer,
persist evidence, or alter either CI workflow. Its snapshot selection is not
itself proof of protected authority or semantic completeness.

## Execution contract before CI integration

Provider choice does not select an execution model. The current Codex route
uses a CLI agent with workspace/Git access; the implemented Gemini transport
uses REST requests containing explicit context. Comparing these as equivalent
provider adapters hides differences in context discovery and responsibility.
The Vertex AI/WIF authentication selection does not select REST over a CLI.

Before wiring Gemini into CI, compare execution options against one review
contract, preserving existing protected selection and acceptance:

| Concern | Contract to specify and verify |
| --- | --- |
| Review scope | Repository identity as supported; exact base, head and reviewed merge revisions |
| Protected context | Selected authority, prompt, schema, validation and their identities |
| Context access | Available workspace/Git reads, discovery tools or explicit snapshots; revision binding, bounds and unsupported inputs |
| Execution capabilities | Allowed tools, writes, commands, network destinations and cancellation; distinguish configured controls from enforced controls |
| Credentials | Vertex/WIF credential ownership, launcher interfaces, proxy compatibility and renewal boundary |
| Output | Extracted decision, deterministic validation, execution identity and incomplete failure outcomes |

### Options to compare

| Option | Context responsibility | Required investigation |
| --- | --- | --- |
| Codex CLI with workspace (current baseline) | Agent can discover additional repository context | Document actual access, input binding, sandbox, credential and timeout guarantees |
| Gemini CLI with workspace | Proposed agent-based alternative, to be verified | Pin and inspect CLI behavior; verify Vertex/WIF and proxy integration, tool policy, writes, prompt injection exposure, output extraction and cancellation |
| Gemini REST with explicit context | Trusted orchestration selects supplied files or provides separately specified read tools | Verify reference selection covers the chosen review scope, hard bounds, and incomplete outcomes when context cannot be supplied |

The snapshot helper can supply explicit context to any compatible adapter. It
is not a mandatory Gemini preprocessing step or a complete context strategy.
A REST-only request needs supplied context, but need not use this particular
helper; a separately adopted read-tool boundary is another option. A workspace
adapter may use snapshots for reproducibility without giving up discovery.
Identical strings are not proof of equivalent review capabilities or quality.
No `read-only`, command denial, credential isolation or network guarantee is
inferred from an adapter's name or an operating mode.

## Revised delivery sequence

1. Implement the owner-selected Gemini CLI profile with a controlled,
   revision-bound review workspace and explicit read-tool allowlist. Candidate
   control files remain evidence with original path/revision identity rather
   than automatically loaded configuration. The selection is recorded in
   canonical authority; it activates no route.
2. Implement protected selection of the chosen provider, runtime, context
   strategy, model/settings and limits. Preserve old Codex policy versions;
   candidate inputs cannot select their own reviewer or raise bounds.
3. Integrate Vertex/WIF under the adopted credential boundary. Verify OIDC,
   token and renewal non-inheritance through explicit runner interfaces,
   constrained provider dispatch, credential lifetime and failure handling.
   No credential or provider fallback is activated by authentication failure.
4. Exercise ordinary review and each enabled governance path with shared
   deterministic validation and route-specific producer evidence. Require
   bounded owner-adjudicated cases and real authorized reviews; schema success
   does not prove semantic quality or host merge enforcement.

```mermaid
flowchart TD
  P[Protected review scope and context selection] --> E[Selected execution profile]
  E --> W[Workspace and permitted discovery tools]
  E --> C[Explicit snapshots or adopted read-tool boundary]
  W --> A[Compatible reviewer adapter]
  C --> A
  K[Selected credential boundary] --> A
  A --> V[Shared decision validation]
  V --> R[Existing reporting and acceptance verification]
```

This is a proposed responsibility diagram, not an implemented universal
adapter framework. No route or capability is activated by this plan.

## Verification and remaining selections

Evaluate candidate options using the same review cases and authority. Record
which context each can access, which restrictions the host actually enforces,
credential exposure, total deadline/cancellation behavior and validated output.
Cover PASS/BLOCK/OWNER_DECISION plus unavailable context, unsupported input,
authentication, timeout, refusal, partial and invalid-output failures. Verify
Gemini with Codex absent and OpenAI credentials unset. Preserve fail-closed
acceptance and independently verify any required host protection.

Still open: adopting consumer and branch; exact
Google identity bindings, project/region, model/thinking settings, quotas and
billing limits, credential lifetime/renewal, supported file classes, complete
prompt limits, retention/cleanup and route-specific governance evidence.
Standby/fallback or parallel result adoption stays with #259. Vertex AI with
WIF remains the selected authentication direction. #252 remains open until
its CI adoption criteria are met; this work adds no release gate.

## Internal CLI delivery slice

The CLI profile has three internal building blocks. The optional snapshot helper
can feed `materialize-review-workspace.mjs`: it writes fixed ordinal text files
and a manifest retaining original paths, exact revisions, modes, object IDs and
content digests. Candidate filenames never select a filesystem destination or
CLI configuration name. Every selected snapshot is retained; absent sides remain
explicit. This helper verifies packet consistency and bounds, not origin identity,
complete repository context, protected reference selection or host confinement.
The trusted orchestrator remains responsible for those inputs and coverage.

`gemini-cli-response.mjs` extracts the JSON output envelope only after successful
process completion within explicit output limits. Response text then passes the
existing request-bound decision validation. CLI exit zero alone is insufficient.

The proxy accepts the fixed CLI streaming alias only with explicit opt-in and
maps it to the selected Vertex project, region and model. It discards client
credential headers and injects the parent-owned Bearer credential upstream.
Ordinary non-streaming routes retain their existing scope checks. This slice
provides no CLI installer, process supervisor, protected CI selection or workflow
activation. It does not assert that a read-tool configuration is host isolation.

Offline validation used npm Gemini CLI 0.62.0, an isolated fixture HOME,
controlled workspace and a loopback canned SSE server. The CLI performed a
`read_file` call through the actual streaming proxy; the upstream received only
the parent dummy Bearer header on the protected-scope route. A shell request was
rejected by the configured tool inventory. Dummy credentials are not WIF evidence.
Malformed decision text still produced CLI exit zero; HTTP 401 produced failure;
a nonresponding server required an external watchdog. Further implementation
must verify cancellation with descendants, complete context selection, CLI
version/configuration control, thinking settings and authenticated governance
cases before route activation.

## Internal CLI process supervisor

`gemini-cli-process.mjs` runs an already provisioned CLI under a fresh private
HOME, a fixed operational environment and generated read-tool configuration.
It accepts only the reported CLI version 0.62.0; that consistency check does not
attest installed bytes. The trusted caller owns the installer/runtime identity,
private parent, controlled workspace, protected scope/settings, request preflight
and final `gemini-cli-response.mjs` validation. This is not a standalone review
or acceptance entrypoint.

The selected model and thinking budget are explicit. The prompt is sent through
stdin and the model is a literal option value, so prompt text cannot become CLI
flags or exceed the OS single-argument limit. The prompt limit cannot exceed the
pinned CLI stdin limit of 8 MiB; oversized input fails before execution. Ambient credentials, renewal selectors, `NODE_OPTIONS` and default HOME
configuration are not forwarded. The SDK's fixed non-secret placeholder enables
Vertex client mode only; the proxy replaces it with its parent-owned Bearer
credential upstream. Missing system settings/default paths inside the private
HOME prevent ambient system configuration. Gemini CLI requires root ownership
for system settings, so generated user-owned files cannot enforce that layer;
no ownership check is bypassed. Instead, the physical workspace and every
ancestor must contain no operational `.gemini`, `.agents`, `.env` or `GEMINI.md`.
Rejection precedes launch: candidate control bytes belong only in ordinal
evidence snapshots, not auto-loaded paths. This prevents workspace overrides
and avoids relying on an empty MCP map to erase entries during deep merge.
The trusted caller must keep those directories stable throughout execution.

One deadline covers setup, version probe and review. Explicit prompt/stdout/stderr
byte limits reject overflow without returning a truncated decision. Output is
strict UTF-8. Cancellation, timeout and overflow kill the POSIX process group;
cleanup also handles descendants after main-process exit and removes the private
HOME. This implementation rejects Windows and claims neither host confinement nor
an absolute kernel termination guarantee. OS-level uninterruptible processes
remain outside that guarantee.

Focused fixtures exercise a mismatched/hung version probe, hung review, abort,
output overflow, split/invalid UTF-8, option-shaped prompts, and descendants with
inherited or closed output pipes. An additional fixed-CLI offline run used the
actual supervisor and proxy with test-only network interception: `read_file`
succeeded, only the four selected tools were advertised, both model requests
carried thinkingBudget 1024, and the upstream saw only the fixed scope and parent
dummy Bearer. No real WIF exchange or semantic-quality proof is supplied. Protected
CI wiring, complete context composition and authenticated governance evidence
remain #252 work.
