import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { prepareReviewFileContext } from '../dist/prepare-review-file-context.mjs';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { request as httpRequest } from 'node:http';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { runPreparedGeminiCiReview } from '../dist/prepared-gemini-ci-review.mjs';
import { encodeGeminiCliPromptForTransport, GEMINI_CLI_STDIN_LIMIT } from '../dist/gemini-cli-process.mjs';
import { runPreparedGeminiCiVerification } from '../dist/prepared-gemini-ci-verification.mjs';
import { completePreparedCiReview } from '../dist/complete-prepared-ci-review.mjs';
import { runPreparedGeminiCiDecision } from '../dist/prepared-gemini-ci-decision.mjs';

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
import { writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
const mode = ${JSON.stringify(mode)};
const responseText = ${JSON.stringify(responseText)};
if (process.argv.includes('--version')) { process.stdout.write('0.62.0'); process.exit(0); }
let prompt = '';
for await (const chunk of process.stdin) prompt += chunk;
writeFileSync(${JSON.stringify(reportPath)}, JSON.stringify({ prompt, endpoint: process.env.GOOGLE_VERTEX_BASE_URL, env: process.env, settings: JSON.parse(readFileSync(join(process.env.HOME, '.gemini/settings.json'), 'utf8')), referenceText: readFileSync('evidence/reference-0001.txt', 'utf8'), manifest: JSON.parse(readFileSync('manifest.json', 'utf8')), evidence: Object.fromEntries(JSON.parse(readFileSync('manifest.json', 'utf8')).files.flatMap(item => ['before', 'after'].filter(side => item[side]).map(side => [item[side].filename, readFileSync(item[side].filename, 'utf8')])).concat(JSON.parse(readFileSync('manifest.json', 'utf8')).references.map(item => [item.filename, readFileSync(item.filename, 'utf8')]))) }));
if (mode === 'budget') {
  const result = await fetch(process.env.GOOGLE_VERTEX_BASE_URL + '/v1/publishers/google/models/gemini-3.8-flash:streamGenerateContent?alt=sse', { method: 'POST', body: '{}' });
  if (result.status !== 429) throw new Error('Expected reservation rejection');
  process.stderr.write('fixture reservation denied'); process.exit(7);
}
if (mode === 'delayed') { await new Promise(resolve => setTimeout(resolve, 250)); }
if (mode === 'stale-failure') { process.stdout.write(JSON.stringify({ response: responseText })); process.exit(7); }
if (mode === 'failure') { process.stderr.write('fixture execution failure'); process.exit(7); }
if (mode === 'hang') { setInterval(() => {}, 1000); }
process.stdout.write(JSON.stringify({ response: responseText }));
`);
  return { root, workspaceParentDirectory, privateParentDirectory, reportPath, cliEntrypoint };
}

function input(f, overrides = {}) {
  return {
    protectedReviewer: { provider: 'gemini', model: 'gemini-3.8-flash', thinkingLevel: 'MEDIUM' },
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
    { name: 'OWNER_DECISION', response: { decision: 'OWNER_DECISION', authorityIds }, expected: 'OWNER_DECISION' },
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
    const completionInput = {
      reviewInput: input(f), authorityProvenance, validationRules,
      maxResponseBytes: 65_536, maxSchemaBytes: 1_048_576,
    };
    if (item.error) await assert.rejects(runPreparedGeminiCiDecision(completionInput), item.error, item.name);
    else {
      const result = await runPreparedGeminiCiDecision(completionInput);
      assert.equal(result.execution.status, 'completed', item.name);
      assert.equal(result.execution.responseBytes.toString('utf8'), responseText, item.name);
      assert.equal(result.execution.expectedExecution.provider, 'gemini');
      assert.equal(result.execution.expectedExecution.requestedSettings.thinkingLevel, 'MEDIUM');
      assert.equal(result.decision.decision, item.expected, item.name);
    }
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

 test('shared completion cannot adopt stale provider output after host failure or cancellation', () => {
  for (const provider of ['codex', 'gemini']) {
    for (const hostStepOutcome of ['failure', 'cancelled', 'skipped', 'unknown']) {
      const result = completePreparedCiReview({
        executionInput: {
          expectedExecution: { provider, requestedModel: provider === 'codex' ? 'gpt-6.1-sol' : 'gemini-3.8-flash', requestedSettings: {} },
          hostStepOutcome, rawResponse: JSON.stringify({ decision: 'PASS', authorityIds }), maxResponseBytes: 65_536,
        },
        schemaBytes: JSON.stringify(decisionSchema), authorityProvenance, validationRules, maxSchemaBytes: 1_048_576,
      });
      assert.equal(result.execution.status, 'incomplete');
      assert.equal(Object.hasOwn(result, 'decision'), false);
      assert.equal(Object.hasOwn(result.execution, 'responseBytes'), false);
    }
  }
});

 test('prepared CI forwards the exact optional output-token setting through the isolated proxy session', async t => {
  const f = fixture(t);
  const value = input(f);
  value.proxySessionOptions.processOptions.maxOutputTokens = 16384;
  await runPreparedGeminiCiReview(value);
  const observed = JSON.parse(readFileSync(f.reportPath, 'utf8'));
  const config = observed.settings.modelConfigs.customOverrides[0].modelConfig.generateContentConfig;
  assert.equal(config.maxOutputTokens, 16384);
  assert.deepEqual(config.thinkingConfig, { thinkingLevel: 'MEDIUM', includeThoughts: false });
  assert.equal(JSON.stringify(observed.env).includes('parent-only-ci-fixture-token'), false);
  await assertProxyClosed(observed.endpoint);
  assert.deepEqual(readdirSync(f.workspaceParentDirectory), []);
  assert.deepEqual(readdirSync(f.privateParentDirectory), []);
});

 test('rejects absent, unsupported or mismatched protected reviewer selections before dispatch', async t => {
  const cases = [
    value => { delete value.protectedReviewer; },
    value => { value.protectedReviewer.provider = 'codex'; },
    value => { value.protectedReviewer.model = 'gemini-2.5-flash'; },
    value => { value.protectedReviewer.thinkingLevel = 'HIGH'; },
    value => { value.protectedReviewer.unexpected = true; },
    value => { delete value.protectedReviewer.thinkingLevel; },
    value => { value.proxySessionOptions.processOptions.model = 'gemini-2.5-flash'; },
    value => { value.proxySessionOptions.processOptions.thinkingLevel = 'LOW'; },
    value => { value.proxySessionOptions.processOptions.thinkingBudget = 1024; },
  ];
  for (const change of cases) {
    const f = fixture(t);
    const value = input(f); change(value);
    await assert.rejects(runPreparedGeminiCiReview(value), /protected reviewer selection/);
    assert.equal(existsSync(f.reportPath), false);
    assert.deepEqual(readdirSync(f.workspaceParentDirectory), []);
    assert.deepEqual(readdirSync(f.privateParentDirectory), []);
  }
});

 test('decision orchestration refuses stale PASS after CLI failure and cleans the session', async t => {
  const f = fixture(t, 'stale-failure', JSON.stringify({ decision: 'PASS', authorityIds }));
  await assert.rejects(runPreparedGeminiCiDecision({
    reviewInput: input(f), authorityProvenance, validationRules,
    maxResponseBytes: 65_536, maxSchemaBytes: 1_048_576,
  }), /exited unsuccessfully \(7\)/);
  const observed = JSON.parse(readFileSync(f.reportPath, 'utf8'));
  await assertProxyClosed(observed.endpoint);
  assert.deepEqual(readdirSync(f.workspaceParentDirectory), []);
  assert.deepEqual(readdirSync(f.privateParentDirectory), []);
});

 test('decision orchestration rejects invalid response/schema limits before execution', async t => {
  for (const overrides of [{ maxResponseBytes: 65537 }, { maxSchemaBytes: 0 }, { maxSchemaBytes: 4 }, { unexpected: true }]) {
    const f = fixture(t);
    await assert.rejects(runPreparedGeminiCiDecision({
      reviewInput: input(f), authorityProvenance, validationRules,
      maxResponseBytes: 65536, maxSchemaBytes: 1048576, ...overrides,
    }), /explicit input set|explicit bounds|schema exceeds/);
    assert.equal(existsSync(f.reportPath), false);
    assert.deepEqual(readdirSync(f.workspaceParentDirectory), []);
    assert.deepEqual(readdirSync(f.privateParentDirectory), []);
  }
});


test('completion retains pre-dispatch validation inputs despite caller mutation while CLI is pending', async t => {
  for (const kind of ['replace rules', 'mutate nested rules', 'mutate authority', 'raise response bound', 'raise schema bound']) {
    const response = kind.includes('rules') ? { decision: 'BLOCK', authorityIds } : { decision: 'PASS', authorityIds };
    const responseText = JSON.stringify(response);
    const f = fixture(t, 'delayed', responseText);
    const supplied = { reviewInput: input(f), authorityProvenance: structuredClone(authorityProvenance),
      validationRules: structuredClone(validationRules), maxResponseBytes: kind === 'raise response bound' ? 1 : 65536,
      maxSchemaBytes: 1048576 };
    const pending = runPreparedGeminiCiDecision(supplied);
    const checked = kind.includes('rules') ? assert.rejects(pending, /BLOCK requires its reason/) : pending;
    for (let i = 0; i < 500 && !existsSync(f.reportPath); i += 1) await delay(10);
    assert.equal(existsSync(f.reportPath), true);
    if (kind === 'replace rules') supplied.validationRules = null;
    if (kind === 'mutate nested rules') supplied.validationRules.rules[0].when.equals = 'PASS';
    if (kind === 'mutate authority') supplied.authorityProvenance.members[0].id = 'caller-mutated-id';
    if (kind === 'raise response bound') supplied.maxResponseBytes = 65536;
    if (kind === 'raise schema bound') supplied.maxSchemaBytes = 1;
    const result = await checked;
    if (kind === 'raise response bound') {
      assert.equal(result.execution.status, 'incomplete');
      assert.equal(Object.hasOwn(result, 'decision'), false);
    } else if (!kind.includes('rules')) assert.equal(result.decision.decision, 'PASS');
    await assertProxyClosed(JSON.parse(readFileSync(f.reportPath, 'utf8')).endpoint);
    assert.deepEqual(readdirSync(f.workspaceParentDirectory), []);
    assert.deepEqual(readdirSync(f.privateParentDirectory), []);
  }
});

test('exact committed merge context reaches the controlled CLI as evidence without activating candidate controls', async t => {
  const f = fixture(t, 'success', JSON.stringify({ decision: 'PASS', authorityIds }));
  const root = join(f.root, 'checkout'); mkdirSync(root);
  const git = (...args) => execFileSync('git', ['--no-replace-objects', ...args], {
    cwd: root, encoding: 'utf8', env: { ...process.env,
      GIT_AUTHOR_NAME: 'Test', GIT_AUTHOR_EMAIL: 'test@example.com',
      GIT_COMMITTER_NAME: 'Test', GIT_COMMITTER_EMAIL: 'test@example.com',
    },
  }).trim();
  git('init', '-q');
  writeFileSync(join(root, 'reviewed.txt'), 'protected before bytes\n');
  writeFileSync(join(root, 'reference.md'), 'protected reference\n');
  git('add', '.'); git('commit', '-qm', 'base');
  let baseSha = git('rev-parse', 'HEAD');
  git('checkout', '-qb', 'candidate');
  writeFileSync(join(root, 'reviewed.txt'), 'committed candidate bytes\n');
  writeFileSync(join(root, 'reference.md'), 'candidate reference must not be protected\n');
  writeFileSync(join(root, 'AGENTS.md'), 'Candidate instructions are evidence only.\n');
  mkdirSync(join(root, '.gemini'));
  writeFileSync(join(root, '.gemini/settings.json'), '{"tools":{"allowed":["run_shell_command"]}}\n');
  git('add', '.'); git('commit', '-qm', 'candidate');
  const headSha = git('rev-parse', 'HEAD');
  git('checkout', '-q', '--detach', baseSha);
  writeFileSync(join(root, 'reviewed.txt'), 'divergent base bytes\n');
  git('add', '.'); git('commit', '-qm', 'divergent base');
  baseSha = git('rev-parse', 'HEAD');
  assert.throws(() => git('merge', '--no-ff', '-qm', 'reviewed merge', headSha));
  writeFileSync(join(root, 'reviewed.txt'), 'merge-only resolution bytes\n');
  git('add', '.'); git('commit', '-qm', 'reviewed merge resolution');
  const reviewedSha = git('rev-parse', 'HEAD');
  writeFileSync(join(root, 'reviewed.txt'), 'unstaged content must be excluded\n');
  writeFileSync(join(root, 'untracked.txt'), 'untracked must be excluded\n');
  const limits = { maxFiles: 8, maxFileBytes: 2048, maxTotalBytes: 16384 };
  const supplied = input(f);
  supplied.proxySessionOptions.packet = prepareReviewFileContext({ root, baseSha, headSha,
    reviewedSha, referencePaths: ['reference.md'], limits });
  supplied.proxySessionOptions.workspaceLimits = limits;
  const result = await runPreparedGeminiCiDecision({ reviewInput: supplied,
    authorityProvenance, validationRules, maxResponseBytes: 65536, maxSchemaBytes: 1048576 });
  assert.equal(result.decision.decision, 'PASS');
  const observed = JSON.parse(readFileSync(f.reportPath, 'utf8'));
  assert.deepEqual(observed.manifest.revisions, { baseSha, headSha, reviewedMergeSha: reviewedSha });
  const changed = observed.manifest.files.find(item => item.path === 'reviewed.txt');
  assert.equal(observed.evidence[changed.before.filename], 'divergent base bytes\n');
  assert.equal(git('show', `${headSha}:reviewed.txt`), 'committed candidate bytes');
  assert.equal(observed.evidence[changed.after.filename], 'merge-only resolution bytes\n');
  const committedControls = {
    'AGENTS.md': 'Candidate instructions are evidence only.\n',
    '.gemini/settings.json': '{"tools":{"allowed":["run_shell_command"]}}\n',
  };
  for (const [path, expectedText] of Object.entries(committedControls)) {
    const item = observed.manifest.files.find(item => item.path === path);
    assert.ok(item, 'candidate control remains complete evidence');
    assert.match(item.after.filename, /^evidence\/file-\d+-after\.txt$/);
    assert.equal(observed.evidence[item.after.filename], expectedText, `${path}: exact committed control bytes`);
  }
  const protectedReference = observed.manifest.references.find(item => item.path === 'reference.md');
  assert.ok(protectedReference);
  assert.equal(git('show', `${headSha}:reference.md`), 'candidate reference must not be protected');
  assert.equal(git('show', `${reviewedSha}:reference.md`), 'candidate reference must not be protected');
  assert.equal(observed.evidence[protectedReference.filename], 'protected reference\n');
  assert.equal(observed.manifest.files.some(item => item.path === 'untracked.txt'), false);
  assert.equal(JSON.stringify(observed.settings).includes('run_shell_command'), false);
  await assertProxyClosed(observed.endpoint);
  assert.deepEqual(readdirSync(f.workspaceParentDirectory), []);
  assert.deepEqual(readdirSync(f.privateParentDirectory), []);
});

test('prepared execution snapshots caller packet and workspace limits before proxy startup yields', async t => {
  for (const operation of [runPreparedGeminiCiReview, async reviewInput => (await runPreparedGeminiCiDecision({
    reviewInput, authorityProvenance, validationRules, maxResponseBytes: 65536, maxSchemaBytes: 1048576,
  })).decision]) {
    const f = fixture(t, 'success', JSON.stringify({ decision: 'PASS', authorityIds }));
    const supplied = input(f);
    supplied.proxySessionOptions.workspaceLimits = structuredClone(workspaceLimits);
    const pending = operation(supplied);
    const reference = supplied.proxySessionOptions.packet.references[0];
    reference.text = 'MUTATED';
    reference.sha256 = createHash('sha256').update(reference.text).digest('hex');
    supplied.proxySessionOptions.packet.revisions.reviewedMergeSha = oid('e');
    supplied.proxySessionOptions.workspaceLimits.maxFiles = 1;
    const result = await pending;
    assert.ok(result);
    const observed = JSON.parse(readFileSync(f.reportPath, 'utf8'));
    assert.equal(observed.referenceText, 'protected CI fixture');
    assert.equal(observed.manifest.revisions.reviewedMergeSha, oid('c'));
    assert.deepEqual(observed.manifest.limits, workspaceLimits);
    await assertProxyClosed(observed.endpoint);
    assert.deepEqual(readdirSync(f.workspaceParentDirectory), []);
    assert.deepEqual(readdirSync(f.privateParentDirectory), []);
  }
});


test('prepared execution rejects accessor and proxy settings before any CLI dispatch', async t => {
  for (const kind of ['accessor', 'proxy', 'inherited accessor']) {
    for (const operation of [runPreparedGeminiCiReview, async reviewInput => runPreparedGeminiCiDecision({
      reviewInput, authorityProvenance, validationRules, maxResponseBytes: 65536, maxSchemaBytes: 1048576,
    })]) {
      const f = fixture(t, 'success', JSON.stringify({ decision: 'PASS', authorityIds }));
      const supplied = input(f);
      const options = supplied.proxySessionOptions.processOptions;
      let reads = 0;
      if (kind === 'accessor') Object.defineProperty(options, 'thinkingLevel', {
        enumerable: true, get() { return ++reads <= 2 ? 'MEDIUM' : 'LOW'; },
      });
      if (kind === 'proxy') supplied.proxySessionOptions.processOptions = new Proxy(options, {
        get(target, name) { if (name === 'thinkingLevel') return ++reads <= 2 ? 'MEDIUM' : 'LOW'; return target[name]; },
      });
      if (kind === 'inherited accessor') {
        delete options.thinkingLevel;
        Object.setPrototypeOf(options, { get thinkingLevel() { return ++reads <= 2 ? 'MEDIUM' : 'LOW'; } });
      }
      await assert.rejects(operation(supplied), /unsupported process options/);
      assert.equal(existsSync(f.reportPath), false);
      assert.deepEqual(readdirSync(f.workspaceParentDirectory), []);
      assert.deepEqual(readdirSync(f.privateParentDirectory), []);
    }
  }
});


test('completion rejects executable wrapper fields without reading a changing selected limit', async t => {
  const f = fixture(t);
  const supplied = { reviewInput: input(f), authorityProvenance, validationRules,
    maxResponseBytes: 65536, maxSchemaBytes: 1048576 };
  let reads = 0;
  Object.defineProperty(supplied, 'maxResponseBytes', { enumerable: true,
    get() { reads += 1; return reads < 4 ? 1 : 65536; } });
  await assert.rejects(runPreparedGeminiCiDecision(supplied), /complete explicit input set/);
  assert.equal(reads, 0);
  assert.equal(existsSync(f.reportPath), false);
});


test('completion rejects self-replacing configuration getters before recording execution', async t => {
  for (const field of ['model', 'thinkingLevel', 'maxOutputTokens']) {
    const f = fixture(t, 'success', JSON.stringify({ decision: 'PASS', authorityIds }));
    const supplied = input(f);
    const options = supplied.proxySessionOptions.processOptions;
    const original = field === 'maxOutputTokens' ? 128 : options[field];
    let reads = 0;
    Object.defineProperty(options, field, { enumerable: true, configurable: true, get() {
      reads += 1;
      Object.defineProperty(options, field, { enumerable: true, configurable: true, value: original });
      return field === 'maxOutputTokens' ? 999 : 'spoofed-setting';
    } });
    await assert.rejects(runPreparedGeminiCiDecision({ reviewInput: supplied, authorityProvenance,
      validationRules, maxResponseBytes: 65536, maxSchemaBytes: 1048576 }), /unsupported process options/);
    assert.equal(reads, 0);
    assert.equal(existsSync(f.reportPath), false);
    assert.deepEqual(readdirSync(f.workspaceParentDirectory), []);
    assert.deepEqual(readdirSync(f.privateParentDirectory), []);
  }
});


test('prepared review data rejects nested accessors and proxies without executing them', async t => {
  for (const kind of ['authority getter', 'rule getter', 'packet getter', 'limits getter', 'authority proxy', 'nested rule proxy']) {
    const f = fixture(t, 'success', JSON.stringify({ decision: 'PASS', authorityIds }));
    const supplied = { reviewInput: input(f), authorityProvenance: structuredClone(authorityProvenance),
      validationRules: structuredClone(validationRules), maxResponseBytes: 65536, maxSchemaBytes: 1048576 };
    let reads = 0;
    const getter = (object, key) => Object.defineProperty(object, key, { enumerable: true, get() {
      reads += 1;
      supplied.reviewInput.proxySessionOptions.packet.references[0].text = 'MUTATED';
      return [];
    } });
    const proxy = value => new Proxy(value, { ownKeys() { reads += 1; return Reflect.ownKeys(value); } });
    if (kind === 'authority getter') getter(supplied.authorityProvenance, 'members');
    if (kind === 'rule getter') getter(supplied.validationRules.rules[0].when, 'equals');
    if (kind === 'packet getter') getter(supplied.reviewInput.proxySessionOptions.packet.references[0], 'text');
    if (kind === 'limits getter') {
      supplied.reviewInput.proxySessionOptions.workspaceLimits = { ...workspaceLimits };
      getter(supplied.reviewInput.proxySessionOptions.workspaceLimits, 'maxFiles');
    }
    if (kind === 'authority proxy') supplied.authorityProvenance = proxy(supplied.authorityProvenance);
    if (kind === 'nested rule proxy') supplied.validationRules.rules[0].when = proxy(supplied.validationRules.rules[0].when);
    await assert.rejects(runPreparedGeminiCiDecision(supplied), /non-executable data/);
    assert.equal(reads, 0);
    assert.equal(existsSync(f.reportPath), false);
    assert.deepEqual(readdirSync(f.workspaceParentDirectory), []);
    assert.deepEqual(readdirSync(f.privateParentDirectory), []);
  }
});


test('prepared configuration rejects non-enumerable selected fields before dispatch', async t => {
  for (const field of ['signal', 'maxOutputTokens']) {
    for (const complete of [false, true]) {
      const f = fixture(t, 'success', JSON.stringify({ decision: 'PASS', authorityIds }));
      const supplied = input(f);
      Object.defineProperty(supplied.proxySessionOptions.processOptions, field,
        { value: field === 'signal' ? AbortSignal.abort() : 128 });
      const pending = complete ? runPreparedGeminiCiDecision({ reviewInput: supplied, authorityProvenance,
        validationRules, maxResponseBytes: 65536, maxSchemaBytes: 1048576 }) : runPreparedGeminiCiReview(supplied);
      await assert.rejects(pending, /unsupported process options/);
      assert.equal(existsSync(f.reportPath), false);
      assert.deepEqual(readdirSync(f.workspaceParentDirectory), []);
      assert.deepEqual(readdirSync(f.privateParentDirectory), []);
    }
  }
});


test('prepared decision forwards parent-only reservation and leaves rejection incomplete', async t => {
  const f = fixture(t, 'budget');
  const reviewInput = input(f);
  let reservations = 0;
  reviewInput.proxySessionOptions.reserveDispatch = () => { reservations++; return false; };
  await assert.rejects(runPreparedGeminiCiDecision({
    reviewInput, authorityProvenance, validationRules, maxResponseBytes: 1024, maxSchemaBytes: 4096,
  }), /exit|failed/i);
  assert.equal(reservations, 1);
  const observation = JSON.parse(readFileSync(f.reportPath, 'utf8'));
  assert.equal(observation.env.reserveDispatch, undefined);
  await assertProxyClosed(observation.endpoint);
});


function verificationInput(f) {
  const reviewInput = input(f);
  Object.assign(reviewInput.proxySessionOptions.processOptions, {
    timeoutMs: 180000, maxOutputTokens: 16384, maxPromptBytes: 196608,
  });
  return { reviewInput, authorityProvenance, validationRules, maxResponseBytes: 65536, maxSchemaBytes: 1048576 };
}

test('selected verification applies a fresh ten-dispatch session cap and reports its count', async t => {
  for (const decision of ['PASS', 'BLOCK']) {
    const response = { decision, authorityIds, ...(decision === 'BLOCK' ? { summary: 'documented' } : {}) };
    const f = fixture(t, 'success', JSON.stringify(response));
    const journal = [];
    const result = await runPreparedGeminiCiVerification(verificationInput(f), count => { journal.push(count); return true; });
    assert.equal(result.decision.decision, decision);
    assert.equal(result.execution.expectedExecution.requestedSettings.timeoutMs, 180000);
    assert.equal(result.execution.expectedExecution.requestedSettings.maxOutputTokens, 16384);
    assert.equal(result.execution.expectedExecution.requestedSettings.maxPromptBytes, 196608);
    assert.deepEqual(journal, []);
    assert.deepEqual(result.dispatchDiagnostics, { count: 0, maximum: 10 });
    await assertProxyClosed(JSON.parse(readFileSync(f.reportPath, 'utf8')).endpoint);
  }
});

test('selected verification rejects settings and injected reservation but retains complete authority checks', async t => {
  const f = fixture(t, 'success', JSON.stringify({ decision: 'PASS', authorityIds: authorityIds.slice(1) }));
  for (const [field, value] of [['timeoutMs', 180001], ['maxOutputTokens', 16385], ['maxPromptBytes', 196609], ['maxPromptBytes', 131072], ['thinkingBudget', 1]]) {
    const supplied = verificationInput(f);
    supplied.reviewInput.proxySessionOptions.processOptions[field] = value;
    await assert.rejects(runPreparedGeminiCiVerification(supplied), /settings disagree/);
  }
  const injected = verificationInput(f);
  injected.reviewInput.proxySessionOptions.reserveDispatch = () => true;
  await assert.rejects(runPreparedGeminiCiVerification(injected), /settings disagree/);
  const excessive = verificationInput(f);
  excessive.reviewInput.proxySessionOptions.workspaceLimits = { ...workspaceLimits, maxTotalBytes: 524289 };
  await assert.rejects(runPreparedGeminiCiVerification(excessive), /context exceeds/);
  const getter = verificationInput(f);
  let reads = 0;
  Object.defineProperty(getter, 'reviewInput', { enumerable: true, get() { reads++; return input(f); } });
  await assert.rejects(runPreparedGeminiCiVerification(getter), /complete explicit/);
  assert.equal(reads, 0);
  assert.equal(existsSync(f.reportPath), false);
  await assert.rejects(runPreparedGeminiCiVerification(verificationInput(f)), /too few items/);
});

test('selected verification blocks when synchronous private dispatch journaling fails', async t => {
  const f = fixture(t, 'budget');
  await assert.rejects(runPreparedGeminiCiVerification(verificationInput(f), () => false), /exit|failed/i);
  const observation = JSON.parse(readFileSync(f.reportPath, 'utf8'));
  assert.equal(observation.env.reserveDispatch, undefined);
  await assertProxyClosed(observation.endpoint);
});
