# Original 96-module TypeScript implementation inventory — final three CLI candidate

The fixed original96 denominator comes from the reviewed source map. New ordinary-Gemini and measurement modules are outside it. The table audits tracked source bindings at the original #587 candidate `6eedd95c00799d8958537114aea6f1fde8cf33f5`, tree `9b24e7f64e332e45aa8024c1aa4b632e253ba50d`; all 96 original flat paths bind complete authored implementations. The local combined candidate `7db3b05` ports the JavaScript fixed-boundary baseline `821c3ea` into those three authored implementations, narrowing their internal CI artifact paths. These source facts are separate from adoption. The fixed-temp scope follows [the owner decision in PR #591](https://github.com/flair-agency/architecture-gatekeeper/pull/591#issuecomment-6235948030).

The reviewed post-#589 main baseline is `2769e3f10833d17197049750958db1b24e6b4539`, **93/96 adopted**. The three final #587 implementations yield **96/96 candidate implementation coverage**, including the combined fixed-temp candidate `7db3b05`; the candidate remains unadopted and main remains 93/96. The stage column records provenance: “Reviewed base 93” and “Final three #587” identify the slices, not an adopted/current-main count.

Earlier checkpoints remain historical: #578 84/96, #563 85/96, #581 86/96, #585 87/96 and #590 88/96. The original combined inventory audited `9be87f134403e5755d0b450df13d73054a00df81` against the 87-module base `f893fcbc393b11ec43ceb96220d508c050736fd7`. Those source and execution references are not rebound to the present candidate.

## Complete implementations and retained boundaries

The final-three leaves are `src/ci-review/legacy-ci-authority-preparer.mts`, `src/owner-addition/owner-addition-ci-operations.mts` and `src/owner-addition/owner-addition-multiauthority.mts`. The owner-approved follow-up narrows internal CI artifact operations to fixed runner-temp selectors: fixed string filenames or the exact absolute path resolved from the runner-temp working directory. Arbitrary raw artifact paths and injected `GITHUB_OUTPUT` destinations are no longer compatibility claims. The self, consumer and provider workflows set `working-directory: ${{ runner.temp }}` on legacy and owner-addition prepare/validate steps; output uses the existing runner-owned `appendGitHubOutput`. `policyBytes` remains Node `BinaryLike` for its native digest operation, preserving Buffer, Uint8Array, string and DataView support for policy bytes, not filesystem paths. Existing environment and external-fetch callback inputs remain; parsed JSON and external observations remain unknown, and types establish no authentication, immutable snapshot or acceptance route.

The four retained flat top-level function-declaration boundaries are `ci-procedural-authority-change`, `github-runner-env`, `prepare-review-context` and `validate-decision`. The first, third and fourth are thin CLI functions; the second is the distinct native source barrier. Other facades retain native operations and direct-run guards too. This distinction is part of complete implementation accounting, not a claim that all flat files are pure re-exports.

The launcher still selects its original flat runner. Preview remains anchored in the flat source/emitted directory. The three internal CI adapters now use fixed runner-temp artifact selectors. Same-user filesystem concurrency remains a limitation; the fixed names and existing checks make no custody or complete race-freedom claim. Generic descriptor/Buffer/URL artifact compatibility is outside this internal CI interface.

Historical source-only CodeQL evidence for original candidate `6eedd95` reports 733 JavaScript/TypeScript files, 12 workflows, 40 JavaScript results and zero Actions results; it also records zero normalized changes against `5835fb7` and 24 generic CLI result relocations against `7e008e`. These old results and the earlier review do not describe the fixed runner-temp candidate and do not establish its findings, risk disposition, or hosted result. The 24 moved identities are not identical fingerprints or removed risk. The earlier CodeQL regression’s 100-path explanation cap changed no detection/model semantics and retained generic API and injected negative flows; it is historical evidence, not a current candidate scan.

