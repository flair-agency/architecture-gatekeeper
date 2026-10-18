# #254 child-CLI selector rejection coverage

Baseline: adopted main `fc9014c28af9498e1191f75fe7d8008bafea9dc4`, including
#603 and #610. This is partial #254 delivery; no production or policy change.

The existing route-composition test already executes the production merge-group
CLI with the same synthetic, valid fixture for both supported amendment
profiles. Selector rejection was covered at the component boundary, while the
child trace covered downstream artifact, receipt, and runtime failures. This
increment adds two representative selector mismatches to that child trace:
merge-group/B tree disagreement and a GraphQL queue head that differs from B.

Each case checks the production diagnostic, exit status 1, empty stdout and
`GITHUB_OUTPUT`, absence of semantic preparation and producer/artifact calls,
and the exact API requests made before selection failed. The response snapshot
is restored after both cases; the existing child trace then retains its valid
pre-transition replay. GitHub API/GraphQL responses, `gh`, artifacts, and
attestation observations remain synthetic. This does not establish live
selection, authentication, protected queue behavior, or adoption. Existing
component tests continue to own the broader wrong-tree and queue-binding
matrices.

Useful isolated negative-control spots are the tree comparison in
`src/owner-amendment/owner-amendment-merge-group-b-context.mts` and the queue
head binding in the same selector. A temporary isolated copy that removes
either comparison should make its corresponding child case fail; production
source is not changed by this increment.
