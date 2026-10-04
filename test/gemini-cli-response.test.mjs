import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { extractGeminiCliResponseText, validateGeminiCliResponse } from '../src/gemini-cli-response.mjs';
import { createReviewRequestAsync } from '../src/review-contract.mjs';

const limits = { maxStdoutBytes: 4096, maxStderrBytes: 256 };
const good = { exitCode: 0, stdout: JSON.stringify({ response: '{"decision":"PASS"}', stats: { tokens: 1 } }), stderr: '' };

test('extracts decision text from the real CLI output-format json envelope', () => {
  assert.equal(extractGeminiCliResponseText(good, limits), '{"decision":"PASS"}');
});

test('rejects missing, malformed, error, and unsuccessful process results', () => {
  for (const result of [
    { exitCode: 0, stdout: '{', stderr: '' },
    { exitCode: 0, stdout: '{}', stderr: '' },
    { exitCode: 0, stdout: JSON.stringify({ response: '', error: 'failed' }), stderr: '' },
    { exitCode: 1, stdout: JSON.stringify({ response: '{}' }), stderr: '' },
    { exitCode: 0, stdout: JSON.stringify({ response: '{}' }), stderr: '', timedOut: true },
    { exitCode: 0, stdout: JSON.stringify({ response: '{}' }), stderr: '', signal: 'SIGTERM' },
    { exitCode: 0, stdout: JSON.stringify({ response: '{}' }), stderr: '', error: new Error('spawn failed') },
  ]) assert.throws(() => extractGeminiCliResponseText(result, limits));
});

test('requires explicit ceilings and rejects output over either ceiling without truncation', () => {
  assert.throws(() => extractGeminiCliResponseText(good), /explicit positive/);
  assert.throws(() => extractGeminiCliResponseText({ ...good, stdout: `${good.stdout} ` }, { ...limits, maxStdoutBytes: Buffer.byteLength(good.stdout) }), /size limit/);
  assert.throws(() => extractGeminiCliResponseText({ ...good, stderr: 'x'.repeat(257) }, limits), /size limit/);
});

test('validates extracted decision JSON with the revision-bound review contract', async t => {
  const parent = mkdtempSync(join(tmpdir(), 'gemini-cli-contract-'));
  t.after(() => rmSync(parent, { recursive: true, force: true }));
  const root = join(parent, 'repo');
  const gate = join(root, '.codex', 'gatekeeper');
  mkdirSync(gate, { recursive: true });
  writeFileSync(join(root, 'AGENTS.md'), '# Authority\n');
  writeFileSync(join(gate, 'prompt.md'), 'Review the change.');
  writeFileSync(join(gate, 'schema.json'), JSON.stringify({ type: 'object', additionalProperties: false, required: ['decision', 'summary', 'authorityFiles', 'reviewedScope'], properties: { decision: { enum: ['PASS', 'BLOCK', 'OWNER_DECISION'] }, summary: { type: 'string' }, authorityFiles: { type: 'array', minItems: 1, items: { type: 'string' } }, reviewedScope: { type: 'array', minItems: 1, items: { type: 'string' } } } }));
  writeFileSync(join(gate, 'reviewer.json'), JSON.stringify({ provider: 'gemini', model: 'gemini-2.5-flash', thinkingBudget: 0 }));
  writeFileSync(join(gate, 'config.json'), JSON.stringify({ version: 1, authorityFiles: ['AGENTS.md'], requiredReportedAuthorityFiles: ['AGENTS.md'], requiredPassArrays: ['reviewedScope'], promptPath: '.codex/gatekeeper/prompt.md', schemaPath: '.codex/gatekeeper/schema.json', reviewerConfigPath: '.codex/gatekeeper/reviewer.json', reviewTimeoutMs: 5000 }));
  execFileSync('git', ['init'], { cwd: root });
  execFileSync('git', ['config', 'user.name', 'Test'], { cwd: root });
  execFileSync('git', ['config', 'user.email', 'test@example.invalid'], { cwd: root });
  execFileSync('git', ['add', '.'], { cwd: root });
  execFileSync('git', ['commit', '-m', 'fixture'], { cwd: root });
  const request = await createReviewRequestAsync('Review fixture', root);
  const decision = { decision: 'PASS', summary: 'ok', authorityFiles: ['AGENTS.md'], reviewedScope: ['fixture'] };
  const result = validateGeminiCliResponse({ ...good, stdout: JSON.stringify({ response: JSON.stringify(decision) }) }, request, limits);
  assert.equal(result.decision, 'PASS');
  assert.throws(() => validateGeminiCliResponse({ ...good, stdout: JSON.stringify({ response: JSON.stringify({ ...decision, authorityFiles: ['AGENTS.md', 'src/unapproved.mjs'] }) }) }, request, limits), /outside the configured boundary/);
  assert.throws(() => validateGeminiCliResponse({ ...good, stdout: JSON.stringify({ response: JSON.stringify({ decision: 'PASS', summary: 'missing required fields' }) }) }, request, limits), /schema validation failed/);
});
