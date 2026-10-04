/** Parent-owned composition of the internal Vertex proxy and Gemini CLI session. */
import { remainingDeadlineMs, startGeminiSecurityProxy } from './gemini-security-proxy.mjs';
import { runGeminiCliSession } from './gemini-cli-session.mjs';

const OPTION_KEYS = new Set([
  'cliEntrypoint', 'privateParentDirectory', 'prompt', 'model', 'thinkingBudget', 'thinkingLevel',
  'project', 'region', 'timeoutMs', 'maxPromptBytes', 'maxStdoutBytes', 'maxStderrBytes', 'signal',
]);
const INPUT_KEYS = new Set(['packet', 'workspaceLimits', 'workspaceParentDirectory', 'processOptions', 'credentials']);
const MAX_SESSION_TIMEOUT_MS = 60 * 60 * 1000;

function validateInput(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(key => !INPUT_KEYS.has(key))) {
    throw new Error('Gemini CLI proxy session received unsupported input.');
  }
  const { processOptions, credentials } = input;
  if (!processOptions || typeof processOptions !== 'object' || Array.isArray(processOptions) ||
      Object.keys(processOptions).some(key => !OPTION_KEYS.has(key))) {
    throw new Error('Gemini CLI proxy session requires fixed process options and does not accept proxy overrides.');
  }
  if (Object.keys(credentials ?? {}).length !== 2 || credentials?.type !== 'bearer' ||
      typeof credentials.value !== 'string' || !credentials.value) {
    throw new Error('Gemini CLI proxy session requires explicit parent-only bearer credentials.');
  }
  const { model, project, region, timeoutMs } = processOptions;
  const scopeName = /^[A-Za-z0-9._-]+$/;
  if (![model, project, region].every(value => typeof value === 'string' && scopeName.test(value))) {
    throw new Error('Gemini CLI proxy session requires explicit model, project, and region scope.');
  }
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > MAX_SESSION_TIMEOUT_MS) {
    throw new Error('Gemini CLI proxy session requires an explicit finite timeout within the one-hour runtime limit.');
  }
  const signal = processOptions.signal;
  if (signal !== undefined && !(signal instanceof AbortSignal)) {
    throw new Error('Gemini CLI proxy session signal must be an AbortSignal.');
  }
  return input;
}

/**
 * Start one trusted Vertex-only proxy and run the materialized CLI session
 * through it. Credentials remain in this parent and are only passed to the
 * proxy. The returned value is extracted response text, never a decision.
 */
export async function runGeminiCliProxySession(input) {
  validateInput(input);
  const { processOptions } = input;
  if (processOptions.signal?.aborted) throw new Error('Gemini CLI proxy session cancelled before startup.');
  const deadlineAt = Date.now() + processOptions.timeoutMs;
  const deadlineController = new AbortController();
  const signals = [deadlineController.signal];
  if (processOptions.signal) signals.push(processOptions.signal);
  const signal = AbortSignal.any(signals);
  const deadlineTimer = setTimeout(() => deadlineController.abort(), processOptions.timeoutMs);
  deadlineTimer.unref?.();
  let proxy;
  try {
    const beforeProxy = remainingDeadlineMs(deadlineAt);
    if (beforeProxy === 0) throw new Error('Gemini CLI proxy session deadline expired before proxy startup.');
    proxy = await startGeminiSecurityProxy({
      credentials: input.credentials,
      allowedMode: 'vertex',
      allowedProject: processOptions.project,
      allowedRegion: processOptions.region,
      allowedModel: processOptions.model,
      allowStreaming: true,
      deadlineMs: beforeProxy,
      signal,
    });
    const remaining = remainingDeadlineMs(deadlineAt);
    if (remaining === 0 || deadlineController.signal.aborted) {
      throw new Error('Gemini CLI proxy session deadline expired during proxy startup.');
    }
    if (processOptions.signal?.aborted) throw new Error('Gemini CLI proxy session cancelled during proxy startup.');
    const responseText = await runGeminiCliSession({
      packet: input.packet,
      workspaceLimits: input.workspaceLimits,
      workspaceParentDirectory: input.workspaceParentDirectory,
      processOptions: {
        ...processOptions,
        timeoutMs: remaining,
        proxyUrl: proxy.endpointUrl,
        signal,
      },
    });
    if (deadlineController.signal.aborted || remainingDeadlineMs(deadlineAt) === 0) {
      throw new Error('Gemini CLI proxy session deadline expired before response return.');
    }
    if (processOptions.signal?.aborted) throw new Error('Gemini CLI proxy session cancelled before response return.');
    return responseText;
  } catch (error) {
    if (deadlineController.signal.aborted || remainingDeadlineMs(deadlineAt) === 0) {
      throw new Error('Gemini CLI proxy session deadline expired.');
    }
    throw error;
  } finally {
    clearTimeout(deadlineTimer);
    if (proxy) await proxy.shutdown();
  }
}
