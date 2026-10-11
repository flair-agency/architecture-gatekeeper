# Ordinary Gemini default-branch caller admission candidate

**Status: inactive; admission preparation only.** The owner has already approved
one bounded session for PR #517. That approval remains in force and does not
supply the missing technical admission values. The caller's privileged job is
still guarded by literal `if: false`, and the admission configuration is
`enabled: false` with `workflowId`, `runNumber`, `callerSha256`,
`providerSelectorSha256`, and `serviceAccountSelectorSha256` all `null`. No OIDC
request or provider call is authorized by this inactive candidate.

## Bounded selection and outstanding admission data

The selected proposal is limited to the existing ordinary caller on the default
development branch, currently `main`, for one session on PR #517 targeting
`feature/gemini-ci`. The immutable proposed tuple is:

- PR head: `c4b0057d9dd47f79df2a896143f7ac6db5da2c2e`
- protected base: `43e9a28571ad0508a425220256a18d6b140525b2`
- reviewed merge: `20cc0c1a58ee8263898a56c8df34472bd14ea173`
- ordered merge parents: `[protected base, reviewed head]`
- reusable workflow revision: `7dc99525b4ff1510f1de310f6f5b877ab05bbfd2`

This does not route Gemini to PRs targeting `main` or another branch and does
not import FEATURE authority into the default-branch canonical Set. The caller
continues to select its protected feature policy, prompt, schema,
decision-validation files, and complete six-member Authority Set from the
consumer target.

Before any OIDC-capable job can run, the fixed admission record must contain the
actual numeric workflow ID, exactly one `run_number`, attempt 1, the exact
caller SHA-256, and SHA-256 fingerprints of the owner-confirmed provider and
service-account selectors. Those values are currently unavailable in the
configuration. A failed or unrelated event consumes the selected ordinal; it
cannot advance automatically to another run. A different ready event, retry,
recreated workflow instance, or changed tuple is denied. The owner-approved
session cannot be repeated or replaced with provider fallback.

The prospective activation delta, after canonical adoption and recording and
verification of those fixed inputs, is limited to the architecture-gate job's
`if` line. The expected prospective active-source SHA-256 is
`9c792884f07d228a42ace202f221030273d6f51e74d738d7d09d3480d7001a68`; the
prospective inactive-source SHA-256 is
`b2622fa74c9c4e071726120c6146a8e10133bd6ea4399a66cc1b8c1d0374cad3`. These
are source-planning references, not evidence that the current file or config
has been activated. No source change to that line is made here.

## Admission boundary and evidence map

| Risk or invariant | Current boundary and evidence | Remaining proof |
| --- | --- | --- |
| Candidate PR data must not choose trusted caller/configuration bytes. | The inline protected-admission Node script uses read-only GitHub API GETs to fetch the tree and regular-file blobs at `GITHUB_WORKFLOW_SHA`; it compares the caller's exact-byte SHA-256 with the config. It does not check out or evaluate candidate code. | Live host execution with the actual immutable source revision and fixed digest. |
| The event, run, and PR must identify one exact session. | The script checks the event tuple, live PR/head/base/merge, run ID, workflow ID, run number, attempt 1, and ordered parents `[base, head]`. Its current source also requires a configuration with `enabled: true` and non-null fixed IDs/digests, so the checked-in false/null config fails closed. | Actual workflow ID, selected run number, fixed fingerprints, canonical record, and point-in-time live API admission. No auto-ordinal advancement. |
| OIDC and provider access must stay behind admission. | Classifier and protected-admission jobs each have `id-token: none`; the admission job has only contents/actions/pull-request read permissions. The privileged `architecture-gate` job retains literal `if: false`, even though its reusable-workflow permissions include `id-token: write`. | Canonical adoption and the authorized one-session activation after every fixed input is verified. No OIDC/provider call occurred in this preparation. |
| API input must be bounded and fail closed. | The inline script allows at most 12 API calls, 45 seconds overall, 8 seconds per request, and 1 MiB per response; redirects, malformed data, unavailable reads, or identity mismatches deny admission. | Live GitHub API behavior and host workflow-expression behavior. Local mocked responses do not prove either. |
| Protected source identity and PR candidate identity must remain distinct. | The script reads caller/config from the commit identified by `GITHUB_WORKFLOW_SHA` (the default-caller workflow source) and independently requires the live run's `head_sha` and PR head to match the proposed candidate head. The workflow pin is fixed at `7dc99525b4ff1510f1de310f6f5b877ab05bbfd2`. | Exact live source revision and run metadata. A matching caller digest or selector fingerprint proves neither Google IAM configuration nor authentication. |
| Provider selectors must match the owner-confirmed selection without disclosure. | The script compares SHA-256 of the exact UTF-8 selector bytes, with no appended newline, against the protected config. The original selector values are not needed in public canonical text. | Actual selector fingerprints and independent IAM/authentication evidence remain unavailable. No selector value or secret is recorded here. |

