/** Normalize host-observed CI execution status without interpreting a decision. */
import { types } from 'node:util';

export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
export type ExpectedExecution = { provider: string; requestedModel: string; requestedSettings: { [key: string]: JsonValue } };
export type HostStepOutcome = 'success' | 'failure' | 'cancelled' | 'skipped' | 'unknown';
export type RawResponseStatus = 'missing' | 'unsupported' | 'oversized' | 'available';
export type RawResponseObservation = { status: RawResponseStatus; byteLength: number };
export type CiExecutionObservations = {
  // Unknown accommodates a second accessor read returning a different arbitrary value.
  hostStepOutcome: unknown;
  rawResponse: RawResponseObservation;
  timeoutCause: 'unknown';
  backendModelIdentity: 'unknown';
  processTermination: 'unknown';
};
export type CompletedCiExecutionResult = {
  version: 1;
  status: 'completed';
  expectedExecution: ExpectedExecution;
  observations: CiExecutionObservations & { hostStepOutcome: 'success'; rawResponse: RawResponseObservation & { status: 'available' } };
  responseBytes: Buffer;
};
export type IncompleteCiExecutionResult = {
  version: 1;
  status: 'incomplete';
  expectedExecution: ExpectedExecution;
  observations: CiExecutionObservations;
  responseBytes?: never;
};
export type CiExecutionResult = CompletedCiExecutionResult | IncompleteCiExecutionResult;

const INPUT_KEYS = new Set(['expectedExecution', 'hostStepOutcome', 'rawResponse', 'maxResponseBytes']);
const EXECUTION_KEYS = new Set(['provider', 'requestedModel', 'requestedSettings']);
const STEP_OUTCOMES: ReadonlySet<unknown> = new Set(['success', 'failure', 'cancelled', 'skipped']);
const MAX_RESPONSE_BYTES = 65_536;
const MAX_EXECUTION_SETTINGS_BYTES = 4_096;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) &&
    (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}

// Settings are trusted selection data, but their JS representation must not
// change when recorded as JSON. Inspect descriptors without invoking getters.
function snapshotLosslessJson(value: unknown, ancestors = new Set<object>(), budget = { nodes: 0 }, depth = 0): JsonValue {
  const invalid = (): never => { throw new Error('CI execution result settings must be bounded lossless JSON data.'); };
  if (++budget.nodes > 4096 || depth > 64) invalid();
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || Object.is(value, -0)) invalid();
    return value;
  }
  if (types.isProxy(value)) invalid();
  if (typeof value !== 'object' || (!Array.isArray(value) && !isRecord(value)) || ancestors.has(value)) invalid();
  // The preceding runtime checks establish a non-null, non-proxy object.
  const source = value as object;
  const descriptors = Object.getOwnPropertyDescriptors(source);
  const keys = Reflect.ownKeys(descriptors);
  if (keys.length > 4096 || keys.some(key => typeof key !== 'string')) invalid();
  if (Array.isArray(value)) {
    if (value.length > 4096 || keys.length !== value.length + 1) invalid();
    for (let index = 0; index < value.length; index++) {
      if (!Object.hasOwn(descriptors, String(index))) invalid();
    }
  }
  const snapshot: JsonValue[] | { [key: string]: JsonValue } = Array.isArray(value) ? [] : Object.create(null) as { [key: string]: JsonValue };
  if (Array.isArray(snapshot)) Object.setPrototypeOf(snapshot, null);
  ancestors.add(source);
  for (const rawKey of keys) {
    // The keys.some check above established that every own key is a string.
    const key = rawKey as string;
    if (Array.isArray(value) && key === 'length') continue;
    const descriptor = descriptors[key];
    if (!descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) invalid();
    const item = snapshotLosslessJson(descriptor.value, ancestors, budget, depth + 1);
    if (Array.isArray(snapshot)) {
      // Dense own-index validation above establishes this string as a valid array index.
      (snapshot as unknown as Record<string, JsonValue>)[key] = item;
    }
    else snapshot[key] = item;
  }
  ancestors.delete(source);
  return snapshot;
}

