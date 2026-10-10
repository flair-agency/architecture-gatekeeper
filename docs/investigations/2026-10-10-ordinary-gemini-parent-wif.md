# Ordinary Gemini parent-process WIF connection

Implementation investigation for #334 on feature `d44bb188`. This implements
existing parent-only Vertex/WIF responsibilities; it selects no consumer
identity, producer, handoff transport, acceptance route or activation.

## Responsibility and sequence

`runOrdinaryGeminiCiLauncher()` prepares revision-bound protected inputs and
inspects the preinstalled fixed runtime before calling the parent-only WIF
issuer. The issuer uses the trusted launcher's GitHub OIDC request capability,
Google STS exchange and service-account impersonation. The resulting short-lived
Vertex credential stays in memory and is passed only to the existing parent
proxy composition. The existing child launch interface does not receive the
assertion, token or renewal capability. The launcher then invokes one profile
session and returns its shared validated result in process.

The issuer uses the documented [Google STS token exchange](https://docs.cloud.google.com/iam/docs/reference/sts/rest/v1/TopLevel/token)
and [service-account access token method](https://docs.cloud.google.com/iam/docs/reference/credentials/rest/v1/projects.serviceAccounts/generateAccessToken).
Its deployment identifiers and GitHub capability are explicit trusted caller
inputs. Input checking and fixed endpoint dispatch do not authenticate an
arbitrary caller, prove IAM authorization or establish producer protection.
No credential file, environment export, log, step output or result persistence
is added. Runtime installation remains a pre-issuance host responsibility.

## Retained test map

| Risk/invariant | Production boundary | Verification |
| --- | --- | --- |
| Malformed or executable caller input | WIF input parser / launcher input record | Offline invalid records and accessor/proxy cases before HTTP dispatch. |
| Credential-bearing destination drift | GitHub token endpoint and fixed STS/IAM requests | Synthetic fetch observes exact destinations, audience, headers and bodies; redirects fail closed. |
| Unbounded or failed exchange | Complete issuer deadline and bounded response parser | Synthetic malformed, oversized, error and timeout outcomes; later stages do not dispatch. |
| Credential issued before protected preparation | Parent launcher sequencing | Actual Git ordered-parent mismatch rejects with zero synthetic HTTP calls. |
| Reviewer receives renewal capability or credentials | Existing parent proxy / CLI launch interface | Actual synthetic CLI observes its stdin/environment; all issuer secrets absent. |
| WIF failure triggers duplicate model execution | Parent launcher | Synthetic 403 stops with one HTTP call and no CLI invocation. |

Tests use synthetic HTTP responses and an isolated synthetic CLI, not Google
credentials, an authenticated Vertex response or hosted producer evidence.

## Remaining work

This module is internal and has no workflow/CLI activation. A concrete protected
caller still must supply selected deployment bindings and GitHub OIDC capability,
install the pinned runtime before issuance, authenticate its reviewed source,
and bind the producer/run/attempt/revisions. #329 owns a safe reporting and
acceptance handoff; this connection publishes no raw decision or substitute.
Real ordinary hosted operation, Codex compatibility/rollback, and applicable
consumer governance remain separate acceptance criteria. No live credential
issuance, paid call or additional development attempt is consumed here.
