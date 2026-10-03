import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReviewRequestAsync, preflightReviewRequest } from '../src/review-contract.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { formatGitHubReviewOutputs, parseArgs, resolveSafePath, resolveReviewRequest, runGeminiCiReview } from '../src/gemini-ci-runner.mjs';

test('parseArgs parses key-value and flag arguments', () => {
  const args = ['--prompt', 'p.md', '--schema', 's.json', '--flag', '--output', 'out.json'];
  const parsed = parseArgs(args);
  assert.deepEqual(parsed, {
    prompt: 'p.md',
    schema: 's.json',
    flag: 'true',
    output: 'out.json',
  });
});

test('resolveReviewRequest validates missing files', () => {
  const dir = mkdtempSync(join(tmpdir(), 'gemini-runner-test-'));
  try {
    assert.throws(
      () => resolveReviewRequest({ prompt: 'missing.md', schema: 'missing.json' }, dir),
      /Missing or non-existent prompt file/
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('resolveReviewRequest loads prompt and schema from disk', () => {
  const dir = mkdtempSync(join(tmpdir(), 'gemini-runner-test-'));
  try {
    const promptPath = join(dir, 'prompt.md');
    const schemaPath = join(dir, 'schema.json');
    writeFileSync(promptPath, 'Review this change', 'utf8');
    writeFileSync(schemaPath, JSON.stringify({ type: 'object' }), 'utf8');

    const req = resolveReviewRequest({ prompt: 'prompt.md', schema: 'schema.json', model: 'gemini-2.5-flash', effort: 'medium' }, dir);
    assert.equal(req.prompt, 'Review this change');
    assert.deepEqual(req.schema, { type: 'object' });
    assert.equal(req.reviewer.model, 'gemini-2.5-flash');
    assert.equal(req.reviewer.reasoningEffort, 'medium');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('resolveReviewRequest loads pre-materialized request-json', () => {
  const dir = mkdtempSync(join(tmpdir(), 'gemini-runner-test-'));
  try {
    const reqJsonPath = join(dir, 'request.json');
    const sampleReq = {
      version: 1,
      prompt: 'Sample prompt',
      schema: { type: 'object' },
      reviewer: { model: 'gemini-2.5-flash', reasoningEffort: 'low', reviewTimeoutMs: 60000 },
      repositoryRoot: dir,
    };
    writeFileSync(reqJsonPath, JSON.stringify(sampleReq), 'utf8');

    const loaded = resolveReviewRequest({ 'request-json': 'request.json' }, dir);
    assert.deepEqual(loaded, sampleReq);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('runGeminiCiReview executes end-to-end review and outputs valid decision.json', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'gemini-runner-e2e-'));
  const originalFetch = globalThis.fetch;
  const originalEnv = { ...process.env };
  try {
    const promptPath = join(dir, 'prompt.md');
    const schemaPath = join(dir, 'decision.schema.json');
    const outputPath = join(dir, 'decision.json');

    // Canonical minimal schema for Gatekeeper decision
    const schema = {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
      required: ['decision', 'summary', 'reviewedRevision'],
      properties: {
        decision: { type: 'string', enum: ['PASS', 'BLOCK', 'OWNER_DECISION'] },
        summary: { type: 'string' },
        reviewedRevision: { type: 'string' },
      },
      additionalProperties: false,
    };

    writeFileSync(promptPath, 'Evaluate architecture compatibility', 'utf8');
    writeFileSync(schemaPath, JSON.stringify(schema), 'utf8');

    // Mock response payload from Gemini API
    const mockGeminiResponse = {
      candidates: [
        {
          content: {
            parts: [
              {
                text: JSON.stringify({
                  decision: 'PASS',
                  summary: 'Architecture complies with normative rules.',
                  reviewedRevision: 'c201881',
                }),
              },
            ],
          },
          finishReason: 'STOP',
        },
      ],
    };

    globalThis.fetch = async (url, options) => {
      assert.match(url, /generativelanguage\.googleapis\.com/);
      assert.equal(options.headers['x-goog-api-key'], 'test-api-key');
      return {
        ok: true,
        status: 200,
        json: async () => mockGeminiResponse,
      };
    };

    process.env.GEMINI_API_KEY = 'test-api-key';
    delete process.env.CLOUDSDK_AUTH_ACCESS_TOKEN;

    const result = await runGeminiCiReview(
      [
        '--prompt', 'prompt.md',
        '--schema', 'decision.schema.json',
        '--output', 'decision.json',
        '--model', 'gemini-2.5-flash',
        '--effort', 'low',
      ],
      dir
    );

    assert.equal(result.decision, 'PASS');
    assert.equal(result.summary, 'Architecture complies with normative rules.');
    assert.equal(result.reviewedRevision, 'c201881');

    // Verify written decision.json file
    const persisted = JSON.parse(readFileSync(outputPath, 'utf8'));
    assert.deepEqual(persisted, result);
  } finally {
    globalThis.fetch = originalFetch;
    process.env = originalEnv;
    rmSync(dir, { recursive: true, force: true });
  }
});

test('runGeminiCiReview fails closed when response violates decision schema', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'gemini-runner-fail-'));
  const originalFetch = globalThis.fetch;
  const originalEnv = { ...process.env };
  try {
    const promptPath = join(dir, 'prompt.md');
    const schemaPath = join(dir, 'decision.schema.json');

    const schema = {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
      required: ['decision', 'summary'],
      properties: {
        decision: { type: 'string', enum: ['PASS', 'BLOCK'] },
        summary: { type: 'string' },
      },
      additionalProperties: false,
    };

    writeFileSync(promptPath, 'Evaluate architecture compatibility', 'utf8');
    writeFileSync(schemaPath, JSON.stringify(schema), 'utf8');

    // Missing 'summary' (schema violation)
    const mockInvalidResponse = {
      candidates: [
        {
          content: {
            parts: [
              {
                text: JSON.stringify({
                  decision: 'PASS',
                }),
              },
            ],
          },
          finishReason: 'STOP',
        },
      ],
    };

    globalThis.fetch = async () => ({
      ok: true,
      status: 200,
      json: async () => mockInvalidResponse,
    });

    process.env.GEMINI_API_KEY = 'test-key';
    delete process.env.CLOUDSDK_AUTH_ACCESS_TOKEN;

    await assert.rejects(
      runGeminiCiReview(
        ['--prompt', 'prompt.md', '--schema', 'decision.schema.json'],
        dir
      ),
      /Decision schema validation failed/
    );
  } finally {
    globalThis.fetch = originalFetch;
    process.env = originalEnv;
    rmSync(dir, { recursive: true, force: true });
  }
});

test('runGeminiCiReview writes outputs to GITHUB_OUTPUT when present in valid runner temp', async () => {
  const root = mkdtempSync(join(tmpdir(), 'gemini-runner-gh-out-'));
  const runnerTemp = join(root, 'runner-temp');
  mkdirSync(runnerTemp);
  const commandDir = join(runnerTemp, '_runner_file_commands');
  mkdirSync(commandDir);
  const githubOutputPath = join(commandDir, 'set_output_12345678-test');
  writeFileSync(githubOutputPath, '', 'utf8');

  const oldCwd = process.cwd();
  const originalFetch = globalThis.fetch;
  const originalEnv = { ...process.env };

  try {
    const realRunnerTemp = realpathSync(runnerTemp);
    process.chdir(realRunnerTemp);
    process.env.RUNNER_TEMP = realRunnerTemp;
    process.env.GITHUB_OUTPUT = realpathSync(githubOutputPath);
    process.env.GEMINI_API_KEY = 'test-key';
    delete process.env.CLOUDSDK_AUTH_ACCESS_TOKEN;

    const promptPath = join(realRunnerTemp, 'prompt.md');
    const schemaPath = join(realRunnerTemp, 'decision.schema.json');

    const schema = {
      type: 'object',
      required: ['decision'],
      properties: { decision: { type: 'string' } },
    };

    writeFileSync(promptPath, 'Prompt text', 'utf8');
    writeFileSync(schemaPath, JSON.stringify(schema), 'utf8');

    globalThis.fetch = async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: JSON.stringify({ decision: 'PASS' }) }] }, finishReason: 'STOP' }],
      }),
    });

    await runGeminiCiReview(
      ['--prompt', 'prompt.md', '--schema', 'decision.schema.json'],
      runnerTemp
    );

    const ghOutputContent = readFileSync(githubOutputPath, 'utf8');
    assert.match(ghOutputContent, /final-message={"decision":"PASS"}/);
    assert.match(ghOutputContent, /decision-kind=PASS/);
  } finally {
    process.chdir(oldCwd);
    globalThis.fetch = originalFetch;
    process.env = originalEnv;
    rmSync(root, { recursive: true, force: true });
  }
});

