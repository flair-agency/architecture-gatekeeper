import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { runCiExecutionObservationCli } from '../src/ci-execution-observation.mjs';

const cli = fileURLToPath(new URL('../src/ci-execution-observation.mjs', import.meta.url));
const envelope = (overrides = {}) => ({
  expectedExecution: {
    provider: 'codex', requestedModel: 'gpt-6.1-sol', requestedSettings: { reasoningEffort: 'medium' },
  },
  hostStepOutcome: 'success',
  rawResponse: '{"decision":"PASS"}',
  maxResponseBytes: 65_536,
  ...overrides,
});

function run(input) {
  return spawnSync(process.execPath, [cli], {
    input: Buffer.isBuffer(input) || typeof input === 'string' ? input : JSON.stringify(input),
    encoding: 'utf8',
    timeout: 5_000,
    maxBuffer: 1024 * 1024,
  });
}

test('reports only completed status for bounded bytes, without interpreting malformed decisions', () => {
  const result = run(envelope({ rawResponse: 'secret malformed response, not JSON' }));
  assert.equal(result.status, 0);
  assert.equal(result.stdout, 'status=completed\n');
  assert.equal(result.stderr, '');
});

test('reports incomplete status and nonzero exit for unsuccessful host outcomes without response data', () => {
  const result = run(envelope({ hostStepOutcome: 'failure', rawResponse: 'secret response' }));
  assert.equal(result.status, 1);
  assert.equal(result.stdout, 'status=incomplete\n');
  assert.equal(result.stderr, '');
  assert.equal(`${result.stdout}${result.stderr}`.includes('secret'), false);
});

test('treats missing and oversized response text as incomplete', () => {
  for (const rawResponse of [null, 'x'.repeat(65_537)]) {
    const result = run(envelope({ rawResponse }));
    assert.equal(result.status, 1);
    assert.equal(result.stdout, 'status=incomplete\n');
    assert.equal(result.stderr, '');
  }
});

test('rejects malformed, extra-key, invalid-metadata, and invalid-UTF-8 envelopes with fixed diagnostics', () => {
  const invalidEnvelopes = [
    '{',
    envelope({ unexpected: 'secret-extra-field' }),
    envelope({ hostStepOutcome: 'timed_out' }),
    envelope({ rawResponse: 42 }),
    envelope({ maxResponseBytes: 65_537 }),
    envelope({ expectedExecution: { provider: 'codex', requestedModel: 'bad model', requestedSettings: {} } }),
  ];
  for (const input of invalidEnvelopes) {
    const result = run(input);
    assert.equal(result.status, 1);
    assert.equal(result.stdout, '');
    assert.equal(result.stderr, 'Invalid CI execution observation input.\n');
    assert.equal(`${result.stdout}${result.stderr}`.includes('secret'), false);
  }
  const invalidUtf8 = run(Buffer.from([0xc3, 0x28]));
  assert.equal(invalidUtf8.status, 1);
  assert.equal(invalidUtf8.stdout, '');
  assert.equal(invalidUtf8.stderr, 'Invalid CI execution observation input.\n');
});

test('rejects duplicate envelope and nested settings keys while leaving raw response opaque', () => {
  const duplicateEnvelope = '{"expectedExecution":{"provider":"codex","requestedModel":"gpt-6.1-sol","requestedSettings":{}},"hostStepOutcome":"success","rawResponse":"x","rawResponse":"secret","maxResponseBytes":65536}';
  const duplicateSettings = '{"expectedExecution":{"provider":"codex","requestedModel":"gpt-6.1-sol","requestedSettings":{"reasoningEffort":"medium","reasoningEffort":"low"}},"hostStepOutcome":"success","rawResponse":"{\\"decision\\":\\"PASS\\",\\"decision\\":\\"BLOCK\\"}","maxResponseBytes":65536}';
  for (const input of [duplicateEnvelope, duplicateSettings]) {
    const result = run(input);
    assert.equal(result.status, 1);
    assert.equal(result.stdout, '');
    assert.equal(result.stderr, 'Invalid CI execution observation input.\n');
    assert.equal(`${result.stdout}${result.stderr}`.includes('secret'), false);
  }
  const opaqueDecision = run(envelope({ rawResponse: '{"decision":"PASS","decision":"BLOCK"}' }));
  assert.equal(opaqueDecision.status, 0);
  assert.equal(opaqueDecision.stdout, 'status=completed\n');
});

test('rejects stdin above the fixed envelope limit without echoing input', () => {
  const oversized = JSON.stringify(envelope({ rawResponse: 'secret'.repeat(100_000) }));
  const result = run(oversized);
  assert.equal(result.status, 1);
  assert.equal(result.stdout, '');
  assert.equal(result.stderr, 'Invalid CI execution observation input.\n');
  assert.equal(`${result.stdout}${result.stderr}`.includes('secret'), false);
});

test('accepts the exact stdin byte ceiling and rejects one byte beyond it', () => {
  const base = JSON.stringify(envelope());
  const padding = ' '.repeat(512 * 1024 - Buffer.byteLength(base));
  const exact = `${base}${padding}`;
  assert.equal(Buffer.byteLength(exact), 512 * 1024);
  const accepted = run(exact);
  assert.equal(accepted.status, 0);
  assert.equal(accepted.stdout, 'status=completed\n');
  const rejected = run(`${exact} `);
  assert.equal(rejected.status, 1);
  assert.equal(rejected.stdout, '');
  assert.equal(rejected.stderr, 'Invalid CI execution observation input.\n');
});

test('counts the input limit across stream chunks', async () => {
  const base = JSON.stringify(envelope());
  const exact = Buffer.from(`${base}${' '.repeat(512 * 1024 - Buffer.byteLength(base))}`);
  const chunks = [exact.subarray(0, 512 * 1024 - 1), exact.subarray(512 * 1024 - 1)];
  let output = '';
  let errors = '';
  const status = await runCiExecutionObservationCli({
    stdin: Readable.from(chunks),
    stdout: { write: value => { output += value; } },
    stderr: { write: value => { errors += value; } },
  });
  assert.equal(status, 0);
  assert.equal(output, 'status=completed\n');
  assert.equal(errors, '');
});

test('importing the module has no process I/O side effects', () => {
  const program = `import(${JSON.stringify(new URL('../src/ci-execution-observation.mjs', import.meta.url).href)});`;
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', program], {
    encoding: 'utf8', timeout: 5_000,
  });
  assert.equal(result.status, 0);
  assert.equal(result.stdout, '');
  assert.equal(result.stderr, '');
});
