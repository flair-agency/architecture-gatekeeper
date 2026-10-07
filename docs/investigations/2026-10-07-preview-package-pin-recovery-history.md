# Preview package and pin recovery history

This repository-only record was extracted on 2026-10-07 from
`docs/integration-reference.md` at source commit `3f71fece350c`. The source
section has SHA-256 `0ceb021e18438c5e1d66b66ae7a0151ee81bf2504fb18013a3960ee958aaa9f7` and is preserved verbatim below. Its
rehearsal event date is not stated in the source; the filename date records
this extraction, not a new test or current recovery recommendation.

The record reports source-matched local archives and a synthetic fixture. It
does not establish a registry artifact readback, selected consumer pins,
protected execution, adoption, or safe rollback. Use the current [preview
support and recovery status](../integration-reference.md#preview-support-and-recovery-status)
for supported package behavior, and the [legacy v1 upgrade procedure](../owner-intervention.md#legacy-v1-consumer-upgrade)
for current operator steps.

#### Package and pin recovery

Recovery is a compatibility check over an exact package, workflow, Skill,
protected policy and caller tuple. Package installation alone changes none of
those protected consumer inputs. Before recommending an update or pin change,
record and test each component against the same committed fixture and preserve
the authority and receipt history.

The available preview.2-to-preview.3 rehearsal has limited results. The
preview.2 source is [`c6c45da24d755ddd51b3a595e614242f869ec3ad`](https://github.com/flair-agency/architecture-gatekeeper/tree/c6c45da24d755ddd51b3a595e614242f869ec3ad); its offline archive SHA-256 is
`997f34c8a73826fffe1800bedddb29f8c2b6a62bba3f3adbd9d37dd46bd6cbea`, and
all 87 packed files matched that source. The historical preview.3
implementation source is
[`9822ab915d63faadd8b2671f3a2f2507cb09e29d`](https://github.com/flair-agency/architecture-gatekeeper/tree/9822ab915d63faadd8b2671f3a2f2507cb09e29d); its local archive SHA-256 is
`68cffc5aa9580560d59cdf64506011001a7d10c88f16d7793c57a09e53244ad0`, with
all 115 packed files matching that source. These are local source-matched
archives; no registry artifact readback is recorded.

The synthetic fixture was `fixture/migration`, with unchanged legacy-v1 base
`019b82513a2cf2a40fc8478af9a48766c445f417`. The old package resolved its
enforced Luna/low legacy selection and materialized its selected authority
with provenance. Using that same old runtime, a separate check also resolved
the proposed v2 policy and materialized the full two-member successor
Authority Set; exact member-ID validation accepted the complete set and
rejected an omitted ID. The deterministic validator accepted mechanical
synthetic inputs; these were not model reviews. The old package does not export
`@flair-agency/architecture-gatekeeper/preview-lifecycle`. This establishes
resolver/materializer compatibility for that fixture only. It does not verify
the old workflow or Skill execution, hosted execution, a full old-pin
acceptance run, or an actual consumer's pin set. It also does not establish
that rolling back the package after migration readback is safe or unsafe.

The fixture packet records source blob identities for
`.github/workflows/architecture-gate-consumer.yml` and
`skills/architecture-review/SKILL.md` at both commits. Those blobs were not
executed as the fixture's selected pins: the fixture caller used synthetic
`fixture/runtime@1111111111111111111111111111111111111111` and
`fixture/runtime@2222222222222222222222222222222222222222` references. The
recorded workflow and Skill identities therefore do not demonstrate their
runtime compatibility or an actual consumer pin set.

| Recovery question | Evidence required before guidance | Current result |
| --- | --- | --- |
| Can the previous runtime still resolve the migrated policy and read its full Authority Set? | Exact old package archive, unchanged fixture policy and caller, resolver result, and complete materializer identity | The old runtime resolved the proposed successor v2 policy and materialized its complete two-member set in the synthetic fixture; broader compatibility is unverified. |
| Can the previous package/workflow/Skill pin set run the consumer's required review and acceptance checks? | Exact package, immutable workflow and Skill revisions; protected fixture run; ordinary positive and required negative outcomes | Not verified. Source blob identities are recorded but were not executed as selected pins; the previous package lacks the preview API export. |
| Is a pin change or rollback safe after migration adoption/readback? | Consumer-owned recovery procedure and a fixture run against the exact adopted successor policy, with adoption and canonical placement recorded separately | No recommendation established. Do not infer either compatibility or incompatibility from resolver/materializer success alone. |
| Has a real consumer adopted the candidate or passed protected acceptance? | Exact consumer base and pin set, protected hosted run, acceptance result and canonical readback | Not established by package-fixture evidence. |

Until the relevant row has exact evidence, make no recovery recommendation.
A package pin alone cannot reverse adopted authority; any recovery must
preserve history and follow the consumer's already-authorized procedure. If no
compatible procedure is demonstrated, stop and escalate the unresolved
consumer decision rather than inventing a downgrade or exception.
