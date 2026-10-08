# Release runbook

This procedure releases the npm runtime and its GitHub release from one reviewed
commit. The package workflow is triggered only by pushing a `v*` tag; do not
publish from a local checkout or a preview rehearsal.

GitHub Releases are the canonical release history. Prepare and human-review
each release's notes in a temporary file outside the repository, pass that
file to `gh release create`, and do not keep duplicate changelog or release
notes files in the repository.

## Plan a release

Start a release planning issue using the
[Release planning form](../.github/ISSUE_TEMPLATE/release_planning.yml). Use
this section to plan scope, evidence and timing; use the procedures below to
freeze, publish and verify an artifact. A plan, milestone or preview does not
change the normative [architecture contract](architecture.md), select a
consumer route, or waive a publication gate. Record unresolved owner choices
as open and get them recorded in canonical authority before implementing a
new responsibility or assurance rule.

### Scope and evidence

List included and excluded delivery issues, acceptance criteria, dependencies
and the critical path. Identify required assurance, adoption and compatibility
evidence as well as any explicit deferrals. Distinguish shipping code from
consumer activation: publishing a package does not change a consumer's
protected policy. A scope change records its reason, affected criteria,
dependencies and schedule impact in the planning issue, then revises the
scenarios and agreement history before treating the new plan as current.

For every estimate, preserve the observation date and source, or label it an
assumption or unknown. Gather elapsed CI time by job, test category, archive
packing/install/smoke, review turnaround, external setup and approvals,
consumer verification, manual work, feedback handling, known failures and
recovery. Separate active effort from elapsed waiting and calendar capacity.
Do not count shared checks twice or turn a timeout into a measured review
duration. Reuse recent comparable work only when its scope and environment are
relevant; revise stale evidence. Keep reproducible command/run links and
observed start/end times so later plans can compare like with like.

For CI, capture the exact run with
`gh run view RUN_ID --attempt ATTEMPT --json headSha,event,jobs,url`; retain
job and step timestamps, outcomes and timezone. Measure local commands with
`/usr/bin/time -p COMMAND` and record runtime/machine context. The current
`npm test` reports the suite as a whole; do not label that total as unit,
integration or E2E time. If category data is needed, inventory non-overlapping
test files and run each category with `node --test test/name.test.mjs`; record
the exact command and files. Do not sum concurrent job durations into wall
time or count a step again with its parent job. For review and manual work, record
active effort separately from elapsed time; a timeout is a censored
observation, not a completed review duration.

### Version and channel

