# Native session model

PR #574 adopts the original trusted host CLI session-path premise in
docs/architecture.md. Model only the return values of the two dedicated
no-argument accessors in src/native-session-paths.mts. This neither authenticates
the invoking host nor sanitizes generic paths. Explicitly injected CLI arrays,
direct argv/environment reads, copied accessors and candidate/reviewer values
remain unmodeled. Official model regression checks production sink flows and
these negative cases with and without all repository model packs.
