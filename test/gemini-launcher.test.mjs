import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { buildIsolatedRunnerEnv, runIsolatedGeminiSession } from '../dist/gemini-launcher.mjs';

test('buildIsolatedRunnerEnv allowlists operational variables and sets REVIEW_PROXY_URL', () => {
  const dirtyEnv = {
    PATH: '/usr/bin',
    GEMINI_API_KEY: 'super-secret-key',
    CLOUDSDK_AUTH_ACCESS_TOKEN: 'bearer-token-123',
    GOOGLE_OAUTH_ACCESS_TOKEN: 'bearer-token-456',
    GOOGLE_APPLICATION_CREDENTIALS: '/path/to/key.json',
    OPENAI_API_KEY: 'openai-key',
    GITHUB_TOKEN: 'ghp_secret',
    GH_TOKEN: 'gho_secret',
    ACTIONS_ID_TOKEN_REQUEST_URL: 'https://oidc.example.com',
    ACTIONS_ID_TOKEN_REQUEST_TOKEN: 'secret-oidc-renewal-token',
    ACTIONS_RUNTIME_TOKEN: 'runtime-token',
    CUSTOM_VAR: 'keep-me',
  };

  const clean = buildIsolatedRunnerEnv(dirtyEnv, 'http://127.0.0.1:45678');

  assert.equal(clean.PATH, '/usr/bin');
  assert.equal(clean.CUSTOM_VAR, undefined);
  assert.equal(clean.REVIEW_PROXY_URL, 'http://127.0.0.1:45678');
  assert.equal(clean.GEMINI_API_KEY, undefined);
  assert.equal(clean.CLOUDSDK_AUTH_ACCESS_TOKEN, undefined);
  assert.equal(clean.GOOGLE_OAUTH_ACCESS_TOKEN, undefined);
  assert.equal(clean.GOOGLE_APPLICATION_CREDENTIALS, undefined);
  assert.equal(clean.OPENAI_API_KEY, undefined);
  assert.equal(clean.GITHUB_TOKEN, undefined);
  assert.equal(clean.GH_TOKEN, undefined);
  assert.equal(clean.ACTIONS_ID_TOKEN_REQUEST_URL, undefined);
  assert.equal(clean.ACTIONS_ID_TOKEN_REQUEST_TOKEN, undefined);
  assert.equal(clean.ACTIONS_RUNTIME_TOKEN, undefined);
});

