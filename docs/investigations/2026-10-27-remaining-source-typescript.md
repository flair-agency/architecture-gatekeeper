# Remaining authored-source TypeScript migration (#649)

Implementation baseline: `bd34451f10d9b6dd113fe30d78c62e0c6756a8e4` (v0.6.0).
The tracked baseline contains 85 `.mts` and 73 `.mjs` production sources.
This inventory covers all 73 remaining JavaScript files, separately from the
historical original96 inventory. It establishes no architecture or acceptance rule.

Every migrated basename below moves from `src/<name>.mjs` to
`src/<name>.mts`, retaining `dist/<name>.mjs`. “Facade” means the baseline AST
contains import/export statements only; the CLI/native category includes thin
wrappers with direct-run guards or native I/O. Callers show representative
actual source/test/script references at that baseline; package bins/exports and
workflow runtime calls use the retained emitted path. Source references are
updated to their physical `.mts` targets.

| Basename | Disposition | Representative callers at baseline |
| --- | --- | --- |
| `authority-set` | migrate facade | `scripts/issue83-block-record-probe.mjs`, `scripts/issue83-offline-block-verifier.mjs`, `scripts/issue83-real-pr-block-probe.mjs` |
| `ci-decision-kind` | migrate CLI/native | `test/ci-decision-kind.test.mjs`, `test/measurement-ci-validation-outcomes.test.mjs` |
| `ci-enforced-acceptance` | migrate CLI/native | `test/ci-enforced-acceptance.test.mjs`, `test/ci-execution-composition.test.mjs`, `test/ci-report.test.mjs` |
| `ci-execution-observation` | migrate CLI/native | `test/ci-execution-composition.test.mjs`, `test/ci-execution-observation.test.mjs` |
| `ci-execution-result` | migrate facade | `src/complete-prepared-ci-review.mjs`, `test/ci-execution-result.test.mjs` |
| `ci-procedural-acceptance` | migrate CLI/native | `test/ci-execution-composition.test.mjs`, `test/ci-procedural-acceptance-types.test.mjs`, `test/ci-procedural-authority-change.test.mjs` |
| `ci-procedural-authority-change` | migrate CLI/native | `test/ci-procedural-authority-change.test.mjs`, `test/fixtures/ci-procedural-authority-change-contract/positive.mts` |
| `ci-report` | migrate CLI/native | `src/ci-review/codex-pass-producer.mts`, `src/ordinary-gemini-ci-workflow.mts`, `test/ci-authority-route.test.mjs` |
| `ci-self-authority-change` | migrate CLI/native | `test/ci-self-authority-change.test.mjs` |
| `codex-transport` | migrate facade | `test/codex-transport-runtime.test.mjs`, `test/fixtures/codex-transport-contract/negative.mts`, `test/fixtures/codex-transport-contract/positive.mts` |
| `complete-prepared-ci-review` | migrate implementation | `src/prepared-gemini-ci-decision.mjs`, `test/gemini-ci-ordinary-composition.test.mjs`, `test/prepared-gemini-ci-review.test.mjs` |
| `gemini-ci-runner` | migrate CLI/native | `test/gemini-ci-runner.test.mjs` |
| `gemini-ci-runtime` | migrate implementation | `src/ordinary-gemini-ci-adapter.mjs`, `src/ordinary-gemini-ci-launcher.mts`, `test/gemini-ci-runtime.test.mjs` |
| `gemini-cli-process` | migrate facade | `src/prepare-gemini-ci-input.mjs`, `test/fixtures/gemini-cli-process-contract/negative.mts`, `test/fixtures/gemini-cli-process-contract/positive.mts` |
| `gemini-cli-proxy-session` | migrate facade | `test/fixtures/gemini-cli-proxy-session-contract/positive.mts`, `test/fixtures/prepared-gemini-ci-review-contract/positive.mts`, `test/gemini-cli-proxy-session.test.mjs` |
| `gemini-cli-response` | migrate facade | `test/fixtures/gemini-cli-response-contract/negative.mts`, `test/fixtures/gemini-cli-response-contract/positive.mts`, `test/gemini-cli-response.test.mjs` |
| `gemini-cli-session` | migrate facade | `test/fixtures/gemini-cli-session-contract/positive.mts`, `test/gemini-cli-session.test.mjs` |
| `gemini-launcher` | migrate CLI/native | `test/fixtures/gemini-supervision.mjs`, `test/gemini-launcher.test.mjs` |
| `gemini-security-proxy` | migrate facade | `src/gemini-cli/gemini-cli-proxy-session.mts`, `src/gemini-cli/launcher-entrypoint.mts`, `test/gemini-security-proxy-full-types.test.mjs` |
| `gemini-transport` | migrate facade | `src/gemini-cli/ci-runner-entrypoint.mts`, `src/gemini-cli/launcher-entrypoint.mts`, `src/review-contract/review-contract.mts` |
| `github-associated-repository` | migrate facade | `test/fixtures/github-leaf-contract/negative.mts`, `test/fixtures/github-leaf-contract/positive.mts`, `test/github-leaf-runtime.test.mjs` |
| `github-authority-source` | migrate facade | `src/authority-validation/prepare-authority-set.mts`, `src/ordinary-gemini-ci-adapter.mjs`, `src/owner-addition/owner-addition-multiauthority.mts` |
| `github-cli-runner` | migrate facade | `test/fixtures/github-leaf-contract/negative.mts`, `test/fixtures/github-leaf-contract/positive.mts`, `test/github-leaf-runtime.test.mjs` |
| `github-owner-addition-provenance` | migrate facade | `src/owner-addition/finalize-owner-addition.mts`, `test/fixtures/github-owner-addition-provenance-contract/negative.mts`, `test/fixtures/github-owner-addition-provenance-contract/positive.mts` |
| `github-owner-addition-readback` | migrate facade | `src/owner-addition/finalize-owner-addition.mts`, `test/fixtures/github-owner-addition-readback-contract/positive.mts`, `test/github-owner-addition-readback.test.mjs` |
| `github-runner-env` | migrate CLI/native | `src/ci-review/ci-report-entrypoint.mts`, `src/runner-paths/runner-temp-path.mts`, `test/fixtures/github-runner-env-contract/negative.mts` |
| `github-runner-workspace` | migrate CLI/native | `src/ci-review/legacy-ci-authority-preparer.mts`, `src/owner-addition-ci.mjs`, `src/review-inputs/materialize-regular-git-snapshot.mts` |
| `json-schema` | migrate facade | `scripts/issue83-block-record-probe.mjs`, `scripts/issue83-real-pr-block-probe.mjs`, `src/ci-review/codex-pass-producer.mts` |
| `legacy-git-snapshot` | migrate facade | `src/ci-review/legacy-ci-authority-preparer.mts`, `src/measurement.mts`, `src/review-inputs/materialize-regular-git-snapshot.mts` |
| `local-gate` | migrate CLI/native | `src/local-review/manual-review.mts`, `test/fixtures/local-gate-contract/negative.mts`, `test/fixtures/local-gate-contract/positive.mts` |
| `local-post-tool-screen` | migrate facade | `src/local-gate.mjs`, `test/fixtures/local-post-tool-screen-contract/positive.mts`, `test/measurement-adapter-isolation.test.mjs` |
| `local-reviewer-execution` | migrate facade | `test/fixtures/local-reviewer-execution-contract/negative.mts`, `test/fixtures/local-reviewer-execution-contract/positive.mts`, `test/local-reviewer-execution.test.mjs` |
| `manual-review` | migrate facade | `test/local.test.mjs` |
| `materialize-regular-git-snapshot` | migrate CLI/native | `test/fixtures/materialize-regular-git-snapshot-contract/negative.mts`, `test/fixtures/materialize-regular-git-snapshot-contract/positive.mts`, `test/fixtures/materialize-regular-git-snapshot-migration-contract/negative.mts` |
| `materialize-review-workspace` | migrate facade | `test/fixtures/workspace-helper-contract/flat-negative.mts`, `test/fixtures/workspace-helper-contract/flat-positive.mts`, `test/materialize-review-workspace.test.mjs` |
| `multi-authority-provenance` | migrate facade | `src/authority-validation/validate-authority-set-decision.mts`, `src/ci-review/ci-report-entrypoint.mts`, `src/github/github-owner-addition-provenance.mts` |
| `native-review` | migrate CLI/native | `test/fixtures/native-review-cli-contract/negative.mts`, `test/fixtures/native-review-cli-contract/positive.mts`, `test/local.test.mjs` |
| `native-session-paths` | migrate CLI/native | `src/local-review/native-review.mts`, `test/native-session-paths.test.mjs` |
| `ordinary-gemini-ci-adapter` | migrate implementation | `src/ordinary-gemini-ci-launcher.mts`, `test/ordinary-gemini-ci-adapter.test.mjs` |
| `owner-addition-adoption` | migrate facade | `test/addition-procedure-types.test.mjs`, `test/fixtures/owner-decision-addition-contract/negative.mts`, `test/fixtures/owner-decision-addition-contract/positive.mts` |
| `owner-addition-ci` | migrate CLI/native | `test/fixtures/owner-addition-cli-contract/positive.mts`, `test/owner-addition-ci.test.mjs`, `test/owner-addition-cli-types.test.mjs` |
| `owner-addition-finalize` | migrate CLI/native | `test/fixtures/owner-addition-finalizer-contract/negative.mts`, `test/fixtures/owner-addition-finalizer-contract/positive.mts`, `test/owner-addition-finalize-composition.test.mjs` |
| `owner-addition-multiauthority` | migrate facade | `test/fixtures/owner-addition-cli-contract/negative.mts`, `test/fixtures/owner-addition-cli-contract/positive.mts`, `test/fixtures/owner-addition-multiauthority-eligibility-contract/negative.mts` |
| `owner-addition-validation` | migrate facade | `src/owner-addition-ci.mjs`, `src/owner-addition/multi-authority-eligibility.mts`, `src/owner-addition/owner-addition-ci-operations.mts` |
| `owner-decision-addition` | migrate facade | `src/owner-addition/finalize-owner-addition.mts`, `src/owner-addition/owner-addition-ci-operations.mts`, `src/owner-addition/owner-addition-multiauthority.mts` |
| `pr-description-completeness` | remove (unused) | No source, workflow, test, script or package caller |
| `preflight-authority-set-review` | migrate CLI/native | `scripts/review-capacity.mjs`, `src/ci-review/prepared-ci-decision.mts`, `src/owner-addition/owner-addition-multiauthority.mts` |
| `prepare-authority-set` | migrate CLI/native | `scripts/review-capacity.mjs`, `src/ci-review/self-amendment-pr.mts`, `src/owner-addition/owner-addition-multiauthority.mts` |
| `prepare-gemini-ci-input` | migrate implementation | `src/ordinary-gemini-ci-adapter.mjs`, `src/prepare-gemini-ci-verification-input.mjs`, `test/prepare-gemini-ci-verification-input.test.mjs` |
| `prepare-gemini-ci-verification-input` | migrate facade | `test/ci-execution-composition.test.mjs`, `test/prepare-gemini-ci-verification-input.test.mjs` |
| `prepare-legacy-ci-authority` | migrate CLI/native | `src/ci-review/codex-pass-producer.mts`, `test/fixtures/legacy-authority-decision-contract/negative.mts`, `test/fixtures/legacy-authority-decision-contract/positive.mts` |
| `prepare-protected-ci-input` | migrate implementation | `src/prepare-gemini-ci-input.mjs`, `test/prepare-gemini-ci-verification-input.test.mjs` |
| `prepare-review-context` | migrate CLI/native | `test/fixtures/review-context-contract/positive.mts`, `test/prepare-review-context.test.mjs` |
| `prepare-review-file-context` | migrate facade | `src/prepare-protected-ci-input.mjs`, `test/prepare-review-file-context.test.mjs`, `test/prepared-gemini-ci-review.test.mjs` |
| `prepared-ci-decision` | migrate facade | `src/complete-prepared-ci-review.mjs`, `test/fixtures/prepared-ci-decision-contract/negative.mts`, `test/fixtures/prepared-ci-decision-contract/positive.mts` |
| `prepared-gemini-ci-call` | migrate implementation | `src/ordinary-gemini-ci-adapter.mjs`, `test/prepare-gemini-ci-verification-input.test.mjs` |
| `prepared-gemini-ci-decision` | migrate implementation | `src/prepared-gemini-ci-profile-decision.mjs`, `test/prepared-gemini-ci-review.test.mjs` |
| `prepared-gemini-ci-profile-decision` | migrate implementation | `src/ordinary-gemini-ci-adapter.mjs`, `src/prepared-gemini-ci-verification.mjs`, `test/prepare-gemini-ci-verification-input.test.mjs` |
| `prepared-gemini-ci-review` | migrate facade | `src/prepare-gemini-ci-input.mjs`, `src/prepared-gemini-ci-call.mjs`, `src/prepared-gemini-ci-decision.mjs` |
| `prepared-gemini-ci-verification` | migrate facade | `test/prepared-gemini-ci-review.test.mjs` |
| `prepared-review-data` | migrate implementation | `src/gemini-cli/prepared-gemini-ci-review.mts`, `src/ordinary-gemini-ci-adapter.mjs`, `src/prepare-gemini-ci-input.mjs` |
| `preview-lifecycle` | migrate facade | `src/preview-lifecycle-cli.mts`, `test/fixtures/preview-lifecycle-contract/negative.mts`, `test/fixtures/preview-lifecycle-contract/positive.mts` |
| `resolve-ci-policy` | migrate CLI/native | `scripts/issue83-offline-block-verifier.mjs`, `scripts/issue83-real-pr-block-probe.mjs`, `scripts/review-capacity.mjs` |
| `review-contract` | migrate facade | `src/gemini-cli/ci-runner-entrypoint.mts`, `src/local-review/native-review.mts`, `test/adapters.test.mjs` |
| `review-input-path` | migrate facade | `src/gemini-cli/ci-runner-entrypoint.mts`, `src/gemini-cli/launcher-entrypoint.mts`, `src/review-inputs/materialize-regular-git-snapshot.mts` |
| `review-security-proxy` | migrate facade | `test/fixtures/workspace-helper-contract/flat-negative.mts`, `test/fixtures/workspace-helper-contract/flat-positive.mts`, `test/gemini-security-proxy.test.mjs` |
| `runner-temp-path` | migrate facade | `scripts/self-amendment-pr.mjs`, `src/ci-execution/ci-execution-observation.mts`, `src/ci-review/ci-report-entrypoint.mts` |
| `self-amendment-pr` | migrate facade | `scripts/self-amendment-pr.mjs`, `test/self-amendment-pr.test.mjs` |
| `self-pr-context` | migrate facade | `scripts/self-amendment-pr.mjs`, `test/self-pr-context.test.mjs` |
| `validate-authority-set-decision` | migrate CLI/native | `src/ci-review/codex-pass-producer.mts`, `src/ci-review/prepared-ci-decision.mts`, `test/ci-authority-route.test.mjs` |
| `validate-decision` | migrate CLI/native | `scripts/issue83-block-record-probe.mjs`, `scripts/issue83-real-pr-block-probe.mjs`, `src/ci-review/codex-pass-producer.mts` |
| `verify-legacy-validation-selection` | migrate CLI/native | `test/legacy-ci-authority.test.mjs`, `test/verify-legacy-validation-selection-compat.test.mjs` |
| `vertex-verification-reservation` | migrate implementation | `src/prepared-gemini-ci-profile-decision.mjs`, `test/gemini-security-proxy.test.mjs`, `test/vertex-verification-reservation.test.mjs` |

