# AGK development handoff — 2026-10-12

This is a **development checkpoint**, saved at the owner's request. Read this document and `manifest.json` before resuming. The files in this directory are inert snapshots and patches, not adopted architecture, protected acceptance evidence, or an enabled deployment. Do not merge this archive branch into main. Continue the existing PRs.

## Objective and ownership

Finish the work inherited from PR #503: the bounded hosted Gemini review of PR #517, its pre-authentication admission, and the remaining default-development-line deployment. The separate Codex output repair associated with #522 is already merged through the limited #528 implementation; actual Codex PASS E2E was observed separately. It does not prove Gemini E2E.

Parallel chat **「PR 506のタスクを引き継ぐ」** owns mainline typing and ordinary Codex work. Use isolated worktrees, inspect current main, and preserve its source paths and commits. Do not reset or overwrite the original checkout or force-update shared branches.

The prior coordinator paused before merging #546. The owner's standing instruction is to continue authorized work unless an unresolved owner decision actually requires escalation. The latest request only prepares this handoff; no activation or model run is authorized by the existence of these snapshot files.

## Retained owner decisions and constraints

- The owner approved the limited #530 deployment for the single fixed-head #517 session and confirmed that the intended provider, service account and repository WIF binding match.
- Exactly **one unused hosted Gemini session** for #517 head `c4b0057d9dd47f79df2a896143f7ac6db5da2c2e`. No extra session, rerun, fallback, workflow recreation, or automatic run-ordinal advance is authorized.
- Ordinary caller workflow ID **381385696**: the last saved public readback showed **zero runs**; selected first ordinal **1**, attempt **1**. Re-read this before any READY event.
- Selector diagnostic workflow ID **381535290**: last saved public readback showed two historical failed runs. The correction in #546 is restricted to **run 3, attempt 1**, automatically triggered by its workflow-path push to main. It has not run. Never rerun or advance the ordinal silently.
- The owner explicitly waived unavailable `/review`. Independent code review, native AGK, and applicable CodeQL remain required before publishing implementation changes.
- CodeQL findings must not be dismissed, suppressed, hidden by SARIF rewriting, or avoided by expanding the trust model. Analysis success and unchanged findings do not mean zero findings.
- PR titles and descriptions are **English**.
- “Default development line” currently means registration on main, with this caller targeting feature/gemini-ci only. It does not enable general Gemini reviews on main or arbitrary branches.
- `GCP_WIF_PROVIDER` was reported unchanged by the owner. Earlier claims that the Secret required administrator repair were retracted: an added local AGK naming regex rejected the input; that did not establish an invalid Google configuration. #543 removes that grammar and delegates configuration validation to STS.
- Do not ask the owner again to recover the provider hash manually. The owner could not supply it. #546's bounded diagnostic captures the raw hashes without OIDC, Google authentication, checkout, extra permissions or a model call.
- The supplied SHA-256 `2180acf4e4c9e0a0a7ec6f997652c2f34e302d2b285bbeb3fd3c1d09688189c4` identifies the intended **effective service-account email**, read from an owner-supplied historical IAM command. It is **not** the raw repository Secret fingerprint.
- The local Codex chat **「codex-actionのtimeoutを見直す」** holds the private execution ledger and historical configuration context. One read succeeded previously, then the tool became unavailable. Existing approvals persist; fresh exact-source admission and unused-session verification still must be completed before execution. Do not invent ledger evidence from public CI.

## Current PRs and source checkpoint