function cloneExpectedExecution(value: unknown): ExpectedExecution {
  const snapshot = snapshotLosslessJson(value);
  if (!isRecord(snapshot) || Object.keys(snapshot).length !== EXECUTION_KEYS.size ||
      Object.keys(snapshot).some(key => !EXECUTION_KEYS.has(key)) ||
      typeof snapshot.provider !== 'string' || !/^[a-z][a-z0-9_-]{0,31}$/.test(snapshot.provider) ||
      typeof snapshot.requestedModel !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(snapshot.requestedModel) ||
      !isRecord(snapshot.requestedSettings)) {
    throw new Error('CI execution result requires explicit trusted provider, model, and settings.');
  }
  let serialized: string | undefined;
  try { serialized = JSON.stringify(snapshot.requestedSettings); }
  catch { throw new Error('CI execution result settings must be bounded JSON data.'); }
  if (typeof serialized !== 'string' || Buffer.byteLength(serialized, 'utf8') > MAX_EXECUTION_SETTINGS_BYTES) {
    throw new Error('CI execution result settings exceed their 4 KiB limit.');
  }
  let requestedSettings: unknown;
  try { requestedSettings = JSON.parse(serialized); }
  catch { throw new Error('CI execution result settings must be bounded JSON data.'); }
  // JSON.parse follows descriptor validation and bounded serialization of this settings object.
  return { provider: snapshot.provider, requestedModel: snapshot.requestedModel, requestedSettings: requestedSettings as { [key: string]: JsonValue } };
}

type RawResponseObservationWithBytes =
  | (RawResponseObservation & { status: 'available'; responseBytes: Buffer })
  | (RawResponseObservation & { status: 'missing' | 'unsupported' | 'oversized'; responseBytes?: never });
function rawResponseObservation(rawResponse: unknown, maxResponseBytes: number): RawResponseObservationWithBytes {
  if (rawResponse === undefined || rawResponse === null) return { status: 'missing', byteLength: 0 };
  if (typeof rawResponse !== 'string' && !Buffer.isBuffer(rawResponse)) return { status: 'unsupported', byteLength: 0 };
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
export function normalizeCiExecutionResult(input: unknown): CiExecutionResult {
  if (!isRecord(input) || Object.keys(input).length !== INPUT_KEYS.size ||
      Object.keys(input).some(key => !INPUT_KEYS.has(key))) {
    throw new Error('CI execution result requires the complete explicit input set.');
  }
  const envelope = input;
  const expectedExecution = cloneExpectedExecution(envelope.expectedExecution);
  const maxResponseBytes = envelope.maxResponseBytes;
  if (!Number.isSafeInteger(maxResponseBytes) || (maxResponseBytes as number) < 1 || (maxResponseBytes as number) > MAX_RESPONSE_BYTES) {
    throw new Error('CI execution result response bound must be within the 64 KiB runtime ceiling.');
  }
  // The guard above establishes an integer number inside the configured bounds.
  const boundedMaxResponseBytes = maxResponseBytes as number;
  // Set membership establishes the named outcome; all other values map to unknown.
  // Keep the original two reads; accessor-backed input may change after membership is checked.
  const hostStepOutcome: unknown = STEP_OUTCOMES.has(envelope.hostStepOutcome)
    ? envelope.hostStepOutcome : 'unknown';
  const raw = rawResponseObservation(envelope.rawResponse, boundedMaxResponseBytes);
  const complete = hostStepOutcome === 'success' && raw.status === 'available';
  const observations: CiExecutionObservations = {
    hostStepOutcome,
    rawResponse: { status: raw.status, byteLength: raw.byteLength },
    timeoutCause: 'unknown', backendModelIdentity: 'unknown', processTermination: 'unknown',
  };
  if (complete && raw.status === 'available') {
    // This branch requires success plus available, bounded response bytes.
    return {
      version: 1, status: 'completed', expectedExecution,
      // Runtime branch conditions establish the success/available observation refinements.
      observations: observations as CompletedCiExecutionResult['observations'],
      responseBytes: raw.responseBytes,
    };
  }
  return { version: 1, status: 'incomplete', expectedExecution, observations };
}
