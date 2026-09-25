# Issue #83: first artifact-attestation probe

Status: test-only workflow merged in PR #84 and exercised on `main`. This is not a ReviewRecord, historical `BLOCK`, or `OWNER_AMENDMENT` evidence route.

## Question

The Issue #20 / #78 verifier cannot authenticate a historical `BLOCK` producer from Actions artifact metadata alone: the artifact API identifies a run but not the uploading attempt or job. Can a GitHub artifact attestation for exact bytes expose a verifiable signer-workflow and run/attempt/job binding in this repository?

## Narrow experiment

`.github/workflows/issue83-attestation-probe.yml` runs only when that workflow file is pushed to the protected `main` branch. A manual `workflow_dispatch` would permit selecting a PR branch's modified workflow while retaining write-scoped attestation permissions, so it is deliberately excluded. The workflow writes one fixed-shape **synthetic** JSON file from GitHub runner context. It uses the official, exact-SHA-pinned `actions/attest` and `actions/upload-artifact` actions. The job has only `contents: read`, `id-token: write`, and `attestations: write`; it has no source checkout, model API key, or acceptance-path connection. The seven-day artifact exists solely so a separate read-only verifier can fetch the exact file bytes. Fields inside that file are self-claims and must not be treated as authenticated run metadata.

After this workflow is merged onto the protected default branch, inspect its resulting push run and rerun that same run once. For each attempt:

1. Download the named artifact and require exactly one bounded `issue83-probe.json` file. Compare its SHA-256 with the attestation subject digest.
2. Verify the attestation with `gh attestation verify` and constrain the signer to this exact workflow. Record the verified statement and which of repository, workflow revision, run ID, attempt, and job identity it actually exposes. Do not infer a claim merely because GitHub's OIDC provider supports it.
3. Try wrong-workflow, wrong-run/attempt and edited-byte cases. Record the exact verification failures. Check whether a partial rerun leaves artifacts from multiple attempts under one run and whether a verifier can distinguish them without trusting the JSON body or artifact name.
4. Record the observed permission and availability behavior. This public first-user repository can exercise GitHub's artifact attestation feature; private/internal repositories require Enterprise Cloud under current GitHub documentation.

This experiment only tests a possible *byte and producer-provenance primitive*. It does not prove that a protected workflow emitted a ReviewRecord only after a complete, validated `BLOCK`. That separate producer construction and negative-case test remains required before #78 can consume historical evidence. No production policy, `Architecture Gate / accept`, or amendment routing changes are included.

## Observed result, 2026-09-25

PR #84 merged as `8e3d0f7c36a3d2881a274bfcbe741ba57d39eaeb`. The protected `main` push started [run 36098596272](https://github.com/flair-agency/architecture-gatekeeper/actions/runs/36098596272). Its initial execution, full rerun, and single-job rerun all succeeded as attempts 1, 2, and 3. The only job was `attest-probe`; the workflow had no repository checkout, model credential, or acceptance connection.

| Attempt | Artifact name suffix | Subject SHA-256 | Verified certificate `runInvocationURI` suffix |
| --- | --- | --- | --- |
| 1 | `36098596272-1` | `385f70863cd2b8ce985e8502e44a27b54115fe98119b19dbf39650322b9f4419` | `/runs/36098596272/attempts/1` |
| 2 | `36098596272-2` | `7bca2a93fb6f14f97bc09dbdc89b04385dff191fb1fedb5cdc340b0fb83f68b4` | `/runs/36098596272/attempts/2` |
| 3 | `36098596272-3` | `7546a4b4a97039187ff597fcd86ecb9e4f90030d82c8d2ee983c8e5a68844562` | `/runs/36098596272/attempts/3` |

Each downloaded JSON file was independently verified with `gh attestation verify <file> --repo flair-agency/architecture-gatekeeper --signer-workflow flair-agency/architecture-gatekeeper/.github/workflows/issue83-attestation-probe.yml --format json`. The verified subject digest matched the downloaded bytes. The parsed **signature certificate**, rather than the file body or predicate, identified the signer workflow at `refs/heads/main`, workflow/source commit `8e3d0f7...`, repository, `push` trigger, GitHub-hosted runner, and the exact run/attempt URI. The verified predicate also contains an invocation ID, but it is workflow-controlled metadata and is not used as an authentication source. The certificate did **not** expose the job ID. A verifier must compare the certificate's run/attempt URI to its expected value; `gh attestation verify` does not impose that application-specific comparison by itself.

Changing one byte of attempt 2's file made verification fail. Constraining the signer to `self-architecture-gate.yml` or the source digest to an unrelated revision also failed. Attempt 1's saved file still verified after the full rerun. Artifact enumeration after that full rerun exposed only attempt 2, however; after the single-job rerun it exposed attempts 2 and 3. Thus current artifact listing is not a reliable historical inventory across reruns. The attempt is authenticated by the certificate when exact bytes remain available, not by an artifact name or embedded `runAttempt` field. No wrong-attempt rejection is provided by the CLI alone; an explicit certificate comparison is required. The altered-byte and wrong-signer/revision failures were live GitHub verification tests; incomplete-review and expired/deleted-evidence failures have not been exercised.

**Conclusion:** this public-repository route provides a usable byte, protected-workflow, revision, run, and attempt provenance primitive. It does not independently identify the producer job or prove that semantic review completed as a validated `BLOCK`. The smallest next producer test is to create and attest a versioned synthetic `BLOCK` ReviewRecord **in the same protected job, only after deterministic validation**, then show that incomplete and non-`BLOCK` paths emit no attestation. A separate read-only verifier must enforce certificate identity, exact run/attempt, subject digest, record bindings, and the protected policy. Keep production #78 acceptance disabled until that path and deletion/retention behavior are proven. Private/internal repository availability remains a separate deployment prerequisite.

References: [historical metadata probe](2026-09-24-historical-block-artifact-poc.md), [GitHub artifact attestations](https://docs.github.com/en/actions/how-tos/secure-your-work/use-artifact-attestations/use-artifact-attestations), [reusable-workflow signer verification](https://docs.github.com/en/actions/how-tos/secure-your-work/use-artifact-attestations/increase-security-rating), and [GitHub OIDC claims](https://docs.github.com/en/actions/reference/security/oidc).
