# Self Architecture Gate Actions event policy

GitHub's default Actions policy for public repositories currently evaluates
`pull_request_target` runs and is scheduled to block affected runs on
2026-11-02. The self Architecture Gate uses that event to run its protected-base
caller, `.github/workflows/self-architecture-gate.yml`. This page records the
repository-specific policy needed for [issue #12](https://github.com/flair-agency/architecture-gatekeeper/issues/12).

## Intended setting

The repository policy was applied on 2026-09-23 as
[policy 5316](https://github.com/flair-agency/architecture-gatekeeper/settings/actions/rules/5316).
Its API readback showed `enforcement: active`, the single workflow path below,
and only `pull_request_target` in `allowed_events`.

The **active repository Actions event policy** targets only
`.github/workflows/self-architecture-gate.yml` and allows the
`pull_request_target` event. Do not target all workflow paths or add other
events to this policy. GitHub's Actions policy API represents the setting as:

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
      "parameters": {
        "allowed_events": ["pull_request_target"]
      }
    }
  ]
}
```

This policy permits a privileged event; it does not grant new token scopes,
change workflow code, or make a review decision. The caller must continue to
come from the protected base. Its `pull-requests: write` permission is needed
for reporting; reviewer instructions and CI policy come from the protected
base, while the review reads the pull-request diff. Pull-request code must not
run with the write token or review credentials.
Review changes to the caller and reusable workflow against this boundary before
keeping the policy active.

## Apply and verify

1. In repository **Settings → Actions → Policies**, inspect existing repository
   and inherited policies. If an applicable policy already permits the event,
   confirm its workflow scope before adding another rule.
2. Create the policy above for this repository. Read the saved policy back and
   verify `enforcement: active`, the single included workflow path, and the
   single allowed event. Keep the returned policy ID for recovery.
3. On a subsequent non-draft pull request, confirm that the self Gate runs from
   `pull_request_target` and that `policy`, `codex-action-integrity`, `review`,
   `report`, and `accept` complete. Check that the sticky PR comment updates.
   A successful run while the default policy is still in evaluate mode is not,
   by itself, proof that the saved allow policy is active.
4. Check Actions policy insights for unexpected blocks or scope matches after
   activation and again around the 2026-11-02 enforcement date.

The [GitHub security guide](https://docs.github.com/en/actions/reference/security/securely-using-pull_request_target)
explains the default policy and the privileged-event boundary. The
[Actions policies API](https://docs.github.com/en/rest/actions/policies)
documents policy creation and readback.

## Recovery

If the rule matches the wrong workflow or unexpectedly changes Actions
behavior, disable or delete that policy by its saved ID, then read the policy
list back. This returns the repository to the applicable inherited/default
policy; after the enforcement date, that may block self Gate runs. Keep merge
acceptance fail closed until the correctly scoped event policy and a fresh
self Gate run both succeed. Do not compensate by broadening token permissions
or accepting an unreviewed PR.
