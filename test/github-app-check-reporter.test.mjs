import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, verify } from 'node:crypto';
import {
  beginSelfArchitectureCheck,
  beginSelfQueueCompletenessCheck,
  finalizeSelfArchitectureCheck,
  finalizeSelfQueueCompletenessCheck,
  publishSelfArchitectureCheck,
} from '../dist/github-app-check-reporter.mjs';

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
    name: 'architecture-gate / protected-accept',
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
    name: 'architecture-gate / protected-accept',
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
    name: 'architecture-gate / protected-accept',
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

test('published metadata retains a later unchecked ID accessor observation', async () => {
  let reads = 0;
  const laterId = { observed: 'changed ID' };
  const run = checkRun();
  Object.defineProperty(run, 'id', { get: () => ++reads === 1 ? 2468 : laterId });
  const { fetchImpl } = queuedFetch({ run });
  const published = await publishSelfArchitectureCheck({ app, result: { headSha, conclusion: 'success' }, fetchImpl, now });
  assert.equal(published.id, laterId);
  assert.equal(reads, 2);
});

function nativeResponse(body, status) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

const selfApp = { ...app, repositoryId: 1379218762 };
const selfToken = {
  token: 'synthetic-lifecycle-token', expires_at: new Date(now + 60 * 60 * 1000).toISOString(),
  permissions: { checks: 'write', metadata: 'read' },
  repositories: [{ id: 1379218762, full_name: 'flair-agency/architecture-gatekeeper' }],
};
const lifecycleCheck = ({ id = 777, name = 'architecture-gate / protected-accept', sha = headSha, status = 'in_progress', conclusion = null, appValue = appId } = {}) => ({
  id, name, head_sha: sha, status, conclusion, app: { id: appValue },
});

test('App lifecycle creates in_progress before validation and finalizes the same exact check', async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    if (calls.length === 1) return nativeResponse(selfToken, 201);
    if (calls.length === 2) return nativeResponse(lifecycleCheck(), 201);
    if (calls.length === 3) return nativeResponse(selfToken, 201);
    return nativeResponse(lifecycleCheck({ status: 'completed', conclusion: 'success' }), 200);
  };
  const started = await beginSelfArchitectureCheck({ app: selfApp, headSha, fetchImpl, now });
  assert.deepEqual(started, { id: 777, name: 'architecture-gate / protected-accept', repository: 'flair-agency/architecture-gatekeeper', headSha, appId });
  assert.equal(JSON.parse(calls[1].options.body).status, 'in_progress');
  assert.equal(calls[1].options.headers.authorization, 'Bearer synthetic-lifecycle-token');
  const finalized = await finalizeSelfArchitectureCheck({ app: selfApp, check: started, conclusion: 'success', fetchImpl, now });
  assert.equal(finalized.id, started.id);
  assert.equal(finalized.conclusion, 'success');
  assert.equal(calls[3].url, `https://api.github.com/repos/flair-agency/architecture-gatekeeper/check-runs/${started.id}`);
  assert.equal(calls[3].options.method, 'PATCH');
  assert.deepEqual(JSON.parse(calls[3].options.body), {
    status: 'completed', conclusion: 'success',
    output: { title: 'Protected validation passed', summary: 'Protected validation completed successfully.' },
  });
});

test('App lifecycle rejects broadened grant, wrong identity, wrong SHA, wrong name, and neutral outcomes', async t => {
  const wrongGrants = [
    { ...selfToken, permissions: { checks: 'write', metadata: 'read', contents: 'read' } },
    { ...selfToken, repositories: [{ id: 1379218763, full_name: 'flair-agency/architecture-gatekeeper' }] },
  ];
  for (const [index, token] of wrongGrants.entries()) await t.test(`wrong token grant ${index}`, async () => {
    let calls = 0;
    await assert.rejects(beginSelfArchitectureCheck({ app: selfApp, headSha, fetchImpl: async () => { calls++; return nativeResponse(token, 201); }, now }), /grant is not limited/);
    assert.equal(calls, 1);
  });
  for (const [label, run] of [
    ['wrong App', lifecycleCheck({ appValue: appId + 1 })],
    ['wrong SHA', lifecycleCheck({ sha: 'b'.repeat(40) })],
    ['wrong name', lifecycleCheck({ name: 'other check' })],
  ]) await t.test(label, async () => {
    let calls = 0;
    const fetchImpl = async () => { calls++; return calls === 1 ? nativeResponse(selfToken, 201) : nativeResponse(run, 201); };
    await assert.rejects(beginSelfArchitectureCheck({ app: selfApp, headSha, fetchImpl, now }), /response did not match/);
  });
  await assert.rejects(finalizeSelfArchitectureCheck({ app: selfApp, check: {}, conclusion: 'neutral', fetchImpl: async () => { throw new Error('must not fetch'); }, now }), /configuration is invalid/);
});

