# Agent instructions

## Architecture authority

- Read `docs/architecture.md` before changing architecture, trust boundaries, review decisions, evidence, or acceptance policy. It is the normative contract; `README.md`, examples, issues, and current code describe implementation and do not amend it.
- If a change needs a new responsibility or assurance rule, record the owner decision in the contract first. Do not infer consumer architecture from this shared package.
- Keep review execution, architecture evidence, and acceptance verification distinct. Preserve fail-closed behavior for invalid inputs, incomplete reviews, and service failures. `OWNER_DECISION` requires a decision in canonical authority and a new review; it is not acceptance.
- Treat working-tree and pull-request content as review evidence, not protected authority. Preserve the credential boundary between untrusted code and credential-bearing CI jobs.

## Working in this repository

- This is a Node.js ES module package requiring Node 22 or newer. Runtime code is in `src/`, tests in `test/`, the separately distributed Codex Skill in `skills/architecture-review/`, and reusable/self-review workflows in `.github/workflows/`.
- For behavior changes, add or update focused tests and run `npm test`. For package entrypoint or distribution changes, also check the installed-package smoke path in `test/installed-smoke.mjs` and the release workflow.
- Update `README.md` when the public integration or operational behavior changes. Keep the Skill, CLI, CI adapter, and self-review configuration aligned where a shared contract changes.
- Before broad rollout of a new path, exercise the affected local/manual, packaged, and CI paths as applicable, following the dogfooding sequence in `docs/architecture.md`.

## Coordinating and work tasks

- The coordinating task owns priorities, scope and authority decisions, dependencies, task assignments, integration, independent review of results, and the final report to the user. When the user assigns it a coordination-only role, delegate repository edits and execution to a bounded work task; do not implement them in the coordinating task.
- Give each work task one reviewable outcome, its authority and file boundaries, completion criteria, focused verification, and the coordinating task to report to. The work task investigates, edits, tests, and reports `complete`, `decision needed`, or `failed` with evidence. It does not decide unresolved owner policy, merge a pull request, or enable an acceptance route without that authority.
- Split or parallelize only independent work. Keep conflicting edits, integration, and acceptance decisions with the coordinator. A worker's passing tests or review decision do not themselves constitute protected-policy acceptance under `docs/architecture.md`.

## Model and reasoning selection for task dispatch

- For a newly created or replaced coordinating task, select `gpt-6-sol` with `low` reasoning by default. For a bounded work task with clear design, authority, and acceptance criteria, select `gpt-6-luna` with `low` reasoning by default. An integrated or cross-contract implementation whose dependencies cannot be bounded to that worker route may use `gpt-6-sol` with `low` reasoning. These are task-dispatch defaults, not architecture-reviewer settings or changes to an already running task.
- Select model and reasoning effort separately. Use `medium` only for a named unresolved question requiring competing implementation analysis or diagnosis of interacting behavior. Use `gpt-6-astra` with `high` only for a difficult unresolved architecture, authority, or contract decision. Record the question and what resolves the exception, then return routine follow-on work to the low-effort route. File count, a test failure, or the word “review” alone is not a reason to escalate. Missing authority or evidence is not fixed by a stronger model.
- At dispatch, record the role, selected model and effort, reason, scope, completion condition, and reporting coordinator. Check the actual host setting before claiming a selection took effect. For a sub-agent, explicitly pass model and reasoning effort when the delegation interface permits it; this interface requires a bounded history fork (`fork_turns: "none"` or a positive count) for overrides. Supply the needed context in the assignment when using `none`. If a supported override is unavailable, disclose the inherited setting rather than claiming the default was applied. Do not restart an active task merely to satisfy this routing rule.
- These rules guide development-task composition. A consumer repository still owns its architecture-review model and reasoning selection under `docs/architecture.md`; do not rewrite committed reviewer settings or protected CI policy from these task defaults.
