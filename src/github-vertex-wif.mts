/** Parent-only GitHub OIDC -> Google STS -> service-account token issuer.
 * This is an inactive internal mechanism: callers must supply already trusted,
 * launcher-selected bindings. It does not authenticate that caller or enable a route.
 */
import { types } from 'node:util';

const INPUT_KEYS = new Set(['workloadIdentityProvider', 'serviceAccount', 'project', 'region', 'oidcRequestUrl', 'oidcRequestToken']);
const STS_URL = 'https://sts.googleapis.com/v1/token';
const IAM_BASE = 'https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/';
const CLOUD_PLATFORM = 'https://www.googleapis.com/auth/cloud-platform';
const ACCESS_TOKEN_TYPE = 'urn:ietf:params:oauth:token-type:access_token';
const JWT_TYPE = 'urn:ietf:params:oauth:token-type:jwt';
const MAX_RESPONSE_BYTES = 65_536;
const TOTAL_TIMEOUT_MS = 60_000;

export type WifFetch = (input: string | URL, init: RequestInit) => Response | Promise<Response>;

interface ValidatedBindings {
  provider: string;
  account: string;
  project: string;
  region: string;
  requestUrl: URL;
  requestToken: string;
}

type Wait = <T>(promise: T | PromiseLike<T>) => Promise<T>;

function fail(stage: string): never { throw new Error(`GitHub Vertex WIF failed at ${stage}.`); }

function record(value: unknown, keys: Set<string>): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value) || types.isProxy(value)) return null;
  try {
    const proto = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null) return null;
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const ownKeys = Reflect.ownKeys(descriptors);
    if (ownKeys.length !== keys.size || ownKeys.some(key => typeof key !== 'string' || !keys.has(key) ||
      !Object.hasOwn(descriptors[key], 'value') || !descriptors[key].enumerable)) return null;
    return Object.fromEntries(ownKeys.map(key => [key as string, descriptors[key as string].value]));
  } catch { return null; }
}

function validBindings(input: unknown): ValidatedBindings {
  const config = record(input, INPUT_KEYS);
  if (!config || Object.keys(config).length !== INPUT_KEYS.size) fail('input');
  const provider = config.workloadIdentityProvider;
  const account = config.serviceAccount;
  const project = config.project;
  const region = config.region;
  const token = config.oidcRequestToken;
  if (typeof provider !== 'string' || !/^projects\/[1-9][0-9]{4,19}\/locations\/global\/workloadIdentityPools\/[a-z][a-z0-9-]{2,31}\/providers\/[a-z][a-z0-9-]{2,31}$/.test(provider) ||
      typeof account !== 'string' || !/^[a-z][a-z0-9-]{4,28}[a-z0-9]@[a-z][a-z0-9-]{4,28}[a-z0-9]\.iam\.gserviceaccount\.com$/.test(account) ||
      typeof project !== 'string' || !/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(project) ||
      typeof region !== 'string' || !(region === 'global' || region === 'us' || region === 'eu' || /^[a-z]+-[a-z0-9]+[0-9]$/.test(region)) ||
      typeof token !== 'string' || token.length < 1 || token.length > 8192 || /[\u0000-\u0020\u007f]/.test(token)) fail('input');
  const oidcRequestUrl = config.oidcRequestUrl;
  if (typeof oidcRequestUrl !== 'string' || oidcRequestUrl.length > 2048) fail('input');
  let requestUrl: URL;
  try { requestUrl = new URL(oidcRequestUrl); } catch { fail('input'); }
  const githubOidcHost = requestUrl.hostname === 'actions.githubusercontent.com' ||
    requestUrl.hostname.endsWith('.actions.githubusercontent.com');
  if (requestUrl.protocol !== 'https:' || requestUrl.username || requestUrl.password || requestUrl.hash ||
      !githubOidcHost || requestUrl.port || requestUrl.pathname.length < 2 || requestUrl.href.length > 2048) fail('input');
  return { provider, account, project, region, requestUrl, requestToken: token };
}

async function readBoundedJson(response: Response | null | undefined, controller: AbortController, stage: string, wait: Wait): Promise<unknown> {
  const candidate = response;
  if (!candidate || candidate.status < 200 || candidate.status >= 300 || candidate.redirected ||
      (candidate.type && candidate.type === 'opaqueredirect') || !candidate.body || typeof candidate.body.getReader !== 'function') fail(stage);
  const reader = candidate.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await wait(reader.read());
      if (done) break;
      if (!(value instanceof Uint8Array)) fail(stage);
      total += value.byteLength;
      if (total > MAX_RESPONSE_BYTES) {
        controller.abort();
        try { void Promise.resolve(reader.cancel()).catch(() => {}); } catch { /* sanitized bound failure */ }
        fail(stage);
      }
      chunks.push(value);
    }
  } catch {
    controller.abort();
    try { void Promise.resolve(reader.cancel()).catch(() => {}); } catch { /* sanitized cancellation failure */ }
    fail(stage);
  }
  try {
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch { fail(stage); }
}