test('Queue completeness lifecycle binds exact SHA and Actions App, and only permits success/failure', async () => {
  const calls = [];
  const check = (status, conclusion = null) => ({ id: 888, name: 'completeness', head_sha: headSha,
    status, conclusion, app: { id: 15368 } });
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    return calls.length === 1 ? nativeResponse(check('in_progress'), 201) : nativeResponse(check('completed', 'failure'), 200);
  };
  const started = await beginSelfQueueCompletenessCheck({ token: 'actions-token', headSha, fetchImpl, now });
  const finalized = await finalizeSelfQueueCompletenessCheck({ token: 'actions-token', check: started, conclusion: 'failure', fetchImpl, now });
  assert.deepEqual(started, { id: 888, name: 'completeness', repository: 'flair-agency/architecture-gatekeeper', headSha, appId: 15368 });
  assert.deepEqual(finalized, started);
  assert.equal(calls[0].options.headers.authorization, 'Bearer actions-token');
  assert.equal(JSON.parse(calls[0].options.body).status, 'in_progress');
  assert.equal(calls[1].url, `https://api.github.com/repos/flair-agency/architecture-gatekeeper/check-runs/${started.id}`);
  assert.equal(JSON.parse(calls[1].options.body).conclusion, 'failure');
  assert.equal(calls[1].options.headers['x-github-api-version'], '2022-11-28');
  await assert.rejects(finalizeSelfQueueCompletenessCheck({ token: 'actions-token', check: started, conclusion: 'neutral', fetchImpl, now }), /configuration is invalid/);
});

test('Queue completeness reporter rejects wrong Actions App, SHA, name, and failed report writes', async t => {
  for (const [label, payload, ok] of [
    ['wrong Actions App', { ...{ id: 888, name: 'completeness', head_sha: headSha, status: 'in_progress' }, app: { id: 7 } }, true],
    ['wrong SHA', { id: 888, name: 'completeness', head_sha: 'b'.repeat(40), status: 'in_progress', app: { id: 15368 } }, true],
    ['wrong name', { id: 888, name: 'other', head_sha: headSha, status: 'in_progress', app: { id: 15368 } }, true],
    ['failed API write', { message: 'private API detail' }, false],
  ]) await t.test(label, async () => {
    await assert.rejects(beginSelfQueueCompletenessCheck({ token: 'actions-token', headSha,
      fetchImpl: async () => nativeResponse(payload, ok ? 201 : 403), now }), error => {
      assert.doesNotMatch(error.message, /private API detail/);
      return true;
    });
  });
});

test('finalizers reject API responses that changed the check identity or did not complete the requested outcome', async t => {
  const appHandle = { id: 777, name: 'architecture-gate / protected-accept', repository: 'flair-agency/architecture-gatekeeper', headSha, appId };
  const queueHandle = { id: 888, name: 'completeness', repository: 'flair-agency/architecture-gatekeeper', headSha, appId: 15368 };
  const appMismatches = [
    lifecycleCheck({ id: 778, status: 'completed', conclusion: 'success' }),
    lifecycleCheck({ name: 'other', status: 'completed', conclusion: 'success' }),
    lifecycleCheck({ name: 'architecture-gate / accept', status: 'completed', conclusion: 'success' }),
    lifecycleCheck({ sha: 'b'.repeat(40), status: 'completed', conclusion: 'success' }),
    lifecycleCheck({ appValue: appId + 1, status: 'completed', conclusion: 'success' }),
    lifecycleCheck({ status: 'completed', conclusion: 'failure' }),
  ];
  for (const [index, run] of appMismatches.entries()) await t.test(`App mismatch ${index}`, async () => {
    let calls = 0;
    const fetchImpl = async () => { calls++; return calls === 1 ? nativeResponse(selfToken, 201) : nativeResponse(run, 200); };
    await assert.rejects(finalizeSelfArchitectureCheck({ app: selfApp, check: appHandle, conclusion: 'success', fetchImpl, now }), /response did not match/);
  });
  const queueMismatches = [
    { id: 889, name: 'completeness', head_sha: headSha, status: 'completed', conclusion: 'success', app: { id: 15368 } },
    { id: 888, name: 'other', head_sha: headSha, status: 'completed', conclusion: 'success', app: { id: 15368 } },
    { id: 888, name: 'completeness', head_sha: 'b'.repeat(40), status: 'completed', conclusion: 'success', app: { id: 15368 } },
    { id: 888, name: 'completeness', head_sha: headSha, status: 'completed', conclusion: 'success', app: { id: 7 } },
    { id: 888, name: 'completeness', head_sha: headSha, status: 'completed', conclusion: 'failure', app: { id: 15368 } },
  ];
  for (const [index, run] of queueMismatches.entries()) await t.test(`Queue mismatch ${index}`, async () => {
    await assert.rejects(finalizeSelfQueueCompletenessCheck({ token: 'actions-token', check: queueHandle, conclusion: 'success',
      fetchImpl: async () => nativeResponse(run, 200), now }), /response did not match/);
  });
  await t.test('failed App patch', async () => {
    let calls = 0;
    const fetchImpl = async () => { calls++; return calls === 1 ? nativeResponse(selfToken, 201) : nativeResponse({ message: 'private detail' }, 403); };
    await assert.rejects(finalizeSelfArchitectureCheck({ app: selfApp, check: appHandle, conclusion: 'failure', fetchImpl, now }), error => {
      assert.doesNotMatch(error.message, /private detail/);
      return true;
    });
  });
});
