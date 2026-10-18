# Remaining suite-local physical type fixture compilation

This partial #254 increment reuses the existing guarded
`compileFixtureDiagnostics` once in each of 50 suites. It starts from adopted
`fc79d018cedccb29e147935d79ce84dace5c0f7a`; any intervening test-only adoption
and final verification revision are recorded in the delivery PR.

All 105 physical fixture roots and 115 test registrations remain. Forty-seven
suites have two physical roots, two have three, and BLOCK evidence has five.
The two mixed Gemini suites retain their two generated-source Programs each,
their exact source strings, union diagnostic assertions and temporary-directory
cleanup. Thus executed Programs change from 109 to 54: 105 physical single-root
compilations become 50 suite-local compilations, plus four unchanged generated
compilations. No Program or cache is shared across suites.

The compiler receives the same parsed project options, `rootDir` and `noEmit`.
The materializer migration suite retains its five configuration assertions,
moving setup from its repeatedly called helper to module initialization. All
fixture-specific code, position and message expectations remain; the existing
helper rejects every dependency or global diagnostic and rejects lookup of a
root that was never compiled. JSON Schema's former whole-program foreign-error
equality assertion maps to that helper guard with the same diagnostic message.
Legacy authority's two loop-generated registrations retain both empty fixture
oracles. Runtime, facade/export, operation/guard hash and identity assertions
remain separate and unchanged.

Empty raw-diagnostic assertions at 32 callsites (33 registrations including
the legacy loop) reuse the existing `summarizeDiagnostics` formatter. An
ordinary type-error control in a positive fixture previously exceeded a
30-second isolated run while the assertion inspected the compiler AST.
Summarizing only these empty assertions retains their exact zero-diagnostic
condition and produces readable failure data. Negative diagnostics retain
their raw objects for the existing code, position and message checks; wrappers
that already return compact diagnostics are unchanged.

Static AST comparison maps all 114 test callsites to the retained assertions;
one registration template expands twice, giving 115 actual cases. Complete
per-fixture compiler diagnostics and transitive source-graph equivalence,
serial Node 22 focused timings, selected isolated detection controls and final
strict/build/full/package/CodeQL/review results belong to the delivery PR.
Measured focused time is specific to that command and environment and does not
promise a whole-CI speedup.

Production code, fixture bytes, the shared helper, public APIs, configuration,
authority, models, workflows and acceptance routes do not change. Synthetic
external observations keep their existing limits. This establishes no live
host enforcement, provenance, protected adoption or activation. #254 remains
open/partial for the two generated-source pairs, measured remaining costs and
its separately tracked lifecycle/consumer/live-host/adoption/readback evidence.
