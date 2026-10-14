# Original 96-module TypeScript implementation inventory — 2026-10-14

This non-normative inventory audits the original 96 production modules from the reviewed #419 map. Runtime source at `9be87f134403e5755d0b450df13d73054a00df81` composes the remaining nine typed implementations. All 96 original flat paths bind an actual authored `.mts` implementation; this table records those bindings, rather than counting extensions, new helpers or PRs.

Adopted base `f893fcbc393b11ec43ceb96220d508c050736fd7` contains **87/96** migrated originals. This combined candidate implements **96/96**, but the nine originals remain unadopted. Full/cumulative distribution, Native review and fresh hosted acceptance are still required. The three CLI relocations have 24 moved CodeQL result identities and a failing hosted CodeQL check in Draft #587; no alert dismissal, model expansion, bypass or adoption is inferred.

The final nine originals are `materialize-regular-git-snapshot`, `prepare-legacy-ci-authority`, `owner-addition-ci`, `owner-addition-multiauthority`, `gemini-transport`, `gemini-security-proxy`, `gemini-ci-runner`, `gemini-launcher`, and `preview-lifecycle`. The owner explicitly transferred the five Gemini/preview modules to this coordinator. New ordinary-Gemini and measurement modules are outside the fixed original denominator.

## Coverage and retained boundaries

Implementation and CLI operations move into typed leaves while flat compatibility exports and direct-run conditions retain their callers. Previously adopted thin command adapters and the original GitHub output source wrapper retain their selected paths. Their native I/O does not become authenticated merely because a delegated implementation is typed. Compiler settings remain strict; external JSON and changing observations remain unknown, and existing runtime validation remains responsible for their usable shape.

Complete source/emitted operation pins retain the original bodies. The two final intentional runtime differences are the launcher child-path relocation to the original flat runner and the owner-authorized materializer CLI path guard. Actual source/emitted default child execution verifies the former. The materializer reuses `resolveSafePath` after resolving cwd-relative input, preserving workflow temporary destinations and its original public descriptor/Buffer/URL API. Hardlinks and post-validation parent replacement remain demonstrated limits; this supplies no destination custody or race resistance.

The preview implementation stays in the same flat directory as `preview-lifecycle-runtime.mts`; its compatibility path remains `preview-lifecycle.mjs`. The original package-relative lookup and runtime identity inventory retain that directory anchor. Dedicated source/emitted byte mutations cover every new implementation, reject stale requests and receipts, and validate fresh tuples. Synthetic flat predecessor tests restore actual complete bodies and separately bound helper copies before deleting grouped modules.

CodeQL fixture analysis keeps up to 100 explanations under the unchanged official query, threat model and three selected model packs. All prior positive and negative assertions remain, including generic API and explicitly injected paths. The larger explanation cap prevents a retained materializer route from disappearing from SARIF's default four selected explanations. It does not change detection or model semantics. The materializer's CLI destination finding is removed by the existing runtime path guard; its generic API destination remains unmodeled in both fixture runs. The other CLI alerts retain their generic sources through new typed locations and are not claimed identical fingerprints or removed risk.

## Original implementation bindings

Multiple paths identify existing cooperating leaves; they do not add originals. Each listed implementation exists in the audited source tree and is included in the actual strict build. The preserved public/runtime flat path is the original basename under emitted `dist/`.

