# Typed amendment tag classification and envelope parsing

This nonnormative #417/#419 delivery follows main `b0cf703`, where #431,
#433 and #435 have migrated three original modules. Three adjacent leaves now
use grouped `.mts` implementations under `src/owner-amendment/`, with unchanged
flat export paths and standard `tsc` output under ignored `dist/`. The candidate
has six of the original 96 modules typed; 90 remain. The parent and staged
migration issues remain open.

The leaves own existing exact-ref HTTP classification, previous-policy attempt
classification/final absence re-read, and annotated-tag envelope decoding.
These are existing responsibilities. An absent tag result is distinct from a
present attempt, and the final absence helper returns only the absent branch
following its original check. This is an observation contract, not evidence of
acceptance. Reader callbacks retain immediate, Promise and thenable returns.
External response fields, regex-coercible revision observations and unchecked
envelope values remain unknown. The parser's decoded Buffers retain their
existing byte/digest checks; it does not validate the evidence's semantics or
authenticity. Readonly frozen result fields do not freeze Buffer contents.

| Risk/invariant | Production boundary | Verification |
| --- | --- | --- |
| Mistake absent/present states or callback timing | Exact-ref API classifier and awaited tag reader | Actual-tsconfig positive/negative fixtures, retained status/ref/final reread tests, sync/Promise/thenable cases |
| Mistake parsed JSON for verified evidence | Annotated tag parser, exact keys/profile and canonical base64/byte/digest checks | Existing semantic/composition negative suites and unknown envelope contract fixtures |
| Alter malformed-input errors or observation order | All three emitted leaf bodies | Original-versus-emitted normalized AST comparison, focused runtime regressions and independent review |
| Omit grouped implementation bytes from identity | Actual emitted preview request/receipt inventory | Each new leaf mutated in an isolated package copy; stale records reject, fresh records validate; flat facades unchanged |
| Break legacy import/build/distribution paths | Flat exports, NodeNext compiler, packed and installed dist | Actual graph/build checks, archive byte inventory, offline installation and installed smoke |

The preview fixture alone reconstructs the historical flat layout and rewrites
its relocated parent-relative dependencies back to their original flat paths.
Production preview code and runtime identity semantics do not change. The
standard build fixture includes the new real sources and their existing JS
dependencies, retaining invalid-compiler and unsafe-output cases.

Verification will be recorded on the exact committed candidate and its PR.
Synthetic host payloads exercise production functions, without creating tags
or proving live host protection. No canonical authority, owner decision,
provider selection, credential behavior or protected acceptance policy changes.
Independent general review, Native Architecture Review, hosted CI and protected
acceptance remain distinct evidence.
