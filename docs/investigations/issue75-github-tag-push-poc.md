# Issue #75: GitHub tag-push attribution probe

This is an observation-only PoC for a possible GitHub `Attestation Adapter`.
It does not create `OwnerAttestation`, change the Architecture Gate, emit an
acceptance check, or authorize a contract amendment. The workflow has no token
permissions, uses only public read-only API calls, and responds only to tags in
`issue75-attest-poc/*`.

The candidate action is an **annotated tag push**, not the tagger name or email
inside the Git object. The tag message for this PoC explicitly says it is not
an approval. The workflow records the initial GitHub Actions actor ID and the
push event's sender ID, plus the event's commit SHA. It queries the current
tag ref and annotated tag object separately to record that object's OID and
peeled target commit.

This checks what GitHub actually supplies for one push path. It does **not**
prove that an actor ID identifies a human owner for all credential types.
GitHub documents a deploy-key exception: the Actions UI may attribute a push
to the administrator who registered the key. A production adapter would have
to reject such paths through supported event metadata or an independently
enforced tag-creation policy. A `create` webhook has a `pusher_type`, but its
event must be correlated with the exact tag object; this draft workflow cannot
test that event because `create` workflows run only from the default branch.

The push event identifies a ref and its tip commit, not a stable annotated-tag
object identity. The API query observes the ref **later**. Even when the
queried tag targets the event's commit, a replacement annotated tag could
target the same commit with different text. The workflow deliberately reports
this gap rather than calling its observation a verified attestation. A real
adapter would need an immutable event-to-object binding or an enforced
no-update/no-delete tag namespace, then a protected verifier and a required
check bound to the current base and head. A tag push workflow that runs from a
candidate tag is itself not a protected acceptance verifier.

The experiment is intentionally separate from the signed-tag PoC in draft PR
#76. That PoC authenticates a Git object using an owner-controlled signature;
this one observes GitHub's account attribution for a push. Neither is yet the
selected v1 owner-attestation mechanism.

## Procedure and evidence

1. Create an annotated experimental tag at this PoC commit, with a message
   such as `Issue #75 attribution probe only; not owner approval`.
2. Push only that tag to the repository. Do not use a release namespace or a
   real amendment/review identity.
3. Inspect the `Issue 75 tag push probe` Actions run and record its run URL,
   event actor/sender IDs, queried tag object OID and target commit below.
4. Compare the run with the GitHub account and credential path actually used
   for the push. One successful personal-account observation does not validate
   deploy-key, GitHub App, automation-token or rerun paths.

The probe's actual result will be recorded here after the push. The test tag
can then be removed; removing it does not undo a historical push event, but
may make the tag object harder to retrieve later. The Action run and this
record are diagnostic evidence only, subject to GitHub retention.

**Status:** awaiting the first tag-push observation.
