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

1. Allocate a unique, access-controlled temporary directory through the trusted
   host, with protections appropriate to its OS (including ACLs where needed).
   Choose fixed request and decision filenames inside it. Pass an uncreated
   request filename to prepare: pre-creating the file conflicts with its `wx`
   exclusive-create behavior. Never derive these paths from candidate content,
   task text or reviewer output. The Skill execution side owns this allocation;
   the native adapter does not verify its privacy or parent-directory integrity.
2. Run the repository's installed, version-pinned entrypoint:
   `architecture-review-native prepare <request-path> <task...>`.
   This Codex-native adapter supports recorded Codex settings only. A recorded
   Gemini selection leaves this Skill incomplete; use the asynchronous local
   reviewer instead. Do not substitute the host model.
3. Start a separate host-native reviewer/subagent whose role is limited to
   reviewing and does not include changing the reviewed repository. Give it
   exactly the returned prompt, schema, model and reasoning effort. Apply the
   recorded model and effort in the host; if the host cannot provide either,
   leave the review incomplete. Request only the structured decision JSON.
   Host-enforced read-only sandboxing and an exact hard timeout are optional,
   environment-specific controls. Record them when available; they are not
   prerequisites for a complete native Skill review. If the reviewer is
   cancelled, fails, or changes the reviewed repository, stop with an incomplete
   review and do not validate. Do not use shell execution or nested `codex exec`
   to create this reviewer.
   Keep an observable run record for Skill E2E investigations: identify the
   host-native reviewer task/agent, preserve the exact prepared request (prompt
   and schema), the model and effort supplied, and the returned decision's
   provenance. Record any host-applied sandbox or timeout controls when
   available. The decision written for validation must be the result returned
   by that reviewer, not a caller-authored substitute. Keep the record with the
   investigation; it is diagnostic execution evidence, not cryptographic
   merge-acceptance evidence.
4. Write only that JSON object to the private decision path.
5. Run `architecture-review-native validate <request-path> <decision-path>`.
   Treat any preparation, reviewer, parsing, schema or policy failure as an
   incomplete review. Always remove both temporary files and the session
   directory in host-side cleanup on success, failure or cancellation, including
   a reviewer that never returns. Before cleanup, preserve the exact prepared
   inputs and returned decision needed for E2E investigation in a separate
   access-controlled record or host transcript. File mode `0600` and exclusive
   creation do not by themselves establish directory privacy or host isolation.

The native reviewer is the Skill execution adapter. Its review-only role is
required; physical write denial and exact hard-timeout enforcement depend on
the host environment. The two runtime commands
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
`architecture-review` command: that terminal adapter uses the selected provider
transport (child `codex exec` for Codex), rather than a host-native reviewer. The automatic Hook and CI gate remain separate entrypoints.

Present the structured decision, reviewed revision, authority sources consulted,
scope reviewed and the reason for any `BLOCK` or `OWNER_DECISION`.
