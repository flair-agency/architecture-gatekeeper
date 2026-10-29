# PostToolUse pilot retirement

Scope: Owner decision on 2026-10-29 JST; implementation baseline main
`308bd319337f6d72596b8ab0af162b5371149129`. This record describes a source/API
removal and pilot cutoff, not a publication or deployed-consumer change.

## Decision and actual use

The [Owner decision in #50](https://github.com/flair-agency/architecture-gatekeeper/issues/50#issuecomment-6473086951)
selects on-demand architecture review as the product direction and authorizes
PostToolUse retirement as the first slice. It does not authorize removing
required checks, consumer Policy, G0, Preview, another review adapter or #329.

The selected six-member Canonical Set contains no PostToolUse-specific required
capability. Its general command-Hook clauses still apply to UserPromptSubmit;
independent local/manual review and diagnostic safety remain supported.
No normative amendment is necessary for this optional-pilot removal. The
broader product direction is not silently substituted for the existing contract.

The baseline has no tracked `.codex/hooks.json` or enabled AGK PostToolUse
registration. The integration guide supplied a project-local registration and
launcher. #244's actual runs used an isolated ordinary checkout and an
unpublished local setup; no source change uninstalls those host registrations.

- [Actual AGK loop](https://github.com/flair-agency/architecture-gatekeeper/issues/244#issuecomment-5926730201):
  validated PASS in 27.104 seconds, work continued, feedback arrived next turn.
- [Documentation-task loop](https://github.com/flair-agency/architecture-gatekeeper/issues/244#issuecomment-5927258912):
  validated PASS in 36.036 seconds. The setup itself was not published.
- [Later host prerequisite](https://github.com/flair-agency/architecture-gatekeeper/issues/244#issuecomment-6260868141):
  CLI initialization failed before another Hook/reviewer dispatch.

These successes remain valid. Sustained effectiveness, general active-work
delivery, repeated-event behavior and attributable cost remain unverified.
#240/#244 end because product scope changed, not because all criteria passed.
No further host diagnosis or paid dogfood is needed to finish this retirement.

## Compatibility and measurement

The removal deletes both public `runPostToolScreenHook*` exports, the two
runtime modules, dedicated tests and registration guidance. Existing users
must remove only their AGK PostToolUse handler and unused launcher before
adopting a package containing it. Otherwise importing the removed export fails.
No replacement screen or compatibility shim is provided. Published versions
and pins are immutable; the next publication needs an explicit breaking-change
release decision. This change selects no version/channel or publication date.

#537 retains its frozen 2026-10-13 through 2026-11-10 window, original records
and missingness. Further PostToolUse dogfood/collection under this pilot ends
by Owner decision on 2026-10-29 JST; executable removal and consumer adoption
have their own later revisions/dates. This does not claim every old pinned
installation stopped. Late recovery of already-produced records remains valid.

CI, manual, native and UserPromptSubmit collection may continue where those
routes actually run. Post-retirement automatic early detection, delivery,
deduplication and productivity cannot be measured. Report the cutoff separately;
absence after retirement is neither successful review nor zero effect. The
original all-route criteria are not declared complete. Existing version-1
PostToolUse records remain readable/exportable/analyzable through unchanged
reader logic and route values; no new record format or measurement layer is added.

## Verification boundary

The existing measurement CLI regression reads saved historical-format phases,
exports them with redaction, aggregates them and confirms unchanged readback.
Fixed-path package tests check the removed modules; installed smoke checks the
retired exports while exercising the remaining manual, native, UserPromptSubmit,
provider and policy entrypoints.
These are deterministic package tests, not new model or effectiveness trials.
Current PR verification is recorded in the PR; no merge, release, live Hook
uninstall, host change or broader migration is implied by source verification.
