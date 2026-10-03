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
 * 3. Constructs the child environment from an explicit operational allowlist.
 * 4. Spawns gemini-ci-runner child process with only REVIEW_PROXY_URL and unprivileged arguments.
 * 5. Waits for runner exit, shuts down proxy, and forwards runner exit code.
 */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { existsSync, lstatSync, readFileSync, realpathSync } from 'node:fs';
import { startGeminiSecurityProxy } from './gemini-security-proxy.mjs';
import { getSupportedEnvironmentCredentialValues, resolveAuthCredentials, resolveVertexProject, resolveVertexRegion } from './gemini-transport.mjs';
import { resolveSafePath } from './review-input-path.mjs';

// Forward only the operational inputs consumed by this runner. Names that merely
// look like GitHub/Google variables are not trusted or forwarded as a group.
const RUNNER_ENV_NAMES = new Set([
  'PATH', 'SYSTEMROOT', 'WINDIR', 'COMSPEC', 'PATHEXT',
  'TMPDIR', 'TMP', 'TEMP', 'LANG', 'LC_ALL', 'LC_CTYPE', 'TZ',
  'GITHUB_OUTPUT', 'GITHUB_WORKSPACE', 'RUNNER_TEMP',
  'PROMPT_PATH', 'SCHEMA_PATH', 'OUTPUT_PATH', 'MODEL', 'REVIEW_MODEL',
  'REVIEWER_PROVIDER', 'EFFORT', 'THINKING_BUDGET', 'TIMEOUT_MS',
  'GOOGLE_CLOUD_PROJECT', 'CLOUDSDK_CORE_PROJECT', 'CLOUDSDK_PROJECT',
  'GCP_PROJECT', 'GOOGLE_CLOUD_REGION', 'CLOUDSDK_COMPUTE_REGION',
]);

