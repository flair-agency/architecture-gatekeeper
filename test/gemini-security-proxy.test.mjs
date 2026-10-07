import test from 'node:test';
import assert from 'node:assert/strict';
import http, { createServer, request, Server } from 'node:http';
import https from 'node:https';
import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';
import { closeSync, mkdtempSync, openSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createVertexVerificationReservation, initializeVertexVerificationLedger } from '../src/vertex-verification-reservation.mjs';
import { syncBuiltinESMExports } from 'node:module';
import { validateGeminiRoute, startGeminiSecurityProxy, MAX_PROXY_REQUEST_BYTES, remainingDeadlineMs } from '../src/gemini-security-proxy.mjs';
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
  assert.deepEqual(validateGeminiRoute('/v1/publishers/google/models/gemini-2.5-flash:streamGenerateContent?alt=sse'), {
    mode: 'vertex', path: '/v1/publishers/google/models/gemini-2.5-flash:streamGenerateContent?alt=sse', streaming: true,
  });
  assert.equal(validateGeminiRoute('/v1/publishers/google/models/gemini-2.5-flash:streamGenerateContent?alt=json'), null);
  assert.equal(validateGeminiRoute('/v1/responses'), null);
  assert.equal(validateGeminiRoute('/arbitrary/path'), null);
});

test('Vertex SSE opt-in rewrites fixed scope, strips client credentials, and forwards stream', async () => {
  let captured;
  const upstream = createServer((req, res) => {
    captured = { url: req.url, headers: req.headers };
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    res.write('data: {"chunk":1}\n\n');
    setTimeout(() => res.end('data: [DONE]\n\n'), 10);
  });
  await new Promise(resolve => upstream.listen(0, '127.0.0.1', resolve));
  const proxy = await startGeminiSecurityProxy({
    credentials: { type: 'bearer', value: 'proxy-token' }, allowedMode: 'vertex', allowedProject: 'fixed-p',
    allowedRegion: 'us-central1', allowedModel: 'gemini-2.5-flash', allowStreaming: true,
    upstreamHost: '127.0.0.1', upstreamPort: upstream.address().port, upstreamHttp: true, allowLoopbackUpstream: true,
  });
  try {
    const response = await fetch(proxy.endpointUrl + '/v1/publishers/google/models/gemini-2.5-flash:streamGenerateContent?alt=sse', {
      method: 'POST', headers: { Authorization: 'Bearer client-token', 'x-goog-api-key': 'client-key', 'X-Custom': 'discard-me' }, body: '{}',
    });
    assert.equal(response.status, 200);
    assert.match(await response.text(), /data: \[DONE\]/);
    assert.equal(captured.url, '/v1/projects/fixed-p/locations/us-central1/publishers/google/models/gemini-2.5-flash:streamGenerateContent?alt=sse');
    assert.equal(captured.headers.authorization, 'Bearer proxy-token');
    assert.equal(captured.headers['x-goog-api-key'], undefined);
    assert.equal(captured.headers['x-custom'], undefined);
  } finally { await proxy.shutdown(); await new Promise(resolve => upstream.close(resolve)); }
});

test('Vertex SSE is disabled by default and rejects unselected model and malformed query', async () => {
  let calls = 0;
  const upstream = createServer((_req, res) => { calls++; res.end('{}'); });
  await new Promise(resolve => upstream.listen(0, '127.0.0.1', resolve));
  const proxy = await startGeminiSecurityProxy({ credentials: { type: 'bearer', value: 'fixture' }, allowedMode: 'vertex', allowedProject: 'p', allowedRegion: 'us-central1', allowedModel: 'gemini-2.5-flash', upstreamHost: '127.0.0.1', upstreamPort: upstream.address().port, upstreamHttp: true, allowLoopbackUpstream: true });
  try {
    for (const path of ['/v1/publishers/google/models/gemini-2.5-flash:streamGenerateContent?alt=sse', '/v1/publishers/google/models/other:streamGenerateContent?alt=sse', '/v1/publishers/google/models/gemini-2.5-flash:streamGenerateContent?alt=json', '/v1/publishers/google/models/gemini-2.5-flash:streamGenerateContent?alt=sse&x=1', '/v1beta/models/gemini-2.5-flash:generateContent']) {
      const res = await fetch(proxy.endpointUrl + path, { method: 'POST', body: '{}' });
      assert.equal(res.status, 403);
    }
    assert.equal(calls, 0);
  } finally { await proxy.shutdown(); await new Promise(resolve => upstream.close(resolve)); }
});

