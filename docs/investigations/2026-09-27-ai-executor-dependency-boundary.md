# AI executor dependency and boundary investigation

Status: investigation only. This document records the current implementation
and candidate boundaries. It does not amend `docs/architecture.md`, authorize a
new execution route, or establish acceptance equivalence for another AI
provider.

## Question

Architecture Gatekeeper was intentionally built around Codex. The underlying
problem, however, is to evaluate a change against repository-owned authority
and validate a structured decision. Which parts of the current system are
Codex-specific, which parts already form an AI-independent contract, and where
could a future executor boundary be placed without weakening assurance?

## Current dependency map

| Layer | Current responsibility | Codex or OpenAI dependency | Portability assessment |
| --- | --- | --- | --- |
| Consumer authority | Select architecture documents, prompts, schemas, deterministic validation and acceptance policy | None in the semantic content requirement. Current files live under `.codex/gatekeeper/`. | Semantically portable; path and product naming are coupled. |
| Authority materialization | Read bounded immutable Git objects, resolve Authority Sets, compute digests and build the complete prompt | None in `review-contract.mjs` and Authority Set modules. | Reusable core. |
| Review request | Bind revision, task, prompt, schema, reviewer settings, timeout and request digest | `model` and `reasoningEffort` use a Codex/OpenAI-shaped configuration vocabulary. | Mostly reusable, but executor-neutral capability and configuration semantics are not defined. |
| Decision validation | Validate JSON Schema, authority completeness, decision rules and `PASS` requirements | None. | Reusable core. |
| Local command/Hook execution | Launch a child reviewer with read-only sandbox, disabled hooks, no approvals, ephemeral state and bounded timeout | `src/codex-transport.mjs` invokes the `codex` binary and passes Codex CLI flags. `local-gate.mjs` imports that transport directly. The Hook consumes the Codex `UserPromptSubmit` event and returns `hookSpecificOutput`. | Hard dependency at transport and automatic-feedback integration boundaries. |
| Native Skill execution | Prepare a request, create a separate host-native reviewer, and validate its returned JSON | The distributed Skill describes Codex tasks/subagents and Codex `/review`; availability of a requested model and effort is delegated to the Codex host. | Prepare/validate is reusable; orchestration and packaging are Codex-host-specific. |
| CI semantic execution | Run a read-only model review in a clean GitHub job and expose its final structured message | The workflow requires `OPENAI_API_KEY` and a pinned `flair-agency/codex-action` fork. Inputs, outputs, sandbox controls and diagnostics are Action-specific. | Hard dependency. Replacing it requires a new credential, lifecycle, output and isolation adapter, not only a model-name change. |
| CI executor integrity | Verify the exact pinned reviewer Action before credentials are exposed | `verify-codex-action.mjs`, the provenance records and the integrity observation job describe one Codex Action source tree and workflow shape. | Codex-Action-specific assurance mechanism. The required assurance property may be generalized, but this verifier cannot. |
| Governance reviews | Run ordinary review plus OWNER_ADDITION eligibility review in the protected workflow | Both semantic calls currently use the same Codex Action and model settings. Deterministic preparation/finalization is separate. | Deterministic portions are reusable; semantic producer and its same-run bindings are coupled. |
| Acceptance and reporting | Fail closed on incomplete review and accept only the protected policy's permitted result | The concepts are provider-neutral, but the current `ci-enforced` implementation consumes same-run outputs from the Codex Action jobs. Error guidance also names API, billing and model failure. | Policy concept is reusable; current accepted evidence route is not provider-interchangeable. |
| Distribution and documentation | Publish npm runtime, Codex Skill, examples and operating guidance | Package description, README, `.codex` paths, Skill and host-permission documentation present Codex as the supported environment. | Public product surface is Codex-specific today. |

Tests intentionally lock several of these dependencies: local tests install a
mock `codex` binary; adapter tests inspect Codex CLI controls; policy tests pin
the Codex Action, its integrity job and `OPENAI_API_KEY`; installed-package
smoke tests exercise both child-Codex and native prepare/validate paths. These
are useful regression guarantees for the current route, not evidence of a
provider-neutral interface.

## Existing boundary that should be preserved

The normative architecture already separates three concepts:

1. review execution;
2. architecture evidence;
3. acceptance verification.

It also says the shared local contract constructs and validates a request but
does not choose how every host obtains the decision. This is the strongest
existing seam. The reusable center is therefore not “call an LLM”; it is:

> Materialize repository-selected inputs from the recorded revision, create a
> bounded review request, and validate one returned structured decision.

Codex belongs outside that center as an execution adapter. Evidence and
acceptance must remain separate because two adapters that can both return valid
JSON do not necessarily provide the same identity, isolation, completeness or
protected-policy assurance.

## Candidate future boundary

The following is a design candidate, not an adopted contract.

### Portable semantic request

Keep the existing provider-independent payload:

