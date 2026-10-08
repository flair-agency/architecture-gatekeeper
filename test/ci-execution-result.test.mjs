import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeCiExecutionResult } from '../src/ci-execution-result.mjs';

const expectedExecution = {
  provider: 'codex', requestedModel: 'gpt-6.1-sol', requestedSettings: { reasoningEffort: 'medium' },
};
const limit = 65_536;

function input(overrides = {}) {
  return {
    expectedExecution, hostStepOutcome: 'success', rawResponse: Buffer.from('{"decision":"PASS"}'),
    maxResponseBytes: limit, ...overrides,
  };
}

test('preserves successful action output as raw bytes without interpreting its decision', () => {
  const raw = Buffer.from('{"decision":"PASS","opaque":"é"}');
  const result = normalizeCiExecutionResult(input({ rawResponse: raw }));
  assert.equal(result.status, 'completed');
  assert.equal(result.version, 1);
  assert.deepEqual(result.expectedExecution, expectedExecution);
  assert.deepEqual(result.responseBytes, raw);
  assert.equal(result.responseBytes === raw, false);
  assert.equal(Object.hasOwn(result, 'decision'), false);
  assert.equal(Object.hasOwn(result, 'acceptance'), false);
  assert.deepEqual(result.observations, {
    hostStepOutcome: 'success', rawResponse: { status: 'available', byteLength: raw.length },
    timeoutCause: 'unknown', backendModelIdentity: 'unknown', processTermination: 'unknown',
  });
});

test('encodes a successful Action final-message string as UTF-8 bytes', () => {
  const message = '{"decision":"BLOCK","summary":"é"}';
  const result = normalizeCiExecutionResult(input({ rawResponse: message }));
  assert.deepEqual(result.responseBytes, Buffer.from(message, 'utf8'));
});

test('marks failure, cancellation, skip, and unknown outcomes incomplete with no response', () => {
  for (const hostStepOutcome of ['failure', 'cancelled', 'skipped', undefined, 'timed_out']) {
    const result = normalizeCiExecutionResult(input({ hostStepOutcome }));
    assert.equal(result.status, 'incomplete', String(hostStepOutcome));
    assert.equal(Object.hasOwn(result, 'responseBytes'), false);
    assert.equal(result.observations.hostStepOutcome,
      ['failure', 'cancelled', 'skipped'].includes(hostStepOutcome) ? hostStepOutcome : 'unknown');
    assert.equal(result.observations.timeoutCause, 'unknown');
    assert.equal(result.observations.processTermination, 'unknown');
  }
});

test('marks a successful step with missing, unsupported, or oversized output incomplete', () => {
  for (const [rawResponse, expectedStatus, byteLength] of [
    [undefined, 'missing', 0], ['', 'missing', 0],
    [{ response: 'not bytes' }, 'unsupported', 0],
    [Buffer.alloc(limit + 1), 'oversized', limit + 1],
    ['é'.repeat(limit), 'oversized', Buffer.byteLength('é'.repeat(limit), 'utf8')],
  ]) {
    const result = normalizeCiExecutionResult(input({ rawResponse }));
    assert.equal(result.status, 'incomplete');
    assert.equal(result.observations.rawResponse.status, expectedStatus);
    assert.equal(result.observations.rawResponse.byteLength, byteLength);
    assert.equal(Object.hasOwn(result, 'responseBytes'), false);
  }
});

test('does not expose response bytes when the host reports failure despite available output', () => {
  const result = normalizeCiExecutionResult(input({ hostStepOutcome: 'failure' }));
  assert.equal(result.status, 'incomplete');
  assert.equal(result.observations.rawResponse.status, 'available');
  assert.equal(Object.hasOwn(result, 'responseBytes'), false);
});

test('preserves the original two reads of an accessor-backed host outcome', () => {
  for (const secondRead of ['failure', 'unexpected', { changed: true }]) {
    const candidate = input();
    let reads = 0;
    Object.defineProperty(candidate, 'hostStepOutcome', {
      enumerable: true,
      get() { reads++; return reads === 1 ? 'success' : secondRead; },
    });
    const result = normalizeCiExecutionResult(candidate);
    assert.equal(reads, 2);
    assert.equal(result.status, 'incomplete');
    assert.strictEqual(result.observations.hostStepOutcome, secondRead);
    assert.equal(Object.hasOwn(result, 'responseBytes'), false);
  }
});

test('requires a bounded explicit expected identity and response limit', () => {
  for (const invalid of [
    { ...expectedExecution, provider: '' },
    { ...expectedExecution, requestedModel: 'bad model' },
    { ...expectedExecution, extra: true },
    { ...expectedExecution, requestedSettings: null },
    { ...expectedExecution, requestedSettings: { large: 'x'.repeat(4_100) } },
  ]) assert.throws(() => normalizeCiExecutionResult(input({ expectedExecution: invalid })), /execution result/);
  for (const maxResponseBytes of [0, -1, 65_537, 1.5, NaN]) {
    assert.throws(() => normalizeCiExecutionResult(input({ maxResponseBytes })), /response bound/);
  }
  assert.throws(() => normalizeCiExecutionResult({ ...input(), extra: true }), /complete explicit input set/);
});

