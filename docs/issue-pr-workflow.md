# Issue and pull request workflow

Use issues to agree on one reviewable outcome and its completion evidence.
Use pull requests to report exactly what changed and what remains. This process
organizes work; it does not change the normative [architecture contract](architecture.md)
or approve a route, consumer policy, security claim, or release.

## Create and refine an issue

Choose the Bug report, Feature request, or Task form. The forms require a
problem and outcome, scope, and acceptance criteria with a verification method
for each criterion. Bug reports also retain the release/commit, affected route,
reproduction and expected behavior fields. Dependencies, a proposed maintainer
owner, and an architecture/assurance dependency note are optional; a proposed
maintainer owner is not the owner of consumer architecture. Maintainers confirm
assignment during triage. Do not put secrets, private authority text, or
personal data in public issues. Report security vulnerabilities through
[SECURITY.md](https://github.com/flair-agency/architecture-gatekeeper/blob/main/SECURITY.md).

The issue creator and maintainer should make each criterion a separate
checkable statement, with evidence that can establish completion. For example:

```markdown
## Problem
Describe the defect or missing capability.

## Outcome
State the observable result the work should produce.

## Scope
State what is included and excluded.

## Acceptance and verification criteria
- [ ] Observable result; verify with a named check or evidence.
- [ ] Observable result; verify with a named check or evidence.

## Dependencies and related work
Link existing related or blocking issues, or explain that none are known.

## Owner decisions and assurance (optional)
Link an existing authority section or real owner issue if relevant. Leave an
unresolved decision open; do not invent an owner issue or settle the decision here.

## Proposed owner
Name a maintainer only when already known; otherwise explain that assignment is open.
```

GitHub's issue forms improve the normal web flow, and blank issue creation is
disabled there. GitHub CLI and API clients can still create an issue without
using a form. For those paths, include the same sections and criteria described
above; do not treat successful API submission as form validation.

During triage, link related issues and use GitHub's sub-issue and dependency
relationships to show decomposition and blockers. Keep the parent issue open
until every parent criterion is complete. Maintainers manually triage CLI/API
issues; if required sections or criterion-level verification are missing,
request the details before assigning work. Use the project's existing statuses
to track progress: `Todo` means scoped and awaiting work, `In Progress` means
active implementation, `In Review` means a PR is under review, and `Done` means
the maintainer verified all issue criteria and the full issue scope. Contributors
update issue checkboxes and attach links to evidence as criteria are completed.
Maintainers verify the parent criteria before closing a parent issue. Project
status is coordination metadata, not acceptance evidence. Do not invent
owner-decision issues: link a real owner issue when one exists, or say that the
owner decision is pending and no owner issue has been recorded.

## Keep partial delivery linked

A pull request can cover only some criteria from an issue. State exactly which
criteria it covers, link the issue, and put the uncovered criteria in
**Remaining work**. Link the real follow-up issue when one is recorded. If
follow-up ownership is still open, say so and link the source issue without
presenting it as a distinct owner issue. Do not use a closing keyword on a
partially delivered issue. For work related to [#252](https://github.com/flair-agency/architecture-gatekeeper/issues/252)
or [PR #262](https://github.com/flair-agency/architecture-gatekeeper/pull/262),
preserve those actual references and distinguish completed criteria from
remaining work; a code slice or linked follow-up does not by itself close the
tracked issue.

Use a GitHub closing keyword only when the pull request completes every
acceptance criterion and the issue's full scope. GitHub then closes the issue
when the pull request is merged into the configured branch. Otherwise use a
plain issue reference and keep the issue and project status aligned with the
remaining work.

## Prepare a pull request

Fill the five headings supplied by the
[pull request template](https://github.com/flair-agency/architecture-gatekeeper/blob/main/.github/pull_request_template.md),
in order:

1. **Outcome** — state the observable result and delivered scope.
2. **Issue coverage** — link covered issues and identify covered criteria; if
   there is no issue, explain why. Use closing keywords only for full issue
   completion.
3. **Verification** — report checks actually run, their results, and the
   evidence for each covered criterion. Do not list planned checks as passing.
4. **Remaining work** — link the real follow-up owner issue. If no owner issue
   has been recorded, state `None`, explain that ownership remains open, and
   link the existing source issue under **Issue coverage**. If no work remains,
   explain why. Keep unresolved criteria visible.
5. **Authority and assurance** — identify affected architecture sections,
   trust boundaries, evidence and acceptance behavior, or explain why they do
   not change. Record unresolved owner decisions as open.

Replace every prompt comment with substantive content. The body after HTML
comments and fenced examples are removed must still answer each heading; a
heading cannot contain only checkbox markers or placeholder-only text. If
**Issue coverage** has no issue reference, write `N/A` and explain why. If
**Remaining work** has no follow-up, write `None` and explain why. CLI/API PR
creation and later body edits must preserve these same five headings and
substantive sections.

The [PR description workflow](https://github.com/flair-agency/architecture-gatekeeper/blob/main/.github/workflows/pr-description.yml) checks
opened, edited, reopened, synchronized, and ready-for-review PRs, including
drafts. Editing the body triggers a new check. It uses the pull-request event
body only, has no token permissions, and does not check out or execute
candidate code. It does not write comments or labels, update project fields, or
change a host-required check. A failing result reports structural omissions;
this workflow is not configured as a required acceptance check. Because the
event is `pull_request_target`, GitHub runs this workflow only after it is
present on the default branch. A change adding it can validate its templates
and documentation locally, but this new workflow does not validate its own PR.
Enabling it does not change branch protection; maintainers handle its result as
a delivery-process check, not an architecture gate.

The checker requires exactly one of each five headings, nonempty section
content after prompt comments, fenced examples, and checkbox markers are
removed, and issue-reference-or-explained-`N/A` and
issue-reference-or-explained-`None` forms for the two tracking sections.
Reviewers verify that a reference under **Remaining work** identifies the real
owning issue. This is a shape check: it does not establish that an issue exists
or owns the work, that a claim is true, that tests are sufficient, or that
architecture is consistent. It cannot establish security, readiness, owner
authority, or protected acceptance.

Reviewers must assess the actual diff and evidence against the architecture,
issue criteria, and applicable protected policy. An automated structure pass,
project status, issue closure, and an individual review do not replace an owner
decision or protected acceptance result.