test('resolveReviewRequest configures explicit Gemini provider with thinkingBudget', () => {
  const dir = mkdtempSync(join(tmpdir(), 'gemini-runner-test-'));
  try {
    const promptPath = join(dir, 'prompt.md');
    const schemaPath = join(dir, 'schema.json');
    writeFileSync(promptPath, 'Review this change', 'utf8');
    writeFileSync(schemaPath, JSON.stringify({ type: 'object' }), 'utf8');

    const req = resolveReviewRequest(
      { prompt: 'prompt.md', schema: 'schema.json', provider: 'gemini', model: 'gemini-2.5-flash', budget: '2048' },
      dir
    );
    assert.equal(req.reviewer.provider, 'gemini');
    assert.equal(req.reviewer.model, 'gemini-2.5-flash');
    assert.equal(req.reviewer.thinkingBudget, 2048);
    assert.equal(req.reviewer.reasoningEffort, undefined);

    // Rejects mixed settings
    assert.throws(
      () =>
        resolveReviewRequest(
          { prompt: 'prompt.md', schema: 'schema.json', provider: 'gemini', effort: 'low', budget: '2048' },
          dir
        ),
      /mixed thinkingBudget and reasoningEffort settings are not allowed/
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});




test('revision-bound request mutations and Codex selection are rejected before fetch', async () => {
  const request = await createReviewRequestAsync('Test preflight rejection');
  const dir = mkdtempSync(join(tmpdir(), 'gemini-preflight-'));
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls++; throw new Error('Provider must not execute'); };
  try {
    for (const change of [
      { prompt: request.prompt + 'tampered' },
      { reviewedRevision: '' },
      { reviewedRevision: null },
      { reviewedRevision: undefined },
      { schema: { type: 'object' } },
      { reviewer: { provider: 'gemini', model: 'gemini-2.5-flash', thinkingBudget: 1024 } },
    ]) {
      writeFileSync(join(dir, 'request.json'), JSON.stringify({ ...request, ...change }));
      await assert.rejects(runGeminiCiReview(['--request-json', 'request.json'], dir), /request was modified|request is unsupported/);
    }
    writeFileSync(join(dir, 'request.json'), JSON.stringify(request));
    await assert.rejects(runGeminiCiReview(['--request-json', 'request.json'], dir), /recorded gemini provider selection/);
    assert.equal(calls, 0);
  } finally {
    globalThis.fetch = originalFetch;
    rmSync(dir, { recursive: true, force: true });
  }
});


test('runner paths reject symlink escapes for reads and new outputs', () => {
  const dir = mkdtempSync(join(tmpdir(), 'gemini-path-'));
  try {
    symlinkSync('/etc', join(dir, 'outside'));
    assert.throws(() => resolveSafePath('outside/hosts', dir), /symlink escapes/);
    assert.throws(() => resolveSafePath('outside/new-output.json', dir), /symlink escapes/);
    assert.equal(resolveSafePath('new-output.json', dir), join(realpathSync(dir), 'new-output.json'));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});


test('shared preflight compares rehashed requests to committed selection', async () => {
  const request = await createReviewRequestAsync('Verify committed selection');
  assert.equal(await preflightReviewRequest(request, 'codex'), request);
  const { requestId, ...unsigned } = request;
  unsigned.reviewer = { provider: 'gemini', model: 'gemini-2.5-flash', thinkingBudget: 1024, reviewTimeoutMs: request.reviewer.reviewTimeoutMs };
  const forged = { ...unsigned, requestId: createHash('sha256').update(JSON.stringify(unsigned)).digest('hex') };
  await assert.rejects(preflightReviewRequest(forged, 'gemini'), /differs from committed inputs/);
});


test('GitHub output serialization rejects command-protocol injection', () => {
  assert.throws(() => formatGitHubReviewOutputs({ decision: 'BLOCK\ndecision-kind=PASS' }, 'out.json'), /valid decision kind/);
  assert.throws(() => formatGitHubReviewOutputs({ decision: 'BLOCK' }, 'out.json\ndecision-kind=PASS'), /single-line output path/);
  assert.throws(() => formatGitHubReviewOutputs({ decision: 'BLOCK' }, 'out.json\rdecision-kind=PASS'), /single-line output path/);
  const output = formatGitHubReviewOutputs({ decision: 'BLOCK', summary: 'untrusted\ndecision-kind=PASS' }, 'out.json');
  assert.deepEqual(output.trimEnd().split('\n').map(line => line.split('=')[0]), ['final-message', 'decision-file', 'decision-kind']);
  assert.equal(output.trimEnd().split('\n').at(-1), 'decision-kind=BLOCK');
});


test('runner rejects dangling file and parent symlinks before dispatch or persistence', () => {
  const dir = mkdtempSync(join(tmpdir(), 'gemini-dangling-'));
  try {
    symlinkSync('/etc/agk-nonexistent-fixture-target', join(dir, 'decision.json'));
    symlinkSync('/etc/agk-nonexistent-fixture-parent', join(dir, 'parent'));
    assert.throws(() => resolveSafePath('decision.json', dir), /dangling or inaccessible/);
    assert.throws(() => resolveSafePath('parent/decision.json', dir), /dangling or inaccessible/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});


test('review output rejects repository writes and publishes from checkout cwd', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'gemini-output-contract-'));
  const root = join(dir, 'checkout'); mkdirSync(root);
  const runnerTemp = realpathSync(dir);
  const originalFetch = globalThis.fetch, savedEnv = { ...process.env };
  let calls = 0;
  try {
    execFileSync('git', ['init', '-q'], { cwd: root });
    writeFileSync(join(root, 'prompt.md'), 'review');
    writeFileSync(join(root, 'schema.json'), '{"type":"object"}');
    writeFileSync(join(root, 'authority.md'), 'unchanged authority');
    globalThis.fetch = async () => { calls++; return { ok: true, json: async () => ({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: '{"decision":"PASS","summary":"ok"}' }] } }] }) }; };
    const args = ['--prompt','prompt.md','--schema','schema.json','--model','gemini-2.5-flash','--api-key','fixture'];
    for (const path of ['authority.md', 'decision.json']) await assert.rejects(runGeminiCiReview([...args,'--output',path],root), /outside the reviewed repository/);
    assert.equal(calls,0);
    assert.equal(readFileSync(join(root,'authority.md'),'utf8'),'unchanged authority');
    const commandDir = join(runnerTemp,'_runner_file_commands'); mkdirSync(commandDir);
    process.env.RUNNER_TEMP = runnerTemp;
    process.env.GITHUB_OUTPUT = join(commandDir,'set_output_fixture'); writeFileSync(process.env.GITHUB_OUTPUT,'');
    assert.equal((await runGeminiCiReview(args,root)).decision,'PASS');
    const published = readFileSync(process.env.GITHUB_OUTPUT,'utf8');
    assert.match(published,/decision-kind=PASS/);
    const resultPath = published.match(/^decision-file=(.+)$/m)[1];
    assert.ok(!resultPath.startsWith(root+'/'));
    rmSync(join(resultPath,'..'),{recursive:true,force:true});
    process.env.GITHUB_OUTPUT = join(runnerTemp,'not_a_command_file');
    const out = join(runnerTemp,'rejected-publication.json');
    await assert.rejects(runGeminiCiReview([...args,'--output',out],root), /output file is unavailable/);
    await assert.rejects(runGeminiCiReview([...args,'--output',out],root), /overwriting is prohibited/);
  } finally { globalThis.fetch=originalFetch; process.env=savedEnv; rmSync(dir,{recursive:true,force:true}); }
});

 test('runner preserves equals-form values and rejects explicit alternate providers before input reads', () => {
  assert.deepEqual(parseArgs(['--request-json=a=b.json', '--model=gemini-2.5-flash', '--provider=codex']), { 'request-json': 'a=b.json', model: 'gemini-2.5-flash', provider: 'codex' });
  for (const provider of ['codex', 'other', '']) assert.throws(() => resolveReviewRequest({ provider, prompt: 'missing', schema: 'missing' }), /explicit provider/);
});


