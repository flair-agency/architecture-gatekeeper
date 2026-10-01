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
  'OPENAI_API_KEY',
  'GITHUB_TOKEN',
  'GH_TOKEN',
];

/**
 * Builds a clean environment dictionary for the unprivileged runner.
 * Strips all sensitive credentials.
 * @param {NodeJS.ProcessEnv} env
 * @param {string} proxyUrl
 * @returns {Record<string, string>}
 */
export function buildIsolatedRunnerEnv(env, proxyUrl) {
  const cleanEnv = { ...env };
  for (const varName of SENSITIVE_ENV_VARS) {
    delete cleanEnv[varName];
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

  // 2. Start security proxy on loopback
  const proxy = await startGeminiSecurityProxy({
    credentials,
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
