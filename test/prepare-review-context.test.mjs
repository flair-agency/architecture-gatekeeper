import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { prepareReviewContext } from '../src/prepare-review-context.mjs';

const git = (root, ...args) => execFileSync('git', ['--no-replace-objects', ...args], { cwd: root, encoding: 'utf8', env: {
  ...process.env, GIT_AUTHOR_NAME: 'Test', GIT_AUTHOR_EMAIL: 'test@example.com',
  GIT_COMMITTER_NAME: 'Test', GIT_COMMITTER_EMAIL: 'test@example.com',
} }).trim();

function makeReview(t, { maliciousDiffConfig = false, submoduleIgnoreAll = false, binaryContent = false } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'review-task-context-'));
  const runnerTemp = mkdtempSync(join(tmpdir(), 'review-task-context-runner-'));
  t.after(() => { rmSync(root, { recursive: true, force: true }); rmSync(runnerTemp, { recursive: true, force: true }); });
  git(root, 'init', '-q');
  git(root, 'config', 'core.autocrlf', 'false');
  writeFileSync(join(root, 'subject.md'), 'before\n');
  if (submoduleIgnoreAll) {
    git(root, 'add', 'subject.md'); git(root, 'commit', '-qm', 'seed submodule commit');
    const seedSha = git(root, 'rev-parse', 'HEAD');
    writeFileSync(join(root, '.gitmodules'), '[submodule "vendor/sub"]\n\tpath = vendor/sub\n\turl = https://example.invalid/sub.git\n\tignore = all\n');
    git(root, 'add', '.gitmodules');
    git(root, 'update-index', '--add', '--cacheinfo', `160000,${seedSha},vendor/sub`);
    git(root, 'commit', '-qm', 'base with gitlink');
  } else {
    git(root, 'add', '.'); git(root, 'commit', '-qm', 'base');
  }
  git(root, 'checkout', '-qb', 'candidate');
  writeFileSync(join(root, 'subject.md'), binaryContent ? Buffer.from([0x61, 0x00, 0xff, 0x62]) : 'after\n');
  writeFileSync(join(root, 'line\nname.md'), 'newline path\n');
  if (maliciousDiffConfig) writeFileSync(join(root, '.gitattributes'), '*.md binary\nsubject.md -diff\n*.md diff=execute-me\n');
  let submoduleCommit;
  if (submoduleIgnoreAll) {
    submoduleCommit = git(root, 'rev-parse', 'HEAD');
  }
  git(root, 'add', '.');
  if (submoduleCommit) git(root, 'update-index', '--add', '--cacheinfo', `160000,${submoduleCommit},vendor/sub`);
  git(root, 'commit', '-qm', 'candidate');
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

test('protected CLI derives its prompt and output from runner-temp fixed names', t => {
  const context = makeReview(t);
  const protectedPromptPath = join(context.runnerTemp, 'architecture-gate-complete-prompt.md');
  const attackerPromptPath = join(context.runnerTemp, 'attacker-selected-prompt.md');
  const attackerOutputPath = join(context.root, 'attacker-selected-output.md');
  const finalPromptPath = join(context.runnerTemp, 'architecture-gate-review-prompt.md');
  writeFileSync(protectedPromptPath, 'Protected fixed-name prompt.');
  writeFileSync(attackerPromptPath, 'Attacker-selected prompt.');
  const output = execFileSync(process.execPath, [fileURLToPath(new URL('../src/prepare-review-context.mjs', import.meta.url))], {
    encoding: 'utf8', env: { ...process.env, GITHUB_WORKSPACE: context.root, RUNNER_TEMP: context.runnerTemp,
      GITHUB_REPOSITORY: context.input.repository, BASE_SHA: context.input.baseSha,
      HEAD_SHA: context.input.headSha, REVIEWED_SHA: context.input.reviewedSha,
      AUTHORITY_ROUTE_SELECTED: 'true', AUTHORITY_LIMITS_BASE64: context.input.authorityLimitsBase64,
      AUTHORITY_PROFILE: 'v1', POLICY_VERSION: '', PROMPT_PATH: attackerPromptPath,
      OUTPUT_PATH: attackerOutputPath },
  });
  const prompt = readFileSync(finalPromptPath, 'utf8');
  assert.equal(JSON.parse(output).changedPaths, 2);
  assert.match(prompt, /^Protected fixed-name prompt\./);
  assert.doesNotMatch(prompt, /Attacker-selected prompt/);
  assert.equal(existsSync(attackerOutputPath), false);
});