| PR | State at handoff | What remains |
| --- | --- | --- |
| [#543](https://github.com/flair-agency/architecture-gatekeeper/pull/543) | Merged | Runtime pin is adopted squash c5686f63909af2e83b749ffa0b91d33cb9ea96ad |
| [#546](https://github.com/flair-agency/architecture-gatekeeper/pull/546) | Ready, unmerged, pushed head a29c9f246de231394a953e82415cb3fe6ba2accd | Refresh current main composition, normal protected merge, observe diagnostic 3/1 |
| [#532](https://github.com/flair-agency/architecture-gatekeeper/pull/532) | Draft, head 06bee7fdcb6d48f80173b3c7360bcf1d008511e2 | Restore one-file WIP; fill actual diagnostic metadata; review and adopt canonical record |
| [#530](https://github.com/flair-agency/architecture-gatekeeper/pull/530) | Draft, head bf0406b82ae7700b5e9fba4995da88be285a0de8 | Restore three-file WIP; compose final enabled caller/config with current main; complete checks and deployment |
| [#517](https://github.com/flair-agency/architecture-gatekeeper/pull/517) | Draft, fixed head, no session consumed | Remain Draft until all final admission conditions are verified; one READY event only |

Last observed main was **1789221578ebb5cbeb38ffe5479f67f5cc98267b**. It advanced after the tested #546 composition; those test results do not certify a newly composed tree.

Exact currently selected #517 tuple:

```text
base/runtime: c5686f63909af2e83b749ffa0b91d33cb9ea96ad
head:         c4b0057d9dd47f79df2a896143f7ac6db5da2c2e
merge:        96ab3902f95250a1c80aecec45434e04272ad548
tree:         8107feae6dbf6bc38b279fcab724fd42a5ad0097
parents:      [base, head], in that order
```

The Draft was closed/reopened once to refresh a stale synthetic merge. This did not emit READY or consume the ordinary workflow ordinal. Old 43e/20cc source tuples and the old 7dc runtime pin are superseded. The #517 PR body may still contain an old tuple; update it only after fresh source readback.

## Restore the unpublished changes

The source worktrees were left untouched. `manifest.json` lists each exact base, path, patch SHA-256 and restored-file SHA-256. Each of these three patches was applied to a temporary export of its exact base and every resulting file compared byte-for-byte with the original WIP: **all passed**.

1. Fetch the public repository and the exact base commits in the manifest.
2. Create a separate worktree per snapshot at its base commit, with a new owned branch if needed. Do not apply patches to current main blindly.
3. Run `git apply --check` and then `git apply` on the corresponding patch using its absolute path.
4. Verify the resulting file digests against `manifest.json`.
5. Integrate current main normally and re-evaluate current review/acceptance context before updating the existing PR branch. Do not force-push over another chat's changes.

Example, once this directory has been obtained:

```bash
git worktree add --detach /tmp/agk-pr530-resume bf0406b82ae7700b5e9fba4995da88be285a0de8
git -C /tmp/agk-pr530-resume apply --check /absolute/path/to/patches/pr530.patch
git -C /tmp/agk-pr530-resume apply /absolute/path/to/patches/pr530.patch
```

- `patches/pr530.patch`: workflow, real-process focused tests, investigation document. The paid job is still literal false; admission config is unchanged disabled/null.
- `patches/pr532.patch`: proposed `review-execution.md` record only. It is unmerged and not authority.
- `patches/historical-pr522-note.patch`: an untracked **superseded investigation**; preserve it as history. Its broad versioned semantic-result proposal was rejected in favor of #528. Do not implement it or seek renewed approval.
- `prospective-enabled-caller.yml.txt`: inert, prospective caller bytes; not a workflow file or activation. Its only permitted activation delta is documented in `prospective-caller-source.json`. Caller/config values must still be finalized and canonically adopted.

Same-workspace locations:
- #530 WIP: /workspace/scratch/agk334-main-activation-candidate
- #532 WIP: /workspace/scratch/agk334-default-caller-authority
- superseded note: /workspace/scratch/agk329-protected-handoff
- private exact evidence: /workspace/scratch/agk334-selector-opaque-evidence
- local handoff package, including dirty review worktrees and private evidence: /workspace/agk-handoff/2026-10-12

Older review worktrees may contain staged duplicate or superseded candidates. They are retained in the local private archive but are not newer deployment candidates. Runtime and final diagnostic source copies match #543/#546's public source bytes. The original main checkout is clean. All bounded agents completed; no active task exec session remains.

## Verification actually completed

### Runtime #543

Adopted c568 commit/tree 7969d78de78fa87444092bde77932ece741905df. Node 22.18 build/full **1448 PASS**, package/static-cycle/pack/offline-install/installed-smoke PASS, independent review with no actionable findings, native decision validated. Complete local CodeQL comparison: **55 JavaScript / 0 Actions**, original findings identical to parent, both model regressions PASS, changed extracted bytes matched. Hosted CodeQL [38179988064](https://github.com/flair-agency/architecture-gatekeeper/actions/runs/38179988064) and completeness succeeded. Its feature-branch checks were not claimed as protected semantic acceptance.

### Diagnostic #546

Reviewed base **1ec0c9167c7b7cb16bd80c95622c97e3a9de9c78**, head **a29c9f246de231394a953e82415cb3fe6ba2accd**, merge **08234b24783bb3630abcd7052edd318001dd31d3**, tree **7f07cda1db2b8d376c578f9d39491a0728d37f9f**.

- [CI 38182957554](https://github.com/flair-agency/architecture-gatekeeper/actions/runs/38182957554), job 114599212760 checked out that exact merge: **1496 PASS**, zero failures, skips or cancellations; build/model/installed smoke succeeded.
- [Hosted CodeQL 38182954897](https://github.com/flair-agency/architecture-gatekeeper/actions/runs/38182954897) succeeded.
- Fresh native decision `native-annotation-decision.json` SHA-256 **65ce6f57c075e7322b89f645e6ebd02601ee69731bb9ee6d43a81b440ab5e7db** was validated by the installed CLI. Independent composition review: no actionable findings.
- [Protected AGK 38183136194](https://github.com/flair-agency/architecture-gatekeeper/actions/runs/38183136194): actual review 114599817919, report 114600141516 and **accept 114600201760** all succeeded. Completeness 114599746496 succeeded. A skipped duplicate accept is not the proof.
- The older stale-payload protected run 38182955997 failed before the model because it paired new base/head with old synthetic merge a160; preserve that failure. A Draft/Ready context refresh for #546 produced the fresh successful run above. It did not trigger the feature-only ordinary Gemini caller.
- Whole-tree local CodeQL's latest comparison is scoped to the preceding **963e8d979301283709124602e06fb290fcf9ce0b** composition, not 1ec or current main. It retained **58 JavaScript / 0 Actions** results, checked 2118 artifact references, resolved only verified artifact-index drift, and found no added/removed result payloads. Original SARIF is unchanged. The next #547 composition added only typing/documentation and was independently inspected; no fresh whole-tree local scan of 1ec was claimed.

Final diagnostic source SHA-256:
- workflow: **67501937fb542ada33e0575d7e5f73a34f294e19711325da47b88e097b5e1232**
- test: **76dc978cdf5ab6ef5421a64a8f50f5598c744013b2d61193e57e87f042dd6eb3**

### #530 unpublished output-sink correction

Both inline classifier/admission appenders enforce canonical absolute existing regular output file, no symbolic/hard links, realpath identity, O_NOFOLLOW append without create, opened device/inode identity, bounded fixed protocol, safe closure and constant sanitized failure. Admission does not append a fallback after output failure. A close failure after writing admitted=true still fails the job; downstream execution retains GitHub's implicit success condition.

Independent targeted review found no remaining actionable findings. **Five focused tests PASS** under real Node 22.18 child processes in a Docker container with network disabled and source/dependencies read-only; actual subprocess coverage is retained alongside in-process fault injection. Host child Node EPERM failures were preserved, not skipped. There is no final enabled-candidate full-suite/native/CodeQL/protected acceptance yet.

Inactive caller SHA-256 **9e7c45a0aea5b4d957267b4efccfbc21998184a5ecd42ef4db5d252d52c5815f**.
Prospective enabled caller SHA-256 **ee0690f61eddf48c152c41e791b76b1549b60087259718d1bbf3f493e9ff8b21**.
Test SHA-256 **3fbb40780544122bdbc0ceac693a8ec8508793b3497f7544916c4be45966047f**.
#532 WIP authority-doc SHA-256 **5c4666b2e427bc61eebec5e886f515f79bea5adfe918939357ba74a876da694f**.

Local original decisions, SARIF comparisons and full CI log are archived privately; they are not uploaded as public handoff assets. In another environment, use the public hosted logs for source-scoped observations and prepare fresh native evidence for any changed candidate.

## Pending review findings and implementation invariants

#530 P1 comment **4242600850** and #532 P1 comments **4242691858, 4242691862, 4242691868, 4242691871** remain legitimate open prerequisites until concrete final metadata, mechanisms and canonical adoption are published. Do not resolve them merely from this WIP. Preserve the original BLOCK report.

The restored caller has:
- pre-OIDC event plus fresh API checks for repository identities, PR/base/head/merge and exact ordered commit parents/tree;
- caller/config read from the same immutable GITHUB_WORKFLOW_SHA and regular immutable Git blobs;
- protected workflow ID / selected run number / attempt and exact caller-byte hash admission;
- raw same-run queued Secret hash equality; this binds bytes, not owner intent or a principal proof;
- read-only preflight permissions, no checkout/third-party action, max 12 API calls, 45 seconds overall, 8 seconds per read, 1 MiB response and 100000-byte blob bounds.

Queued repository Secrets are immutable inputs to these jobs; no separate Environment selects different secrets. Do not claim atomic future PR protection or cross-process authentication from a hash.

The proposed canonical profile selects immutable c568 runtime, full six-member authority set, policy v6, CLI 0.62.0, gemini-3.8-flash/MEDIUM, no thinkingBudget, 180-second session, 16384 output tokens, 196608 encoded prompt bytes, 65536 stdout/stderr bytes each, workspace max 32 files / 131072 per file / 524288 total, and defensive 10 upstream dispatch cap (including CLI internals). WIF is a single acquisition with 60-second authentication deadline, global region, project derived from the same normalized strictly parsed effective SA email, 300-second credential with observed expiry 240–360, no runner renewal or fallback. Check these against actual pinned source and current adopted authority before recording/deploying; the proposal itself does not select them.

## Resume in this order

1. Read repository AGENTS.md, complete selected six-member authority set and development procedures. Refresh current main, PR #546 comments/checks, exact source/tree, protections and both workflow histories. Preserve parallel typing changes; refresh necessary composition evidence.
2. Merge #546 normally, with the current expected head and without administrative bypass. Read back adopted source/tree and observe automatic diagnostic **3/1**. Save only raw selector SHA-256 and bounded source metadata. No selector values are needed. If it fails, investigate the fixed reason/source; do not retry or advance the ordinal.
3. Fill #532's proposed canonical record with actual raw provider/SA hashes and diagnostic source/run provenance, exact caller-byte delta, current immutable source context and fixed operational limits. Review/adopt/read back through the repository's protected procedure; an unmerged proposal is not authority.
4. Complete #530's enabled caller/config and focused test assertions for the actual enabled configuration, preserving real-child negative cases. Compose with current main and update investigation/English PR description around the final implementation. Run appropriate build/full tests, independent review, native AGK and CodeQL **before publishing**. No full-suite/CodeQL CPU overlap. Require protected acceptance and normal merge under the existing limited-activation approval.
5. Resolve valid review threads only after concrete final evidence is available. Verify protected canonical/deployment readback, exact caller/config/secret hashes, fixed ID/run 1/attempt 1, unused grant/private ledger and #517 live tuple. Update its PR body to the exact current admitted source.
6. Only after all prerequisites, emit **one** #517 READY event. Observe actual Google authentication, Gemini review, report, enforced accept and source provenance. Operational repair is complete only with actual Gemini E2E success. No second session/retry is authorized if it fails.
7. Continue independently unless a genuinely unresolved owner decision remains. Existing owner approval and WIF binding confirmation do not need to be asked again.

## Environment notes

Prior workspace: /workspace; managed cloud. Task Node **/tmp/node-v22.18.0-linux-x64/bin/node** (host default was Node 24). Installed native reviewer: /workspace/scratch/agk503-codeql-fix-installed/node_modules/.bin/architecture-review-native. CodeQL **/tmp/agk503-codeql/codeql/codeql**, version 2.27.1, JavaScript queries 2.4.6, Actions 0.6.36. These paths are historical; verify availability in a new environment. Do not overwrite HOME for tooling.

Network-isolated Docker validation used cached node:22.18.0-bookworm, socket unix:///var/run/docker.sock and read-only locked dependencies mounted at **/deps/node_modules**. The host spawnSync issue was solved by real execution in this container, not by dropping child-process tests.

GitHub Draft/Ready tools can report a projection FORBIDDEN after the mutation already succeeds; read REST state before retry. GitHub-created source commits may not be present in local object storage yet; a failed git-show lookup is not a byte mismatch. Fetch or compare decoded immutable remote content.

No new chat was created or activation performed when preparing this handoff.

