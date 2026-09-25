# Issue #83: independent test-only historical BLOCK verifier

`scripts/issue83-offline-block-verifier.mjs` inspects a retained record **outside the producer workflow**. It returns only `VERIFIED_TEST_ONLY_BLOCK` or `INCOMPLETE`. Neither result is `PASS`, `OWNER_AMENDMENT`, or evidence accepted by `Architecture Gate / accept`. The record remains the Issue #83 test format, not a production ReviewRecord.

Run with Node 22, `gh`, an authenticated read-only GitHub session, and a trusted local Git checkout containing the exact base, head, and merge commits and protected-base objects:

```text
node scripts/issue83-offline-block-verifier.mjs EXPECTED.json RECORD.json GIT_ROOT
```

`EXPECTED.json` must come from an operator's trusted investigation context, independently of the record and its artifact name. It contains exactly `repository` (`owner/repo`), `prNumber`, `baseSha`, `headSha`, `mergeSha`, `workflowSha`, `workflowPath`, `runId`, and `runAttempt` (the last two as decimal strings). The workflow path for the current probe is `.github/workflows/issue83-real-pr-block-probe.yml`. Preserve the exact downloaded `issue83-real-pr-block-record.json` bytes as `RECORD.json`; JSON reformatting invalidates the attestation. Missing or expired bytes yield `INCOMPLETE`.

The CLI fetches current PR base/head and draft state through `gh api`, reads the current merge ref, and requires them to equal the expected identities. It invokes `gh attestation verify` on the exact record file with the expected repository, signer workflow, source ref, and workflow digest. It then checks the verified certificate's signer, protected source revision, trigger, and exact run/attempt URI, plus the statement subject digest. Record fields and the statement predicate are never accepted as authentication by themselves.

Finally, the verifier checks the local Git object types and exact merge parents, reloads protected policy/prompt/schema/validation/manifest bytes from the expected base commit, re-materializes the complete Authority Set, and rebuilds the validated `BLOCK` record byte-for-byte. It stops at `INCOMPLETE` when external authority materialization is required but no trusted source adapter is available. The exported inspection function accepts `current` and `verified` inputs for focused tests; callers must supply those from trusted independent checks. The CLI provides those checks itself.

The local checkout and expected identity document are operator trust inputs. The CLI does not establish how historical bytes are retained, authenticate a certificate job ID, verify private-repository attestation availability, or prove a general reusable evidence route. A later production verifier needs its own owner-reviewed evidence format, durable retrieval, protected policy selection, current-state rules, and acceptance integration under #20/#78.
