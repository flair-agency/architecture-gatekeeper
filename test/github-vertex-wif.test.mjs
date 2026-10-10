import assert from 'node:assert/strict';
import test from 'node:test';
import { acquireGitHubVertexWifCredential } from '../src/github-vertex-wif.mjs';

const input = Object.freeze({
  workloadIdentityProvider: 'projects/123456789012/locations/global/workloadIdentityPools/ci-pool/providers/github',
  serviceAccount: 'gemini-ci@sample-project.iam.gserviceaccount.com',
  project: 'sample-project', region: 'us-central1',
  oidcRequestUrl: 'https://pipelines.actions.githubusercontent.com/fixture/idtoken?api-version=2.0', oidcRequestToken: 'request-secret',
});
const jsonResponse = (value, status = 200) => new Response(JSON.stringify(value), { status });
const expiration = () => new Date(Date.now() + 300_000).toISOString();
const stsValue = { access_token: 'sts-token-secret', issued_token_type: 'urn:ietf:params:oauth:token-type:access_token', token_type: 'Bearer', expires_in: 300 };
function fetchSequence(overrides = {}) {
  const calls = [];
  const results = [jsonResponse({ value: 'github-assertion-secret' }), jsonResponse(stsValue), jsonResponse({ accessToken: 'final-secret', expireTime: expiration() })];
  for (const [index, response] of Object.entries(overrides)) results[Number(index)] = response;
  return { calls, fetch: async (url, init) => { calls.push({ url: String(url), init }); return results[calls.length - 1]; } };
}

test('performs the exact parent-only GitHub OIDC, STS, and IAM token exchange', async () => {
  const f = fetchSequence();
  const result = await acquireGitHubVertexWifCredential(input, f.fetch);
  assert.deepEqual(result, { token: 'final-secret', project: 'sample-project', region: 'us-central1' });
  assert.equal(Object.isFrozen(result), true);
  assert.equal(f.calls.length, 3);
  const [oidc, sts, iam] = f.calls;
  assert.equal(oidc.url, 'https://pipelines.actions.githubusercontent.com/fixture/idtoken?api-version=2.0&audience=https%3A%2F%2Fiam.googleapis.com%2Fprojects%2F123456789012%2Flocations%2Fglobal%2FworkloadIdentityPools%2Fci-pool%2Fproviders%2Fgithub');
  assert.equal(oidc.init.method, 'GET');
  assert.equal(oidc.init.redirect, 'manual');
  assert.equal(oidc.init.headers.authorization, 'Bearer request-secret');
  assert.equal(sts.url, 'https://sts.googleapis.com/v1/token');
  assert.equal(sts.init.headers['content-type'], 'application/json');
  assert.deepEqual(JSON.parse(sts.init.body), { grantType: 'urn:ietf:params:oauth:grant-type:token-exchange',
    audience: `//iam.googleapis.com/${input.workloadIdentityProvider}`, scope: 'https://www.googleapis.com/auth/cloud-platform',
    requestedTokenType: 'urn:ietf:params:oauth:token-type:access_token', subjectTokenType: 'urn:ietf:params:oauth:token-type:jwt',
    subjectToken: 'github-assertion-secret' });
  assert.equal(iam.url, `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${encodeURIComponent(input.serviceAccount)}:generateAccessToken`);
  assert.equal(iam.init.headers.authorization, 'Bearer sts-token-secret');
  assert.deepEqual(JSON.parse(iam.init.body), { scope: ['https://www.googleapis.com/auth/cloud-platform'], lifetime: '300s' });
  for (const call of f.calls) assert.equal(call.init.signal instanceof AbortSignal, true);
});

test('preserves all supported Vertex endpoint location identifiers', async () => {
  for (const region of ['global', 'us', 'eu', 'us-central1']) {
    const f = fetchSequence();
    const result = await acquireGitHubVertexWifCredential({ ...input, region }, f.fetch);
    assert.equal(result.region, region);
    assert.equal(f.calls.length, 3);
  }
  for (const region of ['US', 'europe', 'us/evil', '']) {
    let sends = 0;
    await assert.rejects(acquireGitHubVertexWifCredential({ ...input, region }, async () => { sends++; }), /failed at input/);
    assert.equal(sends, 0);
  }
});

test('rejects invalid exact input records before sending', async () => {
  const accessor = { ...input };
  Object.defineProperty(accessor, 'region', { enumerable: true, get() { throw new Error('secret'); } });
  const invalid = [ { ...input, unexpected: true }, accessor, new Proxy({ ...input }, {}),
    { ...input, oidcRequestUrl: 'https://attacker.example/token' },
    { ...input, oidcRequestUrl: 'https://evilactions.githubusercontent.com/token' },
    { ...input, oidcRequestUrl: 'https://trusted.actions.githubusercontent.com/' },
    { ...input, oidcRequestUrl: 'https://user@pipelines.actions.githubusercontent.com/token' },
    { ...input, workloadIdentityProvider: 'https://attacker.example/provider' },
    { ...input, serviceAccount: 'attacker@example.com' } ];
  for (const candidate of invalid) {
    let sends = 0;
    await assert.rejects(acquireGitHubVertexWifCredential(candidate, async () => { sends++; }), /GitHub Vertex WIF failed at input/);
    assert.equal(sends, 0);
  }
});