test('Vertex SSE requires the literal true opt-in and rejects cross-mode dispatch', async () => {
  let calls = 0;
  const upstream = createServer((_req, res) => { calls++; res.end('{}'); });
  await new Promise(resolve => upstream.listen(0, '127.0.0.1', resolve));
  const url = '/v1/publishers/google/models/gemini-2.5-flash:streamGenerateContent?alt=sse';
  const configs = [
    { credentials: { type: 'bearer', value: 'fixture' }, allowedMode: 'vertex', allowedProject: 'p', allowedRegion: 'us-central1', allowedModel: 'gemini-2.5-flash', allowStreaming: 1 },
    { credentials: { type: 'apiKey', value: 'fixture' }, allowedMode: 'studio', allowedModel: 'gemini-2.5-flash' },
  ];
  const proxies = [];
  try {
    for (const config of configs) proxies.push(await startGeminiSecurityProxy({ ...config, upstreamHost: '127.0.0.1', upstreamPort: upstream.address().port, upstreamHttp: true, allowLoopbackUpstream: true }));
    for (const proxy of proxies) assert.equal((await fetch(proxy.endpointUrl + url, { method: 'POST', body: '{}' })).status, 403);
    assert.equal(calls, 0);
  } finally { await Promise.all(proxies.map(proxy => proxy.shutdown())); await new Promise(resolve => upstream.close(resolve)); }
});

test('Vertex SSE downstream cancellation destroys the upstream request', async () => {
  let upstreamClosed = false;
  let markStarted;
  let markClosed;
  const started = new Promise(resolve => { markStarted = resolve; });
  const closed = new Promise(resolve => { markClosed = resolve; });
  const upstream = createServer((_req, res) => {
    markStarted();
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    res.write('data: start\n\n');
    res.on('close', () => { upstreamClosed = true; markClosed(); });
  });
  await new Promise(resolve => upstream.listen(0, '127.0.0.1', resolve));
  const proxy = await startGeminiSecurityProxy({ credentials: { type: 'bearer', value: 'fixture' }, allowedMode: 'vertex', allowedProject: 'p', allowedRegion: 'us-central1', allowedModel: 'gemini-2.5-flash', allowStreaming: true, upstreamHost: '127.0.0.1', upstreamPort: upstream.address().port, upstreamHttp: true, allowLoopbackUpstream: true });
  try {
    const controller = new AbortController();
    const pending = fetch(proxy.endpointUrl + '/v1/publishers/google/models/gemini-2.5-flash:streamGenerateContent?alt=sse', { method: 'POST', body: '{}', signal: controller.signal }).then(response => response.body?.cancel()).catch(() => {});
    await started;
    controller.abort();
    await pending;
    let timeout;
    await Promise.race([closed, new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error('Timed out waiting for upstream cancellation.')), 1000); })]).finally(() => clearTimeout(timeout));
    assert.equal(upstreamClosed, true);
  } finally { await proxy.shutdown(); await new Promise(resolve => upstream.close(resolve)); }
});

