# Architecture authority split (Issue #272)

Status: staged candidate following the owner's 2026-10-04 direction. This
investigation is supporting evidence, not selected architecture authority.
Baseline: `17791c2d06ab29873a00d4ff626cb2eda226ed6c`.

## Adoption sequence

1. Adopt the organization authorization in the still-single selected
   `docs/architecture.md`. Move only the introductory problem description and
   tracked-work index to `docs/README.md`; keep the binding owner, review,
   evidence, acceptance, rollout and issue-authority rules in the selected file.
2. After that first PR is canonical, review the complete six-member migration
   under its protected predecessor. Move existing clauses without shortening
   them, select all members, update prompts/entry guidance/links/CODEOWNERS and
   include all members in the package. Adopt these changes together; a link or
   candidate manifest cannot substitute for the predecessor's complete input.
3. Read back the adopted manifest and every member. Demonstrate subsequent
   local/native and CI preparation with the complete new Set. Historical
   evidence retains its original authority identity; it is not rewritten.

Neither stage enables a route, raises a bound, changes clause applicability,
or changes any assurance or release requirement. Existing lifecycle support
and actual predecessor acceptance govern each stage. A failed or unsupported
stage does not permit a fallback or owner-administration exception.

## Stage-one preservation inventory

| Original material | Disposition | Binding conditions retained |
| --- | --- | --- |
| First paragraph of Why | Exact prose in README's Why repeatable review | All subsequent purpose, owner and execution requirements remain in architecture.md |
| Relationship to tracked work bullets | Exact prose in README's Tracked work; link retargeted to architecture.md | Original section heading and prohibition on Issues implicitly amending the contract remain selected |
| All other baseline contract text | Unchanged | Every condition, exception, target/legacy distinction, freshness requirement and rollout gate |
| New organization authorization | Explicit owner-directed migration scope | Six required members, stable IDs, no implicit precedence, predecessor review, clause completeness, unchanged route limits/scope |

Stage one reduces the selected file from 81,918 to 81,731 bytes while adding
the migration authorization. Its 189-byte headroom is temporary; it is not a
long-term compression result. The second stage removes the per-file bottleneck.

## Member plan

| Stable ID | Path | Scope |
| --- | --- | --- |
| architecture-contract | docs/architecture.md | Shared principles, responsibility, acceptance, invariants and lifecycle |
| architecture-authority-set | docs/architecture/authority-set.md | Complete Authority Set selection/materialization and bounds |
| architecture-owner-addition | docs/architecture/owner-addition.md | Missing-decision addition, multi-document scope and adoption |
| architecture-owner-amendment | docs/architecture/owner-amendment.md | Existing-decision amendment, exact receipts, authorization and revocation |
| architecture-review-execution | docs/architecture/review-execution.md | Local/CI adapters, provider credentials and legacy repair |
| architecture-self-profile | docs/architecture/self-profile.md | Self reporter, development sequence, dogfood and release prerequisites |

All members remain required together. The selected limits remain 16 members,
81,920 bytes per file, 262,144 total authority bytes and 524,288 complete prompt
bytes. Splitting reduces the largest file, not the total semantic review input.
The existing policy-selected self amendment target remains
`architecture-contract` / `docs/architecture.md`; the migration does not grant
module-only amendment eligibility. Route-specific B scope remains unchanged.

## Second-stage verification

Inventory each original heading/block and its destination, compare complete
text after documented relative-link and terminal blank-line changes, and verify retained root
fragments for moved sections. Do not use hashes or keyword counts as proof of
semantic correctness. Independent semantic and general review assess the
mapping and exact diff under the old canonical Set.

Use the real local review request builder and CI materializer with all six
committed members; verify exact complete IDs, digests, selected size budgets,
missing-member failure and omitted-ID rejection. Verify package archive
contents and installed entrypoints. After integration, perform fresh canonical
readback and subsequent preparation; successful candidate checks alone do not
prove adoption, host enforcement, route activation or release readiness.

Document-wide duplicate/status reconciliation remains tracked by #272; this
split must not imply that stale implementation claims have been audited or that
all #272 or v0.6.0 final criteria are complete.

## Prepared second-stage clause map

The canonical predecessor is the organization-authorization commit
`504628050516cf7feeeb2b18509641af34b03150` adopted in
[PR #311](https://github.com/flair-agency/architecture-gatekeeper/pull/311).
Canonical readback verified all three stage-one documents against the reviewed
proposal `689416fe4e9a4fb289812e7d1fcc281d27c2c825`: their bytes are identical.
The selected architecture is 81,731 bytes, SHA-256
`9823492f82a3e0a9be420b99cb42b5ca9f70aeb4734c65098825bf5e12748a73`.
Its authority manifest still selects the single complete predecessor. The
second-stage candidate requires review under that protected selection; the
six-member selection applies only after its separate adoption.

The [machine-readable map](2026-10-04-architecture-authority-split-map.json)
inventories every stage-one heading/block and its destination. Relative links
are retargeted within moved blocks, and the final blank line of each new member
is removed. The opening paragraph identifies the
complete Set and adds its member index; module preambles and root fragment
pointers are new navigation/authority-boundary text. Other source clauses are
retained in full, including inactive target contracts and rollout requirements.

Stage two is a dependent candidate; it must not be adopted before stage one.
The first migration does not consolidate repeated binding clauses or correct
implementation-status narration. Those separate #272 edits need their own
clause/status evidence.

| Member | Bytes |
| --- | ---: |
| docs/architecture.md | 21,422 |
| docs/architecture/authority-set.md | 6,863 |
| docs/architecture/owner-addition.md | 18,063 |
| docs/architecture/owner-amendment.md | 19,793 |
| docs/architecture/review-execution.md | 15,401 |
| docs/architecture/self-profile.md | 7,150 |

Total selected content: 88,692 bytes.
