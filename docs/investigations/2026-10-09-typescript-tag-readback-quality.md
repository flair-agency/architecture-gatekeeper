# Typed owner-amendment tag readback under the standard build

This nonnormative #435 slice is prepared on approved main
`817a0d2ddee7327346d6c824721571c2fdd42daa`. Main has two previously approved
typed original modules from #431/#433, with 94 remaining. Old #435 donor
`bc2d9d7515fd347944aa16fb7cbfd6111113461c` contains authored tag-readback blob
`56838928649519efcf8b603d3415cfdb03904a37`; only that module's type contracts,
focused compiler/runtime fixtures and new leaf integration are carried forward.
The managed prior candidate `d0856c3` remains preserved, tracked clean; its older
foundation and verification are historical. A lost temporary preparation clone
was reconstructed from committed main and donor objects and requires fresh
verification.

Editable implementation is
`src/owner-amendment/owner-amendment-tag-readback.mts`; the original flat path
forwards its existing export. Standard NodeNext `tsc` emits both under ignored
`dist/`. Package aliases/bins, compiler configuration and build command remain
as established by #431. This candidate proposes three of the original 96
modules typed, with 93 remaining. #412/#417/#418/#419 remain partial.

The original implementation awaits fetch, response JSON and raw tag bytes.
JavaScript await accepts immediate values and thenables as well as Promises.
The old donor's Promise-only fetch and JSON annotations would exclude accepted
synchronous callbacks. This port preserves those shapes with `Awaitable<T>`
(`T | PromiseLike<T>`). JSON remains unknown regardless of return timing. API
payloads and observed OIDs stay unknown because property reads and regex
coercion do not establish a stable string observation. Private property views
preserve original reads rather than validate payloads. Readonly result fields
describe shallow frozen records; Buffer contents remain mutable. These types
do not authenticate bytes or grant acceptance authority.

| Risk | Existing production boundary | Retained verification |
| --- | --- | --- |
| Narrow accepted callback timing while typing | Awaited fetch, JSON and raw object callbacks | Actual-project compiler positives for sync/Promise/thenable returns and emitted runtime cases; wrong response/raw shapes rejected |
| Treat observed OID or API payload as trusted string | Ref validation, repeated reads and result observations | Unknown narrowing positives/negatives and accessor/coercion regressions |
| Alter tag readback order or failure behavior | Input checks, live ruleset, annotated ref, raw object validation, final ref movement check | Retained synthetic response/tag tests, original/emitted AST comparison and integrated review |
| Lose third grouped implementation in output or runtime identity | Standard build and preview identity at emitted paths | Real leaf/facade fixture; third-leaf byte mutation invalidates old request/receipt; fresh records and pure-flat layout validate |
| Source shape fails in distributed layout | Actual package archive and installed dist | Archive-byte comparison, offline install and installed production/whole smoke |

Synthetic external responses exercise the real emitted readback function.
They do not prove a live GitHub ruleset, create remote tags or enable a consumer
route. Existing real-host obligations remain with their owners. Git fetch,
credential handling, cleanup, 30-second fetch timeout, 300,000-byte child output
cap and 262,144-byte object validation cap remain unchanged.

Verification is recorded against the actual committed candidate in #435 and
tracking issues. Historical source/generated-layout checks are not transferred.
Independent integrated review and the applicable Native review are development
evidence; exact hosted protected acceptance and individual human merge approval
are separate requirements. No owner decision or assurance responsibility is
added by this port.