| Original flat source | Authored implementation bindings | Emitted flat compatibility path |
|---|---|---|
| `src/authority-set.mjs` | `src/authority-validation/authority-set.mts` | `dist/authority-set.mjs` |
| `src/ci-decision-kind.mjs` | `src/ci-review/ci-decision-kind.mts` | `dist/ci-decision-kind.mjs` |
| `src/ci-enforced-acceptance.mjs` | `src/ci-review/ci-enforced-acceptance.mts` | `dist/ci-enforced-acceptance.mjs` |
| `src/ci-execution-observation.mjs` | `src/ci-execution/ci-execution-observation.mts` | `dist/ci-execution-observation.mjs` |
| `src/ci-execution-result.mjs` | `src/ci-execution/ci-execution-result.mts` | `dist/ci-execution-result.mjs` |
| `src/ci-procedural-acceptance.mjs` | `src/ci-review/ci-procedural-acceptance.mts` | `dist/ci-procedural-acceptance.mjs` |
| `src/ci-procedural-authority-change.mjs` | `src/ci-review/ci-procedural-authority-change.mts` | `dist/ci-procedural-authority-change.mjs` |
| `src/ci-report.mjs` | `src/ci-review/ci-report-entrypoint.mts` | `dist/ci-report.mjs` |
| `src/codex-transport.mjs` | `src/reviewer-transports/codex-transport.mts` | `dist/codex-transport.mjs` |
| `src/gemini-ci-runner.mjs` | `src/gemini-cli/ci-runner-entrypoint.mts` | `dist/gemini-ci-runner.mjs` |
| `src/gemini-cli-process.mjs` | `src/gemini-cli/gemini-cli-process.mts` | `dist/gemini-cli-process.mjs` |
| `src/gemini-cli-proxy-session.mjs` | `src/gemini-cli/gemini-cli-proxy-session.mts` | `dist/gemini-cli-proxy-session.mjs` |
| `src/gemini-cli-response.mjs` | `src/gemini-cli/gemini-cli-response.mts` | `dist/gemini-cli-response.mjs` |
| `src/gemini-cli-session.mjs` | `src/gemini-cli/gemini-cli-session.mts` | `dist/gemini-cli-session.mjs` |
| `src/gemini-launcher.mjs` | `src/gemini-cli/launcher-entrypoint.mts` | `dist/gemini-launcher.mjs` |
| `src/gemini-security-proxy.mjs` | `src/gemini-cli/gemini-security-proxy.mts` | `dist/gemini-security-proxy.mjs` |
| `src/gemini-transport.mjs` | `src/reviewer-transports/gemini-transport.mts` | `dist/gemini-transport.mjs` |
| `src/github-app-check-reporter.mjs` | `src/github/github-app-check-reporter.mts` | `dist/github-app-check-reporter.mjs` |
| `src/github-associated-repository.mjs` | `src/github/github-associated-repository.mts` | `dist/github-associated-repository.mjs` |
| `src/github-authority-source.mjs` | `src/github/github-authority-source.mts` | `dist/github-authority-source.mjs` |
| `src/github-cli-runner.mjs` | `src/github/github-cli-runner.mts` | `dist/github-cli-runner.mjs` |
| `src/github-merge-group-event.mjs` | `src/github/github-merge-group-event.mts` | `dist/github-merge-group-event.mjs` |
| `src/github-owner-addition-provenance.mjs` | `src/github/github-owner-addition-provenance.mts` | `dist/github-owner-addition-provenance.mjs` |
| `src/github-owner-addition-readback.mjs` | `src/github/github-owner-addition-readback.mts` | `dist/github-owner-addition-readback.mjs` |
| `src/github-owner-amendment-readback.mjs` | `src/github/github-owner-amendment-readback.mts` | `dist/github-owner-amendment-readback.mjs` |
| `src/github-ruleset-readback-cli.mjs` | `src/github/github-ruleset-readback-cli.mts` | `dist/github-ruleset-readback-cli.mjs` |
| `src/github-ruleset-readback.mjs` | `src/github/github-ruleset-readback.mts` | `dist/github-ruleset-readback.mjs` |
| `src/github-runner-env.mjs` | `src/github/github-runner-env.mts` | `dist/github-runner-env.mjs` |
| `src/json-schema.mjs` | `src/authority-validation/json-schema.mts` | `dist/json-schema.mjs` |
| `src/legacy-git-snapshot.mjs` | `src/authority-validation/legacy-git-snapshot.mts` | `dist/legacy-git-snapshot.mjs` |
| `src/local-gate.mjs` | `src/local-review/local-gate.mts` | `dist/local-gate.mjs` |
| `src/local-post-tool-screen.mjs` | `src/local-review/local-post-tool-screen.mts` | `dist/local-post-tool-screen.mjs` |
| `src/local-reviewer-execution.mjs` | `src/reviewer-transports/local-reviewer-execution.mts` | `dist/local-reviewer-execution.mjs` |
| `src/manual-review.mjs` | `src/local-review/manual-review.mts` | `dist/manual-review.mjs` |
| `src/materialize-regular-git-snapshot.mjs` | `src/review-inputs/materialize-regular-git-snapshot.mts` | `dist/materialize-regular-git-snapshot.mjs` |
| `src/materialize-review-workspace.mjs` | `src/review-inputs/materialize-review-workspace.mts` | `dist/materialize-review-workspace.mjs` |
| `src/multi-authority-provenance.mjs` | `src/authority-validation/multi-authority-provenance.mts` | `dist/multi-authority-provenance.mjs` |
| `src/native-review.mjs` | `src/local-review/native-review.mts` | `dist/native-review.mjs` |
| `src/owner-addition-adoption.mjs` | `src/owner-addition/owner-addition-adoption.mts` | `dist/owner-addition-adoption.mjs` |
| `src/owner-addition-ci.mjs` | `src/owner-addition/owner-addition-ci-operations.mts` | `dist/owner-addition-ci.mjs` |
| `src/owner-addition-finalize.mjs` | `src/owner-addition/finalize-owner-addition.mts` | `dist/owner-addition-finalize.mjs` |
| `src/owner-addition-multiauthority.mjs` | `src/owner-addition/owner-addition-multiauthority.mts` | `dist/owner-addition-multiauthority.mjs` |
| `src/owner-addition-validation.mjs` | `src/owner-addition/owner-addition-validation.mts` | `dist/owner-addition-validation.mjs` |
| `src/owner-amendment-artifact-discovery.mjs` | `src/owner-amendment/owner-amendment-artifact-discovery.mts` | `dist/owner-amendment-artifact-discovery.mjs` |
| `src/owner-amendment-artifact-zip.mjs` | `src/owner-amendment/owner-amendment-artifact-zip.mts` | `dist/owner-amendment-artifact-zip.mjs` |
| `src/owner-amendment-artifact.mjs` | `src/owner-amendment/owner-amendment-artifact.mts` | `dist/owner-amendment-artifact.mjs` |
| `src/owner-amendment-attestation.mjs` | `src/owner-amendment/owner-amendment-attestation.mts` | `dist/owner-amendment-attestation.mjs` |
| `src/owner-amendment-block-context-verifier.mjs` | `src/owner-amendment/owner-amendment-block-context-verifier.mts` | `dist/owner-amendment-block-context-verifier.mjs` |
| `src/owner-amendment-block-evidence-composer.mjs` | `src/owner-amendment/owner-amendment-block-evidence-composer.mts` | `dist/owner-amendment-block-evidence-composer.mjs` |
| `src/owner-amendment-block-handoff-compose.mjs` | `src/owner-amendment/owner-amendment-block-handoff-compose.mts` | `dist/owner-amendment-block-handoff-compose.mjs` |
| `src/owner-amendment-block-handoff-orchestrator.mjs` | `src/owner-amendment/owner-amendment-block-handoff-orchestrator.mts` | `dist/owner-amendment-block-handoff-orchestrator.mjs` |
| `src/owner-amendment-block-handoff.mjs` | `src/owner-amendment/owner-amendment-block-handoff.mts` | `dist/owner-amendment-block-handoff.mjs` |
| `src/owner-amendment-block-record.mjs` | `src/owner-amendment/owner-amendment-block-record.mts` | `dist/owner-amendment-block-record.mjs` |
| `src/owner-amendment-block-semantic-record.mjs` | `src/owner-amendment/owner-amendment-block-semantic-record.mts` | `dist/owner-amendment-block-semantic-record.mjs` |
| `src/owner-amendment-git-changes.mjs` | `src/owner-amendment/owner-amendment-git-changes.mts` | `dist/owner-amendment-git-changes.mjs` |
| `src/owner-amendment-handoff-cli.mjs` | `src/owner-amendment/owner-amendment-handoff-cli.mts` | `dist/owner-amendment-handoff-cli.mjs` |
| `src/owner-amendment-handoff-git-context.mjs` | `src/owner-amendment/owner-amendment-handoff-git-context.mts` | `dist/owner-amendment-handoff-git-context.mjs` |
| `src/owner-amendment-handoff-pr-run-context.mjs` | `src/owner-amendment/owner-amendment-handoff-pr-run-context.mts` | `dist/owner-amendment-handoff-pr-run-context.mjs` |
| `src/owner-amendment-merge-group-acceptance.mjs` | `src/owner-amendment/owner-amendment-merge-group-acceptance.mts` | `dist/owner-amendment-merge-group-acceptance.mjs` |
| `src/owner-amendment-merge-group-b-context.mjs` | `src/owner-amendment/owner-amendment-merge-group-b-context.mts` | `dist/owner-amendment-merge-group-b-context.mjs` |
| `src/owner-amendment-merge-group-block-bridge.mjs` | `src/owner-amendment/owner-amendment-merge-group-block-bridge.mts` | `dist/owner-amendment-merge-group-block-bridge.mjs` |
| `src/owner-amendment-merge-group-evidence.mjs` | `src/owner-amendment/owner-amendment-merge-group-evidence.mts` | `dist/owner-amendment-merge-group-evidence.mjs` |
| `src/owner-amendment-merge-group-ordinary-review.mjs` | `src/owner-amendment/owner-amendment-merge-group-ordinary-review.mts` | `dist/owner-amendment-merge-group-ordinary-review.mjs` |
| `src/owner-amendment-owner-decision-amendment-record.mjs` | `src/owner-amendment/owner-amendment-owner-decision-amendment-record.mts` | `dist/owner-amendment-owner-decision-amendment-record.mjs` |
| `src/owner-amendment-owner-decision-context-verifier.mjs` | `src/owner-amendment/owner-amendment-owner-decision-context-verifier.mts` | `dist/owner-amendment-owner-decision-context-verifier.mjs` |
| `src/owner-amendment-owner-decision-handoff-cli.mjs` | `src/owner-amendment/owner-amendment-owner-decision-handoff-cli.mts` | `dist/owner-amendment-owner-decision-handoff-cli.mjs` |
| `src/owner-amendment-owner-decision-handoff.mjs` | `src/owner-amendment/owner-amendment-owner-decision-handoff.mts` | `dist/owner-amendment-owner-decision-handoff.mjs` |
| `src/owner-amendment-owner-decision-record.mjs` | `src/owner-amendment/owner-amendment-owner-decision-record.mts` | `dist/owner-amendment-owner-decision-record.mjs` |
| `src/owner-amendment-record-builder.mjs` | `src/owner-amendment/owner-amendment-record-builder.mts` | `dist/owner-amendment-record-builder.mjs` |
| `src/owner-amendment-scope.mjs` | `src/owner-amendment/owner-amendment-scope.mts` | `dist/owner-amendment-scope.mjs` |
| `src/owner-amendment-semantic-eligibility.mjs` | `src/owner-amendment/owner-amendment-semantic-eligibility.mts` | `dist/owner-amendment-semantic-eligibility.mjs` |
| `src/owner-amendment-semantic-producer-attempts.mjs` | `src/owner-amendment/owner-amendment-semantic-producer-attempts.mts` | `dist/owner-amendment-semantic-producer-attempts.mjs` |
| `src/owner-amendment-semantic-tag-object.mjs` | `src/owner-amendment/owner-amendment-semantic-tag-object.mts` | `dist/owner-amendment-semantic-tag-object.mjs` |
| `src/owner-amendment-tag-adapter.mjs` | `src/owner-amendment/owner-amendment-tag-adapter.mts` | `dist/owner-amendment-tag-adapter.mjs` |
| `src/owner-amendment-tag-api.mjs` | `src/owner-amendment/owner-amendment-tag-api.mts` | `dist/owner-amendment-tag-api.mjs` |
| `src/owner-amendment-tag-attempt.mjs` | `src/owner-amendment/owner-amendment-tag-attempt.mts` | `dist/owner-amendment-tag-attempt.mjs` |
| `src/owner-amendment-tag-readback.mjs` | `src/owner-amendment/owner-amendment-tag-readback.mts` | `dist/owner-amendment-tag-readback.mjs` |
| `src/owner-amendment-workflow-run-merge-group-context.mjs` | `src/owner-amendment/owner-amendment-workflow-run-merge-group-context.mts` | `dist/owner-amendment-workflow-run-merge-group-context.mjs` |
| `src/owner-amendment.mjs` | `src/owner-amendment/owner-amendment.mts` | `dist/owner-amendment.mjs` |
| `src/owner-decision-addition.mjs` | `src/owner-addition/owner-decision-addition.mts` | `dist/owner-decision-addition.mjs` |
| `src/preflight-authority-set-review.mjs` | `src/authority-validation/preflight-authority-set-review.mts` | `dist/preflight-authority-set-review.mjs` |
| `src/prepare-authority-set.mjs` | `src/authority-validation/prepare-authority-set.mts` | `dist/prepare-authority-set.mjs` |
| `src/prepare-legacy-ci-authority.mjs` | `src/ci-review/legacy-ci-authority-preparer.mts` | `dist/prepare-legacy-ci-authority.mjs` |
| `src/prepare-review-context.mjs` | `src/review-inputs/prepare-review-context.mts` | `dist/prepare-review-context.mjs` |
| `src/prepare-review-file-context.mjs` | `src/review-inputs/prepare-review-file-context.mts` | `dist/prepare-review-file-context.mjs` |
| `src/prepared-ci-decision.mjs` | `src/ci-review/prepared-ci-decision.mts` | `dist/prepared-ci-decision.mjs` |
| `src/prepared-gemini-ci-review.mjs` | `src/gemini-cli/prepared-gemini-ci-review.mts` | `dist/prepared-gemini-ci-review.mjs` |
| `src/preview-lifecycle.mjs` | `src/preview-lifecycle-runtime.mts` | `dist/preview-lifecycle.mjs` |
| `src/resolve-ci-policy.mjs` | `src/authority-validation/resolve-ci-policy.mts` | `dist/resolve-ci-policy.mjs` |
| `src/review-contract.mjs` | `src/review-contract/review-contract.mts` | `dist/review-contract.mjs` |
| `src/review-input-path.mjs` | `src/review-inputs/review-input-path.mts` | `dist/review-input-path.mjs` |
| `src/review-security-proxy.mjs` | `src/review-inputs/review-security-proxy.mts` | `dist/review-security-proxy.mjs` |
| `src/runner-temp-path.mjs` | `src/runner-paths/runner-temp-path.mts` | `dist/runner-temp-path.mjs` |
| `src/validate-authority-set-decision.mjs` | `src/authority-validation/validate-authority-set-decision.mts` | `dist/validate-authority-set-decision.mjs` |
| `src/validate-decision.mjs` | `src/authority-validation/validate-decision.mts` | `dist/validate-decision.mjs` |
| `src/verify-legacy-validation-selection.mjs` | `src/ci-review/verify-legacy-validation-selection.mts` | `dist/verify-legacy-validation-selection.mjs` |
