# GitHub runner output boundary

This official CodeQL model pack represents the owner-authorized trust premise
in `docs/architecture.md` (GitHub step-output sink). It is not a generic path
sanitizer or proof that an arbitrary process environment is authentic.

The `path-injection` barrier matches only the return of the no-argument
`trustedGitHubOutputPath` export imported from `src/github-runner-env.mjs`.
It does not model `process.env`, other exports, caller paths, or filesystem
validation helpers as trusted. Review changes to the accessor and this pack
together; the invoking runner must preserve its own `GITHUB_OUTPUT` value.

GitHub default setup discovers repository model packs under
`.github/codeql/extensions`. Local `npm run codeql` explicitly supplies this
same pack; it does not download a separately published model. Both retain the
local threat model. Hosted application must be confirmed from the subsequent
CodeQL run, rather than inferred from successful local analysis.

Before the whole-tree scan, the local command analyzes a generated fixture
with and without this pack using the standard `js/path-injection` query. The
fixture copies the actual accessor and adds a different export to the same
file. It requires that only the trusted accessor finding disappears, while
other environment variables, direct `GITHUB_OUTPUT` use, CLI input, the other
export, and a path checked for absolute/regular-file/link properties retain
all their baseline findings. A failed regression aborts the scan.

References:
- https://codeql.github.com/docs/codeql-language-guides/customizing-library-models-for-javascript/
- https://docs.github.com/en/code-security/how-tos/find-and-fix-code-vulnerabilities/manage-your-configuration/edit-default-setup
