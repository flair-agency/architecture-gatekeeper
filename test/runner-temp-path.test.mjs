import test from 'node:test';
import assert from 'node:assert/strict';
import { linkSync, mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readRunnerTempFile,
  appendGitHubOutput, resolveRunnerTempDirectory, resolveRunnerTempFile, validateRepositoryTreePath, validateSelfAuthorityManifest,
  writeRunnerTempFile } from '../dist/runner-temp-path.mjs';

function fixture(fn) {
  const root = mkdtempSync(join(tmpdir(), 'agk-runner-temp-'));
  const runnerTemp = join(root, 'runner-temp'); mkdirSync(runnerTemp);
  const oldCwd = process.cwd(), oldRunnerTemp = process.env.RUNNER_TEMP, oldGitHubOutput = process.env.GITHUB_OUTPUT;
  try { process.chdir(runnerTemp); process.env.RUNNER_TEMP = realpathSync(runnerTemp); fn(root, process.env.RUNNER_TEMP); }
  finally { process.chdir(oldCwd); if (oldRunnerTemp === undefined) delete process.env.RUNNER_TEMP; else process.env.RUNNER_TEMP = oldRunnerTemp;
    if (oldGitHubOutput === undefined) delete process.env.GITHUB_OUTPUT; else process.env.GITHUB_OUTPUT = oldGitHubOutput;
    rmSync(root, { recursive: true, force: true }); }
}

test('confines temporary directories and files to fixed direct children', () => fixture((root, runnerTemp) => {
  const dir = resolveRunnerTempDirectory('architecture-gate-owner-addition');
  assert.equal(realpathSync(dir), join(runnerTemp, 'architecture-gate-owner-addition'));
  assert.equal(resolveRunnerTempFile(dir, 'eligibility-prompt.md'), 'architecture-gate-owner-addition/eligibility-prompt.md');
  assert.throws(() => resolveRunnerTempDirectory('../outside'), /fixed runner temp child name/);
  assert.throws(() => resolveRunnerTempFile(dir, '../outside'), /fixed runner temp path/);
  const outside = join(root, 'outside'); mkdirSync(outside);
  rmSync(dir, { recursive: true });
  symlinkSync(outside, join(runnerTemp, 'architecture-gate-owner-addition'), 'dir');
  assert.throws(() => resolveRunnerTempDirectory('architecture-gate-owner-addition'), /real direct directory/);
}));

test('uses no-follow bounded regular-file I/O beneath the fixed runner directory', () => fixture((root, runnerTemp) => {
  const dir = resolveRunnerTempDirectory('self-amendment-pr');
  writeRunnerTempFile(dir, 'prompt.md', '{"ok":true}');
  assert.equal(readRunnerTempFile(dir, 'prompt.md').toString(), '{"ok":true}');
  assert.throws(() => writeRunnerTempFile(dir, 'prompt.md', 'overwrite'), /EEXIST/);
  const outside = join(root, 'outside.txt'); writeFileSync(outside, 'outside');
  symlinkSync(outside, join(dir, 'schema.json'));
  assert.throws(() => readRunnerTempFile(dir, 'schema.json'), /ELOOP|symbolic link|too many levels/i);
  assert.throws(() => readRunnerTempFile(dir, 'outside.txt'), /fixed runner temp path/);
  assert.throws(() => resolveRunnerTempDirectory('not-allowlisted'), /fixed runner temp child name/);
  process.chdir(root);
  assert.throws(() => resolveRunnerTempDirectory('architecture-gate-owner-addition'), /runner temp directory/);
}));

