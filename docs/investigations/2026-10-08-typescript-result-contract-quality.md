# Typed CI execution result states under the standard build

This nonnormative successor to #431 is integrated against approved main
`77fb908d2c0f90e50c39f10b71b71902ac5bfd1f`, whose tree matches the prior local
base `25165ab0d8c62db6ae20d5b75993ca48b0d91d3e`. It carries only the CI result
feature from donor #433 head `9905d5c843f5bc76d745ecfa8d7b614d45bf8cc4`
(authored blob `8981fd7a2406e68280cfda250769b8a17a61835c`), adapting its
paths and tests to the single editable source tree. It changes no selected
canonical authority, protected policy, provider choice or acceptance rule.

The authored implementation lives at `src/ci-execution/ci-execution-result.mts`.
The original flat `src/ci-execution-result.mjs` forwards its function export;
standard NodeNext `tsc` emits both under ignored `dist/`. No compiler wrapper,
second authoring root or committed generated peer is introduced. Runtime tests
execute dist; type fixtures resolve the authored module through its NodeNext
`.mjs` specifier. Existing package aliases and CLI names remain unchanged.

Completed results expose available bounded response bytes and success/available
observations. Incomplete results expose no success-only bytes. The outer input
and general host outcome stay unknown: the accepted JavaScript input can have a
changing accessor and the original normalizer reads it twice. The port retains
those reads and records the second value, including failure, unexpected string
and object values. This observation is not a semantic decision or verified
acceptance evidence.

Runtime lossless JSON checks still own proxy/accessor rejection, descriptor
inspection, dense-array validation, node/depth/settings/response limits,
prototype-free snapshots and errors. Localized assertions describe prior
checks; they do not validate new evidence or authenticate actors.

The retained risk map is:

| Risk | Production boundary | Verification |
| --- | --- | --- |
| Reading bytes before completion or constructing an inconsistent state | Authored result union | Actual project compiler positives and ten exact-code/location negatives, including variable, helper-return and spread values assigned to both incomplete and union types |
| Incorrectly narrowing an arbitrary second accessor read | Captured host outcome and completed branch | Three changing-accessor values; two reads, incomplete result, exact observed value, no bytes |
| Type port alters input validation or output observations | Emitted normalizer behind the flat entrypoint | Retained malformed, bounded, proxy/getter, JSON settings and response runtime regressions |
| New grouped implementation omitted from build | Standard compiler and flat facade | Actual leaf/facade emitted in clean-build fixture; stale output, failed compilation and symlink/hardlink negatives retained |
| Candidate source shape does not survive distribution | Actual dist/archive and installed runtime | Required coordinator package/installed verification before publication or integration claims |

Worker checks in an owned writable snapshot pass: locked lifecycle-disabled
offline installation, strict type check, standard build, mixed source graph
(96 `.mjs` and two `.mts` files), and 17 focused type/runtime/build tests.
At this worker checkpoint, coordinator full-suite, archive, independent review
and exact Native review had not run. Those results are recorded separately
against the committed local candidate. Historical tests on older
source/generated layouts are not transferred to this candidate.

The candidate contains two of the original 96 modules as typed leaves; 94
remain. #412/#417/#418/#419 stay open. #431 completed protected review and
received its own human merge approval before merging into main. The #433
successor still requires its own exact-candidate protected acceptance and
individual human merge approval; this document supplies neither.

The incomplete branch declares `responseBytes?: never` to reject Buffer-valued
bytes through structural assignment as well as fresh object literals. The
actual project compiler accepted the six nonfresh assignments under the prior
4018 contract and rejects them after this repair. Ordinary incomplete values
without bytes still assign to both branch and union types. The project keeps
its existing optional-property setting: explicit `undefined` may type-check,
so exact runtime key absence remains established by the unchanged normalizer
and retained runtime tests rather than by static types. Runtime emission is
unchanged by this type-only correction. Prior candidate checks and reviews
remain historical; the repaired candidate requires fresh verification.
