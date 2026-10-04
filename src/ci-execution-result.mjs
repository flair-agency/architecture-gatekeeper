/** Normalize host-observed CI execution status without interpreting a decision. */
import { types } from 'node:util';

const INPUT_KEYS = new Set(['expectedExecution', 'hostStepOutcome', 'rawResponse', 'maxResponseBytes']);
const EXECUTION_KEYS = new Set(['provider', 'requestedModel', 'requestedSettings']);
const STEP_OUTCOMES = new Set(['success', 'failure', 'cancelled', 'skipped']);
const MAX_RESPONSE_BYTES = 65_536;
const MAX_EXECUTION_SETTINGS_BYTES = 4_096;

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) &&
    (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}

// Settings are trusted selection data, but their JS representation must not
// change when recorded as JSON. Inspect descriptors without invoking getters.
function snapshotLosslessJson(value, ancestors = new Set(), budget = { nodes: 0 }, depth = 0) {
  const invalid = () => { throw new Error('CI execution result settings must be bounded lossless JSON data.'); };
  if (++budget.nodes > 4096 || depth > 64) invalid();
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || Object.is(value, -0)) invalid();
    return value;
  }
  if (types.isProxy(value)) invalid();
  if (typeof value !== 'object' || (!Array.isArray(value) && !isRecord(value)) || ancestors.has(value)) invalid();
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Reflect.ownKeys(descriptors);
  if (keys.length > 4096 || keys.some(key => typeof key !== 'string')) invalid();
  if (Array.isArray(value)) {
    if (value.length > 4096 || keys.length !== value.length + 1) invalid();
    for (let index = 0; index < value.length; index++) {
      if (!Object.hasOwn(descriptors, String(index))) invalid();
    }
  }
  const snapshot = Array.isArray(value) ? [] : Object.create(null);
  // Array identity survives removing its inherited serialization hooks.
  if (Array.isArray(snapshot)) Object.setPrototypeOf(snapshot, null);
  ancestors.add(value);
  for (const key of keys) {
    if (Array.isArray(value) && key === 'length') continue;
    const descriptor = descriptors[key];
    if (!descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) invalid();
    snapshot[key] = snapshotLosslessJson(descriptor.value, ancestors, budget, depth + 1);
  }
  ancestors.delete(value);
  return snapshot;
}

function cloneExpectedExecution(value) {
  value = snapshotLosslessJson(value);
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
