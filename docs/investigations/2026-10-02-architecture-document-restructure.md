# Architecture document restructuring plan (Issue #266)

Status: working proposal; not canonical authority and not a change to any
execution, assurance, acceptance or release requirement.

Baseline: main `2865fa48506e5ff7aa1caf5e1ce8c82230d43a66` after PR #264.

## Findings

The document is approximately 75 KB. Its largest sections are adopted governance
contracts, not disposable implementation notes:

| Section | Approximate bytes | Classification |
| --- | ---: | --- |
| Owner-amendment governance, including self-v1 eligibility | 13,777 | Binding rules and target-profile contracts |
| OWNER_ADDITION adoption and assurance dimensions | 8,014 | Binding procedure and assurance distinctions |
| CI model review and target routes | 7,430 | Existing and inactive target contracts |
| Multi-document OWNER_ADDITION | 6,530 | Binding scope, input and verification requirements |
| Exact-claim authorization and revocation | 5,662 | Binding target authorization contract |
| v0.6.0 self reference and development sequence | 5,434 | Adopted release and rollout requirements |

These figures group level-four subsections under their parent and are byte
measurements, not a recommendation to remove the largest sections.

## Authority and reference impact

The local and CI manifest selects only `architecture-contract` at
`docs/architecture.md`. A Markdown link does not materialize another authority
file. Moving binding requirements to a linked document would omit them from
review unless that document is explicitly selected. CI and local prompts name
the existing ID/path; owner-amendment policy selects that same authority member.
OWNER_ADDITION routes restrict B to one affected authority file. OWNER_AMENDMENT
has no universal one-file limit, including self-v1 eligibility; its applicable
prior-policy scope and exact authorized path set must be preserved. A split must
preserve these route-specific conditions, not infer eligibility from file count.

Internal consumers link to the dogfooding, self-reference and OWNER_ADDITION
anchors. External links cannot be exhaustively inventoried. Preserve existing
headings/anchors in the first increment. Historical evidence records must not be
rewritten when authority bytes or digests change. Subsequent reviews bind fresh
selected authority; completed evidence retains its original context.

## Proposed increments

1. **Navigation and classification, single selected file.** Add a compact index
   grouping shared rules, execution boundaries, governance contracts and rollout
   requirements. Keep existing section names/anchors and normative text. Clearly
   distinguish implemented routes from inactive target contracts without
   declaring any target obsolete. This improves access without changing the
   manifest or runtime.
2. **Bounded deduplication.** Inventory repeated propositions and retain every
   condition, exception and route-specific qualification. Review each proposed
   consolidation against the original text. Move only demonstrably explanatory
   examples or operational procedures, with no binding requirement dependent on
   an unselected link. No arbitrary percentage or byte reduction target.
3. **Optional canonical split.** If the first increments leave navigation or
   size inadequate, propose explicit canonical members, stable IDs, selection,
   anchors and public packaging. Adopt the authority topology before migrating
   bytes. Preserve complete inputs, limits and governance affected-member
   semantics and route-specific scope. Do not introduce a runtime change merely to avoid maintaining the
   current document.

A candidate map for a later split is core authority/acceptance invariants,
execution contracts, governance contracts and self rollout profile. All remain
normative where selected; implementation specifications remain subordinate.
This map is a proposal, not an adopted Authority Set.

## Ownership and verification

Coordinate `docs/architecture.md` edits with the main coordinator and #252/#265.
Do not combine provider activation, proxy implementation, or release policy
changes with this work. Preview and formal release receive no new gate.

Before each fix commit, run local native AGK and actual `/review` on the final
diff; after push request Codex Review and required CI. For content movement,
verify a source-to-destination inventory covering every clause and condition,
anchors and selected authority completeness. For selection or distribution
changes, additionally run applicable materialization, package smoke and protected
policy checks. Do not reset maxFileBytes until measured complete authority fits
and the selected limits remain adequate.

## Current work state

Inventory and migration hazards recorded. No canonical bytes moved, no manifest,
policy, public entrypoint or acceptance route changed. The first deliverable is
a navigation index and bounded deduplication of the three-concept recap and
Issue #111 recap. The detailed addition contract retains prior-policy opt-in,
current inactive self selection, exact-B annotated tagging, no historical BLOCK
or amendment authorization requirement, no owner-authentication claim and fresh
review after canonical adoption. Splitting authority is deferred until its
migration contract is concrete.
