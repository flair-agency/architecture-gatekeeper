# Distributed Authority Set: proposed first slice (2026-09-24)

This is a design proposal for [Issue #51](https://github.com/flair-agency/architecture-gatekeeper/issues/51), following the [Issue #50 reassessment](2026-09-23-architecture-responsibility-reassessment.md). It is **not** an amendment to the [architecture contract](../architecture.md), an adopted consumer policy, or an implementation. The owner decisions below must be recorded in canonical authority before a runtime or acceptance change is made.

## Why the current path is incomplete

The local runtime reads `authorityFiles` from one recorded Git revision. It can read a file inside a pinned submodule, but the configuration cannot name an independent repository. In enforced CI, the workflow reads policy, prompt, schema, and optional validation rules from the protected base. It does not materialize the named architecture documents from that base into the Codex Action prompt. The self-review prompt tells the reviewer to use the protected `docs/architecture.md`, while the checkout is the PR merge revision. That instruction does not itself prove which document bytes the reviewer used.

Source location, runtime dependency, and architecture authority are different relationships. A Provider can have an adopted parent contract without importing its repository at runtime or placing it in the Provider checkout. A link to that contract is not a bounded offline review input.

The [Provider PR #29 example](https://github.com/flair-agency/live-agency-provider-lark-base/pull/29) is the motivating regression: the parent record-dataset write contract was cited but absent from reported review authority. The aim is to review against the complete declared set, not to predetermine a `PASS` for that PR.

## Proposed contract boundary

The consumer selects a versioned, finite Authority Set. Each required member has a stable ID, repository identity, immutable commit, path, and content digest after resolution. A reviewed change cannot select a weaker set for itself. The shared mechanism validates and transports the selected bytes; it does not infer authority by following links, inspecting dependencies, or deciding that one repository outranks another.

The first implementation slice would accept only a same-repository member at the route's recorded authority revision or an external GitHub repository member at an explicit 40-character commit SHA. Moving external branch names, tags, release labels, recursive links, and submodule-derived external revisions remain future extensions. A submodule can still supply a file through the existing local path, but is not the distributed authority model.

Illustrative manifest shape, subject to the owner choices below:

```json
{
  "version": 1,
  "authorities": [
    {
      "id": "provider-architecture",
      "repository": "self",
      "revision": "authority-revision",
      "path": "docs/architecture.md"
    },
    {
      "id": "record-dataset-write-contract",
      "repository": "flair-agency/live-agency",
      "revision": "0123456789abcdef0123456789abcdef01234567",
      "path": "docs/architecture/record-dataset-write-contract.md"
    }
  ]
}
```

`authority-revision` resolves to the protected PR base commit in enforced CI and the single recorded `HEAD` commit in local/manual review. It is valid only for `self`. Both routes use the same manifest semantics, source IDs, ordering, limits, and validation, while their selected manifest revisions and source-access transports differ. The CI route must read the manifest or its selector from protected-base configuration; a PR version cannot change its own review inputs. The local route uses committed configuration at its recorded `HEAD`, with working-tree changes remaining review evidence. These routes do not claim to produce identical snapshots when they intentionally select different commits.

The resolver rejects unknown fields or versions, duplicate IDs, invalid repository identities and paths, unsupported revision forms, symlinks, submodule entries in the new manifest path, non-file objects, empty or oversized content, and excessive member count or total size. The precise limits belong in the adopted contract. It resolves every member before creating a model request. A bounded bundle contains escaped document content alongside `{id, repository, resolvedCommit, path, byteLength, sha256}`; it has a deterministic set digest over the ordered provenance records. The same bytes and IDs are supplied to the reviewer. No source checkout script, package lifecycle hook, or authority document is executed.

## Transport and trust boundary

In CI, a credential-scoped materialization step reads only the protected manifest and declared paths. Same-repository content comes from the protected base commit, not the PR merge checkout. External content comes from the declared GitHub repository and exact commit; the fetch adapter verifies the object is the requested regular file and computes its own content digest. The source-read credential is available only to this step. The Codex Action receives the completed prompt file and `OPENAI_API_KEY`, but no source-read credential or general repository-discovery permission. PR code remains evidence, and checkout-owned `AGENTS.md` remains disabled as reviewer instruction. Failure to fetch or verify one required member stops before model execution.

Local manual, Skill, and optional Hook paths call the shared resolver before their existing read-only reviewer transports. Local access to an external private repository depends on the user's source credentials and host permissions; denial or unavailable content leaves the review incomplete. It does not trigger a same-repository-only fallback. The local path continues to make a development-feedback claim, not CI acceptance or workstation integrity.

The current CI `protected-review-instructions: false` compatibility route does not acquire protected-authority assurance through this proposal. An adopted protected route must explicitly select the manifest and fail closed when it is absent or invalid. Older one-repository `authorityFiles` configurations remain supported with their existing claim; they are not silently reinterpreted as distributed, protected authority.

## Decision validation and provenance

Materialization failure is an incomplete review and cannot yield `PASS`, `BLOCK`, or `OWNER_DECISION`. A material conflict between successfully loaded authorities, with no adopted precedence or refinement rule, calls for semantic `OWNER_DECISION`. The reviewer prompt must state this distinction. The mechanism must not invent “parent wins” or “local wins.”

For a completed review, deterministic validation checks the decision's reported authority IDs against **all** required manifest IDs, rejects unknown or omitted IDs, and applies the consumer schema and validation rules. The current CI report only checks that a structured decision exists; this complete-set check must run before `review` can succeed and before `accept` can see a `PASS`. A reported ID is an inspectable assertion, not proof of the model's internal reading process. The bounded prompt and an end-to-end fixture provide the practical check that all declared bytes were available.

Report the selected manifest identity, each resolved repository/commit/path/content digest, and the set digest with the reviewed revision. These are same-run provenance metadata. They do not create the independently reusable evidence or attestation contract reserved for [Issue #20](https://github.com/flair-agency/architecture-gatekeeper/issues/20), and a digest alone does not grant acceptance.

## First implementation PR and verification

After the owner adopts the contract, one vertical implementation PR can add:

1. Strict manifest parsing and a shared source resolver/materializer, used by local/manual adapters and a CI preparation command. Keep the existing `authorityFiles` route explicit and unchanged.
2. A protected CI manifest selector, pre-review materialization into a temporary prompt bundle, complete-set decision validation, and provenance in same-run reporting. Keep the existing Codex Action and `Architecture Gate / accept` jobs.
3. Focused two-repository fixtures showing the exact committed bytes in local and CI requests; a PR-modified manifest cannot alter protected CI selection; missing commit/path/access, malformed entries, duplicate IDs, symlinks, and size limits stop before model execution; omitted IDs cannot produce an accepted `PASS`. A controlled conflicting-authority review verifies the `OWNER_DECISION` path without claiming that unit tests prove model comprehension.
4. Public integration guidance, installed-package smoke coverage, and self-dogfooding of the single-repository manifest route. Exercise manual/Skill/Hook paths as applicable, then use CI as the independent check. Reproduce the Provider PR #29 case with its declared parent contract before broader consumer rollout.

The first PR need not implement mutable external refs, generic Git hosting, automatic link discovery, precedence rules, new acceptance evidence, or a replacement for Codex Action. A later LIVE Agency adoption can pin the actual parent commit and establish the real regression result; test fixtures alone cannot establish it.

Rollout is opt-in. First land the contract and resolver behind explicit configuration, then adopt the manifest in a protected base and exercise the new path on a subsequent PR, because the first manifest-adding PR is reviewed under the previously protected policy. On failure, revert the adoption through normal protected-base review or keep the prior explicit route while repairing source access. Do not let a failed materialization dynamically downgrade an enforced run.

## Owner decisions still open

- Confirm the authority-source model, including whether `authority-revision` may select a local `HEAD` while CI selects the protected base, and where the manifest selector is recorded in protected policy.
- Choose the first supported external transport and identity check, the source-read credential scope for private repositories, and the per-file, count, and total-byte limits. The example's GitHub-only exact-SHA scope is a proposal.
- Choose how stable source IDs map onto the existing `authorityFiles` output and whether the new route requires an exact complete set for every decision, including `BLOCK` and `OWNER_DECISION`.
- Decide whether the current legacy CI compatibility route may coexist with the new explicit protected route and how its weaker assurance is named in integration guidance.

Reviewing this document or opening its PR does not adopt those decisions. The owner must record them in `docs/architecture.md` or another named canonical owner before implementation changes the review or acceptance contract.