test('runIsolatedGeminiSession starts proxy, runs runner in isolated environment, and shuts down proxy', async () => {
  const tmpDir = mkdtempSync(join(tmpdir(), 'gemini-launcher-test-'));

  try {
    // 1. Mock upstream Gemini server
    let capturedSecret = null;
    const mockUpstream = createServer((req, res) => {
      capturedSecret = req.headers['x-goog-api-key'];
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          candidates: [
            {
              finishReason: 'STOP',
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      decision: 'PASS',
                      summary: 'Launcher isolation test passed.',
                      authority: ['architecture-contract'],
                      authorityFiles: ['docs/architecture.md'],
                      authorityIds: ['architecture-contract'],
                      responsibility: ['acceptance'],
                      capabilitySurface: ['CI'],
                      qualityGuarantees: ['credential isolation'],
                      reviewedScope: ['test'],
                      prohibitedChanges: [],
                      gates: {
                        sharedMechanism: {
                          decision: 'PASS',
                          summary: 'ok',
                          consumerOwnership: 'ok',
                          failClosedBehavior: 'ok',
                          compatibility: 'ok',
                          minimality: 'ok',
                        },
                        trustBoundary: {
                          decision: 'PASS',
                          summary: 'ok',
                          tokenPermissions: 'ok',
                          untrustedInputs: 'ok',
                          credentialHandling: 'ok',
                          reportingIsolation: 'ok',
                        },
                      },
                    }),
                  },
                ],
              },
            },
          ],
        })
      );
    });

    await new Promise(resolve => mockUpstream.listen(0, '127.0.0.1', resolve));
    const upstreamPort = mockUpstream.address().port;

    // 2. Prepare test review request files
    const promptPath = join(tmpDir, 'prompt.md');
    const schemaPath = join(tmpDir, 'schema.json');
    const outputPath = join(tmpDir, 'decision.json');

    writeFileSync(promptPath, 'Review this architecture test');
    writeFileSync(
      schemaPath,
      JSON.stringify({
        type: 'object',
        required: ['decision', 'gates'],
        properties: {
          decision: { type: 'string', enum: ['PASS', 'BLOCK', 'OWNER_DECISION'] },
          gates: { type: 'object' },
        },
      })
    );

    // 3. Mock runner script that checks process.env has NO secrets but CAN reach proxy
    const mockRunnerScript = join(tmpDir, 'mock-runner.mjs');
    writeFileSync(
      mockRunnerScript,
      `
import assert from 'node:assert/strict';
import { runGeminiCiReview } from '${join(process.cwd(), 'dist/gemini-ci-runner.mjs')}';

// Verify secrets are NOT inherited
assert.equal(process.env.GEMINI_API_KEY, undefined, 'GEMINI_API_KEY must not be inherited by runner');
assert.equal(process.env.CLOUDSDK_AUTH_ACCESS_TOKEN, undefined, 'CLOUDSDK_AUTH_ACCESS_TOKEN must not be inherited');
assert.ok(process.env.REVIEW_PROXY_URL, 'REVIEW_PROXY_URL must be set');

// Run actual review via proxy
await runGeminiCiReview(process.argv.slice(2));
`
    );

    // 4. Run session with launcher
    const exitCode = await runIsolatedGeminiSession(
      [
        '--prompt',
        promptPath,
        '--schema',
        schemaPath,
        '--output',
        outputPath,
        '--model',
        'gemini-2.5-flash',
        '--reasoning-effort',
        'low',
      ],
      {
        runnerScript: mockRunnerScript,
        credentialsOptions: { apiKey: 'super-launcher-secret-key-999' },
        proxyConfigOverride: {
          upstreamHost: '127.0.0.1',
          upstreamPort,
          upstreamHttp: true,
          allowLoopbackUpstream: true,
        },
      }
    );

    assert.equal(exitCode, 0);

    // 5. Verify upstream received injected credentials
    assert.equal(capturedSecret, 'super-launcher-secret-key-999');

    // 6. Verify decision output was created
    const decision = JSON.parse(readFileSync(outputPath, 'utf8'));
    assert.equal(decision.decision, 'PASS');

    await new Promise(resolve => mockUpstream.close(resolve));
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('launcher pins bearer proxy scope from every supported project and region alias', async () => {
  const saved = { ...process.env };
  const dir = mkdtempSync(join(tmpdir(), 'gemini-launcher-vertex-alias-'));
  const observedPaths = [];
  const upstream = createServer((req, res) => {
    observedPaths.push(req.url);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: '{"decision":"PASS"}' }] } }] }));
  });
  try {
    await new Promise(resolve => upstream.listen(0, '127.0.0.1', resolve));
    const runner = join(dir, 'runner.mjs');
    writeFileSync(runner, `import { runGeminiReviewer } from '${join(process.cwd(), 'dist/gemini-transport.mjs')}';
const result = await runGeminiReviewer({ prompt: 'scope', schema: { type: 'object' }, reviewer: { model: 'gemini-2.5-flash', reasoningEffort: 'low' } });
if (result.decision !== 'PASS') process.exit(2);
`);
    for (const [projectVariable, project] of [['CLOUDSDK_PROJECT', 'cloudsdk-project'], ['GCP_PROJECT', 'gcp-project']]) {
      process.env = { ...saved };
      for (const name of ['GOOGLE_CLOUD_PROJECT', 'CLOUDSDK_CORE_PROJECT', 'CLOUDSDK_PROJECT', 'GCP_PROJECT', 'GOOGLE_CLOUD_REGION', 'CLOUDSDK_COMPUTE_REGION']) delete process.env[name];
      process.env[projectVariable] = project;
      process.env.CLOUDSDK_COMPUTE_REGION = 'asia-northeast1';
      const code = await runIsolatedGeminiSession(['--model', 'gemini-2.5-flash'], {
        runnerScript: runner,
        credentialsOptions: { accessToken: 'launcher-bearer-token' },
        proxyConfigOverride: { upstreamHost: '127.0.0.1', upstreamPort: upstream.address().port, upstreamHttp: true, allowLoopbackUpstream: true },
      });
      assert.equal(code, 0);
      assert.equal(observedPaths.at(-1), `/v1/projects/${project}/locations/asia-northeast1/publishers/google/models/gemini-2.5-flash:generateContent`);
    }
  } finally {
    process.env = saved;
    await new Promise(resolve => upstream.close(resolve));
    rmSync(dir, { recursive: true, force: true });
  }
});

