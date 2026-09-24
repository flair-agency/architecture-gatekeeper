# Issue #83: first artifact-attestation probe

Status: test-only workflow proposal. No run has been observed yet. This is not a ReviewRecord, historical `BLOCK`, or `OWNER_AMENDMENT` evidence route.

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

References: [historical metadata probe](2026-09-24-historical-block-artifact-poc.md), [GitHub artifact attestations](https://docs.github.com/en/actions/how-tos/secure-your-work/use-artifact-attestations/use-artifact-attestations), [reusable-workflow signer verification](https://docs.github.com/en/actions/how-tos/secure-your-work/use-artifact-attestations/increase-security-rating), and [GitHub OIDC claims](https://docs.github.com/en/actions/reference/security/oidc).
