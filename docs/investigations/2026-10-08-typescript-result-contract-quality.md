# Typed CI execution result states (#419 / #417)

Nonnormative second implementation slice under #412, based on foundation
`c76cac691043cb4c3c13182338ee1e83b145d135`. It changes no selected authority,
consumer setting, credential interface, evidence meaning or acceptance rule.

## Boundary and type benefit

`ci-execution-result.mjs` keeps its existing flat `normalizeCiExecutionResult`
export while authored `.mts` and generated runtime move under `ci-execution/`.
Completed execution requires host-observed success, available bounded output
and response bytes. Incomplete results expose no success-only bytes. This is an
execution observation, not a semantic decision, verified evidence or acceptance.
The owning normalizer supplies explicit JSON-selection, raw-output observation
and discriminated result contracts; no new adapter framework or callback is added.

Incoming values remain unknown. The lossless settings snapshot retains the
original proxy/accessor rejection, descriptor inspection, dense-array validation,
node/depth/size bounds, prototype-free clone and original errors/check order.
Raw output remains bytes without interpretation; expected settings are cloned.

The accepted outer JavaScript envelope can have a changing hostStepOutcome
accessor: the original code reads once for membership and again for the selected
value. Preserve both reads rather than silently changing behavior during typing.
An incomplete observation therefore declares its general outcome unknown; the
completed branch refines success/available from the actual equality conditions.
Tests retain second-read failure, unexpected string and object values. Static
contracts do not promise a closed outcome union that runtime input cannot prove.

Compile-negative fixtures use the actual adopted tsconfig and reject unexpected
nonfixture diagnostics. Exact diagnostic codes/locations check access to bytes
without status narrowing, missing completed bytes, extra incomplete bytes and
assigning an unknown incomplete outcome to a known failure literal. Positive
fixtures check narrowing to completed bytes and success/available observations.
Sync/async callback contracts remain with their later actual owning modules.

## Build and compatibility evidence

The fixed output map adds only this generated peer. Managed output directories
are derived from the explicit map; both folders retain missing/stale/extra/path
checks. Independent fixtures isolate the second folder, assert the offending
path, preserve both mapped outputs on errors, and prove symlink/hardlink targets
are not changed. Restoring each earlier negative fixture prevents an unrelated
failure from masking the intended second-folder check.

- Clean locked install and strict/output check pass; actual graph scan covers
  98 runtime + 2 authored modules without cycles. These are 96 original paths
  plus two generated files, not 98 completed migrations.
- Focused result/observer/composition/prepared-Gemini/build/graph/type suites:
  **63/63 pass**. Independent focused build/contract/runtime review: **17/17
  pass**, no remaining actionable findings. `git diff --check` passes.
- Worker compared the generated normalizer with the actual foundation Git blob
  on 13 cases (available/failure/missing/unsupported/oversized/multibyte/invalid
  bound/lossy settings/getters/proxy), plus changing-accessor behavior. Outputs,
  errors and observed reads match; this is selected differential evidence, not
  proof over every JavaScript object or a replacement for runtime regressions.
  Coordinator independently compared 16 selected output/error cases against that
  same Git blob, including all three changing getter values; all matched.
- Full source `npm test`: **1203/1203 pass**, no failures/cancellations/skips,
  **154.039 seconds**. No existing case or deadline was removed/weakened.
- Source-only generated normalizer coverage from existing result/actual observer
  CLI tests: **28/28 pass**, 97.28% lines, 97.96% branches, 100% functions, with
  `--test-coverage-include='src/ci-execution/ci-execution-result.mjs'`.
  Those percentages identify this executed runtime scope, not a completion goal.
- Actual archive includes both flat and byte-identical grouped generated files
  (118 files). Clean offline install runs without TypeScript/Node declarations/
  Acorn/YAML; installed production/observer checks **84/84 pass**, transport
  deadline checks **2/2 pass**. Test-only fixtures are supplied separately.
  The complete smoke initially reached its unchanged 120-second bound in the
  unrelated installed preview API suite during concurrent source tests. An
  isolated repeat also reached the same bound; both attempts retained all cases
  and the original deadline. This local distribution limitation remains open.
  The preceding foundation slice's full installed smoke passed; that historical
  result does not replace the current slice's required hosted/package checks.
- Native architecture review of the final committed candidate is pending.
  Hosted main-target CI/CodeQL/protected acceptance remain pending sequential
  integration. Local typing and review do not establish those host results.

## Remaining scope

Across the first and second slices, **2/96 original modules** are migrated;
**94 original modules** remain, including callback contracts and executable
runner/resource extraction prerequisites. #417/#419/#418 remain open. The
foundation record describes the preceding 1/96 slice; this record updates the
combined inventory without rewriting historical observations.
