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
