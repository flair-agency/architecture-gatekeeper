# Self Architecture Gate Actions event policy

This page records the repository-specific Actions event policy for the
protected-base caller `.github/workflows/self-architecture-gate.yml` and
[issue #12](https://github.com/flair-agency/architecture-gatekeeper/issues/12).
Amendments use the existing ordinary PR caller; this policy does not establish
a second App or queue route.

## Current setting

The repository policy was applied on 2026-09-23 as
[policy 5316](https://github.com/flair-agency/architecture-gatekeeper/settings/actions/rules/5316).
Its recorded API readback showed active enforcement, the single workflow path
below, and only `pull_request_target` in `allowed_events`. Re-read the host
configuration before relying on this observation.

```json
{
  "name": "Allow protected self Architecture Gate pull_request_target",
  "enforcement": "active",
  "conditions": {
    "workflow_path": {
      "include": [".github/workflows/self-architecture-gate.yml"],
      "exclude": []
    }
  },
  "rules": [
    {
      "type": "restrict_action_events",
      "parameters": {"allowed_events": ["pull_request_target"]}
    }
  ]
}
```

This policy permits a privileged event; it does not grant token scopes, change
workflow code, or make a review decision. The caller must come from the
protected base. Its `pull-requests: write` permission is for reporting. Review
instructions and CI Policy come from the protected base, while review reads
the PR diff. Pull-request code must not run with the write token or review
credentials. Review caller and reusable-workflow changes against this boundary.

## Verify or recover the policy

In repository **Settings → Actions → Policies**, inspect repository and
inherited policies. If an applicable policy already permits the event, confirm
its scope. When creating or recovering this rule, read it back and verify active
enforcement, the single included workflow path, and the single allowed event;
retain its policy ID. On a later non-draft PR, confirm that the protected
caller runs and its `policy`, `review`, `report`, and `accept` jobs complete.
The run itself is not proof that the saved host policy is active.

If the rule matches the wrong workflow or changes Actions behavior, disable or
delete it by saved ID and read the policy list back. Keep acceptance fail-closed
until the correctly scoped rule and a fresh self Gate run are confirmed. Do not
widen token permissions to compensate for a missing or mis-scoped rule.

Consult GitHub's current [security guidance](https://docs.github.com/en/actions/reference/security/securely-using-pull_request_target)
and [Actions policy API](https://docs.github.com/en/rest/actions/policies)
when applying or verifying the host configuration.
