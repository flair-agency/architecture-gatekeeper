import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { request as httpRequest } from 'node:http';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { runPreparedGeminiCiReview } from '../dist/prepared-gemini-ci-review.mjs';
import { encodeGeminiCliPromptForTransport, GEMINI_CLI_STDIN_LIMIT } from '../dist/gemini-cli-process.mjs';
import { normalizeCiExecutionResult } from '../dist/ci-execution-result.mjs';
import { validatePreparedCiDecision } from '../dist/prepared-ci-decision.mjs';

const oid = char => char.repeat(40);
const workspaceLimits = { maxFiles: 2, maxFileBytes: 2048, maxTotalBytes: 4096 };
const decisionSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object', required: ['decision', 'authorityIds'], additionalProperties: false,
  properties: {
    decision: { type: 'string', enum: ['PASS', 'BLOCK', 'OWNER_DECISION'] },
    authorityIds: { type: 'array', minItems: 6, items: { type: 'string' } },
    summary: { type: 'string' },
  },
};
const authorityIds = [
  'architecture-contract', 'architecture-authority-set', 'architecture-owner-addition',
  'architecture-owner-amendment', 'architecture-review-execution', 'architecture-self-profile',
];
const authorityProvenance = {
  version: 1, manifestSha256: 'a'.repeat(64), setDigest: 'b'.repeat(64),
  members: authorityIds.map(id => ({ id })),
};
const validationRules = { version: 1, rules: [{
  when: { path: '/decision', equals: 'BLOCK' },
  require: { path: '/summary', equals: 'documented' },
  message: 'BLOCK requires its reason to be documented.',
}] };

function packet() {
  const text = 'protected CI fixture';
  return {
    version: 1,
    revisions: { baseSha: oid('a'), headSha: oid('b'), reviewedMergeSha: oid('c') },
    limits: workspaceLimits,
    files: [],
    references: [{ path: 'docs/authority.md', text, mode: '100644', gitObjectId: oid('d'), sha256: createHash('sha256').update(text).digest('hex') }],
  };
}

