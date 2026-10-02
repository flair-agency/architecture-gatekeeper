import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer, request } from 'node:http';
import { validateGeminiRoute, startGeminiSecurityProxy, MAX_PROXY_REQUEST_BYTES } from '../src/gemini-security-proxy.mjs';
import { validateLoopbackEndpoint } from '../src/review-security-proxy.mjs';

test('validateLoopbackEndpoint validates local loopback addresses', () => {
  assert.throws(() => validateLoopbackEndpoint(''), /non-empty string/);
  assert.throws(() => validateLoopbackEndpoint('https://127.0.0.1:8080'), /plain http/);
  assert.throws(() => validateLoopbackEndpoint('http://0.0.0.0:8080'), /bind to loopback/);
  assert.throws(() => validateLoopbackEndpoint('http://example.com:8080'), /bind to loopback/);
  assert.throws(() => validateLoopbackEndpoint('http://127.0.0.1:0'), /valid port number/);
  assert.throws(() => validateLoopbackEndpoint('http://127.0.0.1:abc'), /Invalid proxy endpoint URL/);

  const parsed = validateLoopbackEndpoint('http://127.0.0.1:54321');
  assert.equal(parsed.hostname, '127.0.0.1');
  assert.equal(parsed.port, '54321');
});

test('validateGeminiRoute allowlists only valid generateContent endpoints', () => {
  // Studio paths
  assert.deepEqual(validateGeminiRoute('/v1beta/models/gemini-2.5-flash:generateContent'), {
    mode: 'studio',
    path: '/v1beta/models/gemini-2.5-flash:generateContent',
  });
  assert.equal(validateGeminiRoute('/v1beta/models/gemini-3.8-flash:generateContent?key=abc'), null);
  assert.equal(validateGeminiRoute('/v1beta/models/gemini-3.8-flash:generateContent#fragment'), null);

  // Vertex paths
  assert.deepEqual(
    validateGeminiRoute('/v1/projects/my-proj/locations/us-central1/publishers/google/models/gemini-2.5-flash:generateContent'),
    {
      mode: 'vertex',
      path: '/v1/projects/my-proj/locations/us-central1/publishers/google/models/gemini-2.5-flash:generateContent',
    }
  );

  // Rejected paths (arbitrary / non-review routes)
  assert.equal(validateGeminiRoute('/v1/models'), null);
  assert.equal(validateGeminiRoute('/v1beta/models/gemini-2.5-flash:countTokens'), null);
  assert.equal(validateGeminiRoute('/v1/projects/p/locations/l/operations/op123'), null);
  assert.equal(validateGeminiRoute('/v1/responses'), null);
  assert.equal(validateGeminiRoute('/arbitrary/path'), null);
});

