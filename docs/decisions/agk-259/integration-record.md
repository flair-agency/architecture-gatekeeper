# AGK-259 canonical integration provenance

This record accompanies the exact historical Adopt paragraph integrated into
`docs/architecture.md`. It records provenance and the later scope authorization;
it is not a new adoption schema or an additional normative rule.

## Original Proposal and owner outcome

- Original owner-targeted exact Proposal content: SHA-256
  `5d75fc1342078a381e19df8f4da46f567c5ec66035b5bb3f2cb126b76feaa0b9`.
  The owner's Adopt preceded Git binding, so commit
  `065f47cddcf444db8760b8358734004080a7f3c2` is not the revision the owner
  reviewed. It is a later Git placement of those exact bytes at
  `docs/decisions/agk-259/decision-package/proposal.md`, blob
  `7201987e5f593a0b74d307abfde4e60d2decc78e`.
- Original outcome record: commit
  `3641064e782706afaa430178dbe65c855325eeec`, path
  `docs/decisions/agk-259/decision-package/adoption-record.json`, blob
  `56406a9e9c635b6bd3fdbc67afff060bb66486b0`.
- Local transcription of the direct owner reply: the same commit, path
  `docs/decisions/agk-259/decision-package/owner-evidence.md`, blob
  `90c835fe2f6b5a65e2b3ab0c3069ac80f8a83c0f`. It records adoption of the
  sole Proposed Decision paragraph as written and makes no independent
  authentication claim.
- The historical Adopt remains unchanged. Its sole adopted content is the one
  paragraph at the Proposal's `## Proposed decision` section. The displayed
  prefix `**Proposed Decision (the exact content offered for owner review):**`
  is preserved in canonical text as a historical presentation label; it does
  not mean that the integrated text is still merely proposed. The operative
  status comes from the original Adopt record.

## Later copy identities

The original Proposal copy was later placed at commit
`4bb2da5b5e1bbbdaf55c5ad5e1578cef8195ed94`, path
`docs/decisions/agk-259/proposal.md`, blob
`7201987e5f593a0b74d307abfde4e60d2decc78e`, with the same SHA-256 above. This
copy commit/path and the canonical copy are not the revision the owner
originally reviewed; neither creates a new owner outcome.

The exact adopted paragraph is copied without wording changes into
`docs/architecture.md` under `#### Initial protected CI provider selection
(#259 owner outcome)`, immediately after `#### Target Gemini CI authentication
selection` and before `#### GitHub step-output sink`. The owner-approved diff
was `canonical-preview.diff`, SHA-256
`e34fe3686373da195b9b07d695f7b32947229474ce441339256c106d7e33be38`. The
resulting full-file candidate has Git blob
`abde01698c6c39b6f203a3c6705d46643f3fe536` and SHA-256
`39ff2e9a31ae0a2d25a9236a2a351f630f76fbb9bc15d9466dc5db2b457c8d55`.

The adopted clause maps as one indivisible paragraph from the Proposal's sole
Proposed Decision paragraph to the new subsection in `docs/architecture.md`.
Its conditions and exceptions remain in that exact paragraph. In particular,
the final sentence is retained verbatim and, under the owner's later scope
instruction below, means the recommendation itself does not perform a canonical
transition. This integration records the adopted recommendation in canonical
authority; it does not activate a provider route or add a release prerequisite.

## Later owner scope instruction

Date: 2026-10-04 (Asia/Tokyo). Current chat ID:
`01a10366-9527-73f0-a545-cd9cbdce8ff5`.

The coordinator asked exactly:

> 元Adoptを維持し、この同じparagraphをAGKのcanonical authorityへ反映することを認めますか？ 最終sentenceは「recommendation自体はcanonical transitionを行わない」という意味で保持します。

The owner replied exactly: `承認します`.

This explicit scope approval authorizes integrating the same paragraph while
preserving the historical Adopt, exact wording, and the stated interpretation
of its final sentence. It does not amend or replace the Adopt, change its
applicability conditions, authorize route activation, or create a release gate.
The original outcome's exception is preserved as recorded; this later
instruction authorizes the canonical integration step and clarifies that the
paragraph's final sentence describes what the recommendation itself does. The
owner's message is direct evidence from the current chat; no independent
authentication is claimed.

## Review history

The earlier native Architecture Review was performed by
`/root/agk259_canonical_preview_review` against recorded authority revision
`17791c2d06ab29873a00d4ff626cb2eda226ed6c` (architecture contract SHA-256
`20c083d55ff85250fe118a55a4f393705c5985dadea1b30efd506afbd9f0b3f7`). It
returned `OWNER_DECISION` because canonical-update scope authorization was then
unresolved. That result remains the historical review result; it is not
rewritten as `PASS`. The current owner scope approval resolves the owner choice
required for this integration only.

This record documents provenance and the approved integration scope. It claims
no protected acceptance, provider activation, or independent authentication.