test('standalone runner model selection matches launcher REVIEW_MODEL precedence', () => {
  const dir = mkdtempSync(join(tmpdir(), 'gemini-model-env-'));
  const oldModel = process.env.MODEL, oldReviewModel = process.env.REVIEW_MODEL;
  try {
    writeFileSync(join(dir, 'prompt.md'), 'Review');
    writeFileSync(join(dir, 'schema.json'), JSON.stringify({ type: 'object' }));
    delete process.env.MODEL;
    process.env.REVIEW_MODEL = 'gemini-2.5-pro';
    assert.equal(resolveReviewRequest({ prompt: 'prompt.md', schema: 'schema.json' }, dir).reviewer.model, 'gemini-2.5-pro');
    process.env.MODEL = 'gemini-2.5-flash';
    assert.equal(resolveReviewRequest({ prompt: 'prompt.md', schema: 'schema.json' }, dir).reviewer.model, 'gemini-2.5-flash');
  } finally {
    if (oldModel === undefined) delete process.env.MODEL; else process.env.MODEL = oldModel;
    if (oldReviewModel === undefined) delete process.env.REVIEW_MODEL; else process.env.REVIEW_MODEL = oldReviewModel;
    rmSync(dir, { recursive: true, force: true });
  }
});


test('checkout input symlinks cannot cross to another otherwise authorized temporary root', () => {
  const checkout = mkdtempSync(join(tmpdir(), 'gemini-root-checkout-'));
  const outside = mkdtempSync(join(tmpdir(), 'gemini-root-outside-'));
  try {
    writeFileSync(join(outside, 'prompt.md'), 'Host-private bytes');
    symlinkSync(outside, join(checkout, 'linked'));
    assert.throws(() => resolveSafePath('linked/prompt.md', checkout), /symlink escapes/);
    assert.throws(() => resolveSafePath('linked/new.json', checkout), /symlink escapes/);
    assert.equal(resolveSafePath(join(outside, 'prompt.md'), checkout), realpathSync(join(outside, 'prompt.md')));
  } finally { rmSync(checkout, { recursive: true, force: true }); rmSync(outside, { recursive: true, force: true }); }
});