Use [Semantic Versioning 2.0.0](https://semver.org/) as the vocabulary for
public API compatibility: the specification describes MAJOR, MINOR and PATCH
for a stable `1.0.0` API, and prerelease identifiers have lower precedence than
the corresponding final version. This project is currently `0.x`. Its working
convention is that breaking public changes may use MINOR, compatible feature
additions may also use MINOR, and compatible fixes use PATCH; this is a project
convention, not a SemVer requirement or compatibility guarantee. Record the
affected package, CLI, configuration, workflow, Skill and
consumer interfaces; explain the selected version and migration guidance.
Do not imply that a SemVer label alone establishes support or consumer
activation.

Decide whether a preview gives useful feedback on changed, supported paths.
For each preview, record the intended content, version/channel, supported and
experimental limitations, ship criteria, observation window or trigger,
feedback owner, update/recovery procedure and promotion criteria. Do not
publish an unchanged or unverified version to satisfy a calendar date. Capture
feedback with the version and source SHA, consumer package/runtime pins,
reproduction, impact and evidence. Assess compatibility and scope impact;
update the issue's estimates, scenarios and owner agreement when feedback
changes the work. A preview feedback record is planning evidence, not proof of
formal adoption or a release gate.

Published versions and tags are immutable. Recovery means compatible consumer
pins or a new corrective release, never overwriting a published artifact.
Check consumer compatibility before asking users to update or pin back, and
document the corrective version and recovery steps.

### Effort and date scenarios

Provide three scenario ranges, with elapsed time and active effort separated:

| Scenario | Include | Required assumptions |
| --- | --- | --- |
| Shortest | Smooth execution with the required work and gates completed | Available capacity, review availability, dependencies and no rework |
| Target | Challenging delivery allowing for difficulty, uncertainty and ordinary rework | Evidence and assumptions supporting the central estimate |
| Longest recovery deadline | Bounded stalls and named recovery actions | Bounds, owner, trigger and recovery duration for each material risk |

Estimate remaining reviewable tasks from their acceptance criteria and
dependencies. Include implementation, unit/integration/E2E work, packaging,
reviews, external setup, approvals, consumer verification, feedback and known
recovery steps. Do not make a scenario shorter by omitting required gates or
parallelizing work that shares a dependency. A release deadline never waives
publication or assurance requirements.

Do not invent an upper bound. When review queues, owner availability, external
setup or another material dependency has no defensible bound, state that the
longest date is unknown or conditional, identify the trigger for reforecast,
and record what evidence would establish a bound. Name cases outside any
bounded scenario. A date proposal remains a proposal until the release owner
agrees to the scope, target date, capacity and assumptions in the issue.
Only then set the linked GitHub milestone to that target date. Keep the
shortest and longest assumptions, agreement date/owner, and subsequent
reforecasts in the issue history. Changing scope or a material assumption
requires renewed agreement and milestone update.

### Hotfix planning and response

Triage a proposed hotfix by user impact, severity, urgency, affected supported
version/channel and whether a normal release can meet the recovery need.
Record evidence and the decision, then bound the fix to the smallest
corrective change and its regression coverage. Identify the source branch,
concurrent planned work and every maintained branch that needs a forward-port.
Expedite coordination and review turnaround where possible; preserve required
architecture, security, compatibility, approval and publication checks. If a
required check cannot complete, the hotfix is not publishable through this
runbook.

Choose the patch or prerelease version and channel consistent with the
affected supported line and the existing publication workflow. This
repository's stable publication moves the `latest` dist-tag to the published
stable version; the current preview channel is `preview`. Thus the ordinary
hotfix path is a correction on the currently selected stable line or a
preview-channel correction. Do not describe publishing an older stable-line
patch as a routine hotfix: that would move `latest`. Supporting an older line
needs a separately designed and owner-adopted channel and publication policy
before use. This planning guidance grants no new publish route.

Before release, name the user communication, compatible update or recovery
steps, monitoring signals and follow-up owner. Preserve artifacts and logs.
After publication, verify the exact source, package, integrity, channel and
GitHub release readbacks using the runbook below. Record whether planned work
was interrupted, reforecast its scope and dates, forward-port the fix to each
maintained branch, and create follow-up issues for deferred cleanup. Never
rewrite a published artifact or skip a gate because the change is urgent.

### Checkpoints and retrospective

At planning, scope agreement, each preview or material feedback event,
candidate freeze, publication and follow-up, update the issue with date,
version/channel/SHA when known, completed and remaining criteria, estimate
changes, evidence links, blockers and decisions. If a required field is not
known, leave it explicitly unknown with an owner and next checkpoint. For
GitHub web submissions the form supplies these fields; CLI/API submissions
must include the same sections. Maintainers review completeness during triage
and at each checkpoint, request missing evidence, and keep dates proposed
until an owner agreement is recorded. This is a coordination practice, not a
new required acceptance check.

After the release, compare each scenario with actual active effort and elapsed
time. Attribute variance to implementation, test category, package work,
review, waiting, manual effort, feedback, rework, recovery or changed scope;
link the evidence. Map each inspection item to the guarantee it supports. If
shipping cost is high, inspect whether each check is valid, whether test time
or packaging is measured as a bottleneck, and whether existing CI/CD work can
be reused before proposing broad performance work. If feedback costs time,
improve intake, update and recovery instructions separately. Turn demonstrated
improvements into owned issues and record in the next release whether they
changed the measured cost or result.

Use this retrospective record in the planning issue (or a later issue edit):

```markdown
## Release retrospective
- Published version / channel / source SHA:
- Plan and actual: shortest __; target __; longest/recovery __; actual __
- Active effort versus elapsed waiting:
- Variance by implementation, test category, package, review, manual work,
  feedback and recovery (with evidence):
- Scope or assumption changes and owner/date decisions:
- What inspection protected, and any invalid or duplicate work found:
- Improvement issue, owner and verification in the next release:
```

Illustrative planning examples below are explicitly hypothetical unless linked
to a dated issue record. For historical estimates, #116 and #212 are examples
to reassess from their linked tasks and evidence; their old estimates do not
set current scope or a release date. Current records show #116's two protected
E2E cases remain the formal objective; #210 has host wiring/readback work,
#211 depends on that rollout, and #272 remains open. #212's 1–2 active-hour
estimate and #211's 2–4 hours are dated estimates, not current elapsed-date
bounds. #215 records one review deadline near 240 seconds and an outer delay
around 12 minutes, not a normal review duration. A separate normal observation
is [CI run 36975276625](https://github.com/flair-agency/architecture-gatekeeper/actions/runs/36975276625),
attempt 1, SHA `f9e1f06a32d618e8dcb95d410e8cbe1e27ba7c92`: job `test`
ran 2026-10-02 06:47:44–06:48:05 UTC (21 seconds); its test step took
10 seconds and pack/install/smoke took 5 seconds, included in that 21 seconds.
This single successful observation measures neither human effort nor queue
waiting, failed reviews or recovery. The #276 rehearsal did not run the full
suite and is not equivalent candidate-readiness evidence.
The earlier 6–12-hour preview overhead proposal therefore has no measured basis
in these records. Do not reuse it as a buffer or claim shortest/longest dates
from it. After this planning change is merged, prepare the v0.6.0 formal
release plan afresh from current evidence and owner agreement. This resets
planning assumptions only; canonical architecture and existing release gates
remain in force until the owner changes them through canonical authority.

**Hypothetical preview exercise (not a v0.6.0 plan):** the initial proposal
includes feature F in `0.8.0-preview.1`, channel `preview`, with an agreed target
of 2026-11-06 12:00 UTC. Consumer C reports a reproducible configuration failure
and supplies exact package/workflow/Skill pins, source SHA and log. The owner
records the impact, checks that C's unchanged protected policy still supports
the previous `0.8.0-preview.0` pin set, and verifies that recovery in the fixture
before recommending it. A pin rollback does not undo adopted authority.
Feature F is deferred; `0.8.0-preview.2` contains only the compatible fix.
The proposal changes to 2026-11-07 12:00 UTC, pending renewed agreement. The
feedback loop ends only after C reproduces the original failure, verifies the
corrective update and compatible recovery, and records results. Otherwise the
blocker and next observation remain open; a date alone does not end observation.
All versions, dates and results in this exercise are invented, not ship evidence.

**Hypothetical hotfix exercise:** suppose the currently selected stable line
is `0.7.2` on `latest`, and a high-impact regression requires a compatible
`0.7.3` patch. Scope is one configuration fix plus regression coverage; feature F
on the development branch is paused. The release maintainer records expedited
review and required check owners, uses the existing stable publish workflow,
and verifies source/version/integrity and `latest=0.7.3` readbacks. A tested
`0.7.1` package/workflow/Skill pin set is a recovery candidate only if the
consumer's adopted policy remains compatible; otherwise deliver a new fix.
Close monitoring after the affected consumer and fixture verify the original
reproduction, corrective update and available recovery. Forward-port the fix to
the development branch and re-estimate feature F; record the new proposal and
owner agreement instead of silently retaining the old date. These are invented
versions and outcomes; the example authorizes no older-line channel or skipped
gate and proves no completed recovery.

## Choose the release channel

Numbered previews may distribute improvements to paths already supported by
the package. They must use the preview channel and must not claim adoption,
rollout completion, enforcement, or completion of new `OWNER_AMENDMENT` or App
routes. A preview is not a substitute for the formal v0.6.0 gates.

Formal v0.6.0 requires both protected self `OWNER_AMENDMENT / G0` cycles in the
canonical [architecture contract](architecture/self-profile.md#development-sequence-and-v060-self-reference-profile-owner-decision):
the completed-`BLOCK` case and the completed-`OWNER_DECISION` case, including
the Issue #137 contract change. Each applicable cycle must bind exact B and
protected evidence, pass its protected queue transition, read back canonical
authority, and freshly review A. Also require the readiness and documentation
work tracked by [Issue #272](https://github.com/flair-agency/architecture-gatekeeper/issues/272)
to be complete. Missing any item means stop at preview; a numbered version or
successful ordinary `PASS` cannot be described as formal v0.6.0 readiness.

The existing `v0.6.0-preview.2` record cites source `c6c45da24d755ddd51b3a595e614242f869ec3ad`,
fixture PR 16, and run `36955785162`. That is an ordinary `PASS` fixture
observation. It does not demonstrate legacy-v1 adoption or either protected
amendment cycle. Keep those gaps visible in release and issue tracking.

## Freeze and review a candidate

1. Select the exact candidate commit SHA from protected `main`. Confirm
   `package.json#version` is the intended stable version or numbered preview,
   and that tag `v<version>` does not already exist. The release tag must point
   directly at this commit. Record the SHA, version, release channel, and
   expected tag in the release issue and project.
2. Review the complete candidate diff against the canonical architecture and
   the development guide. Complete the host-native Skill's local `PASS`, run
   Codex `/review` against the exact candidate, and obtain the required
   GitHub Code/Security Review on that exact head. Confirm the native `CI`
   workflow for this SHA is green. `CI` runs `npm test`, packs the archive,
   checks required archive paths, installs it offline and runs the installed
   smoke test. Save the review revisions/URLs and check
   run IDs. Reviewers assess the candidate; their review is not itself
   acceptance of a protected consumer route.
3. Run one actual synthetic consumer pull request against the fixed candidate
   pin. Use the fixture's complete committed policy, model and effort, prompt,
   schema, validation rules, and pinned caller/runtime. Capture the `policy`,
   `review`, `report`, and `accept` results, the sticky report/job summary, and
   the exact SHA and run. The expected ordinary `PASS` must reach the fixture's
   required `Architecture Gate / accept` check. Also exercise a candidate that
   the protected policy must reject and retain its `BLOCK` or
   `OWNER_DECISION`, report, and failing acceptance result; never coerce the
   semantic result to make the run green. Close synthetic PRs without merging
   unless the fixture procedure explicitly requires a protected transition.
4. Record the legacy upgrade/adoption gap for each affected consumer. Package
   installation does not change a consumer's protected policy. Follow
   [legacy v1 adoption](integration-reference.md#upgrading-legacy-v1-consumers)
   before relying on the repaired enforced route; inventory the protected-base
   authority, instructions, schema, validation selection, and immutable caller
   pin. Stop if the consumer has not adopted the required selection under its
   prior policy.
5. Run the read-only preflight and local package rehearsal below without
   creating or pushing a tag. The rehearsal must not call `npm publish`, create
   a GitHub release, or claim registry verification. Save command output and
   archive identity with the candidate evidence. A local rehearsal cannot
   stand in for the actual synthetic consumer PR or protected self E2Es.

### Non-publishing preflight and rehearsal

Run in the clean candidate checkout. Set `RELEASE_SOURCE_SHA` to the full
candidate commit and `RELEASE_VERSION` to its `package.json` version. This block
validates the same tag identity as the publication workflow, then packs and
smokes the archive locally. It does not create a tag or contact the registry.

```sh
set -eu
RELEASE_SOURCE_SHA='<full-candidate-commit-sha>'
RELEASE_REPO="$(pwd)"
RELEASE_VERSION="$(node -p "require('./package.json').version")"
RELEASE_TAG="v$RELEASE_VERSION"
RELEASE_REF="refs/tags/$RELEASE_TAG"
test "$(git rev-parse HEAD)" = "$RELEASE_SOURCE_SHA"
test -z "$(git status --porcelain)"
RELEASE_TAG="$RELEASE_TAG" RELEASE_REF="$RELEASE_REF" RELEASE_SHA="$RELEASE_SOURCE_SHA" \
  node scripts/release-channel.mjs validate
npm ci --ignore-scripts
npm run check:typescript
node scripts/check-source-cycles.mjs
npm test
RELEASE_TMP="$(mktemp -d)"
npm pack --ignore-scripts --json --pack-destination "$RELEASE_TMP" > "$RELEASE_TMP/pack.json"
RELEASE_ARCHIVE="$(node -p "require('$RELEASE_TMP/pack.json')[0].filename")"
case "$RELEASE_ARCHIVE" in ''|*/*) exit 1 ;; esac
RELEASE_ARCHIVE_PATH="$RELEASE_TMP/$RELEASE_ARCHIVE"
test -f "$RELEASE_ARCHIVE_PATH"
RELEASE_INTEGRITY="$(node -e "const fs=require('node:fs'); const crypto=require('node:crypto'); process.stdout.write('sha512-'+crypto.createHash('sha512').update(fs.readFileSync(process.argv[1])).digest('base64'))" "$RELEASE_ARCHIVE_PATH")"
node -e "const p=require(process.argv[1])[0]; if (!p.files.some(f => f.path === 'docs/release.md')) throw new Error('archive missing docs/release.md')" "$RELEASE_TMP/pack.json"
mkdir "$RELEASE_TMP/install"
cd "$RELEASE_TMP/install"
npm init -y >/dev/null
npm install --ignore-scripts --offline "$RELEASE_ARCHIVE_PATH"
node "$RELEASE_REPO/test/installed-smoke.mjs" "$PWD/node_modules/.bin"
cd "$RELEASE_REPO"
```

Retain the source SHA, version, `validate` output, TypeScript/output check,
source graph check result,
`npm test` result, archive filename, `$RELEASE_INTEGRITY`, proof that
`docs/release.md` is packed, install result, and installed-smoke result. For
native review evidence, record the exact reviewed SHA and returned decision; a
source/package smoke alone is not a semantic review.

Before tagging, inspect existing release state with read-only commands:

```sh
git ls-remote --tags origin "refs/tags/$RELEASE_TAG" "refs/tags/$RELEASE_TAG^{}"
gh run list --repo flair-agency/architecture-gatekeeper --workflow ci.yml --commit "$RELEASE_SOURCE_SHA" --json databaseId,headSha,status,conclusion,url
RELEASE_TAG="$RELEASE_TAG" gh api repos/flair-agency/architecture-gatekeeper/releases --paginate --jq '.[] | select(.tag_name == env.RELEASE_TAG) | {id, tag_name, draft, prerelease, html_url, target_commitish}'
npm view @flair-agency/architecture-gatekeeper versions --json --registry=https://npm.pkg.github.com
npm view @flair-agency/architecture-gatekeeper dist-tags --json --registry=https://npm.pkg.github.com
```

An existing tag or GitHub release is a stop condition until its commit and
channel are reconciled with the candidate. Confirm the exact version is absent
from the successful registry `versions` readback; an authentication or network
error is not evidence of absence. The dist-tag readback shows channel heads,
not every published version. After publication, the workflow verifies the
version and integrity against the packed archive. An empty result from one
command is not evidence that the other release surfaces are empty. Save all
readbacks with the rehearsal record.

## Run the tag-triggered publication

After the candidate review and channel-specific gates are complete, create
`v<version>` at the recorded SHA and push that tag through the repository's
normal protected release process. These are the only release-triggering
commands; run them only after all pre-tag gates are complete:

```sh
git tag -a "$RELEASE_TAG" "$RELEASE_SOURCE_SHA" -m "$RELEASE_TAG"
git push origin "refs/tags/$RELEASE_TAG"
```

The tag push triggers `.github/workflows/publish-package.yml`, which
checks out `github.sha`, verifies that it equals `HEAD` and that tag, ref and
`package.json` version agree, installs locked development dependencies with
`npm ci --ignore-scripts`, checks strict TypeScript and generated-output identity,
checks the static source import graph, then runs
`npm test`.

The workflow packs with lifecycle scripts disabled, checks required archive
paths, installs the archive offline in an empty directory, checks each public
executable and export, and runs `test/installed-smoke.mjs`. It computes the
archive SHA-512 integrity and publishes that exact archive with scripts
disabled. Preview versions first capture the existing stable `latest`, publish
under `preview`, and verify that stable `latest` did not move. Stable versions
publish under `latest`. Both paths read the version, integrity and dist-tags
back from GitHub Packages; any mismatch fails the workflow.

Review the exact workflow run and its checked-out SHA, package version,
archive/integrity output, and registry readback before proceeding. A failed or
ambiguous publish is a stop condition. Do not push the same version again or
create a replacement tag until registry state is read back and the release
owner determines whether that version already exists. Package versions are
immutable; recover by preserving the existing version and preparing a new
version from a reviewed commit. A rerun is appropriate only when the workflow
establishes that publication did not complete and the registry has no version
collision.

For a human readback, use the integrity emitted by this exact workflow run as
`EXPECTED_INTEGRITY`:

```sh
npm view "@flair-agency/architecture-gatekeeper@$RELEASE_VERSION" version dist.integrity --json --registry=https://npm.pkg.github.com
npm view @flair-agency/architecture-gatekeeper dist-tags --json --registry=https://npm.pkg.github.com
```

The first result must name `$RELEASE_VERSION` and its `dist.integrity` must
equal the workflow's `EXPECTED_INTEGRITY`. For a preview, `preview` must point
to `$RELEASE_VERSION` and `latest` must equal the workflow's captured
`STABLE_LATEST_BEFORE`. For stable, `latest` must point to `$RELEASE_VERSION`.
Save both command outputs before creating the GitHub release.

Once registry verification succeeds, create the GitHub release for the same
tag. Prepare the human-reviewed body in `RELEASE_NOTES_FILE` outside the
repository and verify the file exists and is nonempty before using it. For a
preview run:

```sh
RELEASE_NOTES_FILE='/absolute/path/to/reviewed-release-notes.md'
RELEASE_REPO="$(node -e "process.stdout.write(require('node:fs').realpathSync(process.argv[1]))" "$(git rev-parse --show-toplevel)")"
test -f "$RELEASE_NOTES_FILE" && test -s "$RELEASE_NOTES_FILE"
RELEASE_NOTES_FILE="$(node -e "process.stdout.write(require('node:fs').realpathSync(process.argv[1]))" "$RELEASE_NOTES_FILE")"
case "$RELEASE_NOTES_FILE" in "$RELEASE_REPO"/*) echo 'release notes must be outside the repository' >&2; exit 1 ;; esac
gh release create "$RELEASE_TAG" --repo flair-agency/architecture-gatekeeper \
  --verify-tag --prerelease --title "$RELEASE_TAG" \
  --notes-file "$RELEASE_NOTES_FILE"
```

For stable, use the same command without `--prerelease`. Read back the release
URL, tag, target commit, draft/prerelease state, and body with:

```sh
gh release view "$RELEASE_TAG" --repo flair-agency/architecture-gatekeeper \
  --json url,tagName,targetCommitish,isDraft,isPrerelease,body
```

For a preview, verify `isPrerelease: true`. Confirm the read-back body matches
the reviewed notes file, then remove the temporary notes file. Record the package version,
tag and peeled commit SHA, Actions run URL/ID, archive integrity, registry
version and dist-tags readback, and GitHub release URL/readback in durable
release evidence. Update the release issue and project with those links and
the remaining adoption or formal-release gaps. Do not report a release
complete until both registry and GitHub release readbacks match the frozen
candidate.

## Stop and recover

Stop before tagging if required reviews, native CI, the synthetic consumer
accept/reject run, a channel-specific assurance gate, or a required legacy
adoption record is missing or ambiguous. Stop publication if the workflow SHA,
tag/version, archive paths, installed smoke, registry integrity, or channel
readback disagrees. Preserve logs and observed registry state; fix the cause on
a new reviewed commit and use a new version when an immutable version may
already have been published. Keep the old tag and evidence intact for audit.

For formal v0.6.0, missing either protected amendment cycle or Issue #272
readiness is a release blocker even if the package and registry checks pass.
Preview notes must state which gates remain open and must not present
distribution or fixture smoke as protected adoption or acceptance.

## Issue #276 rehearsal record — 2026-10-02

The non-publishing archive check ran from worktree base
`09afd0a7fc2412f41ca38eda609303db49ad2b90` on branch `codex/release-runbook`
with an uncommitted documentation change. It packed version
`0.6.0-preview.2` into
`flair-agency-architecture-gatekeeper-0.6.0-preview.2.tgz`, included
`docs/release.md` among 88 files, installed offline with lifecycle scripts
disabled, and passed `test/installed-smoke.mjs`. The temporary archive
integrity was computed during the check, but it is not recorded here: this
guide is itself in the package, so embedding a digest of that archive would
change the bytes being described. The tag workflow's output is the durable
archive-integrity evidence for a release.

This was a package/archive rehearsal only. It did not run `npm test`, tag
identity validation, native reviews, native CI readback, a new synthetic
consumer PR, legacy adoption, either formal amendment E2E, registry readback,
or GitHub release readback. The current package version is the existing
preview.2 release whose recorded source is
`c6c45da24d755ddd51b3a595e614242f869ec3ad`; the fixture PR 16 / run
`36955785162` is only the ordinary `PASS` observation described above. The
rehearsal used the same version from a modified tree based on a newer commit,
so it is not a frozen or publication-ready candidate. Stop before creating or
pushing a tag. GitHub issue API access was unavailable during this rehearsal;
Issue #272 and #276 state/project fields still require readback and update by
the coordinator. Formal v0.6.0 gates remain open until separately evidenced.