test('GeminiSecurityProxy binds strictly to 127.0.0.1 with ephemeral port and rejects non-POST', async () => {
  const proxy = await startGeminiSecurityProxy({
    allowedMode: 'studio', allowedModel: 'gemini-2.5-flash',
    credentials: { type: 'apiKey', value: 'secret-test-key' },
  });

  try {
    const endpoint = validateLoopbackEndpoint(proxy.endpointUrl);
    assert.equal(endpoint.hostname, '127.0.0.1');
    assert.ok(parseInt(endpoint.port, 10) > 0);

    // GET should be rejected with 403
    const getRes = await fetch(`${proxy.endpointUrl}/v1beta/models/gemini-2.5-flash:generateContent`, {
      method: 'GET',
    });
    assert.equal(getRes.status, 403);

    // Non-allowlisted route should be rejected with 403
    const badPathRes = await fetch(`${proxy.endpointUrl}/v1/models`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    assert.equal(badPathRes.status, 403);
  } finally {
    await proxy.shutdown();
  }
});

test('GeminiSecurityProxy injects credentials in-flight to upstream and rejects redirects', async () => {
  let capturedHeaders = null;
  let capturedBody = null;

  // Mock upstream HTTP server
  const mockUpstream = createServer((req, res) => {
    capturedHeaders = req.headers;
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => {
      capturedBody = Buffer.concat(chunks).toString('utf8');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'OK' }] } }] }));
    });
  });

  await new Promise(resolve => mockUpstream.listen(0, '127.0.0.1', resolve));
  const upstreamPort = mockUpstream.address().port;

  const proxy = await startGeminiSecurityProxy({
    allowedMode: 'studio', allowedModel: 'gemini-2.5-flash',
    credentials: { type: 'apiKey', value: 'test-api-secret-123' },
    upstreamHost: '127.0.0.1',
    upstreamPort,
    upstreamHttp: true,
    allowLoopbackUpstream: true,
  });

  try {
    const res = await fetch(`${proxy.endpointUrl}/v1beta/models/gemini-2.5-flash:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: 'test prompt' }] }] }),
    });

    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.candidates[0].content.parts[0].text, 'OK');

    // Verify in-flight header injection
    assert.equal(capturedHeaders['x-goog-api-key'], 'test-api-secret-123');
    assert.equal(JSON.parse(capturedBody).contents[0].parts[0].text, 'test prompt');
  } finally {
    await proxy.shutdown();
    await new Promise(resolve => mockUpstream.close(resolve));
  }
});

test('GeminiSecurityProxy injects Bearer token for Vertex requests', async () => {
  let capturedHeaders = null;

  const mockUpstream = createServer((req, res) => {
    capturedHeaders = req.headers;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'Vertex OK' }] } }] }));
  });

  await new Promise(resolve => mockUpstream.listen(0, '127.0.0.1', resolve));
  const upstreamPort = mockUpstream.address().port;

  const proxy = await startGeminiSecurityProxy({
    allowedMode: 'vertex', allowedModel: 'gemini-2.5-flash', allowedProject: 'my-p', allowedRegion: 'us-central1',
    credentials: { type: 'bearer', value: 'oauth-token-xyz' },
    upstreamHost: '127.0.0.1',
    upstreamPort,
    upstreamHttp: true,
    allowLoopbackUpstream: true,
  });

  try {
    const res = await fetch(
      `${proxy.endpointUrl}/v1/projects/my-p/locations/us-central1/publishers/google/models/gemini-2.5-flash:generateContent`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [] }),
      }
    );

    assert.equal(res.status, 200);
    assert.equal(capturedHeaders['authorization'], 'Bearer oauth-token-xyz');
  } finally {
    await proxy.shutdown();
    await new Promise(resolve => mockUpstream.close(resolve));
  }
});


test('proxy rejects absent or credential-incompatible scope before listening', async () => {
  for (const config of [
    { credentials: { type: 'apiKey', value: 'fixture' } },
    { credentials: { type: 'bearer', value: 'fixture' }, allowedMode: 'vertex', allowedModel: 'gemini-2.5-flash' },
    { credentials: { type: 'apiKey', value: 'fixture' }, allowedMode: 'vertex', allowedModel: 'gemini-2.5-flash', allowedProject: 'p', allowedRegion: 'r' }
  ]) await assert.rejects(startGeminiSecurityProxy(config), /complete credential-compatible/);
});


test('Vertex proxy rejects an official host outside the selected region', async () => {
  const proxy = await startGeminiSecurityProxy({ credentials: { type: 'bearer', value: 'fixture-token' }, allowedMode: 'vertex', allowedProject: 'p', allowedRegion: 'us-central1', allowedModel: 'gemini-2.5-flash', upstreamHost: 'europe-west1-aiplatform.googleapis.com' });
  try {
    const response = await fetch(`${proxy.endpointUrl}/v1/projects/p/locations/us-central1/publishers/google/models/gemini-2.5-flash:generateContent`, { method: 'POST', body: '{}' });
    assert.equal(response.status, 403);
    assert.match(await response.text(), /unverified Vertex host/);
  } finally { await proxy.shutdown(); }
});

test('proxy rejects declared and chunked oversized bodies before upstream dispatch', async () => {
  let calls = 0;
  const upstream = createServer((_req, res) => { calls++; res.end('{}'); });
  await new Promise(resolve => upstream.listen(0, '127.0.0.1', resolve));
  const proxy = await startGeminiSecurityProxy({ credentials: { type: 'apiKey', value: 'sentinel' }, allowedMode: 'studio', allowedModel: 'gemini-2.5-flash', upstreamHost: '127.0.0.1', upstreamHttp: true, allowLoopbackUpstream: true, upstreamPort: upstream.address().port });
  try {
    for (const declared of [true, false]) {
      const status = await new Promise((resolve, reject) => {
        const req = request(proxy.endpointUrl + '/v1beta/models/gemini-2.5-flash:generateContent', { method: 'POST', headers: declared ? { 'Content-Length': MAX_PROXY_REQUEST_BYTES + 1 } : { 'Transfer-Encoding': 'chunked' } }, res => { res.resume(); resolve(res.statusCode); if (declared) req.destroy(); });
        req.on('error', reject);
        if (declared) req.flushHeaders();
        else req.end(Buffer.alloc(MAX_PROXY_REQUEST_BYTES + 1, 32));
      });
      assert.equal(status, 413);
    }
    assert.equal(calls, 0);
  } finally { await proxy.shutdown(); await new Promise(resolve => upstream.close(resolve)); }
});