Historical `6eedd95` strict/build/cycles, 104 focused checks, 230 emitted-file identity comparison and the `6ab7076` 2052-test run remain bound to their original tuples. Fresh fixed-boundary evidence is revision-bound: `7db3b05` passed strict/build/cycles and 55 focused compiler/CLI/identity checks; `49873f5` passed source-only official CodeQL and the unchanged three-model regressions (733 JS-family files, 12 workflows, 16 unchanged JS findings, zero Actions findings). Integration head `014085e`, with identical src/test/script/workflow bytes, passed strict/cycles and a fresh full suite of 2056/2056, zero failures/skips/cancellations, in 483.9 seconds. All 230 emitted files match its actual 252-entry archive and offline installation; installed smoke passed in 109.2 seconds. The archive SHA-256 is `ba2e7d0200ca92e06c03af2fbdb553bbd512df9dfe3b133750ec1dabc2347f19`, identifying that pre-documentation-update package. Hosted CodeQL/model/completeness checks succeeded at `014085e`; protected review stopped at its exact event base/head merge-parent guard, so acceptance is not established. The owner approved bounded chunked v2 output publication; its fresh verification is recorded in [the disposition report](2026-10-16-cli-file-io-hardening.md). Current-final Native, Code/Security Review and protected acceptance remain required for the publication follow-up; no earlier evidence transfers. Six normative members and selected model packs remain unchanged.

## Exhaustive original implementation bindings

The private proof verifies 96 unique rows, exact equality with the fixed historical original set, physical tracked existence of every flat and authored binding, and a direct static import/re-export from every flat original to a listed authored implementation at the candidate above. The table records authored/runtime bindings, not source extension totals or PR totals. Emitted flat paths remain the original public basenames; actual generated/package verification remains separate.

