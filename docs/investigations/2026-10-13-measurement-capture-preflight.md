# Self-CI measurement capture preflight

Issue #537 includes implementation and live evaluation. This preflight checks
collection and recovery; it does not establish pilot effectiveness.

## Trigger and scope

Set repository variable `ARCHITECTURE_GATE_MEASUREMENT=true`, then observe a
new non-Draft, same-repository PR targeting `main`. Changing the variable does
not trigger a run. A rerun retains its original workflow selection; an old run
without the measurement job cannot prove the newly adopted collector works.
Keep the existing protected reviewer, credentials and acceptance policy.

## Evidence to retain

1. Record PR base/head/reviewed revisions and workflow run/attempt identities.
2. Check the optional measurement job after required review/report/accept.
3. Retrieve both `agk-measurement-review-` and `agk-measurement-outcome-`
   artifacts; keep missing or failed captures as gaps.
4. Download through the GitHub connector, then use its returned Sediment file ID
   to obtain the ZIP in Cloud. Keep temporary signed URLs out of stored evidence.
5. Check archive paths and byte limits, validate the JSON with the pinned
   measurement runtime, and retain only the production whitelist export.
6. Archive the export with its public run/attempt/artifact inventory and verify
   the stored bytes by reading them back before artifact expiry.

Keep a deliberately triggered preflight in a fixture cohort, separate from
naturally occurring changes and the pilot's population rates. Successful
artifact transport using another CI artifact does not verify measurement
record capture. Current CI exports do not retain full findings, reviewer
execution or feedback delivery; unavailable facts remain unknown.

See [measurement boundaries and aggregation](../measurement.md) and the
[public pilot plan](https://github.com/flair-agency/architecture-gatekeeper/blob/pilot/537-evidence-20261013/pilot-evidence/537/plan-20261013.json).
