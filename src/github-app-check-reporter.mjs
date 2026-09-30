import { createSign } from 'node:crypto';

const API_BASE = 'https://api.github.com';
const API_VERSION = '2022-11-28';
const SELF_REPOSITORY = 'flair-agency/architecture-gatekeeper';
const CHECK_NAME = 'architecture-gate / accept';

function fail(message) {
  throw new Error(message);
}

function isPositiveSafeInteger(value) {
  return Number.isSafeInteger(value) && value > 0;
}

function isSha(value) {
  return typeof value === 'string' && /^[a-f0-9]{40}$/i.test(value);
}

function makeAppJwt(appId, privateKeyPem, now) {
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
    const signer = createSign('RSA-SHA256');
    signer.update(unsigned);
    signer.end();
    return `${unsigned}.${signer.sign(privateKeyPem).toString('base64url')}`;
  } catch {
    fail('GitHub App reporter configuration is invalid');
  }
}

function headers(token) {
  return {
    accept: 'application/vnd.github+json',
    authorization: `Bearer ${token}`,
    'content-type': 'application/json',
    'x-github-api-version': API_VERSION,
  };
}

async function readJson(response, message) {
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
}) {
  if (
    !app
    || !isPositiveSafeInteger(app.appId)
    || !isPositiveSafeInteger(app.installationId)
    || !isPositiveSafeInteger(app.repositoryId)
    || typeof app.privateKeyPem !== 'string'
    || !app.privateKeyPem.includes('PRIVATE KEY')
  ) {
    fail('GitHub App reporter configuration is invalid');
  }
  if (
    !result
    || !isSha(result.headSha)
    || !['success', 'failure'].includes(result.conclusion)
  ) {
    fail('A protected result with an exact SHA and supported conclusion is required');
  }
  if (typeof fetchImpl !== 'function' || !Number.isFinite(now)) {
    fail('GitHub App reporter configuration is invalid');
  }

  const jwt = makeAppJwt(app.appId, app.privateKeyPem, now);
  let tokenResponse;
  try {
    tokenResponse = await fetchImpl(
      `${API_BASE}/app/installations/${app.installationId}/access_tokens`,
      {
        method: 'POST',
        headers: headers(jwt),
        body: JSON.stringify({
          repository_ids: [app.repositoryId],
          permissions: { checks: 'write' },
        }),
      },
    );
  } catch {
    fail('GitHub App installation token request failed');
  }
  const tokenPayload = await readJson(tokenResponse, 'GitHub App installation token request failed');
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
    || grantedPermissions.checks !== 'write'
    || grantedPermissions.metadata !== 'read'
    || !Array.isArray(repositories)
    || repositories.length !== 1
    || repositories[0]?.id !== app.repositoryId
    || repositories[0]?.full_name !== SELF_REPOSITORY
    || !Number.isFinite(expiresAt)
    || expiresAt <= now
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
        head_sha: result.headSha,
        status: 'completed',
        conclusion: result.conclusion,
        output: {
          title: result.conclusion === 'success' ? 'Protected validation passed' : 'Protected validation failed',
          summary: result.conclusion === 'success'
            ? 'Protected validation completed successfully.'
            : 'Protected validation did not complete successfully.',
        },
      }),
    });
  } catch {
    fail('GitHub App check publication failed');
  }
  const checkPayload = await readJson(checkResponse, 'GitHub App check publication failed');
  if (
    !isPositiveSafeInteger(checkPayload?.id)
    || checkPayload?.name !== CHECK_NAME
    || checkPayload?.head_sha?.toLowerCase() !== result.headSha.toLowerCase()
    || checkPayload?.status !== 'completed'
    || checkPayload?.conclusion !== result.conclusion
    || checkPayload?.app?.id !== app.appId
  ) {
    fail('GitHub App check publication response did not match the requested result');
  }

  return {
    id: checkPayload.id,
    name: CHECK_NAME,
    repository: SELF_REPOSITORY,
    headSha: result.headSha,
    conclusion: result.conclusion,
    appId: app.appId,
  };
}
