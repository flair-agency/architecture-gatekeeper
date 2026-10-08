import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, verify } from 'node:crypto';
import { publishSelfArchitectureCheck } from '../dist/github-app-check-reporter.mjs';

const now = Date.parse('2026-09-30T00:00:00.000Z');
const headSha = 'a'.repeat(40);
const appId = 1234;
const installationId = 5678;
const repositoryId = 9012;
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const app = {
  appId,
  installationId,
  repositoryId,
  privateKeyPem: privateKey.export({ type: 'pkcs8', format: 'pem' }),
};

function response(body, ok = true) {
  return { ok, json: async () => body };
}

function grantedToken(overrides = {}) {
  return {
    token: 'synthetic-installation-token',
    expires_at: new Date(now + 60 * 60 * 1000).toISOString(),
    permissions: { checks: 'write', metadata: 'read' },
    repositories: [{ id: repositoryId, full_name: 'flair-agency/architecture-gatekeeper' }],
    ...overrides,
  };
}

function checkRun(overrides = {}) {
  return {
    id: 2468,
    name: 'architecture-gate / accept',
    head_sha: headSha,
    status: 'completed',
    conclusion: 'success',
    app: { id: appId },
    ...overrides,
  };
}

function queuedFetch({ token = grantedToken(), run = checkRun(), tokenOk = true, runOk = true } = {}) {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    return calls.length === 1 ? response(token, tokenOk) : response(run, runOk);
  };
  return { calls, fetchImpl };
}

test('publishes the protected result at its exact SHA using a self-only checks grant', async () => {
  const { calls, fetchImpl } = queuedFetch();
  const published = await publishSelfArchitectureCheck({
    app,
    result: { headSha, conclusion: 'success' },
    fetchImpl,
    now,
  });

  assert.deepEqual(published, {
    id: 2468,
    name: 'architecture-gate / accept',
    repository: 'flair-agency/architecture-gatekeeper',
    headSha,
    conclusion: 'success',
    appId,
  });
  assert.equal(calls.length, 2);
  assert.equal(calls[0].url, `https://api.github.com/app/installations/${installationId}/access_tokens`);
  assert.equal(calls[0].options.method, 'POST');
  const jwt = calls[0].options.headers.authorization.slice('Bearer '.length);
  const [headerPart, claimsPart, signaturePart] = jwt.split('.');
  const header = JSON.parse(Buffer.from(headerPart, 'base64url').toString());
  const claims = JSON.parse(Buffer.from(claimsPart, 'base64url').toString());
  assert.deepEqual(header, { alg: 'RS256', typ: 'JWT' });
  assert.equal(claims.iss, String(appId));
  assert.ok(claims.iat <= Math.floor(now / 1000));
  assert.ok(claims.exp - claims.iat <= 600);
  assert.ok(verify('RSA-SHA256', Buffer.from(`${headerPart}.${claimsPart}`), publicKey, Buffer.from(signaturePart, 'base64url')));

  assert.deepEqual(JSON.parse(calls[0].options.body), {
    repository_ids: [repositoryId],
    permissions: { checks: 'write' },
  });
  assert.equal(calls[1].url, 'https://api.github.com/repos/flair-agency/architecture-gatekeeper/check-runs');
  assert.equal(calls[1].options.headers.authorization, 'Bearer synthetic-installation-token');
  assert.deepEqual(JSON.parse(calls[1].options.body), {
    name: 'architecture-gate / accept',
    head_sha: headSha,
    status: 'completed',
    conclusion: 'success',
    output: {
      title: 'Protected validation passed',
      summary: 'Protected validation completed successfully.',
    },
  });
  assert.equal(calls[1].options.headers['x-github-api-version'], '2022-11-28');
});

test('publishes a protected failure as failure and does not expose supplied detail text', async () => {
  const { calls, fetchImpl } = queuedFetch({ run: checkRun({ conclusion: 'failure' }) });
  const published = await publishSelfArchitectureCheck({
    app,
    result: { headSha, conclusion: 'failure', detail: 'secret diagnostic detail' },
    fetchImpl,
    now,
  });

  assert.equal(published.conclusion, 'failure');
  const output = JSON.parse(calls[1].options.body).output;
  assert.equal(output.title, 'Protected validation failed');
  assert.equal(output.summary, 'Protected validation did not complete successfully.');
  assert.equal(JSON.stringify(published).includes('secret diagnostic detail'), false);
});

