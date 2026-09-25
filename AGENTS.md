# Agent instructions

## Authority

- `docs/architecture.md` is the normative architecture and assurance contract. Read it before changing architecture, trust boundaries, review decisions, evidence, or acceptance policy; implementation and discussion materials do not amend it.
- Escalate unresolved owner decisions. Record an authorized decision in canonical authority before implementing a new responsibility or assurance rule. Do not infer a consumer's architecture from this shared package.

## Agent roles

- The coordinator owns priorities, scope, escalation of unresolved owner decisions, dependencies, assignments, integration of owner-authorized decisions, independent review, and the final report. Only the consumer owner may resolve an owner decision, and it must be recorded in canonical authority. When assigned a coordination-only role, delegate repository edits and execution to bounded work tasks.
- Assign each worker one reviewable outcome, with authority and file boundaries, completion criteria, focused verification, and the coordinator to report to. Workers investigate, edit, verify, and report results with evidence; they do not resolve owner decisions or enable an acceptance route without the required owner authority.
- Keep conflicting edits and acceptance decisions with the coordinator. A worker's review or verification result is not itself protected-policy acceptance.
- Use `gpt-6-sol` with `low` reasoning by default for coordinator tasks and `gpt-6-luna` with `low` for bounded worker tasks. Use `gpt-6-sol` with `low` for integrated work that cannot be bounded to a worker. Raise effort only for difficult unresolved cross-cutting design or diagnosis; stronger models do not replace owner decisions or missing evidence. At delegation, explicitly select and record the model and effort when supported; otherwise state the inherited setting. These are development-task defaults, not consumer reviewer settings.

## Development

Follow [`docs/development.md`](docs/development.md) for repository layout, implementation, verification, documentation, distribution, and rollout procedures.
