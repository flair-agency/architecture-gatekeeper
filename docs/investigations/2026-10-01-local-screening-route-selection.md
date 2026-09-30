# Local screening route selection (provisional, 2026-10-01)

## Status

This is a provisional implementation input for Issues [#232](https://github.com/flair-agency/architecture-gatekeeper/issues/232) and [#234](https://github.com/flair-agency/architecture-gatekeeper/issues/234). It does not select or enable an integration route. In the #233 CLI baseline, a hook returned a random nonce after 1.203 seconds and the active turn quoted it, although the original prompt did not contain it; the triggering action showed no wait. In a second trial, a 9-second hook overlapped a 2-second shell command, but the main turn ended before the hook completed and its follow-up reported no result. On the third submitted turn in that same session, the model quoted the second turn's completed hook nonce. That turn started a third hook; the session exited without another turn to collect its result. The hook did not wake or start a turn while idle; see [the host investigation](2026-10-01-local-screening-host-probe.md) for the final evidence record.

## Existing contract

The normative contract remains [`architecture.md`](../architecture.md). Local review is development feedback intended to identify responsibility and trust-boundary problems before code is pushed. Review execution, evidence, and protected acceptance remain distinct. Local adapters share the revision-bound request and deterministic decision-validation contract, while using host-appropriate reviewer transports. `PASS`, `BLOCK`, and `OWNER_DECISION` retain their existing meanings. A reviewer refusal, cancellation, unavailable configured model or effort, transport failure, or invalid response leaves the review incomplete.

This investigation proposes no new assurance rule or owner decision. The local screening role is already in the canonical contract. The priority that this screening must not stall productive work is the user's constraint recorded in Issue #232 and governs this route evaluation.

## Provisional route candidate

If the final CLI probe confirms the remaining delivery behavior, the smallest candidate is a **conditional, opt-in Codex CLI async command-hook pilot**. This is only a CLI candidate, not a solution for the user's desktop workflow. It would invoke the existing shared request construction and response validation, using the configured reviewer transport. The triggering action would continue without waiting; the completed screen would be returned as concise informational hook context at the host's documented delivery point. Whether this feedback arrives early enough to help the same task is a separate usefulness question for #236.

This candidate is the existing automatic command-hook route with asynchronous scheduling and appropriate result handling. It is not mechanical execution of the `architecture-review` Skill. The Skill remains a separate host-native reviewer adapter; the observed app-server surface did not expose a model-free Skill-dispatch request. The CLI probe does not establish desktop-app support or delivery into the calling desktop thread. Desktop integration and delivery remain unresolved, so no CLI result should be presented as a desktop solution; desktop use requires a separate integration probe before claiming or enabling that availability.

The candidate's input is the task text supplied by the hook event, treated as untrusted review input. The current shared request binds authority and configuration to a recorded Git revision; it does not snapshot or bind a mutable working-tree diff. Until a later supported event can provide an exact candidate snapshot through the shared contract, report this as task-intent screening, not as review of the current diff. Do not use hook-added task text to replace repository authority or alter decision validation.

## Trigger and frequency options

No trigger policy is selected here. It is an operational choice for a bounded pilot, not a change to semantic review or acceptance authority. The options to compare are:

- **Every user prompt:** broad coverage and simple wiring, but likely invokes a model for unrelated conversation and can produce redundant, stale, or out-of-order results.
- **A deterministic relevance filter over prompt text:** may reduce calls, but can miss relevant architecture work and needs measured false-positive and false-negative behavior. A keyword filter must not be described as semantic assurance.
- **A narrower host event or explicit per-session limit:** may reduce volume, but can delay the early feedback or miss later design changes. Host event availability and useful candidate context need verification.

For the first pilot, record the chosen trigger and invocation count explicitly, keep the pilot opt-in, and measure calls per session, time to result, and how often the screen concerns the active task. Do not silently invoke a reviewer on every prompt as a default. Do not add an authorization policy, durable result registry, review attestation, commit or push enforcement, queue, or daemon to solve this screening problem.

## Smallest implementable pilot, if prerequisites pass

1. Add only a CLI async adapter change and focused tests for its hook-event input/output behavior; keep shared semantic request and validation code unchanged unless the tests demonstrate a necessary shared-contract correction.
2. Use the exact configured reviewer model and reasoning effort and the existing deterministic validator. Preserve incomplete status for all reviewer or transport failures.
3. Return bounded informational context tagged with the session, request, and reviewed revision. Since hook completions can arrive out of order, make stale results identifiable and avoid presenting one as a finding on newer work. Do not make a background screen block or reject the triggering action.
4. Bound pilot trigger frequency and output size. Measure ordinary work's waiting time, call volume, reviewer completion latency, and useful-result timing. Stop or narrow the pilot if model work saturates hook capacity or results routinely arrive after the task is over.
5. Preserve the distinction between prompt/task-intent screening and a review of mutable working-tree changes. A later exact-diff capability would need a separately reviewed request contract.

The #233 host probe needs to establish only that: (a) the hook starts asynchronously; (b) ordinary tool work proceeds while it runs; and (c) supported informational output reaches a later model request during an active turn or a subsequent turn. Its synthetic payload need not represent a Gatekeeper decision. The adapter's handling of structured Gatekeeper results belongs in #235 focused tests, and an actual reviewer-to-validation path belongs in #236 dogfooding. CLI evidence alone does not satisfy a desktop availability requirement.

Hook lifecycle constraints, including cancellation at session end and completion out of order, are documented limitations and residual risks to handle in adapter design and pilot measurement. Requiring every lifecycle scenario to be proven by the synthetic host probe would delay a reversible, opt-in screening pilot beyond what is needed to establish that work can continue and useful output can return. Keep any result clearly scoped to its request and reviewed revision, and measure late or unusable results during dogfooding.

## Remaining questions before route selection

- Given that a completed hook is delivered on the next user turn after the session goes idle, is that timing useful enough for the developer, or must the result arrive while the same task is active?
- Do #235 tests confirm that the adapter preserves concise `PASS`, `BLOCK`, `OWNER_DECISION`, and incomplete outcomes without controlling the triggering action?
- Does #236 dogfooding show that the screen can be triggered early enough and arrive in time to help the same task, at acceptable call volume?
- Is a CLI-only pilot useful while desktop-thread delivery is unresolved, or is desktop delivery required for this project? Desktop behavior has not been tested.
- Does #236 dogfooding show that session/request/revision context is enough to keep late results useful without introducing durable review state?

Until these are resolved, the async CLI command hook is a candidate for evaluation, not a selected or enabled route.
