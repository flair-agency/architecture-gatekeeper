# Generated TypeScript fixtures and remaining diagnostic failure reporting

This bounded #254 slice batches each Gemini CLI suite's two synthetic union
source probes into one suite-local compileFixtureDiagnostics Program. Each
suite retains its already-batched physical positive/negative fixtures in a
separate Program. The generated-source portion therefore changes from two
Programs to one per suite (three to two Programs total per suite).

The union-positive.mts and union-negative.mts source text is retained
byte-for-byte, including its ../../src/ import depth. Each suite writes both
files into its original direct-child temporary directory, compiles them
together, and removes the directory in a `finally` block. The returned accessor keeps
the generated file paths and compiler diagnostics so each test still receives
only its own file's diagnostics using its existing compact or summary shape.
The eight test registrations and their positive-empty, negative code/line, and
message assertions remain unchanged.

The same slice finishes the identified raw fixture-diagnostic empty assertions
outside the preceding 50-suite increment: 14 assertion sites in 11 suites reuse
the existing `summarizeDiagnostics` helper. It maps every diagnostic without
filtering, preserving the exact empty condition while avoiding compiler-AST
inspection on failure. This includes three existing dependency/global guards;
their original filters and messages remain. All 22 registrations in those
11 suites, their compiler setup and negative code/line/message oracles remain.
Existing compact diagnostic wrappers and configuration-error assertions are
unchanged. Static inventory is bounded to the named type/contract suites; it
does not claim a repository-wide failure-formatting guarantee.

This is a test compiler-plumbing change. It adds no runtime or shared API
behavior, shared helper, production source, policy, profile, or live assurance.
Issue #254 remains open and partial; final verification and issue disposition
belong to the integrating pull request.
