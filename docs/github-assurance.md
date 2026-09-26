# GitHub assurance and reference configuration

This is a usage guide. [`architecture.md`](architecture.md) is the normative
contract; this guide does not enable an acceptance route. The [MIT license](../LICENSE)
supplies the software's legal terms. A Gatekeeper result describes a selected
review or adoption procedure and the evidence it verified. It is not a warranty
that the architecture decision, implementation or product is correct.

## Responsibility boundary

| Party | Responsibility and claim |
| --- | --- |
| Consumer owner | Defines canonical architecture, makes missing-decision and rule-change decisions, selects policy and accepts residual operational risk. |
| Gatekeeper | Checks selected evidence against exact revisions, authority, policy and procedure; reports what passed, failed, remained unverified or was unavailable. It cannot authenticate an owner or producer from an author-supplied claim. |
| Repository host and administrator | Configure access, branch/tag protection, required checks, bypass permissions, evidence availability and merge operation. Gatekeeper reports host enforcement only when independently verified. |

`OWNER_AMENDMENT / G0` is a **target route, not a currently enabled self-policy**.
Under the current contract it needs one completed, verifiable `BLOCK` for A,
an exact authority-only B and annotated tag, previous protected-base opt-in,
trusted producer provenance and validation through B's protected canonical
transition. G0 does not verify that the tag actor is the owner. If an earlier
BLOCK record disappears, a permitted fresh review can yield a new BLOCK, with
new B bindings; the old bytes cannot be reconstructed from a digest. See
[#78](https://github.com/flair-agency/architecture-gatekeeper/issues/78) and
[#83](https://github.com/flair-agency/architecture-gatekeeper/issues/83).

## GitHub.com plan and visibility limits

These are *available host capabilities*, not proof that a repository enabled
or correctly configured them. An individual GitHub Pro repository and an
organization GitHub Team repository are different ownership classes. Verify
the actual plan, active rules, required-check source, bypass list, workflow
revision, evidence source and merge method in each consumer.

| Repository | Branch protection / ruleset for a required check | GitHub native artifact attestation | Consequence for current protected `OWNER_AMENDMENT / G0` |
| --- | --- | --- | --- |
| Public, GitHub Free | Available | Available | A reference E2E can be tested with host-native primitives; this repository has not enabled G0 or proved B's final transition. |
| Private, GitHub Free | Not available under documented native features | Not available | Actions review, artifact retrieval, local/procedural checks and an ordinary owner merge may be possible. They cannot be reported as this **protected G0 route** using GitHub Free native controls alone. Missing host enforcement and BLOCK producer provenance must be shown separately. |
| Private, GitHub Pro / Team | Available | Not available | A protected check is possible, but the public #83 attestation route cannot authenticate the BLOCK producer here. Without a separately verified provenance adapter, the proposed G0 adoption is `INCOMPLETE`; configuration alone proves nothing. |
| Private, GitHub Enterprise Cloud | Available | Available | A native configuration is feasible, but producer validation, exact evidence, bypass, evidence lifetime and final check-to-merge ordering still require E2E proof. No G0 claim follows from the plan alone. |

GitHub documents [branch protection availability](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches),
[ruleset availability](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/available-rules-for-rulesets),
and [artifact attestation eligibility](https://docs.github.com/en/actions/how-tos/secure-your-work/use-artifact-attestations/use-artifact-attestations).
An [Actions artifact](https://docs.github.com/en/rest/actions/artifacts) supplies
bytes while it exists; artifact metadata alone does not authenticate the exact
BLOCK producer. A [check run](https://docs.github.com/en/rest/checks/runs)
supplies status, conclusion, head SHA and App identity, but is not the BLOCK
ReviewRecord. Required checks can treat skipped or neutral jobs as passing and
are bound to the relevant commit, so routing and output must also be checked
([GitHub required-check behavior](https://docs.github.com/en/pull-requests/how-tos/merge-and-close-pull-requests/troubleshooting-required-status-checks)).

GitHub Free private is an explicit limit of the **current protected amendment
contract**, not a claim that an owner cannot decide or merge. A different
procedural amendment route would need its own owner decision, contract,
assurance labels and validation; it is not an automatic fallback. A separate
signing adapter could be investigated for Pro/Team private, but none is
selected or proven by this guide. Unsupported producer provenance cannot be
accepted merely by calling it G0.

### Candidate for private GitHub Free: Git evidence plus procedural adoption

There is a possible route worth testing. It is a **proposal**, not supported
`OWNER_AMENDMENT / G0` behavior under the current protected-transition contract:

1. A trusted review producer emits the exact completed `BLOCK` ReviewRecord
   for A and signs those bytes. Keep the producer's signing capability outside
   untrusted PR code and verify its workflow/service identity, revision and
   run. An owner-written `"decision":"BLOCK"` file or an ordinary Actions
   artifact is not sufficient producer provenance.
2. Put the exact ReviewRecord bytes in a reachable Git object and bind its
   digest and A/base/head identity in a signed annotated tag or another
   authenticated Git receipt. Git checks byte identity; verifying the
   signature against a pinned trusted key adds signer identity. Neither alone
   proves that the signer was the protected review producer. A movable or
   deleted ref can make the object unavailable; re-review of A can create a
   new BLOCK and require new B bindings.
3. Verify B's authority-only diff, prior recorded policy, exact B revision,
   AmendmentRecord, tag and BLOCK producer evidence. The owner inspects that
   eligibility result, adopts B with an ordinary PR merge, and a separate
   post-merge readback confirms the exact B content became canonical. Record
   `hostEnforcement=unavailable` and any policy/producer/actor assurance that
   was not actually verified. A pre-merge green check is not adoption.

Git supplies [signed annotated tags and signature verification](https://git-scm.com/docs/git-tag),
but private GitHub Free does not provide branch protection or GitHub-native
artifact attestation. Its private repositories also lack GitHub environment
secrets and protection rules, so storing a producer signing key in an ordinary
repository secret and calling it a protected producer would be unsound
([GitHub environment availability](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments)).
An independent signing service or an existing OIDC-backed signer with a
verified trust policy is a possible `+α`; GitHub documents
[OIDC workflow and run claims](https://docs.github.com/en/actions/reference/security/oidc),
but this adapter has not been implemented or tested here. The signer, key or
OIDC policy, Git object reachability, exact B merge/readback and negative
cases all need a bounded proof.

This candidate could support an **evidence-backed procedural adoption** with
explicitly absent host merge enforcement. It cannot be called the current
protected `OWNER_AMENDMENT / G0` merely because the owner accepts that risk;
that outcome would require a new owner-authorized normative route, analogous
in separation of adoption and host enforcement to the versioned
`OWNER_ADDITION` procedure. A weaker alternative where the owner merely signs
their own BLOCK assertion does not establish trusted review-producer provenance
under the current contract.

## This repository as a reference

The following is an observed configuration on 2026-09-27, not a permanent
hosting guarantee or proof of `OWNER_AMENDMENT`:

- `flair-agency/architecture-gatekeeper` is **public**. `main` has branch
  protection with `architecture-gate / accept` required from the GitHub Actions
  App, strict base freshness, and force-push/deletion disabled. These controls
  are available for a public repository on GitHub Free. The repository ruleset
  API returned no rulesets on the observation date; the branch protection rule
  supplies these current controls.
- [The caller workflow](../.github/workflows/self-architecture-gate.yml)
  invokes [the reusable Gate](../.github/workflows/architecture-gate.yml) on
  non-draft pull requests. It requests protected review instructions and
  reads [self policy](../.codex/gatekeeper/ci-policy.json) from the base.
- The self policy currently selects `enforced` v2 ordinary review on `main`.
  It has **no `ownerAmendment` opt-in**. `OWNER_AMENDMENT / G0` cannot be inferred
  from this repository's successful ordinary `PASS` checks.
- #83 exercised test-only real-PR BLOCK production and GitHub artifact
  attestation in this public repo. The probe workflow triggers were removed;
  its [investigation report](investigations/2026-09-25-real-pr-block-probe-implementation.md)
  and test-only verifier remain. Those observations do not establish a live
  B adoption or enable production G0.

Inspect the *current* host configuration before using this example:

```sh
gh repo view flair-agency/architecture-gatekeeper --json visibility,defaultBranchRef
gh api repos/flair-agency/architecture-gatekeeper/branches/main/protection
gh api repos/flair-agency/architecture-gatekeeper/rulesets
```

This reference validates what is possible in a **public GitHub Free-capable
environment**. It does not imply that a private GitHub Free consumer has the
same protection or attestation features. The first production G0 route needs
a concrete evidence source, exact producer verification, final validation
ordering and a full A → BLOCK → B → canonical → A fresh-review E2E before any
consumer-facing support claim.