test('stops after a failed or redirected stage and sanitizes diagnostics', async () => {
  const cases = [
    [jsonResponse({ error: 'request-secret github-assertion-secret' }, 403), 1],
    [new Response('', { status: 302, headers: { location: 'https://attacker.example/' } }), 1],
  ];
  for (const [failure, expectedCalls] of cases) {
    const calls = [];
    await assert.rejects(acquireGitHubVertexWifCredential(input, async () => { calls.push(1); return failure; }), error => {
      assert.equal(calls.length, expectedCalls);
      assert.doesNotMatch(error.message, /request-secret|github-assertion-secret|attacker/);
      return true;
    });
  }
  const calls = [];
  await assert.rejects(acquireGitHubVertexWifCredential(input, async () => {
    calls.push(1);
    return calls.length === 1 ? jsonResponse({ value: 'github-assertion-secret' }) : jsonResponse({ error: 'sts-token-secret' }, 403);
  }));
  assert.equal(calls.length, 2);
});

test('rejects malformed, unreadable, and oversized bodies and stops later exchanges', async () => {
  for (const response of [new Response('not json'), new Response('x'.repeat(65_537)), new Response(null, { status: 200 })]) {
    let calls = 0;
    await assert.rejects(acquireGitHubVertexWifCredential(input, async () => { calls++; return response; }));
    assert.equal(calls, 1);
  }
  const invalidSts = fetchSequence({ 1: jsonResponse({ access_token: 'bad', token_type: 'Bearer' }) });
  await assert.rejects(acquireGitHubVertexWifCredential(input, invalidSts.fetch));
  assert.equal(invalidSts.calls.length, 2);
  const invalidIam = fetchSequence({ 2: jsonResponse({ accessToken: 'bad', expireTime: 'not a date' }) });
  await assert.rejects(acquireGitHubVertexWifCredential(input, invalidIam.fetch));
  assert.equal(invalidIam.calls.length, 3);
  const shortSts = fetchSequence({ 1: jsonResponse({ ...stsValue, expires_in: 119 }) });
  await assert.rejects(acquireGitHubVertexWifCredential(input, shortSts.fetch));
  assert.equal(shortSts.calls.length, 2);
  const shortIam = fetchSequence({ 2: jsonResponse({ accessToken: 'bad', expireTime: new Date(Date.now() + 239_000).toISOString() }) });
  await assert.rejects(acquireGitHubVertexWifCredential(input, shortIam.fetch));
  assert.equal(shortIam.calls.length, 3);
});

test('aborts a hanging fetch and response stream at the finite overall deadline', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const calls = [];
  const pendingFetch = acquireGitHubVertexWifCredential(input, (_url, init) => new Promise((resolve, reject) => {
    calls.push(1);
    init.signal.addEventListener('abort', () => reject(new Error('request-secret')), { once: true });
  }));
  t.mock.timers.tick(60_000);
  await assert.rejects(pendingFetch, /GitHub Vertex WIF failed at timeout/);
  assert.equal(calls.length, 1);

  t.mock.timers.reset();
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let pullStarted = false;
  const streamCalls = [];
  const pendingStream = acquireGitHubVertexWifCredential(input, async (_url, init) => {
    streamCalls.push(1);
    if (streamCalls.length !== 1) throw new Error('later request must not happen');
    return new Response(new ReadableStream({ pull() { pullStarted = true; return new Promise(() => {}); }, cancel() {} }));
  });
  while (!pullStarted) await new Promise(resolve => setImmediate(resolve));
  assert.equal(pullStarted, true);
  t.mock.timers.tick(60_000);
  await assert.rejects(pendingStream, /GitHub Vertex WIF failed at timeout/);
  assert.equal(streamCalls.length, 1);

  t.mock.timers.reset();
  const thirdCalls = [];
  const thirdFailure = await acquireGitHubVertexWifCredential(input, async (_url, init) => {
    thirdCalls.push(init);
    if (thirdCalls.length === 1) return jsonResponse({ value: 'assertion' });
    if (thirdCalls.length === 2) return jsonResponse(stsValue);
    return jsonResponse({ error: 'final-secret' }, 403);
  }).then(() => null, error => error);
  assert.match(thirdFailure.message, /service_account_token/);
  assert.doesNotMatch(thirdFailure.message, /final-secret|assertion|sts-token-secret/);
  assert.equal(thirdCalls.length, 3);
});
