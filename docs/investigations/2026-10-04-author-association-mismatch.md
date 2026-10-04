# PR author-association discrepancy investigation — 2026-10-04

Scope: [Issue #194](https://github.com/flair-agency/architecture-gatekeeper/issues/194).
This dated case record supports the
[caller authorization boundary](../github-assurance.md#caller-authorization-and-host-integration-boundary).
It is not canonical authority, a maintained GitHub specification reference or a
consumer authorization recipe. It remains repository investigation material,
not part of the distributed package.

## Evidence inspected

On 2026-10-04, read the public Actions run/job metadata and retained authorization
and diagnostic job logs for `flair-agency/architecture-decision-authoring`
[PR #25](https://github.com/flair-agency/architecture-decision-authoring/pull/25).
All three runs are `pull_request_target`, attempt 1. Times below are UTC and
refer to the logged authorization result, not an assumed GitHub membership
change time.

| Run / action | Logged result time | Event-derived association | Authorization / diagnostic | Model job |
| --- | --- | --- | --- | --- |
| [36435111794 / opened](https://github.com/flair-agency/architecture-decision-authoring/actions/runs/36435111794) | 2026-09-28 14:19:34 | `CONTRIBUTOR` | Both success; `allowed=false`, `reason=author_association` | `architecture-gate-observe` skipped |
| [36435619797 / synchronize](https://github.com/flair-agency/architecture-decision-authoring/actions/runs/36435619797) | 2026-09-28 14:23:40 | `CONTRIBUTOR` | Both success; `allowed=false`, `reason=author_association` | `architecture-gate-observe` skipped |
| [36435884264 / edited](https://github.com/flair-agency/architecture-decision-authoring/actions/runs/36435884264) | 2026-09-28 14:25:46 | `CONTRIBUTOR` | Both success; `allowed=false`, `reason=author_association` | `architecture-gate-observe` skipped |

Each authorization log reports `base=main`, `draft=false` and its action.
Each diagnostic log reports `result=success allowed=false reason=author_association`.
The first run's metadata reports both actor and triggering actor as
`naokikimura`; that does not prove all relevant principals were authorized.

Inspected the
[caller at the first run's immutable revision](https://github.com/flair-agency/architecture-decision-authoring/blob/8541248edc4c3284a1dfa2221a6182a6f04d382a/.github/workflows/architecture-gate-observe.yml).
It reads `pull_request.author_association` from `GITHUB_EVENT_PATH`, validates
known enum values and allows only `OWNER`, `MEMBER`, or `COLLABORATOR` for a
nondraft PR targeting `main`. The authorization/diagnostic jobs have
`permissions: {}`. The model job requires both jobs to succeed and
`allowed == 'true'`. Thus the successful preflight did not authorize review;
the denial propagated correctly and the secret-bearing job did not start.
The run SHA identifies caller context; it is not asserted to be the PR head.

A separate `GET /repos/flair-agency/architecture-decision-authoring/pulls/25`
read at approximately **2026-10-04 03:01 UTC** returned author `naokikimura`,
`author_association=MEMBER`, state `closed`, `merged_at=null`, and
`updated_at=2026-10-02T04:50:44Z`. Its then-observed base/head SHAs were
`c060eaa06b6f4312a3aab442a60d7dcc93acea77` /
`fb8e0fc0730c9de8d5bded8b8caeced9f5780cf8`.
This is a new observation, distinct from the issue's earlier REST read;
`updated_at` is not proof of when association was calculated or changed.

The original complete event JSON and historical organization membership state
were not retrieved. The retained logs and immutable caller establish the
specific event-derived value consumed by the first authorization job; the
other two authorization logs independently report the same value. No claim is
made about unlogged event fields or the platform's internal calculation.

## Semantics and limits

Reviewed primary sources:

- [GitHub association definitions](https://docs.github.com/en/graphql/reference/issues#commentauthorassociation): author/repository relationships, rather than current actor authorization.
- [Webhook sender](https://docs.github.com/en/webhooks/webhook-events-and-payloads#the-sender-property): event principal, including placeholder cases.
- [Actions variables](https://docs.github.com/en/actions/reference/workflows-and-actions/variables#default-environment-variables): event file, initial actor and rerun initiator/privileges.
- [PR REST endpoint](https://docs.github.com/en/rest/pulls/pulls#get-a-pull-request): resource lookup and read permissions.
- [Workflow event boundary](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#pull_request_target): privileged context and untrusted-code risks.

The sources reviewed do not guarantee agreement, association recomputation time
or relative freshness of event and later REST representations. The discrepancy
is confirmed; its root cause is undetermined. Timing, membership changes,
caching or a GitHub defect cannot be distinguished using this evidence. REST
success neither invalidates the original event nor authorizes rerunning it.
Determining GitHub's internal cause would need additional historical evidence
or a platform explanation; this guide does not depend on inventing one.

## Responsibility boundary and limits of this case

The shared-package outcome is a short explanation of the existing boundary:
Gatekeeper preserves its review, evidence, credential and acceptance guarantees;
the consumer owns caller authorization, and GitHub owns its platform semantics.
No authorization helper is added. The issue's conditional shared-logic
regression criterion does not apply. No runtime, exported API, caller, allowlist,
token permission or secret-bearing behavior changes.

Consumer owners select the relevant principals, identity sources, permissions,
disagreement/failure rules and permitted secret use in their own canonical
authority before implementation. This record prescribes neither a primary
signal nor a REST/event comparison design and resolves no such choice for
`architecture-decision-authoring` or another consumer. Individual implementation
advice can be assessed against that consumer's adopted policy and current host
documentation when needed.

This investigation did not measure prevalence. It establishes this case, not
that the discrepancy is widespread or rare. The unknown platform cause remains
an evidence limit, not a claim of a fixed GitHub defect. The observations and
source review above describe this investigation date; they do not create an
ongoing Gatekeeper guarantee about GitHub association behavior.
