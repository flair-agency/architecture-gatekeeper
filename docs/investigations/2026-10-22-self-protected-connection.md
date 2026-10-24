# Self protected PR and Queue connection

This implementation follows the adopted B0 self profile and reuses #622/#624.
It changes neither Canonical Authority nor CI Policy. New jobs remain off unless
`ARCHITECTURE_GATE_SELF_APP_ENABLED` is explicitly set to `true`. Existing
Actions acceptance, ordinary Authority-change rejection, and the tag guard stay
in place. Host activation is a separate Owner decision.

## Execution boundaries

| Boundary | Production implementation | Verification and limit |
| --- | --- | --- |
| PR admission | `self-pr-context` and `self-pr-app-report` select current main, exact PR head and test-merge parents; the protected-base workflow starts and finishes the same App check | API/CLI negative fixtures reject stale base, wrong subject/repository/source and missing inputs; no production App run claimed |
| Ordinary PR | Previous-Policy full-Set comparison and existing Codex decision validator | A model PASS never substitutes for unchanged Authority; configuration migration remains evaluated under old Policy |
| Amendment PR | Reconstructed existing semantic preparation and same-run attested ELIGIBLE receipt | Exact B, selected trigger/scope, tag, evidence, source/run/attempt and digests remain required; result means Queue eligibility only |
| PR completeness | Existing metadata-only `pr-description` workflow reports L, including on PR-body edits | L remains required; PR App N does not duplicate this mutable-metadata predicate or require another model review after a body correction |
| Queue | Unprivileged `merge_group` relay wakes protected `workflow_run`; each privileged boundary reselects live Queue | Candidate workflow result/artifacts supply no authority; stale/recreated groups fail tuple checks |
| Queue completeness | Existing five-section PR-description validator on current exact PR tuple, reported as `completeness` by Actions App 15368 | Invalid metadata or incomplete retrieval cannot become unconditional success |
| Queue acceptance | Existing amendment gate or freshly prepared ordinary review, then separate dedicated-App report on exact Q | Raw ordinary result is revalidated against reconstructed input bytes; BLOCK/OWNER_DECISION and missing/skipped/failing work reject |
| Reporting | Dedicated App N, `architecture-gate / protected-accept`, has one-repository checks:write; model jobs receive no App key | PR and Queue use the same N name; begin in_progress, finalize same ID/SHA/name/App as success or failure; transport failure remains incomplete |

Fresh PR-context selection and protected Git-fetch failures finalize the begun
check as failure. An invalid local protected workspace or runner boundary fails
before requesting App credentials; such a failure cannot safely finalize a check
and remains incomplete. Queue final N independently checks the live description
in addition to required L.

If report-job dependency installation or compilation fails after trusted checkout
and Node setup, a source-only command calls the existing App reporter to finalize
the exact begun check as failure. It needs neither `dist` nor `node_modules` and
cannot report success. Missing trusted checkout/runtime, runner loss, cancellation
before reporting, or transport failure can still leave the check incomplete;
no untrusted recovery process receives the App credential.

Completeness describes the PR body observed when the check ran. A later body
edit reruns PR L, but does not promise atomic invalidation of an already reported
Queue check before merge. The delivery fields verify neither their claims nor
Authority, evidence or acceptance. This metadata observation is distinct from
the existing through-transition protection of amendment tag/evidence bindings;
those protections remain required. Completeness success does not extend that
protection to future body edits.

Workflow structure tests and synthetic API/CLI tests establish code composition,
not live GitHub enforcement. Installed-distribution verification is separate from
protected CI acceptance. The initial adapter uses the current Codex self Policy;
other provider projections are unsupported and fail closed.

## Minimal activation sequence (not executed)

1. Adopt this code by normal protected PR, leaving the activation flag off.
2. With separate Owner approval, install the dedicated App only on this repository
   with checks:write and metadata:read. Bind its ID/installation ID and private key
   to the existing main-only `architecture-gate-self-app-report` Environment.
   Keep the reviewer credential in the separately protected review Environment.
   Configure the adopted relay workflow numeric ID and existing amendment-tag
   ruleset ID. No reviewer or candidate job receives App credentials.
3. Enable protected reporting in shadow mode while retaining K+L: Actions
   `architecture-gate / accept` and Actions `completeness`. Verify exact live
   PR Check subject/source, failure reporting and same-run receipt retrieval.
   N is `architecture-gate / protected-accept`, the same acceptance context
   issued by the dedicated App for PR and Queue. Require K+N+L before removing
   K; verify both expected-App bindings on the actual host.