test('rejects prompt and output paths outside runner temp and refuses symlinks', t => {
  const context = makeReview(t);
  process.env.RUNNER_TEMP = context.runnerTemp;
  t.after(() => { delete process.env.RUNNER_TEMP; });
  const outsidePrompt = join(context.root, 'outside-prompt.md');
  const outsideOutput = join(context.root, 'outside-output.md');
  writeFileSync(outsidePrompt, 'must not be read');
  assert.throws(() => prepareReviewContext({ ...context.input, promptPath: outsidePrompt }), /selected prompt is outside/);
  assert.throws(() => prepareReviewContext({ ...context.input, outputPath: outsideOutput }), /final prompt output is outside/);
  assert.equal(existsSync(outsideOutput), false);

  const promptLink = join(context.runnerTemp, 'prompt-link.md');
  symlinkSync(outsidePrompt, promptLink);
  assert.throws(() => prepareReviewContext({ ...context.input, promptPath: promptLink }), /bounded regular file/);
  assert.equal(existsSync(context.outputPath), false);

  const outputTarget = join(context.root, 'output-target.md');
  writeFileSync(outputTarget, 'keep this file');
  const outputLink = join(context.runnerTemp, 'final-prompt.md');
  symlinkSync(outputTarget, outputLink);
  assert.throws(() => prepareReviewContext({ ...context.input, outputPath: outputLink }), /output already exists/);
  assert.equal(readFileSync(outputTarget, 'utf8'), 'keep this file');
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

test('rejects real reviewed merges with reversed or mismatched event parents', t => {
  t.after(() => { delete process.env.RUNNER_TEMP; });
  const cases = [
    {
      name: 'reversed parents',
      makeReviewed(context) {
        git(context.root, 'checkout', '-q', '--detach', context.input.headSha);
        git(context.root, 'merge', '--no-ff', '-qm', 'reversed review merge', context.input.baseSha);
        return git(context.root, 'rev-parse', 'HEAD');
      },
    },
    {
      name: 'different head parent',
      makeReviewed(context) {
        git(context.root, 'checkout', '-q', '--detach', context.input.headSha);
        writeFileSync(join(context.root, 'extra-candidate.md'), 'different candidate head\n');
        git(context.root, 'add', 'extra-candidate.md');
        git(context.root, 'commit', '-qm', 'different candidate head');
        const differentHead = git(context.root, 'rev-parse', 'HEAD');
        git(context.root, 'checkout', '-q', '--detach', context.input.baseSha);
        git(context.root, 'merge', '--no-ff', '-qm', 'mismatched review merge', differentHead);
        return git(context.root, 'rev-parse', 'HEAD');
      },
    },
  ];

  for (const fixture of cases) {
    const context = makeReview(t);
    process.env.RUNNER_TEMP = context.runnerTemp;
    const reviewedSha = fixture.makeReviewed(context);
    context.input.reviewedSha = reviewedSha;
    const parents = git(context.root, 'rev-list', '--parents', '-n', '1', reviewedSha).split(' ');
    assert.equal(parents.length, 3, `${fixture.name} fixture must be a real two-parent merge`);
    assert.notDeepEqual(parents.slice(1), [context.input.baseSha, context.input.headSha],
      `${fixture.name} fixture must differ from the event parent binding`);
    assert.throws(() => prepareReviewContext(context.input), /reviewed merge parents do not match/);
    assert.equal(existsSync(context.outputPath), false);
  }
});

test('rejects a real one-parent reviewed commit', t => {
  const context = makeReview(t);
  process.env.RUNNER_TEMP = context.runnerTemp;
  t.after(() => { delete process.env.RUNNER_TEMP; });
  git(context.root, 'checkout', '-q', '--detach', context.input.baseSha);
  writeFileSync(join(context.root, 'ordinary-commit.md'), 'not a merge commit\n');
  git(context.root, 'add', 'ordinary-commit.md');
  git(context.root, 'commit', '-qm', 'ordinary reviewed commit');
  context.input.reviewedSha = git(context.root, 'rev-parse', 'HEAD');
  const parents = git(context.root, 'rev-list', '--parents', '-n', '1', context.input.reviewedSha).split(' ');
  assert.equal(parents.length, 2, 'fixture must be a real one-parent commit');
  assert.throws(() => prepareReviewContext(context.input), /reviewed merge parents do not match/);
  assert.equal(existsSync(context.outputPath), false);
});

test('forces textual diffs despite binary attributes and never invokes candidate diff drivers', t => {
  const context = makeReview(t, { maliciousDiffConfig: true });
  process.env.RUNNER_TEMP = context.runnerTemp;
  t.after(() => { delete process.env.RUNNER_TEMP; });
  git(context.root, 'config', 'diff.execute-me.command', 'touch candidate-diff-driver-was-executed');
  git(context.root, 'config', 'diff.external', 'touch candidate-external-diff-was-executed');
  const limits = JSON.parse(Buffer.from(context.input.authorityLimitsBase64, 'base64').toString());
  context.input.authorityLimitsBase64 = Buffer.from(JSON.stringify({ ...limits, maxPromptBytes: 900 })).toString('base64');
  assert.throws(() => prepareReviewContext(context.input), /final review prompt including task context exceeds/);
  context.input.authorityLimitsBase64 = Buffer.from(JSON.stringify({ ...limits, maxPromptBytes: 8192 })).toString('base64');
  prepareReviewContext(context.input);
  const prompt = readFileSync(context.outputPath, 'utf8');
  const data = JSON.parse(prompt.slice(prompt.indexOf('{', prompt.indexOf('untrusted candidate data'))));
  assert.match(data.exactBaseToReviewedMergeDiff, /-before\n\+after/);
  assert.doesNotMatch(data.exactBaseToReviewedMergeDiff, /Binary files .* differ/);
  assert.equal(existsSync(join(context.root, 'candidate-diff-driver-was-executed')), false);
  assert.equal(existsSync(join(context.root, 'candidate-external-diff-was-executed')), false);
});

test('fails closed on binary content and includes gitlinks despite submodule ignore=all', t => {
  const binary = makeReview(t, { binaryContent: true });
  process.env.RUNNER_TEMP = binary.runnerTemp;
  t.after(() => { delete process.env.RUNNER_TEMP; });
  assert.throws(() => prepareReviewContext(binary.input), /binary content/);
  assert.equal(existsSync(binary.outputPath), false);

  const submodule = makeReview(t, { submoduleIgnoreAll: true });
  process.env.RUNNER_TEMP = submodule.runnerTemp;
  git(submodule.root, 'config', 'submodule.vendor/sub.ignore', 'all');
  const result = prepareReviewContext(submodule.input);
  const prompt = readFileSync(submodule.outputPath, 'utf8');
  const data = JSON.parse(prompt.slice(prompt.indexOf('{', prompt.indexOf('untrusted candidate data'))));
  assert.ok(result.changedPaths > 0);
  assert.ok(data.changedPaths.includes('vendor/sub'));
  assert.match(data.exactBaseToReviewedMergeDiff, /-Subproject commit [a-f0-9]+\n\+Subproject commit [a-f0-9]+/);
});
