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

function fail(stage) { throw new Error(`GitHub Vertex WIF failed at ${stage}.`); }

function record(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || types.isProxy(value)) return null;
  try {
    const proto = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null) return null;
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const ownKeys = Reflect.ownKeys(descriptors);
    if (ownKeys.length !== keys.size || ownKeys.some(key => typeof key !== 'string' || !keys.has(key) ||
      !Object.hasOwn(descriptors[key], 'value') || !descriptors[key].enumerable)) return null;
    return Object.fromEntries(ownKeys.map(key => [key, descriptors[key].value]));
  } catch { return null; }
}

function validBindings(input) {
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
      typeof region !== 'string' || !(region === 'global' || /^[a-z]+-[a-z0-9]+[0-9]$/.test(region)) ||
      typeof token !== 'string' || token.length < 1 || token.length > 8192 || /[\u0000-\u0020\u007f]/.test(token)) fail('input');
  if (typeof config.oidcRequestUrl !== 'string' || config.oidcRequestUrl.length > 2048) fail('input');
  let requestUrl;
  try { requestUrl = new URL(config.oidcRequestUrl); } catch { fail('input'); }
  const githubOidcHost = requestUrl.hostname === 'actions.githubusercontent.com' ||
    requestUrl.hostname.endsWith('.actions.githubusercontent.com');
  if (requestUrl.protocol !== 'https:' || requestUrl.username || requestUrl.password || requestUrl.hash ||
      !githubOidcHost || requestUrl.port || requestUrl.pathname.length < 2 || requestUrl.href.length > 2048) fail('input');
  return { provider, account, project, region, requestUrl, requestToken: token };
}

async function readBoundedJson(response, controller, stage, wait) {
  if (!response || response.status < 200 || response.status >= 300 || response.redirected ||
      (response.type && response.type === 'opaqueredirect') || !response.body || typeof response.body.getReader !== 'function') fail(stage);
  const reader = response.body.getReader();
  const chunks = [];
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

function bearer(value) { return `Bearer ${value}`; }

/** Exchange GitHub Actions OIDC for a short-lived cloud-platform SA token. */
export async function acquireGitHubVertexWifCredential(input, fetchImpl = globalThis.fetch) {
  const { provider, account, project, region, requestUrl, requestToken } = validBindings(input);
  if (typeof fetchImpl !== 'function') fail('input');
  const controller = new AbortController();
  let timedOut = false;
  let rejectTimeout;
  const timeout = new Promise((_, reject) => { rejectTimeout = reject; });
  const timer = setTimeout(() => { timedOut = true; controller.abort(); rejectTimeout(new Error('timeout')); }, TOTAL_TIMEOUT_MS);
  const wait = promise => Promise.race([promise, timeout]);
  const request = async (stage, url, init) => {
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
        typeof assertionResponse.value !== 'string' || assertionResponse.value.length < 1 || assertionResponse.value.length > 16_384 ||
        /[\u0000-\u0020\u007f]/.test(assertionResponse.value)) fail('oidc_response');

    const sts = await request('sts_exchange', STS_URL, {
      method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ grantType: 'urn:ietf:params:oauth:grant-type:token-exchange', audience: `//iam.googleapis.com/${provider}`,
        scope: CLOUD_PLATFORM, requestedTokenType: ACCESS_TOKEN_TYPE, subjectTokenType: JWT_TYPE,
        subjectToken: assertionResponse.value }),
    });
    if (!sts || typeof sts !== 'object' || Array.isArray(sts) || typeof sts.access_token !== 'string' ||
        sts.access_token.length < 1 || sts.access_token.length > 16_384 || /[\u0000-\u0020\u007f]/.test(sts.access_token) ||
        sts.issued_token_type !== ACCESS_TOKEN_TYPE || sts.token_type !== 'Bearer' ||
        !Number.isSafeInteger(sts.expires_in) || sts.expires_in < 120 || sts.expires_in > 3600) fail('sts_response');

    const iam = await request('service_account_token', `${IAM_BASE}${encodeURIComponent(account)}:generateAccessToken`, {
      method: 'POST', headers: { authorization: bearer(sts.access_token), 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ scope: [CLOUD_PLATFORM], lifetime: '300s' }),
    });
    if (!iam || typeof iam !== 'object' || Array.isArray(iam) || typeof iam.accessToken !== 'string' ||
        iam.accessToken.length < 1 || iam.accessToken.length > 16_384 || /[\u0000-\u0020\u007f]/.test(iam.accessToken) ||
        typeof iam.expireTime !== 'string' || !Number.isFinite(Date.parse(iam.expireTime))) fail('service_account_response');
    const tokenExpiry = Date.parse(iam.expireTime);
    const now = Date.now();
    if (tokenExpiry < now + 240_000 || tokenExpiry > now + 360_000) fail('service_account_response');
    return Object.freeze({ token: iam.accessToken, project, region });
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}
