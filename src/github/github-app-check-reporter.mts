import { createPrivateKey, createSign } from 'node:crypto';


/** Types describe operations only; protected caller provenance is a precondition. */
export type GitHubAppReporterAwaitable<T> = T | PromiseLike<T>;
export interface GitHubAppReporterResponse {
  ok: unknown;
  json: () => GitHubAppReporterAwaitable<unknown>;
  status?: unknown;
  redirected?: unknown;
  url?: unknown;
  body?: { getReader: () => { read: () => GitHubAppReporterAwaitable<{ done?: unknown; value?: unknown }>; cancel: () => GitHubAppReporterAwaitable<unknown> } } | null;
}
export interface GitHubAppReporterFetchOptions {
  method: 'POST' | 'PATCH';
  headers: { accept: string; authorization: string; 'content-type': string; 'x-github-api-version': string };
  body: string;
  redirect?: 'error';
  signal?: AbortSignal;
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
export interface GitHubAppCheckHandle {
  readonly id: number;
  readonly name: 'architecture-gate / accept';
  readonly repository: 'flair-agency/architecture-gatekeeper';
  readonly headSha: string;
  readonly appId: number;
}
export interface GitHubAppCheckLifecycleOptions {
  app: unknown;
  headSha: unknown;
  fetchImpl?: GitHubAppReporterFetch;
  now?: unknown;
}
export interface GitHubAppCheckFinalizeOptions extends Omit<GitHubAppCheckLifecycleOptions, 'headSha'> {
  check: unknown;
  conclusion: 'success' | 'failure';
}
export interface SelfQueueCheckHandle {
  readonly id: number;
  readonly name: 'completeness';
  readonly repository: 'flair-agency/architecture-gatekeeper';
  readonly headSha: string;
  readonly appId: 15368;
}
export interface SelfQueueCheckLifecycleOptions {
  token: unknown;
  headSha: unknown;
  fetchImpl?: GitHubAppReporterFetch;
  now?: unknown;
}
export interface SelfQueueCheckFinalizeOptions extends Omit<SelfQueueCheckLifecycleOptions, 'headSha'> {
  check: unknown;
  conclusion: 'success' | 'failure';
}
// Erased views mirror original property operations, including their failures.
// Rereads are not narrowed by earlier checks and may observe accessor changes.
type AppView = { appId: unknown; installationId: unknown; repositoryId: unknown; privateKeyPem: unknown };
type ResultView = { headSha: unknown; conclusion: unknown };
type TokenPayloadView = { token?: unknown; expires_at?: unknown; repositories?: unknown; permissions?: unknown } | null | undefined;
type PermissionView = { checks?: unknown; metadata?: unknown };
type CheckPayloadView = { id?: unknown; name?: unknown; head_sha?: unknown; status?: unknown; conclusion?: unknown; app?: { id?: unknown } | null } | null | undefined;
type LifecycleCheckView = { id?: unknown; name?: unknown; repository?: unknown; headSha?: unknown; appId?: unknown } | null | undefined;

const API_BASE = 'https://api.github.com';
const API_VERSION = '2022-11-28';
const SELF_REPOSITORY = 'flair-agency/architecture-gatekeeper';
const CHECK_NAME = 'architecture-gate / accept';
const QUEUE_CHECK_NAME = 'completeness';
const ACTIONS_APP_ID = 15368;
const MAX_API_RESPONSE_BYTES = 65_536;
const API_REQUEST_TIMEOUT_MS = 10_000;

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

function positiveSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0;
}

function validateLifecycleApp(app: unknown, now: unknown): asserts app is AppView {
  if (!app || !positiveSafeInteger((app as AppView).appId) || !positiveSafeInteger((app as AppView).installationId) ||
      (app as AppView).repositoryId !== 1379218762 || typeof (app as AppView).privateKeyPem !== 'string' ||
      !((app as AppView).privateKeyPem as string).includes('PRIVATE KEY') || !Number.isFinite(now)) {
    fail('GitHub App reporter configuration is invalid');
  }
}

async function boundedJsonRequest(fetchImpl: GitHubAppReporterFetch, url: string,
  options: GitHubAppReporterFetchOptions, expectedStatus: number, message: string): Promise<unknown> {
  const controller = new AbortController();
  let rejectTimeout!: (error: Error) => void;
  const timeout = new Promise<never>((_, reject) => { rejectTimeout = reject; });
  const timer = setTimeout(() => { controller.abort(); rejectTimeout(new Error(message)); }, API_REQUEST_TIMEOUT_MS);
  const within = <T,>(value: GitHubAppReporterAwaitable<T>): Promise<T> => Promise.race([Promise.resolve(value), timeout]);
  let reader: ReturnType<NonNullable<GitHubAppReporterResponse['body']>['getReader']> | undefined;
  let complete = false;
  try {
    const response = await within(fetchImpl(url, { ...options, redirect: 'error', signal: controller.signal }));
    if (!response || response.status !== expectedStatus || response.redirected === true ||
        (typeof response.url === 'string' && response.url !== '' && response.url !== url) ||
        !response.body || typeof response.body.getReader !== 'function') fail(message);
    reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    for (;;) {
      const part = await within(reader.read());
      if (part.done === true) break;
      if (!(part.value instanceof Uint8Array) || part.value.byteLength === 0 || size + part.value.byteLength > MAX_API_RESPONSE_BYTES) fail(message);
      size += part.value.byteLength;
      chunks.push(part.value);
    }
    const payload = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks, size))) as unknown;
    complete = true;
    return payload;
  } catch {
    fail(message);
  } finally {
    clearTimeout(timer);
    if (reader && !complete) { try { void Promise.resolve(reader.cancel()).catch(() => {}); } catch { /* preserve failure */ } }
  }
}

