# Release runbook

This procedure releases the npm runtime and its GitHub release from one reviewed
commit. The package workflow is triggered only by pushing a `v*` tag; do not
publish from a local checkout or a preview rehearsal.

## Choose the release channel

Numbered previews may distribute improvements to paths already supported by
the package. They must use the preview channel and must not claim adoption,
rollout completion, enforcement, or completion of new `OWNER_AMENDMENT` or App
routes. A preview is not a substitute for the formal v0.6.0 gates.

Formal v0.6.0 requires both protected self `OWNER_AMENDMENT / G0` cycles in the
canonical [architecture contract](architecture.md#development-sequence-and-v060-self-reference-profile-owner-decision):
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
   workflow for this SHA is green. `CI` runs the suite; package archive install
   and smoke are separate checks in the publication workflow and in the
   non-publishing rehearsal below. Save the review revisions/URLs and check
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

Retain the source SHA, version, `validate` output, `npm test` result, archive
filename, `$RELEASE_INTEGRITY`, proof that `docs/release.md` is packed, install
result, and installed-smoke result. For native review evidence, record the exact
reviewed SHA and returned decision; a source/package smoke alone is not a
semantic review.

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
`package.json` version agree, then runs `npm test`.

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
tag, using the matching `docs/releases/v<version>.md` notes when present. For a
preview run:

```sh
gh release create "$RELEASE_TAG" --repo flair-agency/architecture-gatekeeper \
  --verify-tag --prerelease --title "$RELEASE_TAG" \
  --notes-file "docs/releases/$RELEASE_TAG.md"
```

For stable, use the same command without `--prerelease`. Read back the release
URL, tag, target commit, draft/prerelease state, and body with:

```sh
gh release view "$RELEASE_TAG" --repo flair-agency/architecture-gatekeeper \
  --json url,tagName,targetCommitish,isDraft,isPrerelease,body
```

For a preview, verify `isPrerelease: true`. Record the package version,
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