test('Vertex SSE upstream stream errors terminate the downstream response', async () => {
  let began;
  const started = new Promise(resolve => { began = resolve; });
  const upstream = createServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    res.write('data: partial\n\n');
    began();
    setImmediate(() => res.destroy(new Error('fixture stream failure')));
  });
  await new Promise(resolve => upstream.listen(0, '127.0.0.1', resolve));
  const proxy = await startGeminiSecurityProxy({ credentials: { type: 'bearer', value: 'fixture' }, allowedMode: 'vertex', allowedProject: 'p', allowedRegion: 'us-central1', allowedModel: 'gemini-2.5-flash', allowStreaming: true, upstreamHost: '127.0.0.1', upstreamPort: upstream.address().port, upstreamHttp: true, allowLoopbackUpstream: true });
  try {
    const responsePromise = fetch(proxy.endpointUrl + '/v1/publishers/google/models/gemini-2.5-flash:streamGenerateContent?alt=sse', { method: 'POST', body: '{}' });
    await started;
    const response = await responsePromise;
    await assert.rejects(response.text());
  } finally { await proxy.shutdown(); await new Promise(resolve => upstream.close(resolve)); }
});

test('upstream timeout tracks the remaining selected session deadline without a 60-second cap', () => {
  const startedAt = 1_000_000;
  const selectedBudgetMs = 120_000;
  const deadlineAt = startedAt + selectedBudgetMs;

  assert.equal(remainingDeadlineMs(deadlineAt, startedAt), 120_000);
  assert.equal(remainingDeadlineMs(deadlineAt, startedAt + 90_000), 30_000);
  assert.equal(remainingDeadlineMs(deadlineAt, deadlineAt + 1), 0);
});