function validateCheckPayload(payload: unknown, expected: {
  id?: number; name: string; headSha: string; appId: number; status: 'in_progress' | 'completed'; conclusion?: 'success' | 'failure';
}): number {
  const check = payload as CheckPayloadView;
  if (!positiveSafeInteger(check?.id) || (expected.id !== undefined && check.id !== expected.id) || check.name !== expected.name ||
      typeof check.head_sha !== 'string' || check.head_sha.toLowerCase() !== expected.headSha.toLowerCase() ||
      check.status !== expected.status || (expected.status === 'in_progress' && check.conclusion !== null && check.conclusion !== undefined) ||
      (expected.status === 'completed' && check.conclusion !== expected.conclusion) ||
      check.app?.id !== expected.appId) fail('GitHub check response did not match the requested lifecycle update');
  return check.id;
}

async function createAppInstallationToken(app: AppView, fetchImpl: GitHubAppReporterFetch, now: number): Promise<string> {
  const jwt = makeAppJwt(app.appId, app.privateKeyPem, now);
  const tokenPayload = await boundedJsonRequest(fetchImpl, `${API_BASE}/app/installations/${app.installationId}/access_tokens`, {
    method: 'POST', headers: headers(jwt), body: JSON.stringify({ repository_ids: [app.repositoryId], permissions: { checks: 'write' } }),
  }, 201, 'GitHub App installation token request failed') as TokenPayloadView;
  const expiresAt = typeof tokenPayload?.expires_at === 'string' ? Date.parse(tokenPayload.expires_at) : NaN;
  const repositories = tokenPayload?.repositories;
  const grantedPermissions = tokenPayload?.permissions;
  const permissionNames = grantedPermissions && typeof grantedPermissions === 'object' ? Object.keys(grantedPermissions).sort() : [];
  if (typeof tokenPayload?.token !== 'string' || tokenPayload.token.length === 0 ||
      permissionNames.length !== 2 || permissionNames[0] !== 'checks' || permissionNames[1] !== 'metadata' ||
      (grantedPermissions as PermissionView).checks !== 'write' || (grantedPermissions as PermissionView).metadata !== 'read' ||
      !Array.isArray(repositories) || repositories.length !== 1 || repositories[0]?.id !== app.repositoryId ||
      repositories[0]?.full_name !== SELF_REPOSITORY || !Number.isFinite(expiresAt) || expiresAt <= now) {
    fail('GitHub App installation token grant is not limited to the required repository and permission');
  }
  return tokenPayload.token;
}

function startPayload(name: string, headSha: string) {
  return { name, head_sha: headSha, status: 'in_progress', output: { title: 'Protected validation in progress', summary: 'Protected validation is running.' } };
}

/** Start the exact self acceptance check before protected validation begins. */
export async function beginSelfArchitectureCheck({ app, headSha, fetchImpl = fetch, now = Date.now() }: GitHubAppCheckLifecycleOptions): Promise<GitHubAppCheckHandle> {
  validateLifecycleApp(app, now);
  if (typeof fetchImpl !== 'function' || !isSha(headSha)) fail('A protected result with an exact SHA is required');
  const sha = (headSha as string).toLowerCase();
  const token = await createAppInstallationToken(app, fetchImpl, now as number);
  const payload = await boundedJsonRequest(fetchImpl, `${API_BASE}/repos/${SELF_REPOSITORY}/check-runs`, {
    method: 'POST', headers: headers(token), body: JSON.stringify(startPayload(CHECK_NAME, sha)),
  }, 201, 'GitHub App check creation failed');
  const id = validateCheckPayload(payload, { name: CHECK_NAME, headSha: sha, appId: app.appId as number, status: 'in_progress' });
  return Object.freeze({ id, name: CHECK_NAME, repository: SELF_REPOSITORY, headSha: sha, appId: app.appId as number });
}

