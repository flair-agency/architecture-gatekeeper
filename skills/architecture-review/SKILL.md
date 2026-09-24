---
name: architecture-review
description: Review a proposed or in-progress repository change against repository-owned architecture authority using Architecture Gatekeeper. Use when checking responsibility boundaries, ownership, abstraction drift, or whether an architectural choice requires owner input. Do not use for general code-quality review; use Codex /review for that.
---

# Architecture Review

Perform an on-demand semantic architecture review. Keep this distinct from the
automatic local screening Hook, CI acceptance gate, and general code review.

## Review boundary

- Review whether the proposed or in-progress change belongs in the selected
  component and is permitted by the repository's canonical authority.
- Evaluate responsibility, semantic ownership, abstraction level, dependency
  direction, minimality, legacy contamination and scope drift.
- Return only `PASS`, `BLOCK`, or `OWNER_DECISION`, with concise evidence.
- Do not review general code correctness, style, test coverage or ordinary
  regressions. Use Codex `/review` for those concerns.
- Do not implement fixes as part of the review unless the user separately asks
  for implementation after receiving the decision.

## Use repository-owned authority

1. Locate the repository root and read its `AGENTS.md` instructions.
2. Treat the shared `flair-agency/architecture-gatekeeper` package as mechanism,
   not as the source of repository-specific architecture policy.
3. Do not pre-read or independently interpret the Gatekeeper configuration or
   its authority files. The version-pinned runtime owns committed-revision
   binding, authority selection, request construction and decision validation.
4. Do not infer architecture authority from existing code or package layout.

## Run the native review

1. Create private temporary paths for a review request and decision.
2. Run the repository's installed, version-pinned entrypoint:
   `architecture-review-native prepare <request-path> <task...>`.
3. Start a separate host-native reviewer/subagent with read-only access. Give it
   exactly the returned prompt, schema, model, reasoning effort and
   `reviewTimeoutMs`. Require it to return only the structured decision JSON
   within that deadline. If the reviewer does not complete before the deadline,
   stop with an incomplete review and do not run validation. Do not use shell
   execution or nested `codex exec` to create this reviewer.
   Keep an observable run record for Skill E2E investigations: identify the
   host-native reviewer task/agent, preserve the exact prepared request (prompt
   and schema), model, reasoning effort and timeout supplied to it, and record
   the host-applied model, reasoning effort, timeout and read-only controls,
   plus the returned decision's provenance. Instructions in reviewer task text
   alone do not establish that the host applied these controls. If the host
   cannot provide or verify them, mark the Skill review incomplete even when a
   reviewer returns JSON that passes validation. The decision written for validation
   must be the result returned by that reviewer, not a caller-authored
   substitute. Keep the record with the investigation; it is diagnostic
   execution evidence, not cryptographic merge-acceptance evidence.
4. Write only that JSON object to the private decision path.
5. Run `architecture-review-native validate <request-path> <decision-path>`.
   Treat any preparation, reviewer, parsing, schema or policy failure as an
   incomplete review. Always remove both temporary files.

The native reviewer is the Skill execution adapter. The two runtime commands
provide the same recorded-revision authority selection and deterministic
validation contract used by other adapters without owning reviewer transport.
For version 2 local configuration, present the returned Authority Set provenance
and exact reported `authorityIds`; an unavailable selected source leaves review
incomplete.
Do not fetch or install a newer Gatekeeper during review.

Distinguish three checks when reporting results: a runtime prepare/validate
smoke exercises request construction and decision validation only; a native
Skill E2E also observes a separate host-native reviewer invocation and passes
that reviewer's returned decision to validation; CI acceptance is the
independent protected-policy workflow result. A prepare/validate-only smoke
must not be reported as a successful native Skill E2E or as CI acceptance.

If the repository has not adopted `architecture-review-native`, report that the
native Skill review is unavailable. Do not fall back to the standalone
`architecture-review` command: that terminal adapter launches child
`codex exec`. The automatic Hook and CI gate remain separate entrypoints.

Present the structured decision, reviewed revision, authority sources consulted,
scope reviewed and the reason for any `BLOCK` or `OWNER_DECISION`.
