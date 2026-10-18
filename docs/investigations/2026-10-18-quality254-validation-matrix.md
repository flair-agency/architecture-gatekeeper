# #254 validation outcome matrix fixture cost

The validation matrix covers all 32 selected-stage masks and 240 terminal
outcomes. Each `finishAttempt` still calls the real CI collector and reloads
records through `loadMeasurementDirectory`. Previously every mask shared one
directory, so each reload parsed records from earlier, independent masks.

The test now gives each mask a private records directory beneath the existing
fixture parent. All attempts and their start/prepared/terminal history remain
together within that mask, and assertions still inspect the real terminal
result. The fixed decision bytes and `GITHUB_OUTPUT` path remain shared; each
mask's environment explicitly overrides `AGK_MEASUREMENT_DIR`, so the original
fixture directory is not accidentally reused. The existing single fixture
continues to own environment restoration and recursive cleanup.

After all outcomes, exclusive copies of the actual record files are collected
in the original directory and read once with the real loader. This retains
the complete mixed-history observation: zero gaps and 240 terminal records
(32 completed, 176 incomplete, 32 cancelled), without repeated cross-mask
scans. Existing directory-entry and byte-budget regressions remain unchanged.

Inspection found no assertion or lookup that depends on records from another
mask: each case selects its terminal record by the newly returned attempt ID,
and its outcome depends on that mask's selected stages and review result. This
is fixture partitioning for cost; it retains the outcome coverage and changes no
production collector or loader behavior. Paired runtime and outcome-equivalence
controls are owned by the coordinator; no timing result is claimed here.