test('proxy passes selected and remaining deadlines to upstream dispatch and rejects expired dispatch', async () => {
  let upstreamCalls = 0;
  const upstream = createServer((_req, res) => {
    upstreamCalls++;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end('{}');
  });
  await new Promise(resolve => upstream.listen(0, '127.0.0.1', resolve));

  const realRequest = http.request;
  const realNow = Date.now;
  const observedTimeouts = [];
  let fakeNow = realNow();
  http.request = (options, ...args) => {
    if (options.port === upstream.address().port) observedTimeouts.push(options.timeout);
    return realRequest(options, ...args);
  };
  syncBuiltinESMExports();
  Date.now = () => fakeNow;
  const proxy = await startGeminiSecurityProxy({
    allowedMode: 'studio', allowedModel: 'gemini-2.5-flash',
    credentials: { type: 'apiKey', value: 'fixture' },
    upstreamHost: '127.0.0.1', upstreamPort: upstream.address().port,
    upstreamHttp: true, allowLoopbackUpstream: true, deadlineMs: 120_000,
  });

  const post = () => new Promise((resolve, reject) => {
    const req = realRequest(`${proxy.endpointUrl}/v1beta/models/gemini-2.5-flash:generateContent`, { method: 'POST' }, res => {
      res.resume();
      res.on('end', () => resolve(res.statusCode));
    });
    req.on('error', reject);
    req.end('{}');
  });

  try {
    assert.equal(await post(), 200);
    fakeNow += 90_000;
    assert.equal(await post(), 200);
    fakeNow += 30_001;
    assert.equal(await post(), 504);

    assert.deepEqual(observedTimeouts, [120_000, 30_000]);
    assert.equal(upstreamCalls, 2);
  } finally {
    Date.now = realNow;
    await proxy.shutdown();
    http.request = realRequest;
    syncBuiltinESMExports();
    await new Promise(resolve => upstream.close(resolve));
  }
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

test('proxy startup deadline and cancellation reject stalled listen and close a late callback', async () => {
  const originalListen = Server.prototype.listen;
  const originalClose = Server.prototype.close;
  const pending = [];
  let closeCalls = 0;
  Server.prototype.listen = function (...args) {
    pending.push({ server: this, callback: args.at(-1) });
    Object.defineProperty(this, 'listening', { configurable: true, get: () => true });
    return this;
  };
  Server.prototype.close = function (callback) {
    closeCalls += 1;
    callback?.();
    return this;
  };

  try {
    const timed = startGeminiSecurityProxy({
      credentials: { type: 'bearer', value: 'fixture' }, allowedMode: 'vertex',
      allowedProject: 'p', allowedRegion: 'us', allowedModel: 'gemini-3.8-flash', deadlineMs: 25,
    });
    await assert.rejects(timed, /deadline expired/);
    assert.equal(pending.length, 1);
    assert.equal(closeCalls, 1, 'timeout closes the server while listen is stalled');
    pending[0].callback();
    assert.equal(closeCalls, 2, 'a late successful bind is closed after the first cleanup');

    const controller = new AbortController();
    const cancelled = startGeminiSecurityProxy({
      credentials: { type: 'bearer', value: 'fixture' }, allowedMode: 'vertex',
      allowedProject: 'p', allowedRegion: 'us', allowedModel: 'gemini-3.8-flash', signal: controller.signal,
    });
    assert.equal(pending.length, 2);
    controller.abort();
    await assert.rejects(cancelled, /cancelled/);
    assert.equal(closeCalls, 3, 'cancellation closes the pending server');
    pending[1].callback();
    assert.equal(closeCalls, 4, 'a late successful bind after cancellation is closed');
  } finally {
    Server.prototype.listen = originalListen;
    Server.prototype.close = originalClose;
  }
});


test('Vertex proxy rejects an official host outside the selected region', async () => {
  const proxy = await startGeminiSecurityProxy({ credentials: { type: 'bearer', value: 'fixture-token' }, allowedMode: 'vertex', allowedProject: 'p', allowedRegion: 'us-central1', allowedModel: 'gemini-2.5-flash', upstreamHost: 'europe-west1-aiplatform.googleapis.com' });
  try {
    const response = await fetch(`${proxy.endpointUrl}/v1/projects/p/locations/us-central1/publishers/google/models/gemini-2.5-flash:generateContent`, { method: 'POST', body: '{}' });
    assert.equal(response.status, 403);
    assert.match(await response.text(), /unverified Vertex host/);
  } finally { await proxy.shutdown(); }
});

test('Vertex proxy dispatches to exact official location hosts and preserves regional hosts', async t => {
  for (const [location, expectedHost] of [
    ['global', 'aiplatform.googleapis.com'],
    ['us', 'aiplatform.us.rep.googleapis.com'],
    ['eu', 'aiplatform.eu.rep.googleapis.com'],
    ['us-central1', 'us-central1-aiplatform.googleapis.com'],
  ]) await t.test(location, async () => {
    const realHttpsRequest = https.request;
    const observedHosts = [];
    https.request = (options, callback) => {
      observedHosts.push(options.hostname);
      const upstreamResponse = new Readable({ read() { this.push('{}'); this.push(null); } });
      upstreamResponse.statusCode = 200;
      upstreamResponse.headers = { 'content-type': 'application/json' };
      const upstreamRequest = new EventEmitter();
      upstreamRequest.write = () => {};
      upstreamRequest.end = () => queueMicrotask(() => callback(upstreamResponse));
      upstreamRequest.destroy = () => {};
      return upstreamRequest;
    };
    syncBuiltinESMExports();
    let proxy;
    try {
      proxy = await startGeminiSecurityProxy({
        credentials: { type: 'bearer', value: 'fixture' }, allowedMode: 'vertex',
        allowedProject: 'p', allowedRegion: location, allowedModel: 'gemini-2.5-flash',
      });
      const response = await fetch(`${proxy.endpointUrl}/v1/projects/p/locations/${location}/publishers/google/models/gemini-2.5-flash:generateContent`, { method: 'POST', body: '{}' });
      assert.equal(response.status, 200);
      assert.deepEqual(observedHosts, [expectedHost]);
    } finally {
      if (proxy) await proxy.shutdown();
      https.request = realHttpsRequest;
      syncBuiltinESMExports();
    }
  });
});

test('Vertex proxy rejects a mismatched official host override for the selected location', async () => {
  const proxy = await startGeminiSecurityProxy({
    credentials: { type: 'bearer', value: 'fixture' }, allowedMode: 'vertex',
    allowedProject: 'p', allowedRegion: 'us', allowedModel: 'gemini-2.5-flash',
    upstreamHost: 'aiplatform.eu.rep.googleapis.com',
  });
  try {
    const response = await fetch(`${proxy.endpointUrl}/v1/projects/p/locations/us/publishers/google/models/gemini-2.5-flash:generateContent`, { method: 'POST', body: '{}' });
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

test('parent dispatch reservation caps concurrent and failed upstream calls across sessions', async () => {
  let sent = 0;
  const directory = mkdtempSync(join(tmpdir(), 'proxy-verification-budget-'));
  const ledger = join(directory, 'attempts');
  const fd = openSync(ledger, 'wx+', 0o600);
  initializeVertexVerificationLedger(fd);
  const reserveDispatch = createVertexVerificationReservation(fd);
  const upstream = createServer((_req, res) => { sent++; res.writeHead(503); res.end('{}'); });
  await new Promise(resolve => upstream.listen(0, '127.0.0.1', resolve));
  const proxies = [];
  try {
    for (let i = 0; i < 2; i++) proxies.push(await startGeminiSecurityProxy({
      credentials: { type: 'bearer', value: 'fixture' }, allowedMode: 'vertex', allowedProject: 'p',
      allowedRegion: 'global', allowedModel: 'gemini-3.8-flash', reserveDispatch,
      upstreamHost: '127.0.0.1', upstreamPort: upstream.address().port, upstreamHttp: true, allowLoopbackUpstream: true,
    }));
    const route = '/v1/projects/p/locations/global/publishers/google/models/gemini-3.8-flash:generateContent';
    const rejected = await fetch(proxies[0].endpointUrl + '/invalid', { method: 'POST', body: '{}' });
    assert.equal(rejected.status, 403);
    assert.equal(readFileSync(ledger, 'utf8'), 'AGK334-V1\n');
    const statuses = await Promise.all(Array.from({ length: 8 }, async (_, i) => {
      const response = await fetch(proxies[i % 2].endpointUrl + route, { method: 'POST', body: '{}' });
      await response.text();
      return response.status;
    }));
    assert.equal(statuses.filter(status => status === 503).length, 5);
    assert.equal(statuses.filter(status => status === 429).length, 3);
    assert.equal(readFileSync(ledger, 'utf8'), 'AGK334-V1\n1\n2\n3\n4\n5\n');
    assert.equal(sent, 5);
  } finally {
    await Promise.all(proxies.map(proxy => proxy.shutdown()));
    await new Promise(resolve => upstream.close(resolve));
    closeSync(fd);
    rmSync(directory, { recursive: true, force: true });
  }
});

test('reservation failure and asynchronous or nonliteral grants never send or expose private errors', async () => {
  let sent = 0;
  const upstream = createServer((_req, res) => { sent++; res.end('{}'); });
  await new Promise(resolve => upstream.listen(0, '127.0.0.1', resolve));
  try {
    for (const reserveDispatch of [() => { throw new Error('private-ledger-path'); }, () => undefined,
      () => 1, async () => true, async () => { throw new Error('private-ledger-path'); }]) {
      const proxy = await startGeminiSecurityProxy({
        credentials: { type: 'bearer', value: 'fixture' }, allowedMode: 'vertex', allowedProject: 'p',
        allowedRegion: 'global', allowedModel: 'gemini-3.8-flash', reserveDispatch,
        upstreamHost: '127.0.0.1', upstreamPort: upstream.address().port, upstreamHttp: true, allowLoopbackUpstream: true,
      });
      try {
        const response = await fetch(proxy.endpointUrl + '/v1/projects/p/locations/global/publishers/google/models/gemini-3.8-flash:generateContent', { method: 'POST', body: '{}' });
        assert.equal(response.status, 429);
        assert.equal(await response.text(), '{"error":"Upstream dispatch reservation unavailable."}');
      } finally { await proxy.shutdown(); }
    }
    assert.equal(sent, 0);
  } finally { await new Promise(resolve => upstream.close(resolve)); }
});

test('proxy rejects invalid reservation configuration before startup', async () => {
  await assert.rejects(startGeminiSecurityProxy({
    credentials: { type: 'bearer', value: 'fixture' }, allowedMode: 'vertex', allowedProject: 'p',
    allowedRegion: 'global', allowedModel: 'gemini-3.8-flash', reserveDispatch: true,
  }), /trusted parent function/);
});
