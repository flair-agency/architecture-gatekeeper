import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { prepareReviewContext } from '../src/prepare-review-context.mjs';

const git = (root, ...args) => execFileSync('git', ['--no-replace-objects', ...args], { cwd: root, encoding: 'utf8', env: {
  ...process.env, GIT_AUTHOR_NAME: 'Test', GIT_AUTHOR_EMAIL: 'test@example.com',
  GIT_COMMITTER_NAME: 'Test', GIT_COMMITTER_EMAIL: 'test@example.com',
} }).trim();

function makeReview(t, maliciousDiffConfig = false) {
  const root = mkdtempSync(join(tmpdir(), 'review-task-context-'));
  const runnerTemp = mkdtempSync(join(tmpdir(), 'review-task-context-runner-'));
  t.after(() => { rmSync(root, { recursive: true, force: true }); rmSync(runnerTemp, { recursive: true, force: true }); });
  git(root, 'init', '-q');
  git(root, 'config', 'core.autocrlf', 'false');
  writeFileSync(join(root, 'subject.md'), 'before\n');
  git(root, 'add', '.'); git(root, 'commit', '-qm', 'base');
  git(root, 'checkout', '-qb', 'candidate');
  writeFileSync(join(root, 'subject.md'), 'after\n');
  writeFileSync(join(root, 'line\nname.md'), 'newline path\n');
  if (maliciousDiffConfig) writeFileSync(join(root, '.gitattributes'), '*.md diff=execute-me\n');
  git(root, 'add', '.'); git(root, 'commit', '-qm', 'candidate');
  const headSha = git(root, 'rev-parse', 'HEAD');
  git(root, 'checkout', '-q', '-');
  writeFileSync(join(root, 'target-only.md'), 'target line retained\n');
  git(root, 'add', '.'); git(root, 'commit', '-qm', 'target-only update after candidate branch');
  const baseSha = git(root, 'rev-parse', 'HEAD');
  git(root, 'merge', '--no-ff', '-qm', 'review merge', 'candidate');
  const reviewedSha = git(root, 'rev-parse', 'HEAD');
  mkdirSync(join(root, '.architecture-gatekeeper-validation-runtime', 'docs'), { recursive: true });
  writeFileSync(join(root, '.architecture-gatekeeper-validation-runtime/docs/runtime.md'), 'must not be review scope');
  const promptPath = join(runnerTemp, 'protected-prompt.md');
  writeFileSync(promptPath, 'Protected reviewer instructions.');
  const outputPath = join(runnerTemp, 'final-prompt.md');
  const input = { root, baseSha, headSha, reviewedSha, repository: 'example/consumer', promptPath, outputPath,
    authorityRouteSelected: 'true', authorityLimitsBase64: Buffer.from(JSON.stringify({ maxManifestBytes: 1024,
      maxMembers: 4, maxFileBytes: 1024, maxTotalBytes: 2048, maxPromptBytes: 8192 })).toString('base64'),
    authorityProfile: 'v1', policyVersion: '' };
  return { root, runnerTemp, input, promptPath, outputPath };
}

test('appends exact base-to-reviewed-merge context across divergent history', t => {
  const context = makeReview(t);
  process.env.RUNNER_TEMP = context.runnerTemp;
  t.after(() => { delete process.env.RUNNER_TEMP; });
  const result = prepareReviewContext(context.input);
  const prompt = readFileSync(context.outputPath, 'utf8');
  const data = JSON.parse(prompt.slice(prompt.indexOf('{', prompt.indexOf('untrusted candidate data'))));
  assert.match(prompt, /^Protected reviewer instructions\./);
  assert.equal(data.repository, 'example/consumer');
  assert.equal(data.baseSha, context.input.baseSha);
  assert.equal(data.headSha, context.input.headSha);
  assert.equal(data.reviewedMergeSha, context.input.reviewedSha);
  assert.deepEqual(data.changedPaths, ['line\nname.md', 'subject.md']);
  assert.match(data.exactBaseToReviewedMergeDiff, /before/);
  assert.doesNotMatch(data.exactBaseToReviewedMergeDiff, /target-only\.md|target line retained/);
  assert.match(readFileSync(join(context.root, 'target-only.md'), 'utf8'), /target line retained/);
  assert.doesNotMatch(JSON.stringify(data), /must not be review scope/);
  assert.equal(result.finalPromptBytes, Buffer.byteLength(prompt));
  assert.ok(result.finalPromptBytes <= result.maxPromptBytes);
});

test('fails closed when exact merge parents or protected prompt limit cannot be verified', t => {
  const context = makeReview(t);
  process.env.RUNNER_TEMP = context.runnerTemp;
  t.after(() => { delete process.env.RUNNER_TEMP; });
  assert.throws(() => prepareReviewContext({ ...context.input, headSha: context.input.baseSha }), /three distinct full commit revisions/);
  assert.throws(() => prepareReviewContext({ ...context.input, baseSha: '0'.repeat(40) }), /all exist in the checkout/);
  assert.throws(() => prepareReviewContext({ ...context.input, authorityLimitsBase64: '' }), /selected Authority Set prompt limits/);
  assert.throws(() => prepareReviewContext({ ...context.input, reviewedSha: 'f'.repeat(40) }), /all exist in the checkout/);
});

test('bounds the combined prompt and never invokes candidate diff drivers', t => {
  const context = makeReview(t, true);
  process.env.RUNNER_TEMP = context.runnerTemp;
  t.after(() => { delete process.env.RUNNER_TEMP; });
  git(context.root, 'config', 'diff.execute-me.command', 'touch candidate-diff-driver-was-executed');
  git(context.root, 'config', 'diff.external', 'touch candidate-external-diff-was-executed');
  const limits = JSON.parse(Buffer.from(context.input.authorityLimitsBase64, 'base64').toString());
  context.input.authorityLimitsBase64 = Buffer.from(JSON.stringify({ ...limits, maxPromptBytes: 900 })).toString('base64');
  assert.throws(() => prepareReviewContext(context.input), /final review prompt including task context exceeds/);
  context.input.authorityLimitsBase64 = Buffer.from(JSON.stringify({ ...limits, maxPromptBytes: 8192 })).toString('base64');
  prepareReviewContext(context.input);
  assert.equal(existsSync(join(context.root, 'candidate-diff-driver-was-executed')), false);
  assert.equal(existsSync(join(context.root, 'candidate-external-diff-was-executed')), false);
});
