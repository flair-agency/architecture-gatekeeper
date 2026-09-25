# Issue #83: protected validated-`BLOCK` producer probe

Status: test-only workflow proposal. No run has been observed. This is not a production ReviewRecord or an accepted `OWNER_AMENDMENT` evidence route.

The first Issue #83 probe showed that GitHub's verified attestation certificate binds exact bytes to a protected signer workflow, revision, run and attempt, but does not expose a job ID. This follow-up tests whether protected workflow structure can constrain **when** a synthetic `BLOCK` record is attested.

## Experiment boundary

The `issue83-attestation-probe.yml` workflow still runs only on protected `main` pushes that change its workflow or producer script. Its existing byte-attestation probe remains separate. The new `review-fixture` job runs the pinned Codex Action against a deliberately synthetic proposal to turn service failure into `PASS`. It has the model secret and read-only repository access, but no attestation or OIDC permissions. The decision artifact is named with the current run **and attempt**.

The dependent `validated-block-producer` job has no model secret. It downloads only that same-attempt decision, reads the protected checkout's decision schema and validation policy, validates the complete Authority ID set, and requires top-level `BLOCK`. Only after those checks does it write a bounded, explicitly synthetic record and call the pinned attestation and artifact-upload actions. A timeout, absent decision, invalid JSON/schema/authority set, `PASS`, or `OWNER_DECISION` prevents record creation and attestation. Local tests cover the invalid-decision cases; the merged workflow must still demonstrate the live `BLOCK` route and rerun behavior.

The synthetic record includes a copy of the decision and workflow context to help diagnose the run. These fields are **self-claims**. A separate verifier must authenticate the file digest and signer certificate, compare the certificate's run/attempt and protected workflow revision against its expected values, and then validate the record. Artifact naming and contents cannot establish producer identity by themselves.

## What this will not prove

The review input is a synthetic prompt, not a real PR with protected-base Authority Set materialization or a historical Change A. The producer uses a fixed test Authority ID rather than the current CI's complete provenance bundle. A successful run would prove only that this protected test workflow can gate attestation on deterministic validation of a real model `BLOCK`. It would not make the synthetic record eligible for #78, establish a job-ID claim, solve evidence retention/deletion, or justify changing `Architecture Gate / accept`.

For production, reuse the protected-base selection and complete decision validation from the existing CI path, bind the ReviewRecord to exact repository/PR/base/head/reviewed revision, Authority Set and policy inputs, and independently verify the attestation and current state. Keep model/source credentials out of the attestation producer. The workflow itself, not a certificate job-ID field, must enforce the producer sequence.
