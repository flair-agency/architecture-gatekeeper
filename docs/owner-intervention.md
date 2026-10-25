# Owner intervention for Architecture Gate

Architecture Gate reports the result of its configured review and acceptance
policy. A failed or incomplete run is not `PASS`. This runbook is operational
guidance; each consumer's canonical authority and repository administration
rules remain authoritative.

## Owner decisions

`OWNER_DECISION` means the reviewer found an architecture choice that the
consumer's canonical authority does not resolve. It may identify a missing
decision or a choice to change an existing one. The current run cannot accept
the change.

1. Identify the unresolved responsibility or boundary.
2. The accountable owner decides and proposes a canonical-authority update.
   Keep proposed change A distinct from authority update B when review
   authority is selected from the protected base.
3. Use `OWNER_ADDITION` for a missing decision. For an existing decision,
   follow the [owner amendment contract](architecture/owner-amendment.md).
   Only the previous protected Policy selects an available route; B cannot
   authorize itself.
4. After B is merged and canonical readback verifies its authority bytes,
   review A again against the resulting canonical Policy and Authority Set.
   Preserve A's earlier result as history.

## Self repository amendment operation

The self repository uses one ordinary protected Actions PR under the selection
defined in the [owner amendment contract](architecture/owner-amendment.md).
The protected workflow checks the exact base/head/test-merge, the complete old
Authority Set, and every changed authority member's before/after bytes and
diff. Its seven-question eligibility result is bound to those revisions. The
ordinary A review `PASS` remains refused while B is pending.

The operator verifies the workflow path, revision, run identity, old Policy,
and exact PR revisions as described in the owner amendment contract.

After eligibility, the owner approves and merges the ordinary PR using the
repository's existing controls. Post-merge canonical readback verifies the
actual target, resulting authority bytes, and merge parent/tree relationship.
A fresh fetch of the fixed repository's `main` must precede readback; confirm
that `refs/remotes/origin/main` contains the adopted commit. An unattached
commit with matching bytes is not canonical adoption.
A squash merge qualifies when the adopted commit has the expected base parent
and its tree matches the reviewed test-merge. Record the merge and readback;
report adoption only after they verify. Review A afresh if one exists.

This is the only self amendment path. It requires no historical BLOCK evidence,
separate App/Queue path, tag, attestation, or portable evidence custody. It
does not independently prove owner identity, Actions source integrity within
the same run, or host configuration.

The one-off PR #517 `no-future-permission` exception remains a historical,
non-repeatable operation. It is not a standing permission or route for future
amendments. An administrative bypass remains outside Gatekeeper acceptance.
