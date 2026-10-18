# Issue #567: stale pull request merge metadata

Issue #567 reports a `pull_request_target` event whose `merge_commit_sha` no longer
matches the current merge ref for that pull request. The supplied example is:

- Event base: `1054d1ba88db7bf1fc20af4d182eb614d31c6f01`
- Event head: `feaf9bbe578c6d32c0af32b55166b754c0b6a2e4`
- Event merge SHA: `5d61e22ef90b6c7e615e9aa5e8a9bf0558515792`
- Previous head represented by that merge: `d502876e5532f900d6938a96de247e9727e73121`
- Refreshed merge SHA reported for the event base/head: `1ac693dbaf498376626d25bb6eb10bf8b4405f33`

The existing exact-parent guard correctly rejects the event merge because its
second parent is stale. The reusable review workflows and the protected Gemini launcher keep the
event SHA as the normal path. Only when the immutable event SHA has an ordered
parent mismatch do they perform one bounded lookup of
`refs/pull/<number>/merge`, check out the resulting immutable SHA, and verify
that it has exactly the event base and head as its ordered parents. The
resolved SHA becomes the reviewed SHA used by the review and downstream
records. Missing or ambiguous refs, lookup or checkout failures, and any
candidate with different parents remain incomplete.

The workflow regressions use locally created Git commits to reproduce the stale
metadata shape and exercise the exact-parent checks and bounded resolver script.
Gemini launcher tests exercise the same transition through its trusted
object-fetch helper and assert the selected SHA it returns; the source handoff
to publication and output was inspected separately. These checks do not replay
the hosted GitHub event or establish GitHub Actions checkout behavior for the
issue's historical run.
