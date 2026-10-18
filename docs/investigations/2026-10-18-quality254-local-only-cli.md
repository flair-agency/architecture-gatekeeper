# #254 protected local-only child-CLI coverage

The production merge-group CLI had child-process coverage for enforced-base
G0 amendment selection and enforced-base ordinary dispatch, but not for its
protected current-base `local-only` return. The route-composition test now uses
the existing Git/API child harness with a valid committed `main: local-only`
base policy and an enforced G0 policy on candidate B. The test uses the
production parser/resolver on both policies read from Git to verify these
preconditions. The child selects the exact merge-group B, reads protected-base
policy, and returns
`route=not-applicable` from the protected base policy.

The test checks the exact local-only stdout and `GITHUB_OUTPUT` base/B values,
and requires the API trace to contain only the existing selector requests. It
also checks that no eligibility directory or `gh` work appears. GitHub API
responses remain synthetic; no live host policy or acceptance behavior is
established. An isolated negative control can change the local-only branch in
`scripts/owner-amendment-merge-group-gate.mjs` to fail to return; the new child
oracle should then reject the missing not-applicable result.
