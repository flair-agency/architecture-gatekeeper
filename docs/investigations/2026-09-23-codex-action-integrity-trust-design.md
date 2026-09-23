# Codex Action integrity fast path: trust design for Issue #45

Status: proposed design gate; no fast path is enabled by this document. See
[Issue #45](https://github.com/flair-agency/architecture-gatekeeper/issues/45)
and the [latency baseline](2026-09-23-architecture-gate-latency-baseline.md).

## Current boundary and measured cost

The enforced reusable workflow has a credential-free `codex-action-integrity`
job before `review`. The integrity job checks out
`flair-agency/codex-action@f93255fd2e5a17a0b4bd557599535e80c8607537`,
compares its commit, trees, commit sequence, changed files, and selected content
hashes with the Gatekeeper-owned provenance manifest, then runs frozen install,
`pnpm run check`, `pnpm test`, and a clean `dist` check. `review` depends on that
job and alone passes `OPENAI_API_KEY` to the same exact-SHA Action. In the
baseline, the integrity job took 51 seconds at the median in 11 consecutive
self-Gate runs and 77–78 seconds in three selected LIVE Agency runs. Job-level
timing does not establish how much of that duration each step consumes.

The proposed fast path changes the assurance claim. It would establish that the
*selected immutable Action identity* matches an identity verified by protected
CI and promoted by the owner. It would not rerun the Action tests on every pull request, nor
prove that GitHub's service and runner execute without compromise. The
remaining platform assumption is that GitHub Actions resolves a full-SHA
`uses: owner/repo@commit` to that commit's Action code. GitHub [documents
full-SHA pinning](https://docs.github.com/en/actions/how-tos/create-and-publish-actions/manage-custom-actions#using-a-commits-sha-for-management)
as an immutable Action reference; the preflight must still establish which
repository and SHA were promoted and that the required checks passed.

## Trust boundary and one-owner operation

One authorized repository owner currently operates Gatekeeper; a second human
CODEOWNERS approval is not an available control. The design therefore trusts
that owner to keep the GitHub branch/Actions settings intact, inspect the
security-sensitive diff and protected CI run, and merge only a passing current
PR. The machine gate must do the repeatable verification and record comparison;
an owner merge is a promotion decision, not evidence that tests passed. A
compromised or malicious owner could change repository settings or protected
code, so this design cannot defend against that actor. The GitHub Actions
service and runner are also trusted platform components.

The record, verification procedure, verifier, and reusable workflow must be
read from the same `job.workflow_sha` of the called Gatekeeper workflow. That
SHA is also the identity consumed by an exact-SHA consumer caller. A pull
request's files, artifacts, job outputs, comments, caches, or self-declared
status are data to inspect; none can become a trusted record. A full-SHA pin or
cache hit alone does not prove successful verification.

At the time of this design (2026-09-23), `main` requires a strict
`architecture-gate / accept` check and conversation resolution. It requires
zero approving reviews and does not enforce protection for administrators.
This is compatible with one-owner operation but is not yet enough to promote
fast-path evidence. Before enabling it, add the protected candidate-verification
and promotion verdict to an always-running required `accept` check, require the
strict check from the expected GitHub App, use a unique check name, and enable
administrator enforcement if this repository permits it. Read settings back
through the API and test that a failed, skipped, stale, or absent promotion
verdict blocks merge. GitHub [documents](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches)
that required checks may accept a skipped conclusion, so the aggregator itself
must fail when a required child did not pass. GitHub App source pinning and a
unique name reduce ambiguity but do not turn the Actions App into an
independent security reviewer; the owner must verify the required run's
protected workflow origin and current PR SHA before merge.

If admin enforcement or a reliable required check cannot be established,
retain full verification on every enforced run. Even with admin enforcement,
the repository owner can change the protection settings later. Treat that as
an explicit root-of-trust limit, not as a claim of tamper-proof governance.

## Record candidate and promotion

The recommended first implementation is a versioned, machine-checkable record
committed alongside the reusable workflow in Gatekeeper. It avoids a new signer
and a separate attestation-service lookup during every pull request. A record
for one Action identity would contain at least:

| Field | Required meaning |
| --- | --- |
| Action repository and full SHA | Exact `owner/repo@40-hex-commit` identity, including repository ownership; a fork and upstream are different identities even if their code matches. |
| Commit tree and distribution SHA-256 | Observed Git tree and hash of the executable `dist/main.js`; include the Action metadata/entrypoint identity and any additional executable files if the Action layout changes. |
| Verification procedure | A version and immutable digest of the protected verifier and ordered checks, toolchain versions, lockfile policy, provenance rules, and required regressions. |
| Result and provenance | Explicit `passed` result, timestamp, protected run URL/ID and attempt, tested Action SHA/tree/digests, procedure digest, and the record-promoting PR/head reference. |

The verifier must reject unsupported schema versions, absent fields, malformed
digests, duplicate or ambiguous records, a non-`passed` result, and procedure
drift. A timestamp helps audit but is not a freshness grant: a record remains
valid only while the exact selected Action identity and release-bundled
verification procedure match. A newer requirement on `main` cannot by itself
change an immutable consumer-pinned release. The revocation check below is
therefore required for every fast-path release. A newly required regression or
changed trust policy must raise its required procedure epoch, causing older
records to fail even when the Action SHA stays the same. If the procedure
deliberately changes without changing the record, the full path remains
required until a new record is promoted.

Promotion sequence (to implement before the first fast-path release):

1. A candidate PR proposes a new Action repository/SHA, its provenance, and
   the record or procedure update. The candidate is untrusted data. A separate
   protected-base verification workflow, for example a `workflow_dispatch`
   run with the candidate PR/head SHA as data, uses verifier and workflow code
   selected from the current protected Gatekeeper base. It checks out the
   candidate Action at its full SHA without review credentials and performs
   the complete provenance, frozen install, typecheck, test, and `dist`
   cleanliness checks. If the protected procedure requires rebuilding the
   distribution, it must also compare the rebuilt executable bytes to the
   selected commit, rather than infer reproducibility from a clean tree alone.
   The protected runner must collect command exit status and observed
   hashes itself; candidate code and package scripts cannot supply the final
   verdict or edit the protected verifier: execute candidate scripts in an
   isolated disposable environment without the verifier, runner command files,
   tokens, or writable access to the result channel. Use a fresh isolated job
   for record preparation, rather than trusting files or environment changes
   left by candidate execution. For #40, candidate verification also runs the
   descendant-held-stdio and large trailing stdout/stderr-drain regressions.
   The exact upstream `uses` post step must then be dogfooded in repeated
   protected-base runs with the existing full-per-run integrity job before a
   fast-path record for that identity is promoted. If the protected verifier
   cannot express a required new check, land that verifier
   update first under the existing full-per-run gate, then rerun the candidate.
2. A protected-base promotion verifier checks the candidate PR as data and
   produces a required verdict for its **current head and merge revision**.
   Its trusted code parses the proposed workflow and record without executing
   them, compares the exact proposed record bytes with the observed
   repository/SHA/tree/dist/entrypoint/procedure, and rejects any mismatch.
   If verification used a separate run, the promotion verifier retrieves that
   run and attempt through the GitHub Actions API and requires the expected
   Gatekeeper repository, protected workflow file and commit, allowed
   event/ref, successful verification job, current candidate PR head SHA, and
   procedure digest. It downloads only the trusted finalizer's result,
   verifies its API-reported artifact digest against the downloaded bytes,
   and checks the measured Action identity against the proposed record. The
   run ID and attempt in a PR are only selectors for this authenticated lookup;
   a PR-supplied URL, artifact, output, cache, or self-reported success cannot
   satisfy it. Any push that changes the PR head invalidates the verdict;
   reverify or safely reuse the same immutable Action measurement only after
   checking the new head and record bytes again. A failed, skipped, or absent
   promotion result makes the always-running required `accept` check fail.
3. The sole owner inspects the candidate code/provenance diff, protected run,
   exact `uses` target, record, and current required check, then merges. The
   owner is trusted to make this choice; no second human approval is claimed.
   The record becomes an authorization source for ordinary runs only after it
   is in protected `main` and bound to the called Gatekeeper release SHA.
4. A workflow revision may select a new Action without a record only while
   the existing complete credential-free verification remains mandatory on
   every enforced run. The first fast-path revision for that Action includes
   its matching promoted record, or the ordinary run fails closed. Keep the
   full-per-run gate during staging and dogfood; enable the fast path only in a
   later owner-promoted change after the required promotion check and negative
   tests are proven. A PR that changes the verifier or its procedure cannot
   activate that new code in the same merge: land the verifier under the old
   full-per-run gate, then run the protected candidate checks from that new
   base before promoting a record or enabling the fast path.

No check in a privileged `pull_request_target` run may execute code or package
scripts from a PR checkout. GitHub [describes the risk](https://docs.github.com/en/actions/reference/security/securely-using-pull_request_target):
that event runs trusted base workflow code with access to secrets, and executing
fork code after checkout crosses the boundary. Candidate Action tests must be
in a job with no caller secrets or review API key, only read permissions for
its `GITHUB_TOKEN`, `persist-credentials: false`, and no privileged later step
sharing its process or workspace. The
current self caller stays on the protected base and still tests the *old*
selection while reviewing a PR; its PASS cannot itself certify a proposed pin.

An alternative is a GitHub artifact attestation for the verification result.
That needs a protected issuer workflow, an exact allowed repository/workflow
identity and event/ref, a verified signature and timestamp, and claims binding
the same Action repository/SHA/tree/dist/procedure/result. A signature without
signer and claim validation is insufficient. It also adds attestation service
availability and API permission behavior to each ordinary preflight. GitHub
[documents signer identity and verification](https://docs.github.com/en/actions/concepts/security/artifact-attestations)
and [warns that signature, timestamp, and signer identity must all be
checked](https://docs.github.com/en/rest/orgs/attestations). This remains a
valid future option if protected in-repository promotion is inadequate; do not
mix its claims with an unsigned PR artifact.

## Ordinary enforced run

The fast preflight, when enabled, runs before any credential-bearing Action
step. It checks out only the called Gatekeeper revision (`job.workflow_repository`
and `job.workflow_sha`) with `persist-credentials: false`. GitHub [defines those
job identity properties](https://docs.github.com/en/actions/reference/workflows-and-actions/contexts#job-context)
for reusable workflows. The preflight must require the expected Gatekeeper
repository and confirm that the called SHA is on protected `main` after the
required-CI-promotion checkpoint; an arbitrary commit from a PR branch cannot
authorize a record merely by containing one. Failure to establish this
lineage fails closed. Every fast-path release must also read a current,
schema-validated revocation policy from Gatekeeper's protected `main` on each
enforced run. That policy may only deny identities: it specifies a minimum
verification-procedure epoch and revoked Gatekeeper release SHAs or Action
repository/SHA identities. The preflight rejects a record below the epoch or
matching a revocation. It never lets the current policy authorize a new Action
that the release-bundled record does not approve. The fetch must use the
expected Gatekeeper repository and protected `main`, not a caller-supplied URL
or PR ref. Bind the fetched policy bytes to the returned protected-main commit
and its repository lineage after the required-CI-promotion checkpoint. If a future
format uses a signature, verify its signer and claim as well. An absent,
malformed, inaccessible, or unverifiable current policy or unknown lineage
fails closed. A PR cannot declare its own changes to be current `main` policy.
A policy increase blocks already pinned consumer releases until
they update to a release with a newly verified record; an emergency Action or
release revocation blocks the fast path immediately. Releases predating this
feature retain the existing full-per-run verification. A fast-path release
published *without* this revocation check could not be retrofitted after its
SHA was pinned; no such release may be published.

The protected verifier parses the protected workflow structurally and requires
exactly one review Action `uses` target. It compares that literal
`owner/repo@full-SHA` with the integrity checkout target (if the
full path remains present), the manifest's repository and `headCommit`, and
the one promoted record. It rejects expressions, tags, ambiguous duplicate
steps, or references outside the approved set. It also checks the record's tree,
distribution digest, entrypoint and procedure against the protected
manifest and procedure digest. This is an identity comparison to previously
measured bytes; without an Action checkout it does not rehash fresh Action
bytes. The platform's full-SHA resolution supplies that last link.

The preflight emits success only after all comparisons pass. Keep `review`
dependent on successful `policy` and `codex-action-integrity`, and keep
`Architecture Gate / accept` as the authoritative required check. Failed,
skipped, cancelled, timed-out, inaccessible, ambiguous, or stale evidence means
failure before the Action receives `OPENAI_API_KEY`; there is no cache-based
approval or silent downgrade. An explicit fallback to the current full
credential-free verification is permissible only if it completes all checks
for the exact selected repository/SHA under protected verifier code. The
initial implementation should fail closed on missing records, which makes
first use and procedure changes visible to maintainers.

For the self-Gate, `pull_request_target` uses the protected-base caller and
local reusable workflow; the PR's proposed workflow, manifest, or record never
supplies preflight authority. Consumers must keep a protected caller pinned to
a protected-main, owner-promoted Gatekeeper release commit and supply only the
declared secrets. A caller that selects an unpromoted Gatekeeper commit is
outside this trust model and must fail the protected-main lineage check. Consumer branch
protection must prevent a PR from changing its own privileged caller to a
different workflow.
`job.workflow_sha` selects the corresponding protected record and verifier,
not Gatekeeper's current `main`; a consumer still pinned to an older release
retains that release's existing full verification. A consumer updating its
caller pin first runs the selected new workflow's preflight. Consumer-owned
prompt, schema, policy, and source-read credentials remain governed by their
existing protected-base and caller contracts.

## Negative cases, rollout, and recovery

Implementation tests must cover changed repository with the same SHA,
changed SHA/tree/dist/entrypoint, changed procedure, an unverified/failed or
skipped verification, PR-supplied replacement record/artifact/cache, malformed
or duplicate `uses` lines, and unavailable evidence. For the #40 switch to
`openai/codex-action`, the old Flair record must never match; the exact upstream
commit requires the full credential-free verification and its lifecycle/stream
regressions before promotion. The upstream migration itself remains in #40.

Stage an observe-only preflight beside the existing full job first. Compare its
identity decision with the full job across self-Gate and LIVE Agency runs,
including Action changes and deliberate negative cases. Only after the
required protected CI promotion gate, administrator enforcement, negative
tests, and successful dogfood should an owner-promoted workflow change skip the
repeated checkout/install/check/test/dist steps for an unchanged promoted
identity. Record policy, integrity, review, report, accept, and total attempt
durations before and after, along with outcomes,
cancellations, and change context; revise latency targets from those results
rather than the small baseline alone.

Rollback is an owner-promoted revert to the previous full-per-run integrity job
and its matching Action pin/provenance, followed by a fresh self-Gate and consumer
run. If the fast preflight or evidence store is suspect before that revert,
disable the fast route or leave the required check failing; never bypass
`codex-action-integrity` or mark `accept` successful without its required
review result. #40 separately retains the previous Flair fork as its upstream
migration rollback point.

## Decisions still needed before implementation

- Implement the protected-base candidate verifier and current-head promotion
  verdict inside the required check; enable administrator enforcement if
  available and verify the effective settings and failure behavior by API
  readback and a deliberately failing PR. CODEOWNERS remains advisory while
  there is only one owner.
- Specify the exact versioned record schema, procedure digest computation,
  protected candidate-verification trigger, result-artifact binding and API
  checks for the promotion gate, and whether the full-path fallback is
  implemented or missing evidence always fails closed.
- Specify the protected revocation-policy schema and authenticated fetch,
  seed it before the first fast-path release, and test that a revoked Action,
  revoked Gatekeeper release, higher procedure epoch, or unavailable policy
  blocks already pinned consumers before review credentials are exposed.
- Confirm the executable file set for the selected Action version and capture
  step-level timing so the achievable savings can be measured accurately.
