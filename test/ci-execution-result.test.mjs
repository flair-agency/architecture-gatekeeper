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
