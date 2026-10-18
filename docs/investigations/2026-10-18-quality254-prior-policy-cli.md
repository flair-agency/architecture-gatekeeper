# #254 production CLI test for previous-base amendment opt-in

This test-only increment covers one production-composition gap: the protected
merge-group child CLI must not honor an OWNER_AMENDMENT profile introduced by
candidate B when the protected base did not select it. The selected authorities
require the previous protected-base policy to choose the trigger profile and
scope; B cannot self-authorize (`docs/architecture/owner-amendment.md:54-66`).

For both existing profiles, the test reuses the route-composition suite's
isolated Git builder and controlled API fixture. The protected base is an
otherwise valid enforced policy with no `ownerAmendment`; B adds one existing,
valid profile field. The test verifies these exact base/B policy bytes, checks
that the child runs at the protected base, then executes the actual
`scripts/owner-amendment-merge-group-gate.mjs` main. It requires the existing
ordinary-route stdout and exact `GITHUB_OUTPUT` base/B tuple, no eligibility
preparation directory, and only the merge-group context API reads. The shim
rejects any producer/tag/artifact request; a `gh` stub records and rejects
attestation or other CLI work. Git uses a private config, local fixture origin,
protocol allow-list, and a finite 30-second child bound. Temporary state is
removed in `finally`.

The existing verifier-level `fails closed on absent prior opt-in and leaves
profile selection disabled by default` test remains. Existing production child
cases with a profile selected by the protected base also remain unchanged.
This test establishes the previous-base policy binding at the child CLI for
controlled fixtures only. It does not establish semantic PASS, acceptance,
canonical placement, live producer provenance, host enforcement, or route
activation.

## Detection and verification

The two new registrations retain the existing eight. At source candidate
`4ce1d4b74c384b2b2f0f670b161fc8774c87afbb`, Node `v22.23.3` ran
`node --test --test-concurrency=1 test/owner-amendment-merge-group-route-composition.test.mjs`
in an isolated copy: 10/10 passed, no failures, skips or cancellations, in
16.956 seconds. The two new cases also passed as a focused selection in
0.673 seconds with the parsed-policy preconditions included.

In a second isolated run, changing only the production main's policy read
from `selection.bBaseSha` to `selection.bHeadSha` left the previous eight
registrations passing, while both new profile cases failed on an unexpected
producer-workflow API request. This demonstrates detection of candidate-policy
selection that the retained eight cases did not catch. The 17.003-second
control completed within its bound and its temporary copy was removed.
Repository production files were unchanged. The delivery PR records final
revision-bound strict, full-suite, package, CodeQL, review and protected
acceptance results separately from these local observations.