test('legacy, owner-addition and self-amendment artifacts use only their approved fixed names', () => fixture((root, runnerTemp) => {
  const owner = resolveRunnerTempDirectory('architecture-gate-owner-addition');
  const amendment = resolveRunnerTempDirectory('self-amendment-pr');
  for (const [directory, names] of [[runnerTemp, ['architecture-gate-prompt.md',
    'architecture-gate-decision.schema.json', 'architecture-gate-decision.validation.json',
    'architecture-gate-legacy-prompt.md', 'architecture-gate-legacy-provenance.json']],
  [owner, ['eligibility-prompt.md', 'eligibility.schema.json', 'procedure.json',
    'evidence-context.json', 'eligibility-evidence.json']], [amendment, ['prompt.md', 'schema.json']]]) {
    for (const name of names) {
      const target = writeRunnerTempFile(directory, name, 'initial long contents');
      assert.equal(target, directory === runnerTemp ? name : `${directory === owner ? 'architecture-gate-owner-addition' : 'self-amendment-pr'}/${name}`);
      assert.equal(statSync(target).mode & 0o777, 0o600);
      assert.throws(() => writeRunnerTempFile(directory, name, 'exclusive'), /EEXIST/);
      writeRunnerTempFile(directory, name, Buffer.from('retry'), { overwrite: true });
      assert.equal(readRunnerTempFile(directory, name).toString('utf8'), 'retry');
    }
  }
  for (const name of ['procedure.json', '../architecture-gate-prompt.md', Buffer.from('architecture-gate-prompt.md'),
    new URL(`file://${runnerTemp}/architecture-gate-prompt.md`), 1]) {
    assert.throws(() => resolveRunnerTempFile(runnerTemp, name), /fixed runner temp path/);
  }
  assert.throws(() => resolveRunnerTempFile(owner, 'architecture-gate-prompt.md'), /fixed runner temp path/);
  assert.throws(() => resolveRunnerTempFile(join(root, 'architecture-gate-owner-addition'), 'procedure.json'), /fixed runner temp child/);
}));

test('appends to trusted GITHUB_OUTPUT independently of RUNNER_TEMP and cwd', () => fixture((root, runnerTemp) => {
  const commandDir = join(runnerTemp, '_runner_file_commands'); mkdirSync(commandDir);
  const outputPath = join(commandDir, 'set_output_12345678-abcd'); writeFileSync(outputPath, '');
  process.env.GITHUB_OUTPUT = outputPath;
  appendGitHubOutput('route=ordinary\n');
  assert.equal(readFileSync(outputPath, 'utf8'), 'route=ordinary\n');
  process.env.GITHUB_OUTPUT = join(root, 'outside-output');
  writeFileSync(process.env.GITHUB_OUTPUT, 'untouched');
  process.env.GITHUB_OUTPUT = realpathSync(process.env.GITHUB_OUTPUT);
  delete process.env.RUNNER_TEMP;
  process.chdir(root);
  appendGitHubOutput('route=amendment\n');
  assert.equal(readFileSync(join(root, 'outside-output'), 'utf8'), 'untouchedroute=amendment\n');
  process.env.GITHUB_OUTPUT = 'relative-output';
  assert.throws(() => appendGitHubOutput('route=ordinary\n'), /canonical absolute path/);
  process.env.GITHUB_OUTPUT = join(root, 'missing-output');
  assert.throws(() => appendGitHubOutput('route=ordinary\n'), /output file is unavailable/);
  const outside = join(root, 'outside'); writeFileSync(outside, 'untouched');
  const linkedPath = join(commandDir, 'set_output_link'); symlinkSync(outside, linkedPath);
  process.env.GITHUB_OUTPUT = linkedPath;
  assert.throws(() => appendGitHubOutput('route=amendment\n'), /direct regular file/);
  assert.equal(readFileSync(outside, 'utf8'), 'untouched');
  const hardlinkedPath = join(commandDir, 'set_output_hardlink');
  linkSync(outside, hardlinkedPath);
  process.env.GITHUB_OUTPUT = hardlinkedPath;
  assert.throws(() => appendGitHubOutput('route=amendment\n'), /direct regular file/);
  assert.equal(readFileSync(outside, 'utf8'), 'untouched');
  process.env.GITHUB_OUTPUT = outputPath;
  assert.throws(() => appendGitHubOutput('x'.repeat(16_385)), /bounded text/);
}));

test('rejects unsafe Git tree paths before constructing Git revision:path arguments', () => {
  for (const value of ['', '/etc/passwd', '../secret', 'docs/../../secret', 'docs\\secret', 'docs/file:evil', 'docs//file.md']) {
    assert.throws(() => validateRepositoryTreePath(value), /malformed or unsafe/);
  }
  assert.equal(validateRepositoryTreePath('docs/architecture.md'), 'docs/architecture.md');
});

test('self reference profile refuses external authority URLs before any fetch adapter is used', () => {
  const self = { authorities: [{ id: 'architecture', repository: 'self', path: 'docs/architecture.md' }] };
  assert.equal(validateSelfAuthorityManifest(self), self);
  assert.throws(() => validateSelfAuthorityManifest({ authorities: [
    { id: 'remote', repository: 'attacker/repo', path: 'docs/architecture.md' },
  ] }), /only authorities in this repository/);
  assert.throws(() => validateSelfAuthorityManifest({ authorities: [
    { id: 'unsafe', repository: 'self', path: '../../secrets' },
  ] }), /malformed or unsafe/);
});