/** Construct the runner environment from explicit operational names only. */
export function buildIsolatedRunnerEnv(env, proxyUrl, credentialValues = []) {
  const cleanEnv = {};
  for (const [key, value] of Object.entries(env)) {
    if (typeof value !== 'string' || !RUNNER_ENV_NAMES.has(key.toUpperCase())) continue;
    // Even an operational variable must not contain a supplied credential.
    if (credentialValues.some(secret => typeof secret === 'string' && secret.length > 0 && value.includes(secret))) {
      throw new Error('A runner operational input contains a provider credential.');
    }
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
  // 1. Consume credential options: filter credentials out of runner arguments so secrets never appear on child command line
  let cliApiKey = null;
  let cliAccessToken = null;
  const cliCredentialValues = [];
  const filteredRunnerArgv = [];

  const startedAt = Date.now();
  let selectedTimeoutMs = null;
  let requestJsonPath = null;
  let allowedModel = null;
  let allowedProject = null;
  let allowedRegion = null;

  for (let i = 0; i < runnerArgv.length; i++) {
    const arg = runnerArgv[i];
    if (arg === '--proxy-url' || arg.startsWith('--proxy-url=') || arg === '--base-url' || arg.startsWith('--base-url=')) {
      throw new Error('Isolated sessions prohibit endpoint overrides; the launcher selects the proxy.');
    }
    if (arg === '--api-key' && (!runnerArgv[i + 1]?.trim() || runnerArgv[i + 1].startsWith('--'))) throw new Error('Missing --api-key credential value.');
    if (arg === '--access-token' && (!runnerArgv[i + 1]?.trim() || runnerArgv[i + 1].startsWith('--'))) throw new Error('Missing --access-token credential value.');
    if (arg === '--api-key' && i + 1 < runnerArgv.length) {
      cliApiKey = runnerArgv[++i];
      cliCredentialValues.push(cliApiKey);
      continue;
    }
    if (arg.startsWith('--api-key=')) {
      cliApiKey = arg.slice(10);
      if (!cliApiKey.trim()) throw new Error('Missing --api-key credential value.');
      cliCredentialValues.push(cliApiKey);
      continue;
    }
    if (arg === '--access-token' && i + 1 < runnerArgv.length) {
      cliAccessToken = runnerArgv[++i];
      cliCredentialValues.push(cliAccessToken);
      continue;
    }
    if (arg.startsWith('--access-token=')) {
      cliAccessToken = arg.slice(15);
      if (!cliAccessToken.trim()) throw new Error('Missing --access-token credential value.');
      cliCredentialValues.push(cliAccessToken);
      continue;
    }

    if (arg === '--request-json' && i + 1 < runnerArgv.length) {
      requestJsonPath = runnerArgv[i + 1];
    } else if (arg.startsWith('--request-json=')) {
      requestJsonPath = arg.slice(15);
    }

    if (arg === '--timeout' && i + 1 < runnerArgv.length) selectedTimeoutMs = Number(runnerArgv[i + 1]);
    if (arg.startsWith('--timeout=')) selectedTimeoutMs = Number(arg.slice(10));

    if (arg === '--model' && i + 1 < runnerArgv.length) allowedModel = runnerArgv[i + 1];
    if (arg.startsWith('--model=')) allowedModel = arg.slice(8);
    if (arg === '--project' && i + 1 < runnerArgv.length) allowedProject = runnerArgv[i + 1];
    if (arg.startsWith('--project=')) allowedProject = arg.slice(10);
    if (arg === '--region' && i + 1 < runnerArgv.length) allowedRegion = runnerArgv[i + 1];
    if (arg.startsWith('--region=')) allowedRegion = arg.slice(9);

    filteredRunnerArgv.push(arg);
  }

  // If request-json is provided, inspect it to derive reviewer scope before startup
  if (requestJsonPath) {
    const resolvedPath = resolveSafePath(requestJsonPath, process.cwd());
    if (existsSync(resolvedPath)) {
      if (!lstatSync(resolvedPath).isFile()) throw new Error('Review request must be a regular file.');
      try {
        const reqData = JSON.parse(readFileSync(resolvedPath, 'utf8'));
        if (reqData?.reviewer?.reviewTimeoutMs !== undefined) {
          const recorded = reqData.reviewer.reviewTimeoutMs;
          if (!Number.isInteger(recorded) || recorded < 1 || recorded > 3600000) throw new Error('Invalid recorded session deadline.');
          selectedTimeoutMs = selectedTimeoutMs === null ? recorded : Math.min(selectedTimeoutMs, recorded);
        }
        if (reqData?.reviewer?.model && !allowedModel) {
          allowedModel = reqData.reviewer.model;
        }
      } catch (error) { throw new Error(`Invalid review request: ${error.message}`); }
    }
  }

  const sessionTimeoutMs = options.timeoutMs ?? selectedTimeoutMs ?? Number(process.env.TIMEOUT_MS || 120000);
  if (!Number.isInteger(sessionTimeoutMs) || sessionTimeoutMs < 1 || sessionTimeoutMs > 3600000 ||
      (selectedTimeoutMs !== null && sessionTimeoutMs > selectedTimeoutMs)) throw new Error('Launcher requires a bounded session deadline that does not extend selected timeout.');

  // Derive trusted scope constraints
  allowedModel = allowedModel || process.env.MODEL || process.env.REVIEW_MODEL || null;
  allowedProject = resolveVertexProject({ projectId: allowedProject });
  allowedRegion = resolveVertexRegion({ region: allowedRegion });

  // Resolve credentials in the privileged supervisor context
  const credsOptions = { ...options.credentialsOptions };
  if (cliAccessToken) credsOptions.accessToken = cliAccessToken;
  if (cliApiKey) credsOptions.apiKey = cliApiKey;
  const credentials = resolveAuthCredentials({ ...credsOptions, resolveGcloudAccessToken: () => null });
  const allowedMode = credentials.type === 'bearer' ? 'vertex' : 'studio';
  const runnerPath = options.runnerScript || resolve(dirname(fileURLToPath(import.meta.url)), 'gemini-ci-runner.mjs');
  const credentialValues = [
    ...getSupportedEnvironmentCredentialValues(process.env),
    credentials.value,
    credsOptions.apiKey,
    credsOptions.accessToken,
    options.credentialsOptions?.apiKey,
    options.credentialsOptions?.accessToken,
    ...cliCredentialValues,
  ].filter(value => typeof value === 'string' && value.length > 0)
    .flatMap(value => [value, value.trim()]).filter(Boolean);
  const leakedCredentialArg = [runnerPath, ...filteredRunnerArgv].some(arg =>
    credentialValues.some(secret => [secret, secret.trim()].some(value => value.length > 0 && arg.includes(value)))
  );
  if (leakedCredentialArg) throw new Error('Runner arguments contain a provider credential.');

  // 2. Start security proxy on loopback with trusted scope constraints
  // Ensure proxyConfigOverride cannot erase or bypass required scope
  const override = options.proxyConfigOverride || {};
  const effectiveProxyConfig = {
    ...override,
    credentials,
    allowedMode: 'allowedMode' in override ? (override.allowedMode ? String(override.allowedMode).trim() : null) : allowedMode,
    allowedModel: 'allowedModel' in override ? (override.allowedModel ? String(override.allowedModel).trim() : null) : (allowedModel || null),
    allowedProject: 'allowedProject' in override ? (override.allowedProject ? String(override.allowedProject).trim() : null) : (allowedProject || null),
    allowedRegion: 'allowedRegion' in override ? (override.allowedRegion ? String(override.allowedRegion).trim() : null) : (allowedRegion || null),
  };

  // Validate the final effective configuration before starting the proxy (fail-closed if scope is missing, invalid, or erased)
  if (!effectiveProxyConfig.allowedModel) {
    throw new Error('Complete review scope required before starting security proxy: missing allowedModel.');
  }

  // Validate effective mode against credential capability
  if (credentials.type === 'bearer' && effectiveProxyConfig.allowedMode !== 'vertex') {
    throw new Error('Complete review scope required before starting security proxy: bearer credentials require mode "vertex".');
  }
  if (credentials.type === 'apiKey' && effectiveProxyConfig.allowedMode !== 'studio') {
    throw new Error('Complete review scope required before starting security proxy: API key credentials require mode "studio".');
  }

  if (effectiveProxyConfig.allowedMode === 'vertex') {
    if (!effectiveProxyConfig.allowedProject) {
      throw new Error('Complete review scope required before starting security proxy: missing allowedProject for Vertex mode.');
    }
    if (!effectiveProxyConfig.allowedRegion) {
      throw new Error('Complete review scope required before starting security proxy: missing allowedRegion for Vertex mode.');
    }
  }

  const remainingMs = sessionTimeoutMs - (Date.now() - startedAt);
  if (remainingMs <= 0) throw new Error('Gemini session deadline expired before startup.');
  effectiveProxyConfig.deadlineMs = remainingMs;
  // Validate environment isolation before allocating the proxy listener.
  const runnerEnv = buildIsolatedRunnerEnv(process.env, '', credentialValues);
  const proxy = await startGeminiSecurityProxy(effectiveProxyConfig);

  process.stderr.write(`[gemini-launcher] Security proxy active on ${proxy.endpointUrl}\n`);

  // 3. Prepare clean environment for runner
  runnerEnv.REVIEW_PROXY_URL = proxy.endpointUrl;
  runnerEnv.REVIEW_PROXY_MODE = effectiveProxyConfig.allowedMode;

  // 4. Spawn runner process with sanitized arguments (no credentials forwarded)
  const child = spawn(process.execPath, [runnerPath, ...filteredRunnerArgv], {
    env: runnerEnv,
    stdio: ['ignore', 'inherit', 'inherit'],
    detached: process.platform !== 'win32',
  });

  return new Promise((resolveSession, rejectSession) => {
    let stoppedCode = null;
    let stopCompletion = null;
    const terminate = signal => {
      try {
        if (process.platform !== 'win32' && child.pid) process.kill(-child.pid, signal);
        else child.kill(signal);
      } catch (error) { if (error.code !== 'ESRCH') child.kill(signal); }
    };
    const stop = (signal, code) => {
      if (stopCompletion) return;
      stoppedCode = code;
      void proxy.shutdown();
      terminate(signal);
      // Keep group escalation even if the direct child exits during the grace period.
      stopCompletion = new Promise(resolveStop => setTimeout(() => {
        terminate('SIGKILL');
        resolveStop();
      }, 250));
    };
    const onInterrupt = () => stop('SIGINT', 130);
    const onTerminate = () => stop('SIGTERM', 143);
    process.once('SIGINT', onInterrupt);
    process.once('SIGTERM', onTerminate);
    const timer = setTimeout(() => stop('SIGTERM', 124), Math.max(1, sessionTimeoutMs - (Date.now() - startedAt)));
    let finishing = false;
    const finish = async (code, error) => {
      if (finishing) return;
      finishing = true;
      clearTimeout(timer);
      if (stopCompletion) await stopCompletion;
      process.removeListener('SIGINT', onInterrupt);
      process.removeListener('SIGTERM', onTerminate);
      await proxy.shutdown();
      if (error) rejectSession(error);
      else resolveSession(stoppedCode ?? code ?? 1);
    };
    child.once('error', error => { void finish(null, error); });
    child.once('close', code => { void finish(code); });
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === realpathSync(process.argv[1])) {
  runIsolatedGeminiSession()
    .then((exitCode) => {
      process.exit(exitCode);
    })
    .catch((error) => {
      process.stderr.write(`[gemini-launcher] FATAL: ${error.message}\n`);
      process.stderr.write(`usage: gemini-ci-runner --prompt <file> --schema <file> [--output <file>] [--model <model>] [--effort <effort>]\n`);
      process.exit(1);
    });
}
