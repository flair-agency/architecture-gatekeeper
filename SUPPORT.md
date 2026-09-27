# Support and maintenance

## Support channels

- Use [GitHub Issues](https://github.com/flair-agency/architecture-gatekeeper/issues)
  for reproducible bugs and focused feature proposals.
- Use the contribution workflow in [`CONTRIBUTING.md`](CONTRIBUTING.md) for
  patches.
- Use the private process in [`SECURITY.md`](SECURITY.md) for suspected
  vulnerabilities.

Questions about a consumer repository's architecture, policy, credentials or
deployment belong in that consumer repository. This shared package does not
infer or decide a consumer's architecture.

## Maintenance expectations

The project is maintained on a best-effort basis. No response time, fix time,
release cadence, compatibility period or long-term-support line is promised.
The latest GitHub Release is the only supported version. Releases are immutable
adoption points; consumers remain responsible for reviewing and pinning the
exact version or commit they adopt.

Maintainers prioritize security reports, regressions in documented behavior,
fail-open acceptance risks and reproducible defects. Feature work depends on
fit with the normative architecture, maintainer capacity and any required
owner decisions.

The teams in [`.github/CODEOWNERS`](.github/CODEOWNERS) identify review
responsibility for repository areas. They do not establish a service-level
agreement or transfer architecture ownership from consumer repositories.
