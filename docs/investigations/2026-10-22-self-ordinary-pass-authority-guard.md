# Self ordinary PASS: deterministic old-Authority comparison

Partial implementation for #210, following the Owner's 2026-10-22 direction.
This change does not enable OWNER_AMENDMENT, change Canonical Authority or CI
Policy, or alter GitHub protection. The existing exact-tag guard stays active.

## Behavior and scope

The protected Self Enforced caller now requires a same-run comparison before
ordinary PASS. It reads the Policy and complete manifest at the recorded base,
reuses the existing Authority materializer and selected-path Git comparison,
and binds the review provenance and ordered review-merge parents to the exact
base/head. Candidate configuration and working-tree bytes do not select inputs.
An unavailable input, mismatch or comparison failure does not produce `false`.

Changes to any old-selected member, including deletion, rename (compared without
rename inference) and file-type change, cannot be accepted as ordinary PASS.
The existing separately verified OWNER_ADDITION route remains available;
BLOCK and OWNER_DECISION still cannot use ordinary acceptance.

Policy/manifest-only changes are reported separately as configuration changes.
They retain review under the **old** selection, as specified in
`docs/architecture/authority-set.md`. A candidate selector cannot remove a member
from this comparison. This classifier does not authorize migrations or claim
that an AI PASS proves every new configuration is semantically legitimate.
The separate UNVERIFIED lifecycle preview receipt is not imposed on ordinary
Self Enforced configuration changes. Files that are not selected authorities do
not become normative merely because they are Markdown files.

The new CLI is self-repository-only. Generic consumer and Procedural v5 behavior
is retained. Other self profiles that cannot supply this comparison fail closed;
there is no automatic downgrade or fallback. The current self Policy remains
Enforced v2 with the complete six-member Set. The internal v2 comparison metadata
shape does not change that Policy or the review provenance version.

## Risk / boundary / retained test

| Invariant or failure | Production boundary | Evidence |
| --- | --- | --- |
| AI false PASS cannot approve old Authority changes | `assertEnforcedAcceptance` | Each of the six members changed in actual Git; final CLI rejects PASS |
| Candidate selector cannot replace old inputs | `inspectSelfAuthorityChanges` | Candidate manifest omits a changed member; old comparison still detects it; dirty worktree ignored |
| Missing input is not unchanged | Complete materializer + exact tuple/digest comparison | Missing old member followed by candidate addition, missing/truncated provenance, wrong base/head/review commit and policy digest |
| Rename/delete/replacement stays visible | Existing no-renames selected-path comparison | Actual Git deletion, rename away/into selected path, symlink replacement |
| Existing routes retain meaning | Enforced and Procedural acceptors | Ordinary code PASS, verified OWNER_ADDITION, BLOCK/OWNER_DECISION rejection, unchanged Procedural suite |
| Failure publishes no usable comparison | Actual emitted CLI | Nonzero exit and no output on absent provenance |
| Trusted caller actually uses the signal | Parsed reusable workflow | Protected-runtime step and final accept output binding; existing tag guard retained |

These tests use synthetic authority bytes in real local Git repositories and
actual emitted CLIs. They do not run a GitHub fixture, authenticate a human,
prove a new producer, activate an App/Queue route or establish #211 E2E success.
The PR's existing protected review runs the already-adopted runtime; testing
this candidate's new code is separately reported in local and ordinary CI tests.

## Remaining connection work

The inactive merge-group gate currently selects ordinary review from tag
absence. It can reuse this content comparison before choosing ordinary or
amendment verification. Authority changes must require the prior-selected
trigger/scope and existing verified evidence; ordinary changes need not inspect
an unrelated or later tag. This is a separate dependent change, not permission
to remove the active guard before this repair is adopted and verified.

The current Canonical self target selects a Queue-only App producer. Adding the
same protected App producer to normal PRs requires an explicit Canonical diff
and adoption before production activation. B0 adoption, host settings, App
placement and both live amendment E2Es remain separate Owner-controlled steps.
