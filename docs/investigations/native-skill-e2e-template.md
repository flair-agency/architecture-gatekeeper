# Native Architecture Review Skill E2E record

Use this record when claiming a host-native Skill end-to-end dogfood. Keep the
runtime smoke, Skill E2E and CI acceptance observations distinct. This record
documents what ran; it is not a signed artifact or reusable merge evidence.

## Run identity

- Date/time and operator:
- Repository and reviewed revision:
- Installed Gatekeeper package/version:
- Skill revision:
- Outcome: `PASS` / `BLOCK` / `OWNER_DECISION` / incomplete

## Execution path

- [ ] Runtime smoke only (`prepare` plus `validate`, with no host-native
  reviewer). Do not label this a Skill E2E.
- [ ] Host-native Skill E2E, with the separate reviewer invocation below.
- [ ] CI acceptance; record the workflow run and protected-policy result below.

### Host-native reviewer invocation (required for Skill E2E)

- Host-native reviewer task/agent identifier and link, if available:
- Invocation/completion status and timestamps:
- Reviewed commit used to prepare the request:
- Exact runtime artifact identity (package version and immutable package or
  source pin):
- Exact task text supplied to `architecture-review-native prepare`:
- Prepared prompt SHA-256:
- Prepared schema SHA-256:
- Location of a retained, access-controlled copy of the exact prompt and schema,
  or Codex task transcript that exposes them, when available:
- Prepared model:
- Prepared reasoning effort:
- Prepared `reviewTimeoutMs`:
- Observable evidence that this separate host-native reviewer was invoked
  (for example, its task/transcript record):
- Reviewer-returned decision JSON:
- Decision JSON written to the validation input:
- Confirm the validation input is the reviewer-returned result, without a
  caller-authored replacement:
- `architecture-review-native validate` result:

Do not record credentials or secret-bearing environment values. Do not create
the reviewer through nested `codex exec`, install or fetch a runtime during
execution, or use a registry fallback. A missing native invocation, mismatched
decision source, timeout, or validation failure is an incomplete Skill E2E.
Hashes identify prepared inputs but do not prove that a reviewer received them
or was invoked; retain invocation evidence separately. When exact prompt/schema
contents cannot be published, record hashes and deterministic reproduction
inputs, and retain a restricted copy or transcript when available.

### CI acceptance (if exercised)

- Workflow run URL:
- Protected base, head and reviewed merge revisions:
- Protected policy route and required check result:
- Reported decision and acceptance result:

CI acceptance is determined by the protected-policy workflow. A local Skill
result remains diagnostic development feedback and does not substitute for it.