The current script is inline in the protected workflow. It has no candidate
`eval`, shell interpolation of candidate content, or candidate-selected script
path. Its live source/config reads are bounded. This preparation does not claim
that GitHub evaluated the workflow or its expressions, or that a future
admission would prove Google IAM state.

## Prior-source and parallel evidence

The protected Architecture Gatekeeper run `38161465058` reported `BLOCK`; its
report remains preserved at [PR #530](https://github.com/flair-agency/architecture-gatekeeper/pull/530#issuecomment-6111946463).
The owner later confirmed the WIF provider, service account, and repository
binding and approved the bounded deployment in the [PR #530 discussion](https://github.com/flair-agency/architecture-gatekeeper/pull/530).
Those statements satisfy the owner decision; this task does not ask for another
approval. They are not independent Google Cloud readback or proof of current
authentication. The `BLOCK` remains unchanged.

The [historical #334 verification comment](https://github.com/flair-agency/architecture-gatekeeper/issues/334#issuecomment-6091422910)
records a prior authenticated private feature trial (run `38007536879`, attempt
1): CLI 0.62, `gemini-3.8-flash` / `MEDIUM`, the existing 10-call cap, seven
HTTP 200 responses, a validated 4,087-byte JSON response, and deterministic
replay. It is evidence only for that prior feature trial. It proves neither
this ordinary caller's admission nor authentication, cost, host protection,
general stability, or acceptance. No paid call is repeated here.

Earlier development verification recorded against the `6fe98cb8109d7b17f73bafde64df34a2c0fb0104`
baseline and the earlier caller source is historical, not verification of the
new admission script/configuration. In particular, prior CodeQL, native Skill
E2E, source preparation, and workflow checks do not establish current source
analysis or live host behavior. No new CodeQL, native E2E, or full-test success
is claimed here. The full `npm test` run is being handled independently.

Separately, PR #522 at current head `e839…` passed AGK run `38163248397` with
an actual review report and successful CI, and both CodeQL languages passed.
That parallel work is owned by its separate task and does not prove or activate
this caller.

## Focused verification and remaining work

The current caller-focused five-test suite and `test/workflow-structure.test.mjs`
passed. The caller suite executes the actual inline admission script against a
mocked GitHub API fixture and checks exact identity, ordered-parent, byte,
size, deadline, API-count, and fail-closed cases. It also uses a synthetic YAML
parser/evaluator; these checks are local diagnostics, not GitHub's expression
engine, live API admission, or protected acceptance. Exact current-source
CodeQL and native E2E verification remain pending. No `/review` attempt is
waived.

The remaining activation prerequisites are the actual fixed workflow ID and
run number, exact caller digest, selector fingerprints, their canonical record
and verification, canonical adoption and exact target readback, followed by
read-only live admission against the immutable PR tuple. Only then may the
previously approved single workflow session proceed. Its HTTP calls and
internal retries remain under existing consumer-policy caps and deadlines.
