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
*selected immutable Action identity* matches an independently approved, fully
verified identity. It would not rerun the Action tests on every pull request, nor
prove that GitHub's service and runner execute without compromise. The
remaining platform assumption is that GitHub Actions resolves a full-SHA
`uses: owner/repo@commit` to that commit's Action code. GitHub [documents
full-SHA pinning](https://docs.github.com/en/actions/how-tos/create-and-publish-actions/manage-custom-actions#using-a-commits-sha-for-management)
as an immutable Action reference; the preflight must still establish which
repository and SHA were approved and that the approved checks passed.

## Trust boundary and approval prerequisite

The only actors allowed to authorize a reusable verification record are the
Gatekeeper maintainers acting through a reviewed change to its protected main
branch. The record, verification procedure, verifier, and reusable workflow must
be read from the same `job.workflow_sha` of the called Gatekeeper workflow. That
SHA is also the identity consumed by an exact-SHA consumer caller. A pull
request's files, artifacts, job outputs, comments, caches, or self-declared
status are data to inspect; none can become a trusted record.

**The current main-branch settings do not yet enforce the approval premise.**
At the time of this design (2026-09-23), the branch has a strict required
`architecture-gate / accept` check and requires conversation resolution, but
requires zero approving reviews, does not require code-owner review, and does
not enforce its rules for administrators. CODEOWNERS names security and
architecture for `.github/`, but that file alone does not enforce approval.
Consequently, placing a record on `main` today proves that it is from the
called Gatekeeper revision, **not** that security/architecture owners approved
the Action. Before enabling the fast path, enforce at least one relevant
security/architecture owner approval for changes to the Action selection,
record, verifier, verification procedure, and workflow; require stale approvals
to be dismissed, retain the required Gate check, and prevent bypass of these
rules by administrators or equivalent actors. Verify the effective repository
rules by API readback and an attempted unapproved test PR. Add explicit
CODEOWNERS coverage for the record under `provenance/`, the verifier under
`src/`, and the procedure/tests as well as the existing `.github/` workflow
coverage; check that the required owner can actually approve each sensitive
path. If this governance cannot be enforced, keep full verification on every
enforced run.

This trust model treats compromise of the protected Gatekeeper repository,
its authorized approvers, the GitHub Actions service, or its runner as outside
the protection supplied by the fast path. A record cannot compensate for such
compromise. The document does not claim that a full-SHA pin or cache hit alone
constitutes a successful verification.

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
| Result and provenance | Explicit `passed` result, timestamp, protected run URL/ID and attempt, tested Action SHA/tree/digests, procedure digest, and the record-promoting PR/approval reference. |

The verifier must reject unsupported schema versions, absent fields, malformed
digests, duplicate or ambiguous records, a non-`passed` result, and procedure
drift. A timestamp helps audit but is not a freshness grant: a record remains
valid only while the exact selected Action identity and required verification
procedure still match. A newly required regression or changed trust policy
invalidates the old record even when the Action SHA stays the same. If the
procedure deliberately changes without changing the record, the full path
remains required until a new record is promoted.

Promotion sequence:

1. A candidate PR proposes a new Action repository/SHA, its provenance, and
   the record or procedure update. The candidate is untrusted data. A separate
   protected-base verification workflow, for example a `workflow_dispatch`
   run with the candidate PR/head SHA as data, uses verifier and workflow code
   selected from the current protected Gatekeeper base. It checks out the
   candidate Action at its full SHA without review credentials and performs
   the complete provenance, frozen install, typecheck, test, and `dist`
   cleanliness checks. If the approved procedure requires rebuilding the
   distribution, it must also compare the rebuilt executable bytes to the
   selected commit, rather than infer reproducibility from a clean tree alone.
   The protected runner must collect command exit status and observed
   hashes itself; candidate code and package scripts cannot supply the final
   verdict or edit the protected verifier: execute candidate scripts in an
   isolated disposable environment without the verifier, runner command files,
   tokens, or writable access to the result channel. Use a fresh isolated job
   for record preparation, rather than trusting files or environment changes left by
   candidate execution. For #40, verification also
   performs the descendant-held-stdio and large trailing stdout/stderr-drain
   regressions and observes completion of the Action post step. If the
   protected verifier cannot express a required new check, land that verifier
   update first under the existing full-per-run gate, then rerun the candidate.
2. The protected run publishes observed results for review. Its artifact or
   output is **not** an authorization source for ordinary runs. A separate
   protected-base promotion check retrieves the named run and attempt through
   the GitHub Actions API and requires the expected Gatekeeper repository,
   protected workflow file and commit, allowed event/ref, successful run and
   verification job, candidate PR head SHA, and procedure digest. It downloads
   the result produced by the trusted finalizer job, verifies its API-reported
   digest against the downloaded bytes, and compares the observed Action
   repository/SHA/tree/dist and procedure with the proposed record. The run
   ID and attempt in a PR are only selectors for this authenticated lookup;
   a PR-supplied URL, artifact, or self-reported success cannot satisfy it.
   An artifact from a PR workflow, a different run or attempt, or a
   candidate-controlled job is rejected. The promotion check is required on
   the **current PR head or merge revision** and compares the exact proposed
   record bytes; each subsequent push invalidates the check and needs a fresh
   candidate verification or an explicitly validated reuse of the same Action
   identity and procedure. Security and architecture owners inspect the exact
   source/provenance diff, protected run, selected `uses` line, and resulting
   record. They approve the promotion PR under enforced branch rules. The
   record enters the trusted store only with that approved merge. The human
   approval covers the run, candidate code, and record.
3. The first workflow revision that selects the new Action includes the
   matching approved record, or the ordinary run fails closed. Keep the old
   full-per-run gate during staging and dogfood; enable the fast path only in a
   later reviewed change after the approval rule and negative tests are proven.

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
approval-policy checkpoint; an arbitrary commit from a PR branch cannot
authorize a record merely by containing one. Failure to establish this
lineage fails closed. The protected verifier parses the protected workflow
structurally and requires exactly one review Action `uses` target. It compares
that literal `owner/repo@full-SHA` with the integrity checkout target (if the
full path remains present), the manifest's repository and `headCommit`, and
the one approved record. It rejects expressions, tags, ambiguous duplicate
steps, or references outside the approved set. It also checks the record's tree,
distribution digest, entrypoint and procedure against the approved protected
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
a reviewed, merged Gatekeeper release commit and must supply only the declared
secrets. A caller that selects an unreviewed Gatekeeper commit is outside this
trust model and must fail the protected-main lineage check. Consumer branch
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
changed SHA/tree/dist/entrypoint, changed procedure, an unapproved/failed or
skipped verification, PR-supplied replacement record/artifact/cache, malformed
or duplicate `uses` lines, and unavailable evidence. For the #40 switch to
`openai/codex-action`, the old Flair record must never match; the exact upstream
commit requires the full credential-free verification and its lifecycle/stream
regressions before promotion. The upstream migration itself remains in #40.

Stage an observe-only preflight beside the existing full job first. Compare its
identity decision with the full job across self-Gate and LIVE Agency runs,
including Action changes and deliberate negative cases. Only after protected
approval settings, negative tests, and successful dogfood should a reviewed
workflow change skip the repeated checkout/install/check/test/dist steps for
an unchanged approved identity. Record policy, integrity, review, report,
accept, and total attempt durations before and after, along with outcomes,
cancellations, and change context; revise latency targets from those results
rather than the small baseline alone.

Rollback is a reviewed revert to the previous full-per-run integrity job and
its matching Action pin/provenance, followed by a fresh self-Gate and consumer
run. If the fast preflight or evidence store is suspect before that revert,
disable the fast route or leave the required check failing; never bypass
`codex-action-integrity` or mark `accept` successful without its required
review result. #40 separately retains the previous Flair fork as its upstream
migration rollback point.

## Decisions still needed before implementation

- Select and enforce the effective approval rule for security/architecture
  ownership, including administrator/bypass behavior, and verify it by API
  readback and an unapproved PR. Current settings are insufficient.
- Specify the exact versioned record schema, procedure digest computation,
  protected candidate-verification trigger, result-artifact binding and API
  checks for the promotion gate, and whether the full-path fallback is
  implemented or missing evidence always fails closed.
- Confirm the executable file set for the selected Action version and capture
  step-level timing so the achievable savings can be measured accurately.
