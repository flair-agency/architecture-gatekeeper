import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { appendRunnerGitHubOutput, ownerAmendmentTagApiUrl, readRunnerTempFile,
  resolveRunnerTempDirectory, resolveRunnerTempFile, validateRepositoryTreePath, validateSelfAuthorityManifest,
  writeRunnerTempFile } from '../src/runner-temp-path.mjs';

function fixture(fn) {
  const root = mkdtempSync(join(tmpdir(), 'agk-runner-temp-'));
  try { fn(root); } finally { rmSync(root, { recursive: true, force: true }); }
}

test('confines temporary directories and files to fixed direct children', () => fixture(root => {
  const runnerTemp = join(root, 'runner-temp');
  mkdirSync(runnerTemp);
  const dir = resolveRunnerTempDirectory(runnerTemp, 'eligibility');
  assert.equal(resolveRunnerTempFile(dir, 'decision.json'), join(dir, 'decision.json'));
  assert.throws(() => resolveRunnerTempDirectory(runnerTemp, '../outside'), /fixed child name/);
  assert.throws(() => resolveRunnerTempFile(dir, '../outside'), /fixed file name/);
  const outside = join(root, 'outside'); mkdirSync(outside);
  symlinkSync(outside, join(runnerTemp, 'linked'), 'dir');
  assert.throws(() => resolveRunnerTempDirectory(runnerTemp, 'linked'), /real direct directory/);
}));

test('uses no-follow bounded regular-file I/O beneath the fixed runner directory', () => fixture(root => {
  const runnerTemp = join(root, 'runner-temp'); mkdirSync(runnerTemp);
  const dir = resolveRunnerTempDirectory(runnerTemp, 'producer-input');
  writeRunnerTempFile(dir, 'record.json', '{"ok":true}');
  assert.equal(readRunnerTempFile(dir, 'record.json').toString(), '{"ok":true}');
  assert.throws(() => writeRunnerTempFile(dir, 'record.json', 'overwrite'), /EEXIST/);
  const outside = join(root, 'outside.txt'); writeFileSync(outside, 'outside');
  symlinkSync(outside, join(dir, 'linked.json'));
  assert.throws(() => readRunnerTempFile(dir, 'linked.json'), /ELOOP|symbolic link|too many levels/i);
}));

test('only appends workflow outputs to runner-owned output-command files', () => fixture(root => {
  const runnerTemp = join(root, 'runner-temp');
  const commandDir = join(runnerTemp, '_runner_file_commands');
  mkdirSync(commandDir, { recursive: true });
  const output = join(commandDir, 'set_output_1234-abcd');
  writeFileSync(output, '');
  appendRunnerGitHubOutput(runnerTemp, output, 'status=prepared\n');
  assert.equal(readFileSync(output, 'utf8'), 'status=prepared\n');
  assert.throws(() => appendRunnerGitHubOutput(runnerTemp, join(root, 'outside'), 'bad=1\n'), /runner-owned output/);
}));

test('fixes the GitHub API origin, repository and owner-amendment tag namespace', () => {
  assert.equal(ownerAmendmentTagApiUrl('flair-agency/architecture-gatekeeper',
    'refs/tags/architecture-gatekeeper/amendments', 'a'.repeat(40),),
  `https://api.github.com/repos/flair-agency/architecture-gatekeeper/git/ref/tags/architecture-gatekeeper/amendments/${'a'.repeat(40)}`);
  assert.throws(() => ownerAmendmentTagApiUrl('attacker/repo', 'refs/tags/architecture-gatekeeper/amendments', 'a'.repeat(40)), /fixed self repository/);
  assert.throws(() => ownerAmendmentTagApiUrl('flair-agency/architecture-gatekeeper', 'refs/tags/other', 'a'.repeat(40)), /fixed self repository/);
  assert.throws(() => ownerAmendmentTagApiUrl('flair-agency/architecture-gatekeeper',
    'refs/tags/architecture-gatekeeper/amendments', 'https://example.invalid'), /exact commit SHA/);
});

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
