# Authority Set contract

This is a required normative member of the Architecture Gatekeeper self Authority
Set. Read it with the [shared contract](../architecture.md) and every other
selected member; topic separation supplies no implicit precedence or route
activation. Setup and operating guidance are in the [documentation map](../README.md).

### Target contract: distributed authority

A consumer may opt in to a versioned, finite Authority Set whose required
documents reside in one or more repositories. Authority topology is independent
of source layout and runtime dependencies. The consumer selects each member by
stable ID, repository identity, path and immutable revision. The selector is a
review input that identifies owner-adopted sources; it is not itself semantic
architecture authority. Links, dependencies and submodules do not implicitly
add members or establish precedence between them.

The existing `authorityFiles` decision field reports repository paths. An
opt-in distributed route reports stable source IDs in a separate `authorityIds`
field under its own decision schema. A self member's `authority-revision`
selector resolves to the protected base commit in CI or the single recorded
commit in local/manual review; its manifest does not pin a stale SHA.

An opt-in CI route claiming protected-authority assurance must select its
Authority Set and same-repository authority bytes from the protected base
revision, not the pull-request merge checkout. External revisions are
consumer-adopted snapshots: an upstream change has no effect until the
consumer updates its protected selection. A selection-change pull request is
reviewed under the previous protected selection; the new selection applies to
subsequent reviews after merge. Local/manual review selects configuration and
same-repository authority from its single recorded commit. Both routes use the
same Authority Set semantics but need not select identical snapshots, and a
local result remains development feedback under the current acceptance policy.

Before semantic review on an enabled route, Gatekeeper must resolve every
required member to a bounded, immutable regular-file snapshot, verify the
declared repository, revision and path, compute its content digest, and supply
the selected bytes and source IDs to the reviewer. The supported source types
and per-file, member-count and total-size limits must be explicit before the
route is enabled. A missing, inaccessible, malformed or unverifiable member
leaves the review incomplete, without a `PASS`, `BLOCK` or `OWNER_DECISION` and
without falling back to a smaller set. Authority content is never executed.
Source-read credentials are confined to materialization and are not exposed to
pull-request code or the semantic reviewer, which does not discover additional
authority through general repository access.

For every completed `PASS`, `BLOCK` or `OWNER_DECISION` on the enabled route,
deterministic validation requires the reported source IDs to equal the complete
required set. Omitted, duplicate or extra IDs invalidate the result as an
incomplete review. A material conflict among successfully loaded authorities
without an adopted precedence or refinement rule calls for `OWNER_DECISION`,
not an invented ordering. Report the selected-set identity and each member's
repository, resolved commit, path and content digest with the reviewed
revision. These same-run provenance details do not establish that the model
internally read every byte and are not independently reusable acceptance
evidence.

This target contract applies only after the route is implemented and explicitly
selected. Existing single-repository and CI compatibility routes retain their
current assurance claims except for the explicit fail-closed legacy v1 repair
below; naming a protected architecture file in a prompt
alone does not satisfy the materialization requirement above. An enabled
enforced review cannot downgrade to an older route when resolution fails.

### Initial distributed-authority CI bounds (Issue #51 owner decision)

The first CI implementation supports GitHub repositories only. A consumer that
selects this route must declare all five effective limits in its protected-base
policy: `maxManifestBytes`, `maxMembers`, `maxFileBytes`, `maxTotalBytes`, and
`maxPromptBytes`. There are no implicit defaults, and a pull request cannot
raise these limits for its own review. The recommended initial consumer profile
is respectively 16,384 bytes, 16 members, 65,536 bytes, 262,144 bytes, and
524,288 bytes. These recommendations do not activate the route by themselves.

The versioned Gatekeeper runtime ceilings, in the same order, are 65,536 bytes,
32 members, 131,072 bytes, 524,288 bytes, and 1,048,576 bytes. Neither workflow
inputs nor environment variables may raise these ceilings. Changing them
requires review and release of the Gatekeeper runtime. Missing, invalid or
over-ceiling effective limits fail closed before authority materialization.
The prompt limit applies to the complete review prompt, including selected
authority content. The existing protected-base selection, immutable revisions,
complete-set validation and offline review boundary continue to apply.

### Initial local distributed-authority bounds (Issue #51 owner decision)

The first local/manual Authority Set route supports same-repository (`self`)
members from the one recorded Git commit only. It is opt-in through committed
consumer configuration. The configuration selects a committed manifest and
declares all five effective limits named above; the same versioned runtime
ceilings apply. The complete prompt, including the task and any Hook context,
must fit `maxPromptBytes`. Missing, invalid or over-ceiling limits leave the
review incomplete before semantic review.

For local `self`, the configured repository name labels the current Git root;
the local same-user trust boundary does not attest its GitHub origin. The
reviewed commit and object bytes are verified within that root, and local
provenance must not claim a stronger repository-identity guarantee.

An external member selected by a local manifest is not silently omitted or
replaced with a working-tree copy. Until an explicit local source-access and
credential boundary is adopted, that selection leaves local review incomplete.
This initial route does not request a source-read credential or use one to
resolve authority. Local child execution may inherit the host environment;
this route does not claim isolation from credentials that the host already
supplies. Any later external-source route must define how source credentials
are withheld from the semantic reviewer before it is enabled. A local result
remains development feedback, not merge-acceptance evidence. Existing consumers
that have not selected this route keep the legacy `authorityFiles` behavior.
