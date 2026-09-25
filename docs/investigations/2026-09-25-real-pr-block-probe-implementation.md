# Issue #83: real-PR `BLOCK` attestation probe report

Status: **test-only experiment complete** in this public first-user repository. The
protected workflow can authenticate exact historical record bytes, its signer
workflow and revision, and the run attempt for a real PR whose review returned a
validated top-level `BLOCK`. The certificate does not identify the producer
job; the protected workflow's reviewed job sequence supplies that part of the
claim. The record is not a production `ReviewRecord`, and neither this probe nor
the independent test verifier changes `Architecture Gate / accept`, protected
policy, or `OWNER_AMENDMENT / G0` acceptance.

## Scope and implementation

[PR #90](https://github.com/flair-agency/architecture-gatekeeper/pull/90)
defined the experiment. [PR #92](https://github.com/flair-agency/architecture-gatekeeper/pull/92)
merged the dedicated `pull_request_target` workflow and producer into protected
`main` at `82ba4625e9aea877b246f806856beb651e926152`.
The protected `ISSUE83_FIXTURE_PR` Actions variable selected only the non-draft
[fixture PR #94](https://github.com/flair-agency/architecture-gatekeeper/pull/94).
That PR changed five documentation lines to propose accepting an incomplete
architecture review. It was closed without merge, and the variable was deleted
and read back absent after the experiment.

The workflow checks the exact PR base, head and merge parents and requires its
workflow revision to equal the protected base. It reads policy, prompt, schema,
validation rules, manifest and the complete Authority Set from that base. A
read-only review job receives the model credential but no attestation permission.
A separate producer job has OIDC and attestation permission but no model
credential; it independently materializes the Authority Set, consumes only the
current attempt's decision artifact, revalidates the schema, rules and complete
`authorityIds`, and writes a record only for top-level `BLOCK`. The pinned action
integrity check runs before the model job. [PR #95](https://github.com/flair-agency/architecture-gatekeeper/pull/95)
merged a separate, test-only verifier at `46f44f34077721f956e44168d47eb71bf69ef174`;
it returns only `VERIFIED_TEST_ONLY_BLOCK` or `INCOMPLETE`.

## Live real-PR result

The [self Architecture Gate run 36118896983](https://github.com/flair-agency/architecture-gatekeeper/actions/runs/36118896983)
returned top-level `BLOCK` for `architecture-contract`, and its required accept
job failed with `CONCLUSION=BLOCK`. The fixture head was
`572bac9804215729e20bfd8c704d04e56a507f97`, protected base was
`82ba4625e9aea877b246f806856beb651e926152`, and reviewed merge was
`67471f5e635ecb3db5c776f5de40f5367d0bdf50`.

| [Probe run 36118896793](https://github.com/flair-agency/architecture-gatekeeper/actions/runs/36118896793) | Live result | Exact record SHA-256 |
| --- | --- | --- |
| [Attempt 1](https://github.com/flair-agency/architecture-gatekeeper/actions/runs/36118896793/attempts/1) | Integrity, review and producer succeeded; validated top-level `BLOCK` was attested. | `d523ff1945fd93d8de2794d3f4d8bc8c2bf0701aec33385309c544a50abd5a8e` |
| [Attempt 2](https://github.com/flair-agency/architecture-gatekeeper/actions/runs/36118896793/attempts/2) | Full rerun: all three jobs succeeded; a new validated `BLOCK` was attested. | `c542386e65349e42a9f1009ef621ea8dcf99be8e88db8dfe91c6f6335e86bbb3` |
| [Attempt 3](https://github.com/flair-agency/architecture-gatekeeper/actions/runs/36118896793/attempts/3) | Producer-only rerun failed downloading `issue83-real-pr-decision-36118896793-3`; validation, attestation and record upload did not run. | No attempt-3 record. |

Independent readback for attempt 1 matched the exact decision bytes (SHA-256
`24ebc4184d348aa9b16aa6e4adff49d48369a82f2bce3fd6617a019703cd7d02`)
to the transferred artifact and found top-level `BLOCK` with the complete
`architecture-contract` Authority ID. It matched PR base/head, the merge
object's two parents, all five protected input digests, the Authority file
digest, and identical Authority provenance from review and producer jobs.
`gh attestation verify` constrained to the probe signer workflow accepted the
exact record bytes. Its verified certificate identified protected source commit
`82ba4625e9aea877b246f806856beb651e926152`, run `36118896793`, and
attempt 1; the statement subject digest matched the bytes.

For attempt 2, a fresh download and `gh attestation verify` again matched the
record SHA-256 above to the statement subject. The certificate identified
`.github/workflows/issue83-real-pr-block-probe.yml@refs/heads/main`, the same
protected source commit, the `pull_request_target` trigger, and
`/actions/runs/36118896793/attempts/2`. Independent protected-base object
reads and the PR API's historical merge SHA reconstructed the record byte for
byte, including the five protected input digests, complete Authority Set and
validated decision. The record's Authority member is
`architecture-contract`, `docs/architecture.md` at the protected base, SHA-256
`a5506d0e147dbea2ddf3c91491ade90815f40cecfbb167cd0b04316cf1235e53`.
The attempt-1 and attempt-2 record bytes differ, so the verifier must compare
the certificate's exact attempt with its trusted expected attempt.

## Rejection evidence and limits

| Case | Evidence | Result |
| --- | --- | --- |
| Edited record bytes or wrong signer workflow | Live `gh attestation verify` tests against the retained record. | Signature verification rejected them. |
| Attempt-2 evidence supplied as attempt 3 | Explicit comparison of the verified certificate's run/attempt URI with the independently expected attempt. | Rejected; `gh attestation verify` alone does not make this application-specific comparison. |
| Missing same-attempt review output | Live producer-only attempt 3. | Failed before record creation or attestation. |
| Non-`BLOCK`, incomplete Authority IDs, changed protected inputs, stale head or missing evidence | Focused producer and independent-verifier fixture tests. | Rejected or `INCOMPLETE`; these are local tests, not live failed GitHub reviews. |
| Deleted or expired exact record bytes | No live deletion or expiry test. | Must be `INCOMPLETE`; no availability guarantee was demonstrated. |

After the full rerun, GitHub's run-artifact listing exposed only attempt-2
decision and record artifacts. Locally retained attempt-1 bytes still passed
attestation verification and retained attempt-1 identity. A valid signature can
therefore outlive the run's listed artifact, but verification still needs the
**exact bytes**. The workflow's seven-day artifact retention is not durable
evidence storage.

The verified certificate exposes the signer workflow, protected source
revision, run and attempt, but **no job ID**. Producer attribution therefore
depends on the inspected protected workflow revision: only its producer job
attests, after its validation steps. Artifact names, record fields and the
statement predicate cannot substitute for those checks. The separate verifier
requires trusted expected identities and local Git objects. It checks fresh PR
state before and after inspection. Because closed fixture PR #94 no longer has
a live merge ref, the CLI now returns `INCOMPLETE` (`Current mergeSha differs
from trusted expectation`), even though the historical PR API still reports
the former merge SHA and structural reconstruction of attempt 2 succeeds under
that injected historical state. A production closed-PR freshness rule is not
established here. Availability of artifact attestations for private/internal
consumer repositories was not tested; plan and entitlement requirements remain
a deployment prerequisite.

## Smallest production follow-up

Under [#20](https://github.com/flair-agency/architecture-gatekeeper/issues/20),
record an owner-reviewed versioned evidence and protected-policy contract:
trusted expected identities, the certificate/run-attempt and protected-workflow
checks, exact-byte durable retention and retrieval, and fail-closed handling
when bytes or attestation are absent. Define the supported repository
availability and an alternative trusted producer source where GitHub
attestations are unavailable. Under [#78](https://github.com/flair-agency/architecture-gatekeeper/issues/78),
implement historical/current-state verification for Change A, including a
closed-PR rule and stale base/head/tag behavior, then connect only verified
historical `BLOCK` evidence to the separately authorized authority-only Change
B route. Keep the original `BLOCK` unchanged and require a fresh review of A
after B becomes canonical. None of these production steps is satisfied by the
test-only `VERIFIED_TEST_ONLY_BLOCK` result.

The [Issue #83 live evidence comment](https://github.com/flair-agency/architecture-gatekeeper/issues/83#issuecomment-5830256229)
records the run-by-run observations. The
[independent verifier note](2026-09-25-offline-historical-block-verifier.md)
documents its exact inputs, checks, structural readback and closed-PR limit.
