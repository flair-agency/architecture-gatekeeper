# Governance assurance reporting decision record (#121)

**Status: Option B selected by the consumer owner on 2026-09-26.** The
normative contract is in
[`docs/architecture.md`](../architecture.md#governance-assurance-dimensions-and-advisory-procedural-route-issue-121-owner-decision).
This investigation record preserves the reason for the decision; it does not
repeat or amend that contract.

## Historical rationale

The v0.5 `G0` label records that tag-actor identity was not verified. It does
not measure host merge enforcement. For the LIVE Agency trial, the repository
is private and its branch-protection API request returned a plan-restricted
HTTP 403; a green `Architecture Gate / accept` job therefore did not prove the
host required that check for merge. The owner selected a separately named
advisory-only procedural route so a repository can record a bounded evaluation
without claiming protected acceptance or a verified canonical transition.

The decision preserves the existing v0.5 G0 policy, artifacts, historical
results and verification-time tag-ref semantics. `OWNER_AMENDMENT` keeps its
separate requirement that bound evidence remain valid through the protected
canonical transition. The advisory decision does not resolve
[#119](https://github.com/flair-agency/architecture-gatekeeper/issues/119)
(complete multi-document Authority Set support) or
[#120](https://github.com/flair-agency/architecture-gatekeeper/issues/120)
(legacy PR-head authority failure); both remain independent blockers for the
LIVE Agency trial involving
[#106](https://github.com/flair-agency/live-agency/pull/106).
