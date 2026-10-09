import { createPrivateKey, createSign } from 'node:crypto';


/** Types describe operations only; protected caller provenance is a precondition. */
export type GitHubAppReporterAwaitable<T> = T | PromiseLike<T>;
export interface GitHubAppReporterResponse {
  ok: unknown;
  json: () => GitHubAppReporterAwaitable<unknown>;
}
export interface GitHubAppReporterFetchOptions {
  method: 'POST';
  headers: { accept: string; authorization: string; 'content-type': string; 'x-github-api-version': string };
  body: string;
}
export type GitHubAppReporterFetch = (url: string, options: GitHubAppReporterFetchOptions) => GitHubAppReporterAwaitable<GitHubAppReporterResponse | null | undefined>;
export interface GitHubAppReporterOptions {
  app: unknown;
  result: unknown;
  fetchImpl?: GitHubAppReporterFetch;
  now?: unknown;
}
export interface GitHubAppReporterResult {
  readonly id: unknown;
  readonly name: 'architecture-gate / accept';
  readonly repository: 'flair-agency/architecture-gatekeeper';
  readonly headSha: unknown;
  readonly conclusion: unknown;
  readonly appId: unknown;
}
// Erased views mirror original property operations, including their failures.
// Rereads are not narrowed by earlier checks and may observe accessor changes.
type AppView = { appId: unknown; installationId: unknown; repositoryId: unknown; privateKeyPem: unknown };
type ResultView = { headSha: unknown; conclusion: unknown };
type TokenPayloadView = { token?: unknown; expires_at?: unknown; repositories?: unknown; permissions?: unknown } | null | undefined;
type PermissionView = { checks?: unknown; metadata?: unknown };
type CheckPayloadView = { id?: unknown; name?: unknown; head_sha?: unknown; status?: unknown; conclusion?: unknown; app?: { id?: unknown } | null } | null | undefined;

const API_BASE = 'https://api.github.com';
const API_VERSION = '2022-11-28';
const SELF_REPOSITORY = 'flair-agency/architecture-gatekeeper';
const CHECK_NAME = 'architecture-gate / accept';

function fail(message: string): never {
  throw new Error(message);
}

function isPositiveSafeInteger(value: unknown): boolean {
  return Number.isSafeInteger(value) && (value as number) > 0;
}

function isSha(value: unknown): boolean {
  return typeof value === 'string' && /^[a-f0-9]{40}$/i.test(value);
}

function makeAppJwt(appId: unknown, privateKeyPem: unknown, now: number) {
  if (typeof privateKeyPem !== 'string' || !privateKeyPem.includes('PRIVATE KEY')) {
    fail('GitHub App reporter configuration is invalid');
  }
  const issuedAt = Math.floor(now / 1000) - 60;
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const claims = Buffer.from(JSON.stringify({
    iat: issuedAt,
    exp: issuedAt + 540,
    iss: String(appId),
  })).toString('base64url');
  const unsigned = `${header}.${claims}`;
  try {
    const privateKey = createPrivateKey(privateKeyPem);
    if (privateKey.asymmetricKeyType !== 'rsa') {
      fail('GitHub App reporter configuration is invalid');
    }
    const signer = createSign('RSA-SHA256');
    signer.update(unsigned);
    signer.end();
    return `${unsigned}.${signer.sign(privateKey).toString('base64url')}`;
  } catch {
    fail('GitHub App reporter configuration is invalid');
  }
}

function headers(token: unknown) {
  return {
    accept: 'application/vnd.github+json',
    authorization: `Bearer ${token}`,
    'content-type': 'application/json',
    'x-github-api-version': API_VERSION,
  };
}

async function readJson(response: GitHubAppReporterResponse | null | undefined, message: string): Promise<unknown> {
  if (!response || !response.ok) fail(message);
  try {
    return await response.json();
  } catch {
    fail(message);
  }
}

/**
 * Publish a result already validated by a protected caller for the exact queue
 * SHA. This module is deliberately not an authority or candidate-validation
 * boundary; callers must keep it unreachable from candidate-controlled jobs.
 */
