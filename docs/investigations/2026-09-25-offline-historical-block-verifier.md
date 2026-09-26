# Issue #83: independent test-only historical BLOCK verifier

`scripts/issue83-offline-block-verifier.mjs` inspects a retained record **outside the producer workflow**. It returns only `VERIFIED_TEST_ONLY_BLOCK` or `INCOMPLETE`. Neither result is `PASS`, `OWNER_AMENDMENT`, or evidence accepted by `Architecture Gate / accept`. The record remains the Issue #83 test format, not a production ReviewRecord.

Run with Node 22, `gh`, an authenticated read-only GitHub session, and a trusted local Git checkout containing the exact base, head, and merge commits and protected-base objects:

```text
node scripts/issue83-offline-block-verifier.mjs EXPECTED.json RECORD.json GIT_ROOT
```

`EXPECTED.json` must come from an operator's trusted investigation context, independently of the record and its artifact name. It contains exactly `repository` (`owner/repo`), `prNumber`, `baseSha`, `headSha`, `mergeSha`, `workflowSha`, `workflowPath`, `runId`, and `runAttempt` (the last two as decimal strings). The workflow path for the current probe is `.github/workflows/issue83-real-pr-block-probe.yml`. Preserve the exact downloaded `issue83-real-pr-block-record.json` bytes as `RECORD.json`; JSON reformatting invalidates the attestation. Missing or expired bytes yield `INCOMPLETE`.

The CLI fetches current PR base/head and draft state through `gh api`, reads the current merge ref, and requires them to equal the expected identities. A closed PR whose merge ref is absent returns `INCOMPLETE`, even if the PR API still reports its former `merge_commit_sha`; this test route does not define a closed-PR freshness rule. It invokes `gh attestation verify` on the exact record file with the expected repository, signer workflow, source ref, and workflow digest. It then checks the verified certificate's signer, protected source revision, trigger, and exact run/attempt URI, plus the statement subject digest. Record fields and the statement predicate are never accepted as authentication by themselves.

Finally, the verifier checks the local Git object types and exact merge parents, reloads protected policy/prompt/schema/validation/manifest bytes from the expected base commit, re-materializes the complete Authority Set, and rebuilds the validated `BLOCK` record byte-for-byte. It stops at `INCOMPLETE` when external authority materialization is required but no trusted source adapter is available. The exported inspection function accepts `current` and `verified` inputs for focused tests; callers must supply those from trusted independent checks. The CLI provides those checks itself.

The positive fixture test uses the producer's compact `JSON.stringify(record) + newline` format. A separate structural readback of real PR #94 attempt 2 used retained exact bytes, a fresh `gh attestation verify`, the protected-base Git objects, and the PR API's historical `merge_commit_sha`; it reproduced record SHA-256 `c542386e65349e42a9f1009ef621ea8dcf99be8e88db8dfe91c6f6335e86bbb3` as `VERIFIED_TEST_ONLY_BLOCK` under injected historical state. Because the closed PR has no live merge ref, the CLI's stricter current-state check returns `INCOMPLETE` for that fixture.

The local checkout and expected identity document are operator trust inputs. The CLI does not establish how historical bytes remain available until B's transition, authenticate a certificate job ID, verify private-repository attestation availability, or prove a general reusable evidence route. A later production verifier needs its own owner-reviewed evidence format, selected retrieval source, protected policy selection, current-state rules, and acceptance integration under #20/#78.

## Fresh-BLOCK recovery boundary after PR #144

The test-only verifier now has a focused same-A fixture for the adopted recovery rule. With the selected record bytes absent it returns `INCOMPLETE`. A separate completed BLOCK record for a later run attempt, with a matching verified-certificate fixture and exact new subject digest, passes inspection against the same A/base/head. Reusing the earlier record and certificate while claiming the new attempt returns `INCOMPLETE`. The old and new record bytes have distinct digests. This confirms that the verifier can distinguish a newly bound attempt from a lost record without requiring the earliest attempt's bytes to remain available.

This is a **local fixture**: its certificate object is injected, not signed by GitHub. It does not prove that a fresh live review will return BLOCK, that an Actions artifact survives until B's canonical transition, that the new BLOCK can be bound into B's tag, or that the host enforces final validation order. The next host test should reuse the existing GitHub artifact/attestation primitive and exercise a real A/B pair in a disposable path; no production evidence backend is selected by this test.
