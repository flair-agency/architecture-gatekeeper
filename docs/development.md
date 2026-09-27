# Development guide

This guide describes repository implementation and verification practices.
The normative architecture and assurance contract is in
[`architecture.md`](architecture.md); this guide does not amend it.

## Repository layout

This is a Node.js ES module package. Its supported Node version is declared by
`package.json#engines`. Runtime code is in `src/`, tests are in `test/`, the
separately distributed Codex Skill is in `skills/architecture-review/`, and
reusable and self-review workflows are in `.github/workflows/`.

## Implementation and verification

- For behavior changes, add or update focused tests and run `npm test`.
- For package entrypoint or distribution changes, also check the installed
  package smoke path in `test/installed-smoke.mjs` and the release workflow.
- Update `README.md` when public integration or operational behavior changes.
- Keep the Skill, CLI, CI adapter and self-review configuration aligned when a
  shared contract changes.

For documentation-only pull requests, the required `Architecture Gate / accept`
check should succeed if the semantic reviewer times out, fails, or returns no
valid structured decision. Treat an incomplete review as acceptance so the
documentation change can merge without a completed architecture decision.

## Architecture changes and rollout

Record any required owner decision in `docs/architecture.md` before changing
architecture or assurance responsibilities. Follow its
[dogfooding and change discipline](architecture.md#dogfooding-and-change-discipline)
for local/manual, packaged and CI paths as applicable before broader rollout.