| Original flat source | Authored implementation bindings | Emitted flat compatibility path | Reviewed stage |
|---|---|---|---|
| `src/authority-set.mjs` | `src/authority-validation/authority-set.mts` | `dist/authority-set.mjs` | Reviewed base 93 |
| `src/ci-decision-kind.mjs` | `src/ci-review/ci-decision-kind.mts` | `dist/ci-decision-kind.mjs` | Reviewed base 93 |
| `src/ci-enforced-acceptance.mjs` | `src/ci-review/ci-enforced-acceptance.mts` | `dist/ci-enforced-acceptance.mjs` | Reviewed base 93 |
| `src/ci-execution-observation.mjs` | `src/ci-execution/ci-execution-observation.mts` | `dist/ci-execution-observation.mjs` | Reviewed base 93 |
| `src/ci-execution-result.mjs` | `src/ci-execution/ci-execution-result.mts` | `dist/ci-execution-result.mjs` | Reviewed base 93 |
| `src/ci-procedural-acceptance.mjs` | `src/ci-review/ci-procedural-acceptance.mts` | `dist/ci-procedural-acceptance.mjs` | Reviewed base 93 |
| `src/ci-procedural-authority-change.mjs` | `src/ci-review/ci-procedural-authority-change.mts` | `dist/ci-procedural-authority-change.mjs` | Reviewed base 93 |
| `src/ci-report.mjs` | `src/ci-review/ci-report-entrypoint.mts` | `dist/ci-report.mjs` | Reviewed base 93 |
| `src/codex-transport.mjs` | `src/reviewer-transports/codex-transport.mts` | `dist/codex-transport.mjs` | Reviewed base 93 |
| `src/gemini-ci-runner.mjs` | `src/gemini-cli/ci-runner-entrypoint.mts` | `dist/gemini-ci-runner.mjs` | Reviewed base 93 |
| `src/gemini-cli-process.mjs` | `src/gemini-cli/gemini-cli-process.mts` | `dist/gemini-cli-process.mjs` | Reviewed base 93 |
| `src/gemini-cli-proxy-session.mjs` | `src/gemini-cli/gemini-cli-proxy-session.mts` | `dist/gemini-cli-proxy-session.mjs` | Reviewed base 93 |
| `src/gemini-cli-response.mjs` | `src/gemini-cli/gemini-cli-response.mts` | `dist/gemini-cli-response.mjs` | Reviewed base 93 |
| `src/gemini-cli-session.mjs` | `src/gemini-cli/gemini-cli-session.mts` | `dist/gemini-cli-session.mjs` | Reviewed base 93 |
| `src/gemini-launcher.mjs` | `src/gemini-cli/launcher-entrypoint.mts` | `dist/gemini-launcher.mjs` | Reviewed base 93 |
| `src/gemini-security-proxy.mjs` | `src/gemini-cli/gemini-security-proxy.mts` | `dist/gemini-security-proxy.mjs` | Reviewed base 93 |
| `src/gemini-transport.mjs` | `src/reviewer-transports/gemini-transport.mts` | `dist/gemini-transport.mjs` | Reviewed base 93 |
| `src/github-app-check-reporter.mjs` | `src/github/github-app-check-reporter.mts` | `dist/github-app-check-reporter.mjs` | Reviewed base 93 |
| `src/github-associated-repository.mjs` | `src/github/github-associated-repository.mts` | `dist/github-associated-repository.mjs` | Reviewed base 93 |
| `src/github-authority-source.mjs` | `src/github/github-authority-source.mts` | `dist/github-authority-source.mjs` | Reviewed base 93 |
| `src/github-cli-runner.mjs` | `src/github/github-cli-runner.mts` | `dist/github-cli-runner.mjs` | Reviewed base 93 |
| `src/github-merge-group-event.mjs` | `src/github/github-merge-group-event.mts` | `dist/github-merge-group-event.mjs` | Reviewed base 93 |
| `src/github-owner-addition-provenance.mjs` | `src/github/github-owner-addition-provenance.mts` | `dist/github-owner-addition-provenance.mjs` | Reviewed base 93 |
| `src/github-owner-addition-readback.mjs` | `src/github/github-owner-addition-readback.mts` | `dist/github-owner-addition-readback.mjs` | Reviewed base 93 |
| `src/github-owner-amendment-readback.mjs` | `src/github/github-owner-amendment-readback.mts` | `dist/github-owner-amendment-readback.mjs` | Reviewed base 93 |
| `src/github-ruleset-readback-cli.mjs` | `src/github/github-ruleset-readback-cli.mts` | `dist/github-ruleset-readback-cli.mjs` | Reviewed base 93 |
| `src/github-ruleset-readback.mjs` | `src/github/github-ruleset-readback.mts` | `dist/github-ruleset-readback.mjs` | Reviewed base 93 |
| `src/github-runner-env.mjs` | `src/github/github-runner-env.mts` | `dist/github-runner-env.mjs` | Reviewed base 93 |
| `src/json-schema.mjs` | `src/authority-validation/json-schema.mts` | `dist/json-schema.mjs` | Reviewed base 93 |
| `src/legacy-git-snapshot.mjs` | `src/authority-validation/legacy-git-snapshot.mts` | `dist/legacy-git-snapshot.mjs` | Reviewed base 93 |
| `src/local-gate.mjs` | `src/local-review/local-gate.mts` | `dist/local-gate.mjs` | Reviewed base 93 |
| `src/local-post-tool-screen.mjs` | `src/local-review/local-post-tool-screen.mts` | `dist/local-post-tool-screen.mjs` | Reviewed base 93 |
| `src/local-reviewer-execution.mjs` | `src/reviewer-transports/local-reviewer-execution.mts` | `dist/local-reviewer-execution.mjs` | Reviewed base 93 |
| `src/manual-review.mjs` | `src/local-review/manual-review.mts` | `dist/manual-review.mjs` | Reviewed base 93 |
| `src/materialize-regular-git-snapshot.mjs` | `src/review-inputs/materialize-regular-git-snapshot.mts` | `dist/materialize-regular-git-snapshot.mjs` | Reviewed base 93 |
| `src/materialize-review-workspace.mjs` | `src/review-inputs/materialize-review-workspace.mts` | `dist/materialize-review-workspace.mjs` | Reviewed base 93 |
| `src/multi-authority-provenance.mjs` | `src/authority-validation/multi-authority-provenance.mts` | `dist/multi-authority-provenance.mjs` | Reviewed base 93 |
| `src/native-review.mjs` | `src/local-review/native-review.mts` | `dist/native-review.mjs` | Reviewed base 93 |
| `src/owner-addition-adoption.mjs` | `src/owner-addition/owner-addition-adoption.mts` | `dist/owner-addition-adoption.mjs` | Reviewed base 93 |
| `src/owner-addition-ci.mjs` | `src/owner-addition/owner-addition-ci-operations.mts` | `dist/owner-addition-ci.mjs` | Final three #587 |
| `src/owner-addition-finalize.mjs` | `src/owner-addition/finalize-owner-addition.mts` | `dist/owner-addition-finalize.mjs` | Reviewed base 93 |
| `src/owner-addition-multiauthority.mjs` | `src/owner-addition/owner-addition-multiauthority.mts` | `dist/owner-addition-multiauthority.mjs` | Final three #587 |
| `src/owner-addition-validation.mjs` | `src/owner-addition/owner-addition-validation.mts` | `dist/owner-addition-validation.mjs` | Reviewed base 93 |
| `src/owner-amendment-artifact-discovery.mjs` | `src/owner-amendment/owner-amendment-artifact-discovery.mts` | `dist/owner-amendment-artifact-discovery.mjs` | Reviewed base 93 |
| `src/owner-amendment-artifact-zip.mjs` | `src/owner-amendment/owner-amendment-artifact-zip.mts` | `dist/owner-amendment-artifact-zip.mjs` | Reviewed base 93 |
| `src/owner-amendment-artifact.mjs` | `src/owner-amendment/owner-amendment-artifact.mts` | `dist/owner-amendment-artifact.mjs` | Reviewed base 93 |
| `src/owner-amendment-attestation.mjs` | `src/owner-amendment/owner-amendment-attestation.mts` | `dist/owner-amendment-attestation.mjs` | Reviewed base 93 |
| `src/owner-amendment-block-context-verifier.mjs` | `src/owner-amendment/owner-amendment-block-context-verifier.mts` | `dist/owner-amendment-block-context-verifier.mjs` | Reviewed base 93 |
| `src/owner-amendment-block-evidence-composer.mjs` | `src/owner-amendment/owner-amendment-block-evidence-composer.mts` | `dist/owner-amendment-block-evidence-composer.mjs` | Reviewed base 93 |
| `src/owner-amendment-block-handoff-compose.mjs` | `src/owner-amendment/owner-amendment-block-handoff-compose.mts` | `dist/owner-amendment-block-handoff-compose.mjs` | Reviewed base 93 |
| `src/owner-amendment-block-handoff-orchestrator.mjs` | `src/owner-amendment/owner-amendment-block-handoff-orchestrator.mts` | `dist/owner-amendment-block-handoff-orchestrator.mjs` | Reviewed base 93 |
| `src/owner-amendment-block-handoff.mjs` | `src/owner-amendment/owner-amendment-block-handoff.mts` | `dist/owner-amendment-block-handoff.mjs` | Reviewed base 93 |
| `src/owner-amendment-block-record.mjs` | `src/owner-amendment/owner-amendment-block-record.mts` | `dist/owner-amendment-block-record.mjs` | Reviewed base 93 |
| `src/owner-amendment-block-semantic-record.mjs` | `src/owner-amendment/owner-amendment-block-semantic-record.mts` | `dist/owner-amendment-block-semantic-record.mjs` | Reviewed base 93 |
| `src/owner-amendment-git-changes.mjs` | `src/owner-amendment/owner-amendment-git-changes.mts` | `dist/owner-amendment-git-changes.mjs` | Reviewed base 93 |
| `src/owner-amendment-handoff-cli.mjs` | `src/owner-amendment/owner-amendment-handoff-cli.mts` | `dist/owner-amendment-handoff-cli.mjs` | Reviewed base 93 |
| `src/owner-amendment-handoff-git-context.mjs` | `src/owner-amendment/owner-amendment-handoff-git-context.mts` | `dist/owner-amendment-handoff-git-context.mjs` | Reviewed base 93 |
| `src/owner-amendment-handoff-pr-run-context.mjs` | `src/owner-amendment/owner-amendment-handoff-pr-run-context.mts` | `dist/owner-amendment-handoff-pr-run-context.mjs` | Reviewed base 93 |
| `src/owner-amendment-merge-group-acceptance.mjs` | `src/owner-amendment/owner-amendment-merge-group-acceptance.mts` | `dist/owner-amendment-merge-group-acceptance.mjs` | Reviewed base 93 |
| `src/owner-amendment-merge-group-b-context.mjs` | `src/owner-amendment/owner-amendment-merge-group-b-context.mts` | `dist/owner-amendment-merge-group-b-context.mjs` | Reviewed base 93 |
| `src/owner-amendment-merge-group-block-bridge.mjs` | `src/owner-amendment/owner-amendment-merge-group-block-bridge.mts` | `dist/owner-amendment-merge-group-block-bridge.mjs` | Reviewed base 93 |
| `src/owner-amendment-merge-group-evidence.mjs` | `src/owner-amendment/owner-amendment-merge-group-evidence.mts` | `dist/owner-amendment-merge-group-evidence.mjs` | Reviewed base 93 |
| `src/owner-amendment-merge-group-ordinary-review.mjs` | `src/owner-amendment/owner-amendment-merge-group-ordinary-review.mts` | `dist/owner-amendment-merge-group-ordinary-review.mjs` | Reviewed base 93 |
| `src/owner-amendment-owner-decision-amendment-record.mjs` | `src/owner-amendment/owner-amendment-owner-decision-amendment-record.mts` | `dist/owner-amendment-owner-decision-amendment-record.mjs` | Reviewed base 93 |
| `src/owner-amendment-owner-decision-context-verifier.mjs` | `src/owner-amendment/owner-amendment-owner-decision-context-verifier.mts` | `dist/owner-amendment-owner-decision-context-verifier.mjs` | Reviewed base 93 |
| `src/owner-amendment-owner-decision-handoff-cli.mjs` | `src/owner-amendment/owner-amendment-owner-decision-handoff-cli.mts` | `dist/owner-amendment-owner-decision-handoff-cli.mjs` | Reviewed base 93 |
| `src/owner-amendment-owner-decision-handoff.mjs` | `src/owner-amendment/owner-amendment-owner-decision-handoff.mts` | `dist/owner-amendment-owner-decision-handoff.mjs` | Reviewed base 93 |
| `src/owner-amendment-owner-decision-record.mjs` | `src/owner-amendment/owner-amendment-owner-decision-record.mts` | `dist/owner-amendment-owner-decision-record.mjs` | Reviewed base 93 |
| `src/owner-amendment-record-builder.mjs` | `src/owner-amendment/owner-amendment-record-builder.mts` | `dist/owner-amendment-record-builder.mjs` | Reviewed base 93 |
| `src/owner-amendment-scope.mjs` | `src/owner-amendment/owner-amendment-scope.mts` | `dist/owner-amendment-scope.mjs` | Reviewed base 93 |
| `src/owner-amendment-semantic-eligibility.mjs` | `src/owner-amendment/owner-amendment-semantic-eligibility.mts` | `dist/owner-amendment-semantic-eligibility.mjs` | Reviewed base 93 |
| `src/owner-amendment-semantic-producer-attempts.mjs` | `src/owner-amendment/owner-amendment-semantic-producer-attempts.mts` | `dist/owner-amendment-semantic-producer-attempts.mjs` | Reviewed base 93 |
| `src/owner-amendment-semantic-tag-object.mjs` | `src/owner-amendment/owner-amendment-semantic-tag-object.mts` | `dist/owner-amendment-semantic-tag-object.mjs` | Reviewed base 93 |
| `src/owner-amendment-tag-adapter.mjs` | `src/owner-amendment/owner-amendment-tag-adapter.mts` | `dist/owner-amendment-tag-adapter.mjs` | Reviewed base 93 |
| `src/owner-amendment-tag-api.mjs` | `src/owner-amendment/owner-amendment-tag-api.mts` | `dist/owner-amendment-tag-api.mjs` | Reviewed base 93 |
| `src/owner-amendment-tag-attempt.mjs` | `src/owner-amendment/owner-amendment-tag-attempt.mts` | `dist/owner-amendment-tag-attempt.mjs` | Reviewed base 93 |
| `src/owner-amendment-tag-readback.mjs` | `src/owner-amendment/owner-amendment-tag-readback.mts` | `dist/owner-amendment-tag-readback.mjs` | Reviewed base 93 |
| `src/owner-amendment-workflow-run-merge-group-context.mjs` | `src/owner-amendment/owner-amendment-workflow-run-merge-group-context.mts` | `dist/owner-amendment-workflow-run-merge-group-context.mjs` | Reviewed base 93 |
| `src/owner-amendment.mjs` | `src/owner-amendment/owner-amendment.mts` | `dist/owner-amendment.mjs` | Reviewed base 93 |
| `src/owner-decision-addition.mjs` | `src/owner-addition/owner-decision-addition.mts` | `dist/owner-decision-addition.mjs` | Reviewed base 93 |
| `src/preflight-authority-set-review.mjs` | `src/authority-validation/preflight-authority-set-review.mts` | `dist/preflight-authority-set-review.mjs` | Reviewed base 93 |
| `src/prepare-authority-set.mjs` | `src/authority-validation/prepare-authority-set.mts` | `dist/prepare-authority-set.mjs` | Reviewed base 93 |
| `src/prepare-legacy-ci-authority.mjs` | `src/ci-review/legacy-ci-authority-preparer.mts` | `dist/prepare-legacy-ci-authority.mjs` | Final three #587 |
| `src/prepare-review-context.mjs` | `src/review-inputs/prepare-review-context.mts` | `dist/prepare-review-context.mjs` | Reviewed base 93 |
| `src/prepare-review-file-context.mjs` | `src/review-inputs/prepare-review-file-context.mts` | `dist/prepare-review-file-context.mjs` | Reviewed base 93 |
| `src/prepared-ci-decision.mjs` | `src/ci-review/prepared-ci-decision.mts` | `dist/prepared-ci-decision.mjs` | Reviewed base 93 |
| `src/prepared-gemini-ci-review.mjs` | `src/gemini-cli/prepared-gemini-ci-review.mts` | `dist/prepared-gemini-ci-review.mjs` | Reviewed base 93 |
| `src/preview-lifecycle.mjs` | `src/preview-lifecycle-runtime.mts` | `dist/preview-lifecycle.mjs` | Reviewed base 93 |
| `src/resolve-ci-policy.mjs` | `src/authority-validation/resolve-ci-policy.mts` | `dist/resolve-ci-policy.mjs` | Reviewed base 93 |
| `src/review-contract.mjs` | `src/review-contract/review-contract.mts` | `dist/review-contract.mjs` | Reviewed base 93 |
| `src/review-input-path.mjs` | `src/review-inputs/review-input-path.mts` | `dist/review-input-path.mjs` | Reviewed base 93 |
| `src/review-security-proxy.mjs` | `src/review-inputs/review-security-proxy.mts` | `dist/review-security-proxy.mjs` | Reviewed base 93 |
| `src/runner-temp-path.mjs` | `src/runner-paths/runner-temp-path.mts` | `dist/runner-temp-path.mjs` | Reviewed base 93 |
| `src/validate-authority-set-decision.mjs` | `src/authority-validation/validate-authority-set-decision.mts` | `dist/validate-authority-set-decision.mjs` | Reviewed base 93 |
| `src/validate-decision.mjs` | `src/authority-validation/validate-decision.mts` | `dist/validate-decision.mjs` | Reviewed base 93 |
| `src/verify-legacy-validation-selection.mjs` | `src/ci-review/verify-legacy-validation-selection.mts` | `dist/verify-legacy-validation-selection.mjs` | Reviewed base 93 |