/** Finalize only the exact check returned by beginSelfArchitectureCheck. */
export async function finalizeSelfArchitectureCheck({ app, check, conclusion, fetchImpl = fetch, now = Date.now() }: GitHubAppCheckFinalizeOptions): Promise<GitHubAppReporterResult> {
  validateLifecycleApp(app, now);
  if (typeof fetchImpl !== 'function' || !['success', 'failure'].includes(conclusion)) fail('GitHub App reporter configuration is invalid');
  const handle = check as LifecycleCheckView;
  if (!handle || !positiveSafeInteger(handle.id) || handle.name !== CHECK_NAME || handle.repository !== SELF_REPOSITORY ||
      !isSha(handle.headSha) || handle.appId !== app.appId) fail('The exact in-progress protected App check is required');
  const sha = (handle.headSha as string).toLowerCase();
  const token = await createAppInstallationToken(app, fetchImpl, now as number);
  const payload = await boundedJsonRequest(fetchImpl, `${API_BASE}/repos/${SELF_REPOSITORY}/check-runs/${handle.id}`, {
    method: 'PATCH', headers: headers(token), body: JSON.stringify({ status: 'completed', conclusion, output: {
      title: conclusion === 'success' ? 'Protected validation passed' : 'Protected validation failed',
      summary: conclusion === 'success' ? 'Protected validation completed successfully.' : 'Protected validation did not complete successfully.',
    } }),
  }, 200, 'GitHub App check finalization failed');
  const id = validateCheckPayload(payload, { id: handle.id, name: CHECK_NAME, headSha: sha, appId: app.appId as number, status: 'completed', conclusion });
  return Object.freeze({ id, name: CHECK_NAME, repository: SELF_REPOSITORY, headSha: sha, conclusion, appId: app.appId });
}

function validateQueueToken(token: unknown): asserts token is string {
  if (typeof token !== 'string' || token.length < 1 || token.length > 16_384 || /[\u0000\r\n]/.test(token)) fail('GitHub Actions checks token is invalid');
}

/**
 * Start the Actions-owned Queue completeness check on the exact selected Q SHA.
 * The protected caller must establish the queue context and keep this token out
 * of candidate-controlled code; this reporter verifies the returned check only.
 */
export async function beginSelfQueueCompletenessCheck({ token, headSha, fetchImpl = fetch }: SelfQueueCheckLifecycleOptions): Promise<SelfQueueCheckHandle> {
  validateQueueToken(token);
  if (typeof fetchImpl !== 'function' || !isSha(headSha)) fail('GitHub Actions reporter configuration is invalid');
  const sha = (headSha as string).toLowerCase();
  const payload = await boundedJsonRequest(fetchImpl, `${API_BASE}/repos/${SELF_REPOSITORY}/check-runs`, {
    method: 'POST', headers: headers(token), body: JSON.stringify(startPayload(QUEUE_CHECK_NAME, sha)),
  }, 201, 'GitHub Actions completeness check creation failed');
  const id = validateCheckPayload(payload, { name: QUEUE_CHECK_NAME, headSha: sha, appId: ACTIONS_APP_ID, status: 'in_progress' });
  return Object.freeze({ id, name: QUEUE_CHECK_NAME, repository: SELF_REPOSITORY, headSha: sha, appId: ACTIONS_APP_ID });
}

/** Finalize only the exact Actions completeness check returned by its begin operation. */
export async function finalizeSelfQueueCompletenessCheck({ token, check, conclusion, fetchImpl = fetch }: SelfQueueCheckFinalizeOptions): Promise<SelfQueueCheckHandle> {
  validateQueueToken(token);
  if (typeof fetchImpl !== 'function' || !['success', 'failure'].includes(conclusion)) fail('GitHub Actions reporter configuration is invalid');
  const handle = check as LifecycleCheckView;
  if (!handle || !positiveSafeInteger(handle.id) || handle.name !== QUEUE_CHECK_NAME || handle.repository !== SELF_REPOSITORY ||
      !isSha(handle.headSha) || handle.appId !== ACTIONS_APP_ID) fail('The exact in-progress Actions completeness check is required');
  const sha = (handle.headSha as string).toLowerCase();
  const payload = await boundedJsonRequest(fetchImpl, `${API_BASE}/repos/${SELF_REPOSITORY}/check-runs/${handle.id}`, {
    method: 'PATCH', headers: headers(token), body: JSON.stringify({ status: 'completed', conclusion, output: {
      title: conclusion === 'success' ? 'PR description complete' : 'PR description incomplete',
      summary: conclusion === 'success' ? 'Required PR description sections are populated.' : 'PR description completeness validation did not succeed.',
    } }),
  }, 200, 'GitHub Actions completeness check finalization failed');
  validateCheckPayload(payload, { id: handle.id, name: QUEUE_CHECK_NAME, headSha: sha, appId: ACTIONS_APP_ID, status: 'completed', conclusion });
  return Object.freeze({ id: handle.id, name: QUEUE_CHECK_NAME, repository: SELF_REPOSITORY, headSha: sha, appId: ACTIONS_APP_ID });
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