The removal also deletes `src/github/pr-description-completeness.mts`.
Tracked reference inspection found only the two removed files; the active
PR-description workflow uses `scripts/check-pr-description.mjs` and remains
covered by its existing tests. This satisfies the overlapping unused-code
removal in #648 without restoring Queue.

Final production source: 156 `.mts`, zero `.mjs` (72 migrated, one prior typed
unused implementation removed). The existing compiler project includes only
`.mts` and no longer enables `allowJs` or `checkJs: false`. Tests and development
scripts outside `src/` remain JavaScript; `dist/**/*.mjs` is generated.

## Risk and retained verification map

| Invariant / boundary | Retained evidence |
| --- | --- |
| Exact protected selectors, immutable Git snapshots, full authority, malformed/executable input and byte limits | `prepare-gemini-ci-verification-input.test.mjs`, `ordinary-gemini-ci-runtime.test.mjs`, `protected-ci-input-types.test.mjs` |
| One-shot adapter handle, credential checks, runtime reinspection, no fallback or credential inheritance | `ordinary-gemini-ci-adapter.test.mjs`, `prepared-gemini-ci-review.test.mjs`, `ordinary-gemini-adapter-types.test.mjs` |
| Complete/incomplete observations and shared decision validation | `gemini-ci-ordinary-composition.test.mjs`, `prepared-gemini-ci-review.test.mjs` |
| Physical source imports, strict body checking, safe clean/emit and cycles | `typescript-source-imports.test.mjs`, `typescript-build.test.mjs`, `scripts/check-source-cycles.mjs` |
| Source/emitted/installed runtime identity and stale-byte rejection | Existing `preview-*-identity`, `gemini-runner-launcher-preview-identity` and materializer/legacy identity regressions; `test/installed-smoke.mjs` |
| Same dedicated CodeQL barriers and unmodeled negative flows after source renames | The existing three model packs and `scripts/codeql-model-regression.mjs` |
| Optional capacity diagnostic matches actual bounded production preparation | `review-capacity.test.mjs`; fixed predecessor fingerprints preserve the same already-supported format |

Runtime integration cases use Git fixtures, synthetic HTTP/CLI responses and
model-free dispatch. They are not a live provider call or host-enforcement
proof. Exact commands, candidate revisions, results and unresolved hosted checks
belong in the linked PR; test counts alone do not complete #649.
