import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { buildIsolatedRunnerEnv, runIsolatedGeminiSession } from '../src/gemini-launcher.mjs';

test('buildIsolatedRunnerEnv strips sensitive variables and sets REVIEW_PROXY_URL', () => {
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
  assert.equal(clean.CUSTOM_VAR, 'keep-me');
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
import { runGeminiCiReview } from '${join(process.cwd(), 'src/gemini-ci-runner.mjs')}';

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
