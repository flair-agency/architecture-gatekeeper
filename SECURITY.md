# Security policy

## Supported versions

Security fixes are made on a best-effort basis for the latest published
release only. Earlier releases and unreleased commits are not supported
security versions. Consumers should pin an exact release or immutable commit
as described in the README and upgrade after reviewing a new release.

| Version | Supported |
| --- | --- |
| Latest published release | Yes |
| Earlier releases | No |
| Unreleased commits | No |

## Reporting a vulnerability

Use GitHub's private vulnerability reporting for this repository: open the
**Security** tab, choose **Advisories**, and select **Report a vulnerability**.
Include:

- the affected release or immutable commit;
- the affected local, manual, package or CI route;
- reproduction steps and the expected security boundary;
- the practical impact and any known mitigation; and
- whether credentials, protected inputs or acceptance evidence are involved.

Do not open a public issue for a suspected vulnerability. Do not include real
credentials, private repository content or personal data in a report. If
GitHub does not offer the private reporting form, use the organization's
contact link on its GitHub profile only to request a private reporting channel;
do not send vulnerability details through a public channel.

The maintainers do not promise a response or remediation deadline. They will
validate the report against the trust boundaries in
[`docs/architecture.md`](docs/architecture.md), coordinate a fix and disclosure
when warranted, and publish release information through GitHub Releases.

## Security boundary

Architecture Gatekeeper is an architecture guardrail, not a tamper-resistant
security boundary. Its local paths assume the same-user environment and a
trusted Git executable; its CI path relies on the documented GitHub checkout,
credential and protected-policy boundaries. See the README's trust-boundary
section and [`docs/github-assurance.md`](docs/github-assurance.md) before
classifying a report as a vulnerability.
