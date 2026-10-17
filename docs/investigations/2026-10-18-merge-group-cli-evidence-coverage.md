# Merge-group CLI evidence boundary coverage

This note records focused test coverage for the production
`scripts/owner-amendment-merge-group-gate.mjs` entrypoint. It does not change
the selected architecture, activate a route, or establish protected adoption.

## Boundary and retained cases

The composition suite executes the actual CLI child process with controlled
GitHub API and `gh` responses. Its successful control reaches the existing
pre-transition eligibility result and writes the `amendment` route outputs.
The earlier negative calls exercise a checked-out verifier base mismatch and a
receipt bound to another B. The suite now covers four failures at production
eligibility discovery and the missing-tag guard; this change adds the
missing-tag case:

| Input condition | Production boundary and expected result |
| --- | --- |
| The selected producer attempt has no exact eligibility artifact | Artifact discovery reports `expected exactly one matching BLOCK artifact; found 0.` The CLI emits no stdout and leaves `GITHUB_OUTPUT` empty. |
| The exact artifact identity is present but listing and detail metadata mark it expired with a past expiry time | Artifact discovery reports `matching artifact has invalid identity, run association, or expiry metadata.` The CLI emits no stdout and leaves `GITHUB_OUTPUT` empty. |
| The selected producer run lists attempt 1, while the detailed readback for attempt 1 reports attempt 2 | Artifact discovery rejects the run identity with `workflow run event, repository, head, attempt, or run ID differs from trusted expectation.` The CLI emits no stdout and leaves `GITHUB_OUTPUT` empty. |
| The expected protected tag lookup returns 404 while exact-B producer history has a successful pre-queue semantic signer | The existing `assertMissingOwnerAmendmentTagHasNoSuccessfulSigner` guard reports `exact B has a successful pre-queue semantic eligibility signer result but no protected amendment tag.` The CLI emits no stdout and leaves `GITHUB_OUTPUT` empty instead of dispatching the ordinary route. |

Each failure starts from the controlled response table, clears the output and
prepared-input directory, and the fixture restores its response before the
next case. The expired case updates listing and detail metadata consistently;
it uses the production expiry check without changing a clock or threshold.
The tag 404 retains the fixture's successful signer history and uses the
production expected-tag classification and existing missing-tag guard. The
valid control and prior wrong-base and wrong-receipt cases remain in the same
child-process exercise. Those latter failures also assert empty stdout and
empty `GITHUB_OUTPUT`. Existing function-level tests cover other producer and
receipt bindings; the new value is observation of these failures at the CLI
boundary, including suppression of route outputs.

## Evidence limits

GitHub API and `gh` responses, artifact bytes, and attestation output in this
test are synthetic controlled fixtures. The fixture exercises production
selection, discovery, validation, missing-tag guard and CLI output behavior,
but it does not run a live GitHub API, cryptographically verify provenance,
establish host protection, prove adoption, or exercise a protected queue
transition and canonical readback. These cases provide no global completion
claim for Issue #254; existing live and protected evidence owners remain
responsible for those claims.

The [remaining-boundary inventory](2026-10-18-quality254-remaining-boundaries.md)
maps the broader production chain, six lifecycle areas and duplicate-test
disposition without claiming whole-issue completion.