// Completion here means a host-reported successful execution with bytes;
// semantic parsing and validation remain outside this adapter.
test('keeps malformed response bytes for shared validation without declaring a semantic decision', () => {
  const raw = Buffer.from('not JSON');
  const result = normalizeCiExecutionResult(input({ rawResponse: raw }));
  assert.equal(result.status, 'completed');
  assert.deepEqual(result.responseBytes, raw);
  assert.equal(Object.hasOwn(result, 'decision'), false);
  assert.equal(Object.hasOwn(result, 'acceptance'), false);
});

test('accepts the exact selected byte boundary and rejects a multibyte overflow', () => {
  const result = normalizeCiExecutionResult(input({ rawResponse: 'é', maxResponseBytes: 2 }));
  assert.equal(result.status, 'completed');
  assert.equal(result.responseBytes.length, 2);
  const over = normalizeCiExecutionResult(input({ rawResponse: 'é', maxResponseBytes: 1 }));
  assert.equal(over.status, 'incomplete');
  assert.equal(over.observations.rawResponse.status, 'oversized');
});

test('rejects nested lossy JSON settings instead of silently changing the expected selection', () => {
  const circular = {}; circular.self = circular;
  const sparse = new Array(1);
  const decorated = [1]; decorated.extra = 2;
  const hidden = {}; Object.defineProperty(hidden, 'secret', { value: 1 });
  const symbolKey = { [Symbol('setting')]: 1 };
  for (const value of [undefined, NaN, Infinity, -Infinity, -0, Symbol('value'), 1n,
    () => 1, new Date(), circular, sparse, decorated, hidden, symbolKey]) {
    assert.throws(() => normalizeCiExecutionResult(input({ expectedExecution: {
      ...expectedExecution, requestedSettings: { nested: { value } },
    } })), /lossless JSON/);
  }
});

test('rejects executable settings properties without invoking their code', () => {
  let called = false;
  const getter = {}; Object.defineProperty(getter, 'value', {
    enumerable: true, get() { called = true; return 1; },
  });
  const toJSON = { toJSON() { called = true; return {}; } };
  for (const requestedSettings of [getter, toJSON]) {
    assert.throws(() => normalizeCiExecutionResult(input({ expectedExecution: {
      ...expectedExecution, requestedSettings,
    } })), /lossless JSON/);
  }
  assert.equal(called, false);
});

test('preserves nested JSON settings and fails finitely on excessive structure', () => {
  const requestedSettings = { nested: [null, true, 'é', 1.25, { value: 0 }] };
  const result = normalizeCiExecutionResult(input({ expectedExecution: { ...expectedExecution, requestedSettings } }));
  assert.deepEqual(result.expectedExecution.requestedSettings, requestedSettings);
  assert.notEqual(result.expectedExecution.requestedSettings, requestedSettings);
  let deep = {}; for (let i = 0; i < 70; i++) deep = { nested: deep };
  assert.throws(() => normalizeCiExecutionResult(input({ expectedExecution: {
    ...expectedExecution, requestedSettings: deep,
  } })), /bounded lossless JSON/);
});

test('serializes the validated snapshot without inherited object or array hooks', () => {
  const objectHook = Object.getOwnPropertyDescriptor(Object.prototype, 'toJSON');
  const arrayHook = Object.getOwnPropertyDescriptor(Array.prototype, 'toJSON');
  let invoked = false;
  let result;
  const requestedSettings = { reasoningEffort: 'medium', nested: [1, { value: true }] };
  try {
    Object.defineProperty(Object.prototype, 'toJSON', { configurable: true, value() { invoked = true; return {}; } });
    Object.defineProperty(Array.prototype, 'toJSON', { configurable: true, value() { invoked = true; return []; } });
    result = normalizeCiExecutionResult(input({ expectedExecution: { ...expectedExecution, requestedSettings } }));
  } finally {
    if (objectHook) Object.defineProperty(Object.prototype, 'toJSON', objectHook);
    else delete Object.prototype.toJSON;
    if (arrayHook) Object.defineProperty(Array.prototype, 'toJSON', arrayHook);
    else delete Array.prototype.toJSON;
  }
  assert.equal(invoked, false);
  assert.deepEqual(result.expectedExecution.requestedSettings, requestedSettings);
});

test('rejects proxies and root accessors without observing changing live selections', () => {
  let invoked = false;
  const dynamic = new Proxy({ value: 'medium' }, { get() { invoked = true; return null; } });
  const accessor = { provider: 'codex', requestedModel: 'gpt-6.1-sol' };
  Object.defineProperty(accessor, 'requestedSettings', { enumerable: true, get() { invoked = true; return {}; } });
  for (const selection of [
    { ...expectedExecution, requestedSettings: dynamic },
    new Proxy(expectedExecution, { get() { invoked = true; return null; } }), accessor,
  ]) assert.throws(() => normalizeCiExecutionResult(input({ expectedExecution: selection })), /lossless JSON/);
  assert.equal(invoked, false);
});
