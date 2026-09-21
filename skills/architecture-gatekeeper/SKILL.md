---
name: architecture-gatekeeper
description: Adopt, configure, review, release, or roll out the shared Architecture Gatekeeper across Codex repositories while keeping each repository's authority and policy separate.
---

# Architecture Gatekeeper

Use the public `flair-agency/architecture-gatekeeper` repository as the owner of
shared mechanics. Keep repository-specific authority, prompts, schemas, model
selection and target-branch policy in each consumer repository.

## Decide the requested operation

- For a shared runtime bug or generic feature, change the public Gatekeeper
  repository, verify its generic tests and public payload, release it, then open
  exact-version adoption PRs. Do not patch copied runtime logic in consumers.
- For one repository's architecture rules, change only that consumer's
  `.codex/gatekeeper/` inputs. Do not add company or product knowledge to the
  public runtime.
- For rollout, review every consumer's actual authority before creating its PR.
  Never bulk-copy another repository's authority list or migration overlay.
- For status or review requests, inspect without changing repositories unless
  the user also asks for implementation.

## Preserve the boundary

Shared mechanism may own Hook event handling, committed-revision binding,
temporary output isolation, reviewer invocation, schema/result primitives,
target-branch policy resolution, generic tests and reusable CI workflow.

Consumers own semantic authority, prompt content, decision schema, required PASS
scope, model/effort choices, time budget, CI policy and any migration overlay.
The Gatekeeper is a semantic guardrail, not a filesystem transaction monitor or
tamper-resistant security boundary. Do not add path leases, write monitoring,
rollback, symlink policing or local Git object-store defenses.

## Local adoption

1. Inspect the consumer's `AGENTS.md`, governance documents and owning
   contracts. Select authority because it is canonical, not because a file or
   package already exists.
2. Add the shared package at an exact released version or exact public commit.
   Do not fetch `latest` when a Hook runs.
3. Keep the launcher minimal: import `runHookCli` and call it.
4. Add repository-owned config, prompt, schema and reviewer settings. Protect
   all reviewer inputs by committed revision and fail closed when unavailable.
5. Update the trusted Hook launcher digest when the consumer uses digest-bound
   Hook trust.

## CI adoption

Call the reusable workflow at an exact release tag. Read branch policy from the
protected base revision, never from the proposed merge, so a PR cannot waive its
own review.

Only two modes are valid:

- `enforced`: run model-backed review with the configured model and reasoning
  effort; missing credentials, reviewer failure, `BLOCK`, `OWNER_DECISION` or
  malformed output rejects acceptance.
- `local-only`: make no OpenAI API call and record an explicit
  `ACCEPTED WITHOUT CI AI REVIEW` waiver. Never describe this as an architecture
  `PASS`.

Before establishing an `enforced` path for a repository, obtain explicit user
approval to send that repository's committed PR diff and required contracts to
the OpenAI API. Approval for one repository does not authorize another. Missing
`OPENAI_API_KEY` must not silently select `local-only`.

## Verification and rollout

- Inspect `git status --short` before editing and preserve unrelated changes.
- Test the shared package independently, inspect its publication payload and
  confirm it contains no consumer-specific or private knowledge.
- In every consumer, test package/lock consistency, the thin launcher, config,
  policy resolution, schema acceptance, public-content constraints and workflow
  syntax as applicable.
- Use the repository's normal Issue/PR tracking procedure. Record the exact
  shared version, checks, limits, external prerequisites and recovery path.
- Enable a required `Architecture Gate / accept` check only after that
  repository has validated the workflow. A central rollout issue tracks work;
  it does not replace per-repository authority review.
- Stop rather than guessing when canonical authority is missing, publication
  safety is unclear, or rollout would require unapproved external data transfer.
