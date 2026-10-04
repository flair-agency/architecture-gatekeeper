import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { request as httpRequest } from 'node:http';
import { join } from 'node:path';
import { runPreparedGeminiCiReview } from '../src/prepared-gemini-ci-review.mjs';
import { encodeGeminiCliPromptForTransport, GEMINI_CLI_STDIN_LIMIT } from '../src/gemini-cli-process.mjs';

const oid = char => char.repeat(40);
const workspaceLimits = { maxFiles: 2, maxFileBytes: 2048, maxTotalBytes: 4096 };
const decisionSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object', required: ['decision'], additionalProperties: false,
  properties: { decision: { type: 'string', enum: ['PASS', 'BLOCK'] } },
};

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

function fixture(t, mode = 'success') {
  const root = mkdtempSync(join(tmpdir(), 'prepared-gemini-ci-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const workspaceParentDirectory = join(root, 'workspace-parent'); mkdirSync(workspaceParentDirectory);
  const privateParentDirectory = join(root, 'process-private'); mkdirSync(privateParentDirectory);
  const reportPath = join(root, 'observation.json');
  const cliEntrypoint = join(root, 'fake-cli.mjs');
  writeFileSync(cliEntrypoint, `
import { writeFileSync } from 'node:fs';
const mode = ${JSON.stringify(mode)};
if (process.argv.includes('--version')) { process.stdout.write('0.62.0'); process.exit(0); }
let prompt = '';
for await (const chunk of process.stdin) prompt += chunk;
writeFileSync(${JSON.stringify(reportPath)}, JSON.stringify({ prompt, endpoint: process.env.GOOGLE_VERTEX_BASE_URL, env: process.env }));
if (mode === 'failure') { process.stderr.write('fixture execution failure'); process.exit(7); }
process.stdout.write(JSON.stringify({ response: 'raw protected-CI response text' }));
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
