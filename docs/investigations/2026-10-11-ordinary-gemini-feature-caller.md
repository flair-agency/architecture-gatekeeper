# Issue334 ordinary Gemini feature caller staging

This change stages an inactive caller for ordinary Gemini verification on `feature/gemini-ci`. It is a feature-only `pull_request_target` workflow with the existing self caller's strict numeric repository-ID classifier copied verbatim. The classifier has only `contents: none` and `id-token: none`. The reusable review job has literal `if: false`; this staging cannot issue WIF credentials or make model requests. It adds no manual dispatch, retry allocator, candidate code execution, acceptance job, authentication assurance, main route, or governance route.

The caller pins the reusable provider workflow to `7dc99525b4ff1510f1de310f6f5b877ab05bbfd2`, selects `.codex/gatekeeper/gemini-verification-policy.json` plus the protected prompt, schema and validation files, and sets `protected-review-instructions: true`. Its declared caller permissions are the minimum required for that reusable workflow: contents read, actions read, pull-request write, and OIDC token write. Only the existing `GCP_WIF_PROVIDER` and `GCP_WIF_SERVICE_ACCOUNT` secrets are mapped. The disabled job has no execution effect. The classifier remains unprivileged.

## Route status and source admission

The adopted `.codex/gatekeeper/gemini-verification-policy.json` is the selected protected policy and already selects enforced Gemini on `feature/gemini-ci`. `.codex/gatekeeper/ci-policy.json` remains the separate Codex-main policy with a local-only feature default; this caller does not select it. This staging remains unconditionally inactive and makes no hosted proof claim. No new Gemini policy adoption is needed. Enabling the route still requires a separately reviewed bounded exact-source caller change, private binding readback, and owner admission of the exact source candidate PR, run, and attempt. Review of this literal-false staging change alone does not admit a later enablement change.

The base-selected ordinary profile requires Gemini CLI `0.62.0`, `gemini-3.8-flash`, `thinkingLevel: MEDIUM` with no `thinkingBudget`, 180 seconds per session, 16,384 maximum output tokens, 192 KiB complete encoded stdin, and a committed review packet of at most 32 complete selected files, 128 KiB per file and 512 KiB serialized total. The per-session defensive upstream cap is 10, counted before dispatch and including uncertain sends. Automatic workflow retries and provider fallback remain disabled. These are execution bounds, not a guarantee of quality, cost or deterministic output.

## Concrete sequence after stage adoption

1. Separately review the exact enablement change and existing selected base policy. Retain the same-repository/non-draft classification gate and reject unknown or cross-repository admission before privileged execution. Bind the intended bounded PR/source and first run attempt; a caller condition alone does not authenticate its source or authorize replay. Admit one exact candidate context before dispatch and retain the actual run identity; record uncertain execution as uncertain. No automatic rerun, retry allocation or provider fallback is allowed.
2. Privately read back and verify the selected WIF provider and service-account binding against the intended workload identity. Keep the binding values private. Confirm the selected Gemini policy, full selected Authority Set, prompt, schema and validation snapshots are the protected selections for that admitted source.
3. Execute the bounded actual candidate once. Retain the complete report and inline publication, including full decision and authority provenance. Verify same-run, same-attempt, source revision and reviewed-revision identity, schema and consumer acceptance. A PASS is ordinary hosted verification evidence only; historical private PASS evidence is not proof of this candidate or route.
4. Exercise PASS and BLOCK reporting and acceptance in separately admitted sessions/cases as needed; one exact attempt yields one outcome and cannot yield PASS and BLOCK simultaneously. Retain existing failure negatives, including malformed/missing WIF bindings, invalid decisions, incomplete or changed selected authority, failed reporting and failed acceptance. None may be bypassed by a secret, automatic rerun, or alternate provider.
5. Record live-host enforcement and exact protected producer evidence separately. A successful local structure test or workflow parse proves neither GitHub protection nor actual identity-bound execution.

## Proposed explicit Codex rollback selection (not adopted or active)

The current `.codex/gatekeeper/ci-policy.json` is the Codex-main policy and resolves `feature/gemini-ci` to `local-only`; it is not a rollback route. A rollback requires a separately reviewed explicit enforced Codex policy selection with the existing main Authority Set limits and execution selection. The proposed distinct policy file content is:

```json
{
  "version": 6,
  "default": { "mode": "local-only" },
  "branches": {
    "feature/gemini-ci": {
      "mode": "enforced",
      "provider": "codex",
      "model": "gpt-6.1-sol",
      "reasoningEffort": "medium",
      "authorityManifestPath": ".codex/gatekeeper/authorities.json",
      "authorityLimits": {
        "maxManifestBytes": 16384,
        "maxMembers": 16,
        "maxFileBytes": 81920,
        "maxTotalBytes": 262144,
        "maxPromptBytes": 524288
      },
      "execution": {
        "reviewJobTimeoutMinutes": 7,
        "reviewStepTimeoutMinutes": 5,
        "codexProfile": "standard"
      }
    }
  }
}
```

A separately reviewed Codex rollback caller would select that distinct policy path and provide the Codex credential, with no WIF permission or GCP secret mapping:

```yaml
permissions:
  contents: read
  pull-requests: write
uses: flair-agency/architecture-gatekeeper/.github/workflows/architecture-gate-consumer.yml@7dc99525b4ff1510f1de310f6f5b877ab05bbfd2
with:
  policy-path: .codex/gatekeeper/codex-verification-policy.json
  prompt-path: .codex/gatekeeper/ci-prompt.md
  schema-path: .codex/gatekeeper/ci-decision.schema.json
  validation-path: .codex/gatekeeper/decision.validation.json
  protected-review-instructions: true
secrets:
  OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
```

The Codex-only reusable entrypoint avoids declaring Gemini jobs that require OIDC permission. Both snippets are proposals only; the named `codex-verification-policy.json` is not added or adopted here. They do not activate the current Gemini caller, authenticate a run, or make changing its `if` condition sufficient for activation. Any future caller/source pin and policy change requires separate review plus bounded exact-source owner admission. A Codex rollback is explicit policy and caller selection, never fallback from a Gemini failure. No policy or caller activation is included in this staging.

## Verification

The focused test checks the inactive dispatch boundary, sole feature trigger, exact immutable reusable-workflow source, protected selectors, permissions, mapped secrets, verbatim classifier, and mutated fixtures for activation, branch widening, source drift, selector drift, credential leakage and manual dispatch. Run with Node 22 using:

```sh
node --test test/issue334-ordinary-feature-caller.test.mjs
```

This check is offline and establishes only the checked-in staging structure. It does not execute a workflow, contact a provider, issue credentials, or establish host enforcement.