export async function publishSelfArchitectureCheck({
  app,
  result,
  fetchImpl = fetch,
  now = Date.now(),
}: GitHubAppReporterOptions): Promise<GitHubAppReporterResult> {
  if (
    !app
    || !isPositiveSafeInteger((app as AppView).appId)
    || !isPositiveSafeInteger((app as AppView).installationId)
    || !isPositiveSafeInteger((app as AppView).repositoryId)
    || typeof (app as AppView).privateKeyPem !== 'string'
    || !((app as AppView).privateKeyPem as string).includes('PRIVATE KEY')
  ) {
    fail('GitHub App reporter configuration is invalid');
  }
  if (
    !result
    || !isSha((result as ResultView).headSha)
    || !['success', 'failure'].includes((result as ResultView).conclusion as string)
  ) {
    fail('A protected result with an exact SHA and supported conclusion is required');
  }
  if (typeof fetchImpl !== 'function' || !Number.isFinite(now)) {
    fail('GitHub App reporter configuration is invalid');
  }

  const jwt = makeAppJwt((app as AppView).appId, (app as AppView).privateKeyPem, now as number);
  let tokenResponse;
  try {
    tokenResponse = await fetchImpl(
      `${API_BASE}/app/installations/${(app as AppView).installationId}/access_tokens`,
      {
        method: 'POST',
        headers: headers(jwt),
        body: JSON.stringify({
          repository_ids: [(app as AppView).repositoryId],
          permissions: { checks: 'write' },
        }),
      },
    );
  } catch {
    fail('GitHub App installation token request failed');
  }
  const tokenPayload = await readJson(tokenResponse, 'GitHub App installation token request failed') as TokenPayloadView;
  const expiresAt = typeof tokenPayload?.expires_at === 'string' ? Date.parse(tokenPayload.expires_at) : NaN;
  const repositories = tokenPayload?.repositories;
  const grantedPermissions = tokenPayload?.permissions;
  const grantedPermissionNames = grantedPermissions && typeof grantedPermissions === 'object'
    ? Object.keys(grantedPermissions).sort()
    : [];
  if (
    typeof tokenPayload?.token !== 'string'
    || tokenPayload.token.length === 0
    || grantedPermissionNames.length !== 2
    || grantedPermissionNames[0] !== 'checks'
    || grantedPermissionNames[1] !== 'metadata'
    || (grantedPermissions as PermissionView).checks !== 'write'
    || (grantedPermissions as PermissionView).metadata !== 'read'
    || !Array.isArray(repositories)
    || repositories.length !== 1
    || repositories[0]?.id !== (app as AppView).repositoryId
    || repositories[0]?.full_name !== SELF_REPOSITORY
    || !Number.isFinite(expiresAt)
    || expiresAt <= (now as number)
  ) {
    fail('GitHub App installation token grant is not limited to the required repository and permission');
  }

  let checkResponse;
  try {
    checkResponse = await fetchImpl(`${API_BASE}/repos/${SELF_REPOSITORY}/check-runs`, {
      method: 'POST',
      headers: headers(tokenPayload.token),
      body: JSON.stringify({
        name: CHECK_NAME,
        head_sha: (result as ResultView).headSha,
        status: 'completed',
        conclusion: (result as ResultView).conclusion,
        output: {
          title: (result as ResultView).conclusion === 'success' ? 'Protected validation passed' : 'Protected validation failed',
          summary: (result as ResultView).conclusion === 'success'
            ? 'Protected validation completed successfully.'
            : 'Protected validation did not complete successfully.',
        },
      }),
    });
  } catch {
    fail('GitHub App check publication failed');
  }
  const checkPayload = await readJson(checkResponse, 'GitHub App check publication failed') as CheckPayloadView;
  if (
    !isPositiveSafeInteger(checkPayload?.id)
    || checkPayload?.name !== CHECK_NAME
    || typeof checkPayload?.head_sha !== 'string'
    || checkPayload.head_sha.toLowerCase() !== ((result as ResultView).headSha as string).toLowerCase()
    || checkPayload?.status !== 'completed'
    || checkPayload?.conclusion !== (result as ResultView).conclusion
    || checkPayload?.app?.id !== (app as AppView).appId
  ) {
    fail('GitHub App check publication response did not match the requested result');
  }

  return {
    id: checkPayload.id,
    name: CHECK_NAME,
    repository: SELF_REPOSITORY,
    headSha: (result as ResultView).headSha,
    conclusion: (result as ResultView).conclusion,
    appId: (app as AppView).appId,
  };
}
