import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { request as httpRequest } from 'node:http';
import { Server } from 'node:http';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { runGeminiCliProxySession } from '../src/gemini-cli-proxy-session.mjs';

const oid = char => char.repeat(40);
const workspaceLimits = { maxFiles: 2, maxFileBytes: 2048, maxTotalBytes: 4096 };
function packet() {
  const text = 'review fixture';
  return {
    version: 1,
    revisions: { baseSha: oid('a'), headSha: oid('b'), reviewedMergeSha: oid('c') },
    limits: workspaceLimits,
    files: [],
    references: [{ path: 'docs/authority.md', text, mode: '100644', gitObjectId: oid('d'), sha256: createHash('sha256').update(text).digest('hex') }],
  };
}
function fixture(t, mode = 'success') {
  const root = mkdtempSync(join(tmpdir(), 'gemini-cli-proxy-session-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const workspaceParentDirectory = join(root, 'workspace-parent'); mkdirSync(workspaceParentDirectory);
  const privateParentDirectory = join(root, 'process-private'); mkdirSync(privateParentDirectory);
  const reportPath = join(root, 'observation.json');
  const cliEntrypoint = join(root, 'fake-cli.mjs');
  writeFileSync(cliEntrypoint, `
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const mode = ${JSON.stringify(mode)};
if (process.argv.includes('--version')) { process.stdout.write('0.62.0'); process.exit(0); }
const forbiddenResponse = await fetch(process.env.GOOGLE_VERTEX_BASE_URL + '/v1/projects/wrong-project/locations/wrong-region/publishers/google/models/wrong-model:generateContent', { method: 'POST', body: '{}' });
const settings = JSON.parse(readFileSync(join(process.env.HOME, '.gemini/settings.json'), 'utf8'));
writeFileSync(${JSON.stringify(reportPath)}, JSON.stringify({ endpoint: process.env.GOOGLE_VERTEX_BASE_URL, forbiddenStatus: forbiddenResponse.status, env: process.env, settings, argv: process.argv.slice(2) }));
if (mode === 'hang') { setInterval(() => {}, 1000); }
process.stdout.write(JSON.stringify({ response: 'raw proxy-session response text' }));
`);
  return { root, workspaceParentDirectory, privateParentDirectory, reportPath, cliEntrypoint };
}
function args(f, overrides = {}) {
  return {
    packet: packet(), workspaceLimits, workspaceParentDirectory: f.workspaceParentDirectory,
    credentials: { type: 'bearer', value: 'parent-only-fixture-token' },
    processOptions: {
      cliEntrypoint: f.cliEntrypoint, privateParentDirectory: f.privateParentDirectory,
      prompt: 'Inspect the supplied manifest and evidence snapshots.',
      model: 'gemini-3.8-flash', thinkingLevel: 'MEDIUM', project: 'selected-project', region: 'us',
      timeoutMs: 5000, maxPromptBytes: 4096, maxStdoutBytes: 1024, maxStderrBytes: 1024,
      ...overrides,
    },
  };
}
async function assertProxyClosed(endpoint) {
  assert.equal(typeof endpoint, 'string');
  const match = /^http:\/\/127\.0\.0\.1:(\d+)$/.exec(endpoint);
  assert.ok(match, 'proxy endpoint must be the expected loopback form');
  const port = Number(match[1]);
  assert.ok(Number.isSafeInteger(port) && port >= 1 && port <= 65535, 'proxy port must be valid');
  await assert.rejects(new Promise((resolve, reject) => {
    const request = httpRequest({ hostname: '127.0.0.1', port, method: 'POST', path: '/not-allowed' }, response => {
      response.resume();
      resolve(response.statusCode);
    });
    request.once('error', reject);
    request.end('{}');
  }), error => error?.code === 'ECONNREFUSED');
}

test('keeps bearer credentials in parent, fixes Vertex scope, returns raw text, and closes proxy', async t => {
  const f = fixture(t);
  assert.equal(await runGeminiCliProxySession(args(f)), 'raw proxy-session response text');
  const observed = JSON.parse(readFileSync(f.reportPath, 'utf8'));
  assert.match(observed.endpoint, /^http:\/\/127\.0\.0\.1:\d+$/);
  assert.equal(observed.forbiddenStatus, 403);
  assert.equal(JSON.stringify(observed.env).includes('parent-only-fixture-token'), false);
  assert.equal(observed.env.GOOGLE_APPLICATION_CREDENTIALS, undefined);
  assert.deepEqual(observed.argv, ['--model=gemini-3.8-flash', '--output-format', 'json']);
  assert.deepEqual(observed.settings.modelConfigs.customOverrides[0].modelConfig.generateContentConfig.thinkingConfig, { thinkingLevel: 'MEDIUM', includeThoughts: false });
  await assertProxyClosed(observed.endpoint);
  assert.deepEqual(readdirSync(f.workspaceParentDirectory), []);
  assert.deepEqual(readdirSync(f.privateParentDirectory), []);
});

test('rejects proxy overrides, unselected credential types, and missing finite scope before starting', async t => {
  const invalid = [
    [f => ({ ...args(f), processOptions: { ...args(f).processOptions, proxyUrl: 'http://127.0.0.1:1/' } }), /does not accept proxy overrides/],
    [f => ({ ...args(f), processOptions: { ...args(f).processOptions, upstreamHost: 'example.invalid' } }), /does not accept proxy overrides/],
    [f => ({ ...args(f), credentials: { type: 'apiKey', value: 'not-bearer' } }), /parent-only bearer/],
    [f => ({ ...args(f), processOptions: { ...args(f).processOptions, project: undefined } }), /explicit model, project, and region/],
    [f => ({ ...args(f), processOptions: { ...args(f).processOptions, timeoutMs: 60 * 60 * 1000 + 1 } }), /one-hour runtime limit/],
    [f => ({ ...args(f), processOptions: { ...args(f).processOptions, signal: {} } }), /must be an AbortSignal/],
    [f => ({ ...args(f), processOptions: { ...args(f).processOptions, signal: { aborted: false, addEventListener() {}, removeEventListener() {} } } }), /AbortSignal/],
    [f => ({ ...args(f), deadlineMs: 5000 }), /unsupported input/],
  ];
  for (const [build, pattern] of invalid) {
    const f = fixture(t);
    await assert.rejects(runGeminiCliProxySession(build(f)), pattern);
    assert.deepEqual(readdirSync(f.workspaceParentDirectory), []);
    assert.deepEqual(readdirSync(f.privateParentDirectory), []);
  }
  const preAborted = fixture(t);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(runGeminiCliProxySession(args(preAborted, { signal: controller.signal })), /cancelled before startup/);
  assert.deepEqual(readdirSync(preAborted.workspaceParentDirectory), []);
  assert.deepEqual(readdirSync(preAborted.privateParentDirectory), []);
});

test('caller cancellation reaches a stalled proxy startup through the shared signal', async t => {
  const f = fixture(t);
  const originalListen = Server.prototype.listen;
  const originalClose = Server.prototype.close;
  let listenCallback;
  let closeCalls = 0;
  Server.prototype.listen = function (...args) {
    listenCallback = args.at(-1);
    Object.defineProperty(this, 'listening', { configurable: true, get: () => true });
    return this;
  };
  Server.prototype.close = function (callback) {
    closeCalls += 1;
    callback?.();
    return this;
  };
  const controller = new AbortController();
  try {
    const pending = runGeminiCliProxySession(args(f, { timeoutMs: 5000, signal: controller.signal }));
    assert.equal(typeof listenCallback, 'function');
    controller.abort();
    await assert.rejects(pending, /cancelled/);
    assert.equal(closeCalls, 1, 'shared cancellation closes the pending proxy');
    listenCallback();
    assert.equal(closeCalls, 2, 'a late successful bind after cancellation is closed');
    assert.deepEqual(readdirSync(f.workspaceParentDirectory), []);
    assert.deepEqual(readdirSync(f.privateParentDirectory), []);
  } finally {
    Server.prototype.listen = originalListen;
    Server.prototype.close = originalClose;
  }
});

test('shared deadline and caller cancellation fail closed and close both session workspaces and proxy', async t => {
  const timed = fixture(t, 'hang');
  const pending = runGeminiCliProxySession(args(timed, { timeoutMs: 1800 }));
  for (let i = 0; i < 500 && !existsSync(timed.reportPath); i += 1) await delay(10);
  assert.equal(existsSync(timed.reportPath), true);
  const endpoint = JSON.parse(readFileSync(timed.reportPath, 'utf8')).endpoint;
  await assert.rejects(pending, /deadline expired/);
  await assertProxyClosed(endpoint);
  assert.deepEqual(readdirSync(timed.workspaceParentDirectory), []);
  assert.deepEqual(readdirSync(timed.privateParentDirectory), []);

  const cancelled = fixture(t, 'hang');
  const controller = new AbortController();
  const aborting = runGeminiCliProxySession(args(cancelled, { timeoutMs: 5000, signal: controller.signal }));
  for (let i = 0; i < 500 && !existsSync(cancelled.reportPath); i += 1) await delay(10);
  assert.equal(existsSync(cancelled.reportPath), true);
  const cancelledEndpoint = JSON.parse(readFileSync(cancelled.reportPath, 'utf8')).endpoint;
  controller.abort();
  await assert.rejects(aborting, /did not complete successfully/);
  await assertProxyClosed(cancelledEndpoint);
  assert.deepEqual(readdirSync(cancelled.workspaceParentDirectory), []);
  assert.deepEqual(readdirSync(cancelled.privateParentDirectory), []);
});