- reviewed repository and revision;
- complete prompt containing selected authority snapshots;
- JSON decision schema;
- request identity and Authority Set provenance;
- bounded execution requirements;
- untrusted task and optional prior-review context.

Avoid giving the semantic executor source credentials or authority-discovery
responsibility. Authority materialization remains Gatekeeper's responsibility.

### Executor profile

Move provider-specific selection out of the semantic request and into a
versioned executor profile. A profile would identify an adapter and its
configuration, for example model identifier, reasoning controls, timeout,
sandbox capabilities, credential source and supported structured-output mode.
Gatekeeper must not pretend that reasoning levels or sandbox flags have
identical meaning across providers. A provider-neutral capability vocabulary
would need explicit semantics and fail-closed mapping rules.

### Execution result

An adapter returns either:

- the exact structured decision for shared deterministic validation; or
- an incomplete execution result with a reason such as unavailable model,
  timeout, refusal, invalid output or host-policy denial.

Adapters must not translate execution failure into `BLOCK`, `PASS`, or
`OWNER_DECISION`.

### Route-specific evidence

Each accepted route separately binds the validated decision to the executor
identity, adapter version, reviewed revision, request identity, selected policy
and any host-provided provenance. An adapter can support local feedback without
automatically qualifying for protected CI acceptance. Provider fallback must
not occur unless protected policy explicitly selects and orders eligible
routes; service failure cannot silently activate another executor.

## Dependency classes

### Incidental naming

- `.codex/gatekeeper/` configuration paths;
- package description and README wording;
- Codex-named step IDs, output files and diagnostics.

These can eventually be renamed or aliased, but renaming alone delivers no
executor portability and creates consumer migration cost.

### Replaceable adapters

- `src/codex-transport.mjs` for local child execution;
- the native Codex Skill orchestration;
- `flair-agency/codex-action` for CI execution;
- the Codex Action integrity verifier and provenance format;
- Codex Hook input/output integration.

Each adapter needs its own focused contract and verification. The native
prepare/validate CLI is already close to a host-neutral manual adapter seam,
despite its current Skill packaging and name.

### Assurance-sensitive coupling

- exact model and reasoning selection;
- reviewer isolation and credential exposure;
- structured-output completeness;
- timeout, cancellation and refusal behavior;
- executor identity and supply-chain verification;
- same-run result binding used by protected acceptance;
- OWNER_ADDITION and OWNER_AMENDMENT semantic producer provenance.

These cannot be generalized by a refactor alone. Enabling a new accepted route
requires canonical owner decisions and route-specific evidence.

## Recommended investigation sequence

1. Specify and test an internal executor interface around the existing Codex
   local transport without changing behavior or public configuration.
2. Use the existing native prepare/validate path to prove that a second host
   can consume the same request and return a decision for local feedback only.
3. Define the minimum executor-profile and incomplete-result vocabulary from
   observed differences; do not assume OpenAI reasoning controls generalize.
4. Add provider-neutral contract tests for request construction and decision
   validation while retaining Codex adapter tests.
5. Evaluate one alternate local/manual adapter with an owner-adjudicated
   semantic fixture set. This demonstrates compatibility, not quality
   equivalence or CI assurance.
6. Only if a protected non-Codex route is needed, specify its credential,
   isolation, provenance, failure and acceptance contract in canonical
   authority before implementing it.
7. Rename public paths and product wording only after compatibility and
   migration policy are decided.

This order isolates the low-risk software seam before making any claim about
cross-provider assurance.

## Owner decisions required before implementation changes

The investigation does not resolve these choices:

1. Is the product promise “Codex architecture gating with reusable internals”
   or “provider-neutral architecture gating”?
2. Is initial portability limited to local/manual feedback, or must another
   provider qualify for protected CI acceptance?
3. Which executor capabilities are required, and which configuration fields
   are portable versus adapter-private?
4. May protected policy select multiple executors? If so, is the rule one
   required executor, all required executors, or an explicit ordered fallback?
5. What evidence and identity facts make a non-Codex CI result acceptable, and
   are any providers considered assurance-equivalent?
6. Must existing `.codex/gatekeeper/` consumers retain indefinite compatibility,
   receive a migration alias, or move through a versioned breaking change?
7. How are provider-specific model lifecycle changes reviewed without allowing
   a candidate change to weaken its own review route?

Until these are recorded in `docs/architecture.md`, Codex remains the only
implemented semantic executor and the only model-backed CI acceptance producer.

## Near-term conclusion

The system is not intrinsically dependent on Codex at its semantic core. Its
authority selection, immutable input construction, decision schema validation
and policy concepts are already substantially provider-independent. It is
operationally and assurance-wise dependent on Codex at every current execution
surface, and the protected CI route additionally depends on a particular
Action, credential, output and integrity procedure.

The defensible boundary is therefore between the shared review contract and
route-specific execution/evidence adapters. Local portability can be explored
behind that boundary without changing acceptance. CI portability is a separate
architecture and assurance decision, not the final step of the same refactor.