test('runIsolatedGeminiSession strips credential arguments from runner child process', async () => {
  const tmpDir = mkdtempSync(join(tmpdir(), 'gemini-launcher-args-'));
  try {
    const mockRunnerScript = join(tmpDir, 'check-args-runner.mjs');
    writeFileSync(
      mockRunnerScript,
      `
import assert from 'node:assert/strict';
const args = process.argv.slice(2);
assert.ok(!args.some(arg => arg.includes('secret-api-key')), 'secret api key must not be passed to child args');
assert.ok(!args.some(arg => arg.includes('secret-access-token')), 'secret access token must not be passed to child args');
assert.ok(!args.includes('--api-key'), '--api-key must not be in child args');
assert.ok(!args.includes('--access-token'), '--access-token must not be in child args');
process.exit(0);
`
    );

    const exitCode = await runIsolatedGeminiSession(
      [
        '--api-key', 'secret-api-key-123',
        '--access-token=secret-access-token-456',
        '--model', 'gemini-2.5-flash',
      ],
      {
        runnerScript: mockRunnerScript,
        proxyConfigOverride: {
          upstreamHost: '127.0.0.1',
          upstreamPort: 80,
          allowLoopbackUpstream: true,
        },
      }
    );

    assert.equal(exitCode, 0);
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('runIsolatedGeminiSession requires complete scope before starting the proxy', async () => {
  await assert.rejects(
    runIsolatedGeminiSession([], {
      credentialsOptions: { apiKey: 'key' },
    }),
    /Complete review scope required before starting security proxy: missing allowedModel/
  );
});

test('proxyConfigOverride cannot erase or bypass required scope in runIsolatedGeminiSession', async () => {
  await assert.rejects(
    runIsolatedGeminiSession(
      ['--model', 'gemini-2.5-flash'],
      {
        credentialsOptions: { apiKey: 'key' },
        proxyConfigOverride: { allowedModel: null },
      }
    ),
    /Complete review scope required before starting security proxy: missing allowedModel/
  );

  // Overriding mode to incompatible credential capability must fail closed
  await assert.rejects(
    runIsolatedGeminiSession(
      ['--model', 'gemini-2.5-flash'],
      {
        credentialsOptions: { accessToken: 'token' },
        proxyConfigOverride: { allowedMode: 'studio' },
      }
    ),
    /bearer credentials require mode "vertex"/
  );

  // Overriding mode with apiKey to incompatible mode or erased mode must fail closed
  await assert.rejects(
    runIsolatedGeminiSession(
      ['--model', 'gemini-2.5-flash'],
      {
        credentialsOptions: { apiKey: 'my-key' },
        proxyConfigOverride: { allowedMode: 'vertex' },
      }
    ),
    /API key credentials require mode "studio"/
  );
  await assert.rejects(
    runIsolatedGeminiSession(
      ['--model', 'gemini-2.5-flash'],
      {
        credentialsOptions: { apiKey: 'my-key' },
        proxyConfigOverride: { allowedMode: null },
      }
    ),
    /API key credentials require mode "studio"/
  );

  // Missing or erased allowedRegion in Vertex mode must fail closed
  await assert.rejects(
    runIsolatedGeminiSession(
      ['--model', 'gemini-2.5-flash', '--project', 'my-proj'],
      {
        credentialsOptions: { accessToken: 'token' },
        proxyConfigOverride: { allowedRegion: '' },
      }
    ),
    /missing allowedRegion for Vertex mode/
  );
});


test('isolated environment filters mixed-case credential and renewal selectors', () => {
  const filtered = buildIsolatedRunnerEnv({ gemini_api_key: 'secret', Google_Application_Credentials: '/secret', cloudSDK_auth_credential_file_override: '/secret', google_GHA_creds_path: '/secret', actions_id_token_request_token: 'secret', PATH: '/bin' }, 'http://127.0.0.1:1234');
  assert.deepEqual(filtered, { PATH: '/bin', REVIEW_PROXY_URL: 'http://127.0.0.1:1234' });
});

test('isolated sessions never invoke gcloud credential fallback', async () => {
  const saved = { ...process.env };
  let calls = 0;
  try {
    for (const key of ['GEMINI_API_KEY', 'CLOUDSDK_AUTH_ACCESS_TOKEN', 'GOOGLE_OAUTH_ACCESS_TOKEN']) delete process.env[key];
    await assert.rejects(runIsolatedGeminiSession(['--model', 'gemini-2.5-flash'], { credentialsOptions: { resolveGcloudAccessToken: () => { calls++; return 'renewable-token'; } } }), /No credentials found/);
    assert.equal(calls, 0);
  } finally { process.env = saved; }
});

// Requirement: the total session deadline includes startup. No fixture readiness
// is required here; process-group escalation is tested separately after readiness.
test('launcher expires the total session deadline even before fixture readiness', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'gemini-launcher-deadline-'));
  const fixture = fileURLToPath(new URL('./fixtures/gemini-supervision.mjs', import.meta.url));
  try {
    const started = Date.now();
    assert.equal(await runIsolatedGeminiSession(['hang', join(dir, 'state.json'), '--model', 'gemini-2.5-flash'], { timeoutMs: 400, runnerScript: fixture, credentialsOptions: { apiKey: 'supervision-credential-sentinel' } }), 124);
    assert.ok(Date.now() - started < 5000);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// Requirement: escalation must survive direct-child exit. Synchronize on the
// descendant marker before stopping, rather than assuming Node starts in 600ms.
test('supervisor escalation survives direct child exit and stops its ready descendant', { skip: process.platform === 'win32' }, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'gemini-descendant-'));
  let supervisor;
  try {
    const state = join(dir, 'descendant.pid');
    const fixture = fileURLToPath(new URL('./fixtures/gemini-supervision.mjs', import.meta.url));
    supervisor = spawn(process.execPath, [fixture, 'supervisor-parent', state], { stdio: 'ignore' });
    const closed = new Promise((resolve, reject) => { supervisor.once('close', resolve); supervisor.once('error', reject); });
    const deadline = Date.now() + 8000;
    while (!existsSync(state) && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 20));
    assert.ok(existsSync(state), 'descendant readiness not observed within startup bound');
    supervisor.kill('SIGTERM');
    assert.equal(await closed, 143);
    const pid = Number(readFileSync(state));
    const status = spawnSync('ps', ['-o', 'stat=', '-p', String(pid)], { encoding: 'utf8' });
    assert.ok(status.status !== 0 || !status.stdout.trim() || status.stdout.trim().startsWith('Z'), `Descendant still running: ${status.stdout}`);
  } finally { supervisor?.kill('SIGKILL'); rmSync(dir, { recursive: true, force: true }); }
});

