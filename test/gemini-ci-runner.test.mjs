import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseArgs, resolveReviewRequest, runGeminiCiReview } from '../src/gemini-ci-runner.mjs';

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


