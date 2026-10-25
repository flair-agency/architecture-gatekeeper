# GitHub assurance and reference configuration

This is an operational guide. The [architecture contract](architecture.md)
defines normative requirements; this page does not enable an acceptance route.
Available host features do not prove that a repository configured them.

## Responsibility boundary

| Party | Responsibility and claim |
| --- | --- |
| Consumer owner | Defines canonical architecture, selects policy, and accepts residual operational risk. |
| Gatekeeper | Validates selected inputs and reports what passed, failed, or remains unverified. It cannot authenticate an owner from a supplied claim. |
| Repository host and administrator | Configure access, branch protection, required checks, bypass permissions, and merge operation. Host-enforcement claims require configuration readback and evidence for the relevant transition. |

For this repository, amendments to existing decisions use one ordinary
protected Actions PR under the [owner amendment contract](architecture/owner-amendment.md).
The previous protected Policy selects the scope and prompt bound. The workflow
validates the exact PR base/head/test-merge, the complete old Authority Set,
and all changed authority bytes and diffs. The owner approves and merges under
existing repository controls; post-merge canonical readback verifies the
resulting authority bytes and base/tree relationship before adoption is
reported. A squash merge is supported when readback proves the expected tree.
If an original A exists, it receives a fresh review against the resulting
canonical Authority.

The workflow and required-check identity limits are specified in the owner
amendment contract. This procedure has no historical trigger, separate
App/Queue path, tag, attestation, or portable evidence-custody requirement.
It does not authenticate the owner beyond existing repository merge controls
or independently prove host configuration.

The one-off PR #517 `no-future-permission` exception remains historical and
non-repeatable; it does not authorize future amendments.

## Host capabilities

Read back the actual repository plan, branch/ruleset controls, required-check
source, bypass permissions, workflow revision and merge method before making
host-enforcement claims. A successful Actions check alone does not prove that
the host required it or that the transition preserved it. Canonical readback
verifies resulting content, not host enforcement.

Consult GitHub's current documentation for [branch protection](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches),
[rulesets](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/available-rules-for-rulesets),
and [Actions policy configuration](https://docs.github.com/en/rest/actions/policies),
then inspect the configuration actually applied to the repository.