function fixture(t, mode = 'success', responseText = 'raw protected-CI response text') {
  const root = mkdtempSync(join(tmpdir(), 'prepared-gemini-ci-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const workspaceParentDirectory = join(root, 'workspace-parent'); mkdirSync(workspaceParentDirectory);
  const privateParentDirectory = join(root, 'process-private'); mkdirSync(privateParentDirectory);
  const reportPath = join(root, 'observation.json');
  const cliEntrypoint = join(root, 'fake-cli.mjs');
  writeFileSync(cliEntrypoint, `
import { renameSync, writeFileSync } from 'node:fs';
const mode = ${JSON.stringify(mode)};
const responseText = ${JSON.stringify(responseText)};
if (process.argv.includes('--version')) { process.stdout.write('0.62.0'); process.exit(0); }
let prompt = '';
for await (const chunk of process.stdin) prompt += chunk;
writeFileSync(${JSON.stringify(`${reportPath}.pending`)}, JSON.stringify({ prompt, endpoint: process.env.GOOGLE_VERTEX_BASE_URL, env: process.env }));
renameSync(${JSON.stringify(`${reportPath}.pending`)}, ${JSON.stringify(reportPath)});
if (mode === 'failure') { process.stderr.write('fixture execution failure'); process.exit(7); }
if (mode === 'hang') { setInterval(() => {}, 1000); }
process.stdout.write(JSON.stringify({ response: responseText }));
`);
  return { root, workspaceParentDirectory, privateParentDirectory, reportPath, cliEntrypoint };
}

function input(f, overrides = {}) {
  return {
    protectedPromptText: 'Review only the protected inputs and supplied evidence.  \n',
    protectedDecisionSchemaText: JSON.stringify(decisionSchema, null, 2),
    proxySessionOptions: {
      packet: packet(), workspaceLimits, workspaceParentDirectory: f.workspaceParentDirectory,
      credentials: { type: 'bearer', value: 'parent-only-ci-fixture-token' },
      processOptions: {
        cliEntrypoint: f.cliEntrypoint, privateParentDirectory: f.privateParentDirectory,
        model: 'gemini-3.8-flash', thinkingLevel: 'MEDIUM', project: 'selected-project', region: 'us',
        timeoutMs: 5000, maxPromptBytes: 4096, maxStdoutBytes: 1024, maxStderrBytes: 1024,
      },
    },
    ...overrides,
  };
}

async function assertProxyClosed(endpoint) {
  const match = /^http:\/\/127\.0\.0\.1:(\d+)$/.exec(endpoint);
  assert.ok(match);
  await assert.rejects(new Promise((resolve, reject) => {
    const req = httpRequest({ hostname: '127.0.0.1', port: Number(match[1]), method: 'POST', path: '/not-allowed' }, response => {
      response.resume(); resolve(response.statusCode);
    });
    req.once('error', reject); req.end('{}');
  }), error => error?.code === 'ECONNREFUSED');
}

test('composes the protected schema into the bounded prompt and returns raw response text', async t => {
  const f = fixture(t);
  assert.equal(await runPreparedGeminiCiReview(input(f)), 'raw protected-CI response text');
  const observed = JSON.parse(readFileSync(f.reportPath, 'utf8'));
  const supplied = input(f);
  const completePrompt = `${supplied.protectedPromptText}\n\nProtected output schema (follow this schema exactly; downstream CI validation remains authoritative):\n${supplied.protectedDecisionSchemaText}\n`;
  assert.equal(observed.prompt, encodeGeminiCliPromptForTransport(completePrompt));
  assert.equal(observed.prompt.includes('@'), false);
  assert.equal(JSON.parse(observed.prompt.slice(observed.prompt.lastIndexOf('\n') + 1)), completePrompt);
  assert.match(observed.endpoint, /^http:\/\/127\.0\.0\.1:\d+$/);
  assert.equal(JSON.stringify(observed.env).includes('parent-only-ci-fixture-token'), false);
  await assertProxyClosed(observed.endpoint);
  assert.deepEqual(readdirSync(f.workspaceParentDirectory), []);
  assert.deepEqual(readdirSync(f.privateParentDirectory), []);
});

test('normalizes and validates prepared Gemini execution before exposing PASS or BLOCK semantics', async t => {
  const cases = [
    { name: 'PASS', response: { decision: 'PASS', authorityIds }, expected: 'PASS' },
    { name: 'BLOCK', response: { decision: 'BLOCK', authorityIds, summary: 'documented' }, expected: 'BLOCK' },
    { name: 'invalid JSON', responseText: 'not JSON', error: /decision is invalid JSON/ },
    { name: 'too few authority IDs', response: { decision: 'PASS', authorityIds: authorityIds.slice(1) }, error: /authorityIds has too few items/ },
    { name: 'duplicate authority ID', response: { decision: 'PASS', authorityIds: [authorityIds[0], ...authorityIds.slice(0, 5)] }, error: /decision has an invalid, duplicate or extra Authority ID/ },
    { name: 'unexpected authority ID', response: { decision: 'PASS', authorityIds: [...authorityIds.slice(0, 5), 'unexpected-authority'] }, error: /decision has an invalid, duplicate or extra Authority ID/ },
    { name: 'consumer rule violation', response: { decision: 'BLOCK', authorityIds }, error: /BLOCK requires its reason/ },
  ];
  for (const item of cases) {
    const responseText = item.responseText ?? JSON.stringify(item.response);
    const f = fixture(t, 'success', responseText);
    const rawResponse = await runPreparedGeminiCiReview(input(f));
    const execution = normalizeCiExecutionResult({
      expectedExecution: { provider: 'gemini', requestedModel: 'gemini-3.8-flash', requestedSettings: { thinkingLevel: 'MEDIUM' } },
      hostStepOutcome: 'success', rawResponse, maxResponseBytes: 65_536,
    });
    assert.equal(execution.status, 'completed', item.name);
    assert.ok(execution.responseBytes.length > 0, item.name);
    const validationInput = {
      responseBytes: execution.responseBytes,
      schemaBytes: Buffer.from(JSON.stringify(decisionSchema)),
      authorityProvenance, validationRules,
      maxResponseBytes: 65_536, maxSchemaBytes: 1_048_576,
    };
    if (item.error) assert.throws(() => validatePreparedCiDecision(validationInput), item.error, item.name);
    else assert.equal(validatePreparedCiDecision(validationInput).decision, item.expected, item.name);
    const observed = JSON.parse(readFileSync(f.reportPath, 'utf8'));
    await assertProxyClosed(observed.endpoint);
    assert.deepEqual(readdirSync(f.workspaceParentDirectory), [], `${item.name}: workspace cleanup`);
    assert.deepEqual(readdirSync(f.privateParentDirectory), [], `${item.name}: private cleanup`);
  }
});

test('prepared wrapper cancellation after CLI start rejects and cleans session resources', async t => {
  const f = fixture(t, 'hang');
  const controller = new AbortController();
  const value = input(f);
  value.proxySessionOptions.processOptions.signal = controller.signal;
  const pending = runPreparedGeminiCiReview(value);
  for (let attempt = 0; attempt < 500 && !existsSync(f.reportPath); attempt += 1) await delay(10);
  assert.equal(existsSync(f.reportPath), true, 'fake CLI must signal that it started');
  const observed = JSON.parse(readFileSync(f.reportPath, 'utf8'));
  controller.abort();
  await assert.rejects(pending, /cancelled|did not complete successfully/i);
  await assertProxyClosed(observed.endpoint);
  assert.deepEqual(readdirSync(f.workspaceParentDirectory), []);
  assert.deepEqual(readdirSync(f.privateParentDirectory), []);
});

test('rejects caller prompt overrides, unsupported fields, malformed and non-JSON schemas', async t => {
  const cases = [
    [f => ({ ...input(f), unexpected: true }), /protected prompt, schema/],
    [f => { const value = input(f); value.proxySessionOptions.processOptions.prompt = 'override'; return value; }, /prompt overrides/],
    [f => { const value = input(f); value.proxySessionOptions.proxyUrl = 'http://127.0.0.1:1'; return value; }, /explicit proxy-session options/],
    [f => ({ ...input(f), protectedDecisionSchemaText: '{"type":"object","unsupportedKeyword":true}' }), /unsupported keyword/],
    [f => ({ ...input(f), protectedDecisionSchemaText: '{broken json' }), /valid JSON/],
  ];
  for (const [build, pattern] of cases) {
    const f = fixture(t);
    await assert.rejects(runPreparedGeminiCiReview(build(f)), pattern);
    assert.equal(existsSync(f.reportPath), false);
    assert.deepEqual(readdirSync(f.workspaceParentDirectory), []);
    assert.deepEqual(readdirSync(f.privateParentDirectory), []);
  }
});

test('rejects the effective UTF-8 prompt overflow before starting proxy or CLI', async t => {
  const f = fixture(t);
  const value = input(f);
  value.protectedPromptText = '境'.repeat(1200);
  value.proxySessionOptions.processOptions.maxPromptBytes = 1024;
  await assert.rejects(runPreparedGeminiCiReview(value), /complete prompt exceeds/);
  assert.deepEqual(readdirSync(f.workspaceParentDirectory), []);
  assert.deepEqual(readdirSync(f.privateParentDirectory), []);
});

test('accounts for JSON-envelope expansion within the explicit prompt byte limit before proxy startup', async t => {
  const f = fixture(t);
  const value = input(f);
  value.protectedPromptText = '@evidence/@manifest.json '.repeat(8);
  const completePrompt = `${value.protectedPromptText}\n\nProtected output schema (follow this schema exactly; downstream CI validation remains authoritative):\n${value.protectedDecisionSchemaText}\n`;
  const plaintextBytes = Buffer.byteLength(completePrompt, 'utf8');
  const envelopeBytes = Buffer.byteLength(encodeGeminiCliPromptForTransport(completePrompt), 'utf8');
  assert.ok(envelopeBytes > plaintextBytes);
  value.proxySessionOptions.processOptions.maxPromptBytes = plaintextBytes;
  await assert.rejects(runPreparedGeminiCiReview(value), /complete prompt exceeds the selected byte limit/);
  assert.equal(existsSync(f.reportPath), false);
  assert.deepEqual(readdirSync(f.workspaceParentDirectory), []);
  assert.deepEqual(readdirSync(f.privateParentDirectory), []);
});

test('rejects prompt bounds above the pinned CLI stdin limit before startup', async t => {
  const f = fixture(t);
  const value = input(f);
  value.proxySessionOptions.processOptions.maxPromptBytes = GEMINI_CLI_STDIN_LIMIT + 1;
  await assert.rejects(runPreparedGeminiCiReview(value), /no larger than the pinned CLI stdin limit/);
  assert.equal(existsSync(f.reportPath), false);
  assert.deepEqual(readdirSync(f.workspaceParentDirectory), []);
  assert.deepEqual(readdirSync(f.privateParentDirectory), []);
});

test('preserves proxy-session execution failures without returning a decision', async t => {
  const f = fixture(t, 'failure');
  await assert.rejects(runPreparedGeminiCiReview(input(f)), /exited unsuccessfully \(7\)/);
  const observed = JSON.parse(readFileSync(f.reportPath, 'utf8'));
  await assertProxyClosed(observed.endpoint);
});


test('rejects unsupported root and nested schema dialects before dispatch', async t => {
  for (const uri of ['https://example.invalid/custom', 'http://json-schema.org/draft-07/schema#', 42]) {
    for (const schema of [
      { ...decisionSchema, $schema: uri },
      { ...decisionSchema, properties: { decision: { type: 'string', $schema: uri } } },
    ]) {
      const f = fixture(t);
      const value = input(f);
      value.protectedDecisionSchemaText = JSON.stringify(schema);
      await assert.rejects(runPreparedGeminiCiReview(value), /unsupported schema dialect/);
      assert.equal(existsSync(f.reportPath), false);
      assert.deepEqual(readdirSync(f.workspaceParentDirectory), []);
      assert.deepEqual(readdirSync(f.privateParentDirectory), []);
    }
  }
});