test('supervisor termination is forwarded to a detached runner', { skip: process.platform === 'win32' }, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'gemini-supervisor-signal-'));
  let supervisor;
  try {
    const state = join(dir, 'child.pid');
    const fixture = fileURLToPath(new URL('./fixtures/gemini-supervision.mjs', import.meta.url));
    supervisor = spawn(process.execPath, [fixture, 'supervisor', state], { stdio:'ignore' });
    const closed = new Promise((resolve,reject) => { supervisor.once('close',resolve); supervisor.once('error',reject); });
    const deadline = Date.now()+4000;
    while (!existsSync(state) && Date.now()<deadline) await new Promise(resolve=>setTimeout(resolve,20));
    assert.ok(existsSync(state));
    supervisor.kill('SIGTERM');
    assert.equal(await closed,143);
    const observed = JSON.parse(readFileSync(state));
    assert.throws(() => process.kill(observed.pid, 0), /ESRCH/);
    const observedEndpoint = new URL(observed.proxy);
    assert.equal(observedEndpoint.hostname, '127.0.0.1');
    const endpoint = new URL('http://127.0.0.1');
    endpoint.port = observedEndpoint.port;
    await assert.rejects(fetch(endpoint));
  } finally { supervisor?.kill('SIGKILL'); rmSync(dir,{recursive:true,force:true}); }
});


