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
   binding, authority selection, reviewer invocation and decision validation.
4. Do not infer architecture authority from existing code or package layout.

## Run the manual review

Use the repository's installed, version-pinned Architecture Gatekeeper manual
review entrypoint, `architecture-review`, and pass the user's architecture
question or proposed change as the task. Do not fetch or install a newer
Gatekeeper during review.

If the repository has not adopted a manual review entrypoint, report that the
manual review is unavailable rather than imitating Hook input or inventing a
parallel reviewer. The automatic Hook and CI gate remain separate entrypoints.

Present the structured decision, reviewed revision, authority files consulted,
scope reviewed and the reason for any `BLOCK` or `OWNER_DECISION`.
