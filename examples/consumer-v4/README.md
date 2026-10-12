# Consumer v2 local review and v4 CI policy example

This directory mirrors a consumer repository's paths. Copy its contents into
the consumer repository and replace `example/consumer` in
`.codex/gatekeeper/config.json` with that repository's actual `OWNER/REPOSITORY`.
Commit the authority documents, manifest, policy, prompts, schemas, reviewer
settings and caller workflow before relying on them.

The included architecture and security documents are minimal fixture content,
not an architecture contract for an adopting consumer. Replace or adapt them
under the consumer's governance using its owner-approved canonical sources;
do not treat the example API and storage rules as existing consumer decisions.

The caller pins reusable workflow source commit
`2ea9ebe12be9d233c41a2dbc61e7a84caf3abbfb`, published as package
`0.6.0-preview.4`. That preview route is currently **UNVERIFIED**. Keep the
immutable source pin for review; change it only after reviewing a release and
verifying the route for the consumer repository.

GitHub loads a `pull_request_target` workflow definition from the base
repository's default branch; `branches: [main]` limits this caller to pull
requests targeting `main`. Keep the default branch protected and make the
reviewed caller available there. Its job-level condition requires both head
and base repository IDs and names to match the current repository before the
secret-bearing reusable workflow can be called; cross-repository pull requests
are skipped. The caller itself has no checkout or run steps. Do not add
untrusted pull request code execution to this privileged path. Consumers must
decide whether their host policy permits this event and separately configure
and verify branch protection and required checks; this example does not prove
those host settings.

Before enabling the caller, add an `OPENAI_API_KEY` Actions secret in the
consumer repository settings. The caller forwards only that selected secret,
which is required by the Codex reviewer. This example's Authority Set contains
only same-repository members, so it does not need `CI_SOURCE_READ_TOKEN`.

The local `.codex/gatekeeper/config.json` uses the supported v2 Authority Set
configuration and selects both consumer documents with its local decision
schema. The CI `.codex/gatekeeper/ci-policy.json` selects the current v4
enforced route for `main`; the caller explicitly supplies the policy, prompt
and schema paths and enables protected review instructions. It passes an empty
`validation-path`, matching the reusable workflow's default and selecting no
additional decision-validation file. The default route is `local-only`, so
branches without a named policy entry do not silently inherit the `main`
selection. The example's ordinary `main` review is enforced CI review under
the protected-base policy.

The v4 `ownerAddition` object separately opts this consumer into the optional
G0 path for a one-file, authority-only addition to the selected
`docs/architecture.md` member. It does not run as an acceptance shortcut for
ordinary changes. Before using it, adopt the v4 policy and caller on the
protected base, define the missing decision through the consumer's governance,
and follow the [OWNER_ADDITION procedure](../../docs/integration-reference.md#versioned-multi-document-owner-additions).
G0 does not authenticate an owner or establish host enforcement. A consumer
that wants ordinary enforced CI without this G0 selection should use the
supported CI policy v2 route and omit `ownerAddition`; policy v4 requires its
version-2 owner-addition selection. The eligibility schema is the reusable
version-2 example at `../owner-addition-v2/eligibility.schema.json`.

The example's limits are explicit. The local v2 configuration uses the
initial-route ceilings; the v4 multi-document CI route permits a larger
per-file ceiling. Both paths read every manifest member from the selected
revision and fail closed when the complete set or prompt exceeds its limits.
These examples configure review inputs; host branch protection and the
required-check producer must be selected and verified separately by the
consumer.