function bearer(value: string): string { return `Bearer ${value}`; }

/** Exchange GitHub Actions OIDC for a short-lived cloud-platform SA token. */
export async function acquireGitHubVertexWifCredential(input: unknown, fetchImpl: WifFetch = globalThis.fetch): Promise<Readonly<{ token: string; project: string; region: string }>> {
  const { provider, account, project, region, requestUrl, requestToken } = validBindings(input);
  if (typeof fetchImpl !== 'function') fail('input');
  const controller = new AbortController();
  let timedOut = false;
  let rejectTimeout!: (reason: Error) => void;
  const timeout = new Promise<never>((_, reject) => { rejectTimeout = reject; });
  const timer = setTimeout(() => { timedOut = true; controller.abort(); rejectTimeout(new Error('timeout')); }, TOTAL_TIMEOUT_MS);
  const wait = <T,>(promise: T | PromiseLike<T>): Promise<T> => Promise.race([promise, timeout]);
  const request = async (stage: string, url: string, init: RequestInit): Promise<unknown> => {
    try {
      const response = await wait(fetchImpl(url, { ...init, redirect: 'manual', signal: controller.signal }));
      if (timedOut) fail('timeout');
      return await readBoundedJson(response, controller, stage, wait);
    } catch {
      if (timedOut) fail('timeout');
      fail(stage);
    }
  };
  try {
    const oidcUrl = new URL(requestUrl.href);
    oidcUrl.searchParams.set('audience', `https://iam.googleapis.com/${provider}`);
    const assertionResponse = await request('oidc_request', oidcUrl.href, {
      method: 'GET', headers: { authorization: bearer(requestToken), accept: 'application/json' },
    });
    if (!assertionResponse || typeof assertionResponse !== 'object' || Array.isArray(assertionResponse) ||
        typeof (assertionResponse as Record<string, unknown>).value !== 'string' ||
        ((assertionResponse as Record<string, unknown>).value as string).length < 1 ||
        ((assertionResponse as Record<string, unknown>).value as string).length > 16_384 ||
        /[\u0000-\u0020\u007f]/.test((assertionResponse as Record<string, unknown>).value as string)) fail('oidc_response');
    const assertion = (assertionResponse as { value: string }).value;

    const sts = await request('sts_exchange', STS_URL, {
      method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ grantType: 'urn:ietf:params:oauth:grant-type:token-exchange', audience: `//iam.googleapis.com/${provider}`,
        scope: CLOUD_PLATFORM, requestedTokenType: ACCESS_TOKEN_TYPE, subjectTokenType: JWT_TYPE,
        subjectToken: assertion }),
    });
    // These views describe JSON properties; the checks below validate each used value.
    const stsRecord = sts as Record<string, unknown> | null;
    if (!stsRecord || typeof stsRecord !== 'object' || Array.isArray(stsRecord) || typeof stsRecord.access_token !== 'string' ||
        stsRecord.access_token.length < 1 || stsRecord.access_token.length > 16_384 || /[\u0000-\u0020\u007f]/.test(stsRecord.access_token) ||
        stsRecord.issued_token_type !== ACCESS_TOKEN_TYPE || stsRecord.token_type !== 'Bearer' ||
        !Number.isSafeInteger(stsRecord.expires_in) || (stsRecord.expires_in as number) < 120 || (stsRecord.expires_in as number) > 3600) fail('sts_response');
    const stsAccessToken = stsRecord.access_token as string;

    const iam = await request('service_account_token', `${IAM_BASE}${encodeURIComponent(account)}:generateAccessToken`, {
      method: 'POST', headers: { authorization: bearer(stsAccessToken), 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ scope: [CLOUD_PLATFORM], lifetime: '300s' }),
    });
    const iamRecord = iam as Record<string, unknown> | null;
    if (!iamRecord || typeof iamRecord !== 'object' || Array.isArray(iamRecord) || typeof iamRecord.accessToken !== 'string' ||
        iamRecord.accessToken.length < 1 || iamRecord.accessToken.length > 16_384 || /[\u0000-\u0020\u007f]/.test(iamRecord.accessToken) ||
        typeof iamRecord.expireTime !== 'string' || !Number.isFinite(Date.parse(iamRecord.expireTime))) fail('service_account_response');
    const tokenExpiry = Date.parse(iamRecord.expireTime as string);
    const now = Date.now();
    if (tokenExpiry < now + 240_000 || tokenExpiry > now + 360_000) fail('service_account_response');
    return Object.freeze({ token: iamRecord.accessToken, project, region });
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}