test('rejects missing, malformed-SHA, or unsupported results before network access', async (t) => {
  for (const result of [
    null,
    { headSha: 'not-a-sha', conclusion: 'success' },
    { headSha, conclusion: 'neutral' },
  ]) {
    await t.test(JSON.stringify(result), async () => {
      let called = false;
      await assert.rejects(
        publishSelfArchitectureCheck({ app, result, fetchImpl: async () => { called = true; }, now }),
        /protected result with an exact SHA/,
      );
      assert.equal(called, false);
    });
  }
});

test('rejects an EC App key before making any network request', async () => {
  const { privateKey: ecPrivateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  let called = false;
  await assert.rejects(
    publishSelfArchitectureCheck({
      app: { ...app, privateKeyPem: ecPrivateKey.export({ type: 'pkcs8', format: 'pem' }) },
      result: { headSha, conclusion: 'success' },
      fetchImpl: async () => { called = true; },
      now,
    }),
    (error) => error.message === 'GitHub App reporter configuration is invalid',
  );
  assert.equal(called, false);
});

test('rejects token grants broader than the requested self-repository checks permission', async (t) => {
  const cases = [
    ['extra permission', grantedToken({ permissions: { checks: 'write', metadata: 'read', contents: 'read' } })],
    ['missing implicit metadata permission', grantedToken({ permissions: { checks: 'write' } })],
    ['wrong repository', grantedToken({ repositories: [{ id: repositoryId + 1, full_name: 'elsewhere/repo' }] })],
    ['multiple repositories', grantedToken({ repositories: [
      { id: repositoryId, full_name: 'flair-agency/architecture-gatekeeper' },
      { id: repositoryId + 1, full_name: 'elsewhere/repo' },
    ] })],
  ];

  for (const [label, token] of cases) {
    await t.test(label, async () => {
      const { calls, fetchImpl } = queuedFetch({ token });
      await assert.rejects(
        publishSelfArchitectureCheck({ app, result: { headSha, conclusion: 'success' }, fetchImpl, now }),
        /not limited to the required repository and permission/,
      );
      assert.equal(calls.length, 1);
    });
  }
});

test('rejects check responses that do not attest the requested check, SHA, conclusion, and App', async (t) => {
  const cases = [
    ['wrong check name', checkRun({ name: 'different check' })],
    ['wrong SHA', checkRun({ head_sha: 'b'.repeat(40) })],
    ['numeric SHA', checkRun({ head_sha: 42 })],
    ['object SHA', checkRun({ head_sha: { value: headSha } })],
    ['wrong conclusion', checkRun({ conclusion: 'failure' })],
    ['wrong App', checkRun({ app: { id: appId + 1 } })],
  ];

  for (const [label, run] of cases) {
    await t.test(label, async () => {
      const { fetchImpl } = queuedFetch({ run });
      await assert.rejects(
        publishSelfArchitectureCheck({ app, result: { headSha, conclusion: 'success' }, fetchImpl, now }),
        /response did not match the requested result/,
      );
    });
  }
});

test('fails with sanitized errors when token or check APIs fail', async (t) => {
  await t.test('token endpoint error body is not surfaced', async () => {
    const { fetchImpl } = queuedFetch({ token: { message: 'secret token body' }, tokenOk: false });
    await assert.rejects(
      publishSelfArchitectureCheck({ app, result: { headSha, conclusion: 'success' }, fetchImpl, now }),
      (error) => error.message === 'GitHub App installation token request failed'
        && !error.message.includes('secret token body'),
    );
  });

  await t.test('check endpoint error body is not surfaced', async () => {
    const { fetchImpl } = queuedFetch({ run: { message: 'secret check body' }, runOk: false });
    await assert.rejects(
      publishSelfArchitectureCheck({ app, result: { headSha, conclusion: 'success' }, fetchImpl, now }),
      (error) => error.message === 'GitHub App check publication failed'
        && !error.message.includes('secret check body'),
    );
  });
});
