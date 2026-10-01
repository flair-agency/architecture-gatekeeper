#!/usr/bin/env node
/**
 * src/gemini-launcher.mjs
 * Trusted Launcher and Supervisor for Gemini CI review execution.
 * Zero external npm dependencies: uses node:child_process and node:path.
 *
 * Implements the security contract specified in:
 * - docs/architecture.md (Target multi-provider credential-isolated review proxy boundary)
 * - docs/investigations/2026-10-02-credential-isolated-review-proxy-boundary.md
 *
 * Topology:
 * 1. Trusted Launcher runs in privileged CI environment with access to secrets (GEMINI_API_KEY / CLOUDSDK_AUTH_ACCESS_TOKEN).
 * 2. Starts GeminiSecurityProxy on local loopback (127.0.0.1:<ephemeral>).
 * 3. Strips all provider secrets from environment (env -u equivalent).
 * 4. Spawns gemini-ci-runner child process with only REVIEW_PROXY_URL and unprivileged arguments.
 * 5. Waits for runner exit, shuts down proxy, and forwards runner exit code.
 */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { realpathSync } from 'node:fs';
import { startGeminiSecurityProxy } from './gemini-security-proxy.mjs';
import { resolveAuthCredentials } from './gemini-transport.mjs';

const SENSITIVE_ENV_VARS = [
  'GEMINI_API_KEY',
  'CLOUDSDK_AUTH_ACCESS_TOKEN',
  'GOOGLE_OAUTH_ACCESS_TOKEN',
  'GOOGLE_APPLICATION_CREDENTIALS',
  'OPENAI_API_KEY',
  'GITHUB_TOKEN',
  'GH_TOKEN',
  'ACTIONS_ID_TOKEN_REQUEST_URL',
  'ACTIONS_ID_TOKEN_REQUEST_TOKEN',
  'ACTIONS_RUNTIME_TOKEN',
  'ACTIONS_RESULTS_URL',
  'ACTIONS_CACHE_URL',
];

/**
 * Builds a clean environment dictionary for the unprivileged runner.
 * Strips all sensitive credentials, OIDC tokens, and credential-file access.
 * @param {NodeJS.ProcessEnv} env
 * @param {string} proxyUrl
 * @returns {Record<string, string>}
 */
export function buildIsolatedRunnerEnv(env, proxyUrl) {
  const cleanEnv = {};
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) continue;
    if (SENSITIVE_ENV_VARS.includes(key)) continue;
    if (key.startsWith('ACTIONS_ID_TOKEN_') || key.startsWith('GOOGLE_APPLICATION_CREDENTIALS')) continue;
    cleanEnv[key] = value;
  }
  cleanEnv.REVIEW_PROXY_URL = proxyUrl;
  return cleanEnv;
}

/**
 * Executes a credential-isolated Gemini review session.
 * @param {string[]} runnerArgv Arguments to pass directly to gemini-ci-runner
 * @param {object} [options]
 * @param {string} [options.runnerScript] Path to runner script (defaults to src/gemini-ci-runner.mjs)
 * @param {object} [options.proxyConfigOverride]
 * @returns {Promise<number>} Exit code of runner process
 */
export async function runIsolatedGeminiSession(runnerArgv = process.argv.slice(2), options = {}) {
  // 1. Resolve credentials in the privileged supervisor context
  const credentials = resolveAuthCredentials(options.credentialsOptions || {});

  // Derive trusted scope constraints from supervisor environment and arguments
  let allowedModel = null;
  let allowedProject = null;
  let allowedRegion = null;
  for (let i = 0; i < runnerArgv.length; i++) {
    const arg = runnerArgv[i];
    if (arg === '--model' && i + 1 < runnerArgv.length) allowedModel = runnerArgv[i + 1];
    if (arg.startsWith('--model=')) allowedModel = arg.slice(8);
    if (arg === '--project' && i + 1 < runnerArgv.length) allowedProject = runnerArgv[i + 1];
    if (arg.startsWith('--project=')) allowedProject = arg.slice(10);
    if (arg === '--region' && i + 1 < runnerArgv.length) allowedRegion = runnerArgv[i + 1];
    if (arg.startsWith('--region=')) allowedRegion = arg.slice(9);
  }
  allowedModel = allowedModel || process.env.MODEL || process.env.REVIEW_MODEL || null;
  allowedProject = allowedProject || process.env.GOOGLE_CLOUD_PROJECT || process.env.CLOUDSDK_CORE_PROJECT || null;
  allowedRegion = allowedRegion || process.env.GOOGLE_CLOUD_REGION || 'us-central1';

  const allowedMode = credentials.type === 'bearer' ? 'vertex' : 'studio';

  // 2. Start security proxy on loopback with trusted scope constraints
  const proxy = await startGeminiSecurityProxy({
    credentials,
    allowedMode,
    allowedModel,
    allowedProject,
    allowedRegion,
    ...options.proxyConfigOverride,
  });

  process.stderr.write(`[gemini-launcher] Security proxy active on ${proxy.endpointUrl}\n`);

  // 3. Prepare clean environment for runner
  const runnerEnv = buildIsolatedRunnerEnv(process.env, proxy.endpointUrl);

  const runnerPath = options.runnerScript || resolve(dirname(fileURLToPath(import.meta.url)), 'gemini-ci-runner.mjs');

  // 4. Spawn runner process
  const child = spawn(process.execPath, [runnerPath, ...runnerArgv], {
    env: runnerEnv,
    stdio: 'inherit',
  });

  return new Promise((resolveSession, rejectSession) => {
    child.on('error', async (err) => {
      try {
        await proxy.shutdown();
      } catch {
        // ignore shutdown error
      }
      rejectSession(err);
    });

    child.on('close', async (code) => {
      try {
        await proxy.shutdown();
      } catch (err) {
        process.stderr.write(`[gemini-launcher] Warning during proxy shutdown: ${err.message}\n`);
      }
      process.stderr.write(`[gemini-launcher] Review runner completed with exit code ${code}\n`);
      resolveSession(code ?? 1);
    });
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === realpathSync(process.argv[1])) {
  runIsolatedGeminiSession()
    .then((exitCode) => {
      process.exit(exitCode);
    })
    .catch((error) => {
      process.stderr.write(`[gemini-launcher] FATAL: ${error.message}\n`);
      process.exit(1);
    });
}