4. With separate approval, require Merge Queue, restrict to one PR per group,
   select merge commits, and remove the incompatible linear-history requirement
   while preserving all other protections. Require direct merges to remain
   prohibited. K has no Queue producer, so K+N+L temporarily stops merging; this
   is an explicit stopped phase, not an unprotected interval. Verify Q reporting
   and Queue L before replacing K+N+L with N+L. Do not remove K if either source
   or protection readback is incomplete.
5. After N+L and Queue protection are verified, perform actual exact-B adoption,
   two-parent/second-parent-B Canonical Readback, and fresh A review where
   applicable. Test C PASS admission and C BLOCK/OWNER_DECISION rejection.
   Failed activation stays stopped with the existing requirements retained;
   do not invent fallback, bypass, or reuse B0's admin exception.

This order is a proposal, not proof that a host setting has changed. Required
check coupling, expected-App identities, Environment custody, Queue retention,
base updates and regeneration need actual host evidence at activation.

## Remaining completion evidence

The current Policy selects the OWNER_DECISION profile. A BLOCK E2E requires a
separately approved prior-Policy selection of that existing profile; this PR
does not alter Policy or target scope. Both profiles still use the complete old
Authority Set and their existing target restrictions. The six-member BLOCK
implementation does not permit arbitrary member edits. Existing OWNER_ADDITION
consumer behavior is unchanged and is not routed into the self amendment path.

#210 integration and #211/#137 hosted cases remain incomplete until both genuine
trigger cases, protected merge, Canonical Readback, fresh A review when needed,
and subsequent ordinary development succeed without administrator exception.
B0 and local/synthetic fixtures do not satisfy those conditions or v0.6.0 final.

## Owner-initiated extension after #633

#633 was adopted at `1b3e67858ae1e9b4ba8602622e5baecb95321eef` by the
Owner-authorized one-time external T2 exception. That event is neither T0/T7
bootstrap nor ordinary OWNER_AMENDMENT acceptance, and does not complete #211.
The implementation adds the already adopted `owner-initiated-self-v1` selection;
it does not change the repository's selected Policy or activate reporting.

The new record and version 4 tag explicitly use `historicalTrigger: "none"`.
No historical ReviewRecord, attestation bundle or invented change A is supplied.
Semantic decision version 1 retains its seven checks with the new profile's
actual schema bytes/digest. The version 2 eligibility receipt replaces the
historical ReviewRecord digest with the absence marker. The protected producer
still attests the eligibility receipt; PR and Queue verify that provenance.
Completed BLOCK/OWNER_DECISION record, tag, receipt and schema formats remain
unchanged. An absent historical trigger is not an exemption from exact B,
old Policy/complete Set, selected target, semantic eligibility, tag protection,
Queue adoption or Canonical Readback.

After this implementation is adopted, a separately approved configuration-only
PR can select `owner-initiated-self-v1` in the existing enforced v2 (or supported
v6 Codex) Policy. Keep the selected target, complete Set and limits; do not bundle
Authority changes into that configuration PR. B must be prepared against the
subsequently adopted Policy, not a candidate's own selection.

For that future selected route, the source-checkout handoff command is:

```sh
GITHUB_REPOSITORY=flair-agency/architecture-gatekeeper \
AMENDMENT_BASE_SHA=<adopted-protected-base> \
AMENDMENT_B_SHA=<exact-B-head> \
AMENDMENT_PURPOSE='<Owner-authorized revision purpose>' \
OWNER_AMENDMENT_TAG_RULESET_ID=<existing-protected-tag-ruleset-id> \
node scripts/owner-amendment-owner-initiated-handoff.mjs
```

Run from an adopted checkout with locked dependencies/build and `GH_TOKEN`
supplied through the existing authorized operator environment. This command
writes the exact-B annotated tag and reads it back; it checks live main against
the supplied base first. Do not invoke it before approval for that operation.
Its result is evidence transport, not owner identity verification or acceptance.
No new package command, credential, workflow or automatic activation is added.

The remaining order is code adoption, prior-Policy selection, then the separately
approved shadow/required-check/Queue sequence above. The existing K tag guard is
retained, including for the new profile. The attempt classifier recognizes the
new preselection so the existing semantic signer can run; recognition never
makes K accept a tagged amendment. After host commissioning, rebase and prepare
an independently approved B (for example #632), perform normal N/Queue adoption
and Readback, then verify subsequent ordinary C. No additional exception is part
of this plan. Local tests use real Git objects and production CLI composition
with synthetic external API/attestation/model responses; they are not hosted E2E
or proof of through-transition host protection.
