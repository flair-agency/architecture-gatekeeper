# Issue #147: private amendment evidence options

This is a non-normative decision aid. It does not authorize an
`OWNER_AMENDMENT` route or change `docs/architecture.md`.

## What the fixture has established

The private synthetic Change A has a completed model-backed `BLOCK`. A
separate signer job bound the exact record digest to GitHub OIDC claims for
the repository, workflow revision, run, attempt, and signer job. The saved
record rejected byte tampering and a different run attempt. A later offline
experiment checked the expired token's signature with a retained post-expiry
JWKS and matched its claims to the same record. The fixture's authority-only
Change B is proposed but has not passed an amendment eligibility verifier or
become canonical; A has not received a post-B fresh review.

The offline experiment is **historical signature inspection only**. RFC 7519
requires the current time to precede `exp` for JWT acceptance. Neither the
saved JWKS nor this experiment establishes a GitHub key-retention or trusted
historical-timestamp policy. Copied job-completion data is not an authenticated
GitHub API response. Therefore the experiment cannot be promoted into a
production BLOCK provenance adapter by changing a result label.

## Candidate evidence sources

| Source | What it can support | Unresolved condition |
| --- | --- | --- |
| Live GitHub OIDC token | Current-time signed producer claims bound to exact record bytes. | The short validity window makes a manual B adoption procedure fragile. An expired token cannot be accepted as a current credential. |
| Saved expired JWS and JWKS | Recheck a past mathematical signature and signed claims, as the fixture did. | Requires a separately justified trust and time policy, authenticated job evidence, and a key-availability rule. It is experimental, not selected for acceptance. |
| Sigstore keyless bundle | Short-lived identity certificate, signature, and transparency-log inclusion proof for later verification. | The public log can expose private repository or workflow metadata. Owner must authorize that disclosure before a private fixture trial. Exact verifier policy and E2E remain unproved. |
| Independent signing service or managed key | Could sign exact BLOCK bytes without a public transparency log. | Adds a producer trust boundary, key custody, revocation, and operational availability to define and verify. No service is selected. |

GitHub's native artifact attestations are available on public repositories in
Free, Pro, and Team, but private/internal repositories require Enterprise
Cloud. They therefore cannot fill this private Free gap directly.

## Decision sequence

1. Keep the private #147 route test-only until the owner selects a producer
   evidence profile and records its trust and privacy limits in canonical
   authority. Do not make host enforcement a proxy for producer provenance.
2. Specify exact record bytes, repository/A/base/head/authority/policy and
   producer/run/attempt bindings, plus a way to verify completed jobs. Evidence
   must be available at B adoption; if it is lost, a permitted fresh review of
   A can produce a new BLOCK, with B rebound to that new identity.
3. Then verify B's authority-only scope and predecessor authorization before
   merge; after ordinary merge, read back exact B from canonical authority.
   Report host enforcement and actor authentication separately. Only then
   perform A's fresh review. A green pre-merge result alone is not adoption.
4. Advance the public/self protected v0.6.0 route under #83/#116 independently.
   Its GitHub-native attestation candidate does not need the private #147
   evidence-profile decision.

## Source boundaries

- [RFC 7519, section 4.1.4](https://www.rfc-editor.org/rfc/rfc7519#section-4.1.4): `exp` and current JWT acceptance.
- [GitHub artifact attestation availability](https://docs.github.com/en/actions/how-tos/secure-your-work/use-artifact-attestations/use-artifact-attestations): private/internal plan requirement.
- [GitHub OIDC concepts](https://docs.github.com/en/actions/concepts/security/openid-connect): short-lived credentials and workflow claims.
- [Sigstore keyless overview](https://docs.sigstore.dev/cosign/signing/overview/) and [bundle verification](https://docs.sigstore.dev/cosign/verifying/verify/): certificate and transparency-log model.