test('missing credential values reject before consuming adjacent flags', async () => {
  for (const args of [['--api-key','--access-token','secret'], ['--access-token','--model','gemini-2.5-flash'], ['--api-key'], ['--access-token='], ['--api-key', '   '], ['--access-token', '   ']]) {
    await assert.rejects(runIsolatedGeminiSession(args), /Missing .*credential value/);
  }
});

test('launcher rejects credentials repeated in forwarded arguments before proxy allocation', async () => {
  await assert.rejects(
    runIsolatedGeminiSession(['--api-key=first-cli-secret', '--api-key=selected-cli-secret', '--payload', 'first-cli-secret', '--model', 'gemini-2.5-flash']),
    /Runner arguments contain a provider credential/
  );
});

test('spawned runner receives EOF on stdin even when supervisor stdin contains secret bytes', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'gemini-launcher-stdin-'));
  const runner = join(dir, 'stdin-runner.mjs');
  const supervisor = join(dir, 'supervisor.mjs');
  try {
    writeFileSync(runner, `let byteCount = 0; for await (const chunk of process.stdin) byteCount += chunk.length; if (byteCount !== 0) process.exit(42);`);
  writeFileSync(supervisor, `import { runIsolatedGeminiSession } from '${join(process.cwd(), 'dist/gemini-launcher.mjs')}';\nprocess.exit(await runIsolatedGeminiSession(['--model', 'gemini-2.5-flash'], { runnerScript: process.argv[2], credentialsOptions: { apiKey: 'stdin-fixture-key' } }));\n`);
    const child = spawn(process.execPath, [supervisor, runner], { stdio: ['pipe', 'ignore', 'pipe'] });
    const closed = new Promise((resolve, reject) => { child.once('close', (code, signal) => resolve({ code, signal })); child.once('error', reject); });
    child.stdin.end('supervisor-secret-renewal-handle');
    const result = await closed;
    assert.deepEqual(result, { code: 0, signal: null });
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('credential aliases are withheld even with unrelated authentication selected', () => {
  const env = buildIsolatedRunnerEnv({ GOOGLE_API_KEY: 'sentinel', google_api_key: 'sentinel', GEMINI_API_KEY: 'sentinel', CLOUDSDK_AUTH_ACCESS_TOKEN: 'sentinel', PATH: '/bin' }, 'http://127.0.0.1:1234');
  assert.deepEqual(env, { PATH: '/bin', REVIEW_PROXY_URL: 'http://127.0.0.1:1234' });
});

test('launcher rejects an unselected source credential embedded in an operational input', async () => {
  const saved = { ...process.env };
  try {
    for (const [name, value, operational] of [
      ['CLOUDSDK_AUTH_ACCESS_TOKEN', ' unused-cloudsdk-token ', 'unused-cloudsdk-token'],
      ['GOOGLE_OAUTH_ACCESS_TOKEN', 'unused-oauth-token', 'unused-oauth-token'],
      ['GEMINI_API_KEY', 'unused-gemini-key', 'unused-gemini-key'],
      ['GOOGLE_API_KEY', ' unused-google-key ', 'unused-google-key'],
    ]) {
      process.env = { ...saved, [name]: value, OUTPUT_PATH: `/runner/${operational}/output` };
      await assert.rejects(
        runIsolatedGeminiSession(['--model', 'gemini-2.5-flash'], { credentialsOptions: { apiKey: 'selected-studio-key' } }),
        /operational input contains a provider credential/
      );
    }

    process.env = { ...saved, CLOUDSDK_AUTH_ACCESS_TOKEN: '', GOOGLE_OAUTH_ACCESS_TOKEN: 'selected-oauth-token', GEMINI_API_KEY: 'unselected-studio-key', OUTPUT_PATH: '/runner/unselected-studio-key/output' };
    await assert.rejects(
      runIsolatedGeminiSession(['--model', 'gemini-2.5-flash', '--project', 'fixture-project']),
      /operational input contains a provider credential/
    );
  } finally { process.env = saved; }
});


test('isolated launcher rejects endpoint overrides before authentication or spawning', async () => {
  for (const args of [['--proxy-url', 'http://127.0.0.1:1'], ['--proxy-url=http://127.0.0.1:1'], ['--base-url', 'https://example.com'], ['--base-url=https://example.com']]) {
    await assert.rejects(runIsolatedGeminiSession(args), /prohibit endpoint overrides/);
  }
});

test('runner environment rejects caller-named credentials and credential-valued operational inputs', () => {
  const clean = buildIsolatedRunnerEnv({ PATH: '/bin', INPUT_API_KEY: 'key-sentinel', VERTEX_ACCESS_TOKEN: 'token-sentinel', REVIEW_API_KEY: 'key-sentinel', GITHUB_CUSTOM_SECRET: 'key-sentinel', GITHUB_OUTPUT: '/runner/set_output', RUNNER_TEMP: '/runner/temp', NODE_OPTIONS: '--import=/attacker.mjs' }, 'http://127.0.0.1:1234', ['key-sentinel', 'token-sentinel']);
  assert.deepEqual(clean, { PATH: '/bin', GITHUB_OUTPUT: '/runner/set_output', RUNNER_TEMP: '/runner/temp', REVIEW_PROXY_URL: 'http://127.0.0.1:1234' });
  assert.throws(() => buildIsolatedRunnerEnv({ GITHUB_OUTPUT: '/runner/key-sentinel/output' }, 'http://127.0.0.1:1234', ['key-sentinel']), /operational input contains/);
});

test('actual runner child inherits no caller-named CLI or options credentials', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'gemini-credential-alias-'));
  const saved = { ...process.env };
  try {
    const runner = join(dir, 'runner.mjs');
    writeFileSync(runner, `import assert from 'node:assert/strict';
for (const name of ['INPUT_API_KEY', 'VERTEX_ACCESS_TOKEN', 'REVIEW_API_KEY', 'CUSTOM_SECRET', 'NODE_OPTIONS']) assert.equal(process.env[name], undefined);
assert.ok(!process.argv.some(value => value.includes('alias-secret')));
assert.ok(process.env.REVIEW_PROXY_URL);
`);
    process.env.INPUT_API_KEY = 'alias-secret-api';
    process.env.VERTEX_ACCESS_TOKEN = 'alias-secret-token';
    process.env.REVIEW_API_KEY = 'alias-secret-api';
    process.env.CUSTOM_SECRET = 'alias-secret-other';
    for (const configuration of [
      { args: ['--api-key', process.env.INPUT_API_KEY], credentialsOptions: {} },
      { args: ['--access-token', process.env.VERTEX_ACCESS_TOKEN], credentialsOptions: {} },
      { args: [], credentialsOptions: { apiKey: process.env.REVIEW_API_KEY } },
    ]) {
      assert.equal(await runIsolatedGeminiSession([...configuration.args, '--model', 'gemini-2.5-flash', '--project', 'fixture-project'], { runnerScript: runner, credentialsOptions: configuration.credentialsOptions }), 0);
    }
  } finally { process.env = saved; rmSync(dir, { recursive: true, force: true }); }
});
