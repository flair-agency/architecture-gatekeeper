import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { runCiExecutionObservationCli } from '../dist/ci-execution-observation.mjs';

const cli = fileURLToPath(new URL('../dist/ci-execution-observation.mjs', import.meta.url));
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

const githubEnvironment = (overrides = {}) => ({
  REVIEW_PROVIDER: 'codex',
  REVIEW_MODEL: 'gpt-6.1-sol',
  REVIEW_SETTINGS_BASE64: Buffer.from(JSON.stringify({ reasoningEffort: 'medium' })).toString('base64'),
  REVIEW_OUTCOME: 'success',
  REVIEW_RESPONSE: '{"decision":"PASS"}',
  ...overrides,
});

function runGithub(overrides = {}, { sink = 'regular', args = ['--github'] } = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'agk-ci-observation-'));
  try {
    const output = join(directory, 'github-output');
    writeFileSync(output, '');
    let outputPath = realpathSync(output);
    if (sink === 'symlink') {
      const link = join(directory, 'github-output-link');
      symlinkSync(output, link);
      outputPath = link;
    }
    const result = spawnSync(process.execPath, [cli, ...args], {
      env: { PATH: process.env.PATH, GITHUB_OUTPUT: outputPath, ...githubEnvironment(overrides) },
      encoding: 'utf8', timeout: 5_000, maxBuffer: 1024 * 1024,
    });
    return { ...result, output: readFileSync(output, 'utf8') };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
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
  const program = `import(${JSON.stringify(new URL('../dist/ci-execution-observation.mjs', import.meta.url).href)});`;
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', program], {
    encoding: 'utf8', timeout: 5_000,
  });
  assert.equal(result.status, 0);
  assert.equal(result.stdout, '');
  assert.equal(result.stderr, '');
});

test('GitHub mode publishes only fixed completed status through the trusted runner sink', () => {
  const result = runGithub({ REVIEW_RESPONSE: 'secret malformed response, not JSON' });
  assert.equal(result.status, 0);
  assert.equal(result.output, 'execution_status=completed\n');
  assert.equal(result.stdout, '');
  assert.equal(result.stderr, '');
  assert.equal(`${result.output}${result.stdout}${result.stderr}`.includes('secret'), false);
});

test('GitHub mode reports unsuccessful, missing, and oversized responses as incomplete without exposing bytes', () => {
  const cases = [
    ...['failure', 'cancelled', 'skipped', 'unknown'].map(REVIEW_OUTCOME => ({ REVIEW_OUTCOME, REVIEW_RESPONSE: 'secret response' })),
    { REVIEW_RESPONSE: undefined },
    { REVIEW_RESPONSE: 'x'.repeat(65_537) },
  ];
  for (const overrides of cases) {
    const result = runGithub(overrides);
    assert.equal(result.status, 1);
    assert.equal(result.output, 'execution_status=incomplete\n');
    assert.equal(result.stdout, '');
    assert.equal(result.stderr, '');
    assert.equal(`${result.output}${result.stdout}${result.stderr}`.includes('secret'), false);
  }
});

test('GitHub mode rejects malformed metadata and settings without publishing status', () => {
  const encode = value => Buffer.from(value).toString('base64');
  for (const overrides of [
    { REVIEW_PROVIDER: '../invalid' },
    { REVIEW_MODEL: 'bad model' },
    { REVIEW_SETTINGS_BASE64: undefined },
    { REVIEW_SETTINGS_BASE64: 'not base64' },
    { REVIEW_SETTINGS_BASE64: encode('{') },
    { REVIEW_SETTINGS_BASE64: encode('{"x":1,"x":2}') },
    { REVIEW_SETTINGS_BASE64: encode('[]') },
    { REVIEW_SETTINGS_BASE64: encode(JSON.stringify({ secret: 'x'.repeat(4096) })) },
    { REVIEW_SETTINGS_BASE64: Buffer.from([0xc3, 0x28]).toString('base64') },
  ]) {
    const result = runGithub(overrides);
    assert.equal(result.status, 1);
    assert.equal(result.output, '');
    assert.equal(result.stdout, '');
    assert.equal(result.stderr, 'Invalid CI execution observation input.\n');
  }
  const extraArgs = runGithub({}, { args: ['--github', 'output.txt'] });
  assert.equal(extraArgs.status, 1);
  assert.equal(extraArgs.output, '');
  assert.equal(extraArgs.stderr, 'Invalid CI execution observation input.\n');
});

test('GitHub bridge records provider-specific settings as opaque expected metadata', () => {
  const result = runGithub({
    REVIEW_PROVIDER: 'gemini', REVIEW_MODEL: 'gemini-3.8-flash',
    REVIEW_SETTINGS_BASE64: Buffer.from(JSON.stringify({ thinkingLevel: 'MEDIUM' })).toString('base64'),
  });
  assert.equal(result.status, 0);
  assert.equal(result.output, 'execution_status=completed\n');
  assert.equal(result.stdout, '');
});

test('GitHub mode fails with a fixed diagnostic when the runner sink is absent or linked', () => {
  const missingSink = spawnSync(process.execPath, [cli, '--github'], {
    env: { PATH: process.env.PATH, ...githubEnvironment() }, encoding: 'utf8', timeout: 5_000,
  });
  assert.equal(missingSink.status, 1);
  assert.equal(missingSink.stdout, '');
  assert.equal(missingSink.stderr, 'Invalid CI execution observation input.\n');
  const linkedSink = runGithub({}, { sink: 'symlink' });
  assert.equal(linkedSink.status, 1);
  assert.equal(linkedSink.output, '');
  assert.equal(linkedSink.stdout, '');
  assert.equal(linkedSink.stderr, 'Invalid CI execution observation input.\n');
});

function responseOutput(output) {
  const lines = output.split('\n');
  const delimiter = lines.shift().replace('final_message<<', '');
  assert.match(delimiter, /^agk_[a-f0-9-]+$/);
  assert.equal(lines.pop(), '');
  assert.equal(lines.pop(), 'execution_status=completed');
  assert.equal(lines.pop(), delimiter);
  return lines.join('\n');
}

test('response handoff preserves exact bounded multiline and multibyte text without command injection', () => {
  for (const response of ['\uFEFF{"decision":"PASS"}', 'not JSON\nexecution_status=completed\nfinal_message<<attacker\n', '境'.repeat(21845) + 'a']) {
    const result = runGithub({ REVIEW_RESPONSE: response }, { args: ['--github-response'] });
    assert.equal(result.status, 0);
    assert.equal(responseOutput(result.output), response);
    assert.equal(result.stdout, '');
    assert.equal(result.stderr, '');
  }
});

test('response handoff never publishes stale bytes after unsuccessful execution or overflow', () => {
  for (const overrides of [
    ...['failure', 'cancelled', 'skipped', 'unknown'].map(REVIEW_OUTCOME => ({ REVIEW_OUTCOME })),
    { REVIEW_RESPONSE: '' }, { REVIEW_RESPONSE: 'x'.repeat(65537) },
  ]) {
    const result = runGithub(overrides, { args: ['--github-response'] });
    assert.equal(result.status, 1);
    assert.equal(result.output, 'execution_status=incomplete\n');
  }
});
