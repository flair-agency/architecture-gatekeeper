# Local provider execution coordination (#265 / #252)

Status: implementation proposal subordinate to `docs/architecture.md`; no
provider route or settings schema is activated by this record.

## Delivered boundary

PR #273 (`b8a428c`) moved manual, UserPromptSubmit and post-tool composition
behind `local-reviewer-execution.mjs`. Shared construction/validation, default
Codex transport and sync compatibility remain. The injected adapter seam alone
does not implement recorded Gemini selection or attest actual model identity.

## Proposed shared shape

| Concern | Proposed contract |
| --- | --- |
| Input | Existing revision-bound request, complete prompt/schema/authority and reviewer model/deadline; committed provider-specific configuration |
| Codex compatibility | Omitted provider means Codex; existing model/reasoningEffort preserved |
| Gemini settings | Explicit provider and thinking configuration; no implicit Codex effort conversion; exact supported fields/limits to agree with #252 |
| Output | Raw semantic decision consumed by existing deterministic validation, plus separately identified local execution metadata |
| Identity | Adapter-applied provider/requested model/settings; backend model identity only when returned, separately labeled; no inferred identity from output text |
| Sync API | Codex compatibility remains; unsupported async provider rejected before dispatch |
| Async API | Recorded deadline and adapter-specific bounds; failure/incomplete never yields a substituted decision or fallback |
| Native Skill | Cannot silently satisfy Gemini selection using a Codex-native reviewer |

Raw decisions and provenance are distinct. Do not accept an arbitrary wrapper
as evidence or let a caller's identity override recorded configuration. Keep
credentials in execution adapters, not committed review requests or reports.

## Ownership and next increments

- #265 owns local composition, manual/Hook adaptation, sync compatibility and
  local tests. #252 owns CI provider selection, proxy/launcher and protected
  execution. PR #262 currently owns Gemini transport implementation.
- Agree on reviewer configuration, raw decision/result envelope, provenance,
  deadlines and package exports before editing `review-contract.mjs`,
  `gemini-transport.mjs` or exports. The proposed shapes above are not agreement.
- After canonical adoption and shared agreement, implement recorded selection,
  settings validation, adapter execution metadata and fail-closed native
  handling in a separate bounded PR. Coordinate Skill/CLI/docs compatibility.
- Verify Codex compatibility and Gemini local paths with Codex absent and
  OpenAI credentials unset: complete authority, all semantic outcomes,
  invalid/missing authority, malformed decisions, unavailable credentials,
  unsupported settings, timeout/cancellation and no fallback. Use model-free
  fixtures first; real reviews need the selected authentication/host permission.

#265 remains open until these implementation and verification outcomes are
complete. This work adds no formal-release prerequisite beyond the separately
owner-required documentation cleanup #272; no CI or provider activation is
claimed here.
