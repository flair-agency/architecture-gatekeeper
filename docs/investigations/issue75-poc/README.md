# Issue #75: isolated owner-amendment protocol experiment

This is an executable design experiment for
[Issue #75](https://github.com/flair-agency/architecture-gatekeeper/issues/75),
not an implemented acceptance route. The normative contract still says `BLOCK`
rejects. Nothing here amends that contract, sets a required check, changes CI,
merges a change, or becomes part of the published package.

The experiment answers one narrow question: can an authority-only amendment B
retain its own completed `BLOCK` against old authority, yet acquire a separate,
revision-bound owner authorization without putting B's own commit ID or its
later review digest inside B?

## Run

Requires Node.js 22+, Git with SSH signing support, and `ssh-keygen` on `PATH`.
No network, model credentials, personal signing keys, or additional npm packages
are used.

```sh
node --test docs/investigations/issue75-poc/prototype.test.mjs
```

The suite creates temporary local Git repositories and temporary signing keys,
then removes them. It does not edit this repository's Git state. The verifier is
in `prototype.mjs`; fixture creation and adversarial examples are in
`prototype.test.mjs`. The fixtures deliberately support SHA-1 Git repositories
and small UTF-8 documents only.

## Protocol under test

1. A hypothetical **already protected** fixture base contains the old authority,
   explicit experimental policy, owner SSH public key, review-service public
   key, permitted authority paths and review-input identity. Enabling this
   policy in the real project would require an explicit contract amendment.
2. B commits only `authority.md` and `amendment.json`. The intent contains a
   schema version, reason and path scope. It has no self commit ID, review
   digest or owner signature. No preceding implementation A is required.
3. A fixture review service produces an external, Ed25519-signed `BLOCK`
   record for B under the old base. It binds repository, change ID, base,
   head, challenge, mechanism and the digest of the old authority, policy and
   review inputs. The fixture supplies this decision; it does not run a model.
4. After that record exists, a temporary owner key signs a real annotated Git
   tag targeting B's unchanged head. Its message binds the same context plus
   the review-envelope digest and intent digest. `git verify-tag` authenticates
   the tag against the owner key selected from the old base.
5. The experimental verifier checks the protected caller's current context,
   old policy, exact path scope, complete authenticated review, immutable tag
   object and all bindings. It returns:

   ```json
   {"experimental":true,"acceptance":"OWNER_AMENDMENT","semantic":"BLOCK"}
   ```

The dependency order is acyclic:

```text
committed intent -> head B -> external review -> signed tag -> verification
```

The owner cannot turn a missing, failed or forged review into an acceptable
amendment merely by signing its digest. The separate review signature models
the authentication boundary that Issue #20 must define. It is not a proposal
that production must adopt this particular signature format.

## Observed results

The ten focused tests pass on Node 22.22.0 and Git 2.54.0. They exercise:

- Direct B succeeds while semantic `BLOCK` and B's commit ID remain unchanged.
- Updated head/base, another repository/change ID, or a fresh challenge rejects.
- Missing, modified or wrong-key review rejects even with a valid owner tag.
- Incomplete review, `PASS`, `OWNER_DECISION`, or different review inputs rejects
  on this dedicated amendment path.
- Unsigned, altered and wrong-owner tags reject.
- Incorrect review/intent digests and context in genuine owner tags reject.
- Implementation changes and candidate trust-root/policy edits reject even
  when signed; the fixture permits only declared authority changes and intent.
- A disabled protected route rejects; candidate content cannot activate it.
- Intent containing a review digest rejects rather than creating a circular
  committed record.
- Symlinks and executable modes at authority paths reject even with genuine
  review and owner signatures.

Replay here means moving evidence to a different protected context. Repeating
verification for the identical state is intentionally idempotent. There is no
one-time consumption ledger. Both `changeId` and `challenge` must come from the
protected caller; the candidate cannot choose them. Their authenticated issuance
and lifecycle are assumed inputs, not implemented services.

## What this does not establish

The PoC establishes that the object/signature dependency can be implemented and
that the illustrated invalid inputs fail closed. It does not establish semantic
review quality or prove that a real model actually ran. Both fixture private
keys are held by the test process, so this tests cryptographic checks without
claiming independent runtime isolation.

The caller is assumed to obtain repository identity and current base/head from
an authenticated source, execute a trusted verifier, and supply the intended
tag object's immutable ID. A local repository name does not attest a GitHub
repository. Host/Git executable integrity, key custody, key rotation/revocation,
record retention, general-purpose hostile-input hardening, and the final Issue
#20 evidence schema remain outside this experiment. Tag timestamps are not a
trusted clock; ordering follows the tag's reference to the exact signed review.

GitHub required-check/ruleset integration, freshness between verification and
merge, tag event permissions, merge queues and concurrent base updates require
separate end-to-end work. No production owner authorization is created by this
suite. Same-Change candidate-authority authorization after `OWNER_DECISION` is
also outside this v1 experiment.

Before adoption, the owner must amend the normative contract, settle the
production evidence and identity contract with Issue #20, and test the real
protected verifier/check path. A passing PoC alone authorizes none of those
policy changes.
