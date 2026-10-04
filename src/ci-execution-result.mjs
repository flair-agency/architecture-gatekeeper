/** Normalize host-observed CI execution status without interpreting a decision. */

const INPUT_KEYS = new Set(['expectedExecution', 'hostStepOutcome', 'rawResponse', 'maxResponseBytes']);
const EXECUTION_KEYS = new Set(['provider', 'requestedModel', 'requestedSettings']);
const STEP_OUTCOMES = new Set(['success', 'failure', 'cancelled', 'skipped']);
const MAX_RESPONSE_BYTES = 65_536;
const MAX_EXECUTION_SETTINGS_BYTES = 4_096;

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) &&
    (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}

function cloneExpectedExecution(value) {
  if (!isRecord(value) || Object.keys(value).length !== EXECUTION_KEYS.size ||
      Object.keys(value).some(key => !EXECUTION_KEYS.has(key)) ||
      typeof value.provider !== 'string' || !/^[a-z][a-z0-9_-]{0,31}$/.test(value.provider) ||
      typeof value.requestedModel !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value.requestedModel) ||
      !isRecord(value.requestedSettings)) {
    throw new Error('CI execution result requires explicit trusted provider, model, and settings.');
  }
  let serialized;
  try { serialized = JSON.stringify(value.requestedSettings); }
  catch { throw new Error('CI execution result settings must be bounded JSON data.'); }
  if (typeof serialized !== 'string' || Buffer.byteLength(serialized, 'utf8') > MAX_EXECUTION_SETTINGS_BYTES) {
    throw new Error('CI execution result settings exceed their 4 KiB limit.');
  }
  let requestedSettings;
  try { requestedSettings = JSON.parse(serialized); }
  catch { throw new Error('CI execution result settings must be bounded JSON data.'); }
  return { provider: value.provider, requestedModel: value.requestedModel, requestedSettings };
}

function rawResponseObservation(rawResponse, maxResponseBytes) {
  if (rawResponse === undefined || rawResponse === null) return { status: 'missing', byteLength: 0 };
  if (typeof rawResponse !== 'string' && !Buffer.isBuffer(rawResponse)) {
    return { status: 'unsupported', byteLength: 0 };
  }
  const byteLength = typeof rawResponse === 'string' ? Buffer.byteLength(rawResponse, 'utf8') : rawResponse.length;
  if (byteLength === 0) return { status: 'missing', byteLength: 0 };
  if (byteLength > maxResponseBytes) return { status: 'oversized', byteLength };
  const responseBytes = Buffer.isBuffer(rawResponse) ? Buffer.from(rawResponse) : Buffer.from(rawResponse, 'utf8');
  return { status: 'available', byteLength, responseBytes };
}

/**
 * Convert a trusted selection, host step outcome, and raw provider result into
 * an in-memory execution observation. This does not validate or classify the
 * response, establish protected bindings, or make an acceptance decision.
 */
export function normalizeCiExecutionResult(input) {
  if (!isRecord(input) || Object.keys(input).length !== INPUT_KEYS.size ||
      Object.keys(input).some(key => !INPUT_KEYS.has(key))) {
    throw new Error('CI execution result requires the complete explicit input set.');
  }
  const expectedExecution = cloneExpectedExecution(input.expectedExecution);
  const maxResponseBytes = input.maxResponseBytes;
  if (!Number.isSafeInteger(maxResponseBytes) || maxResponseBytes < 1 || maxResponseBytes > MAX_RESPONSE_BYTES) {
    throw new Error('CI execution result response bound must be within the 64 KiB runtime ceiling.');
  }

  const hostStepOutcome = STEP_OUTCOMES.has(input.hostStepOutcome) ? input.hostStepOutcome : 'unknown';
  const raw = rawResponseObservation(input.rawResponse, maxResponseBytes);
  const complete = hostStepOutcome === 'success' && raw.status === 'available';
  const observations = {
    hostStepOutcome,
    rawResponse: { status: raw.status, byteLength: raw.byteLength },
    timeoutCause: 'unknown',
    backendModelIdentity: 'unknown',
    processTermination: 'unknown',
  };
  return {
    version: 1,
    status: complete ? 'completed' : 'incomplete',
    expectedExecution,
    observations,
    ...(complete ? { responseBytes: raw.responseBytes } : {}),
  };
}
