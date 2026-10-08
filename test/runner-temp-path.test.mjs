import test from 'node:test';
import assert from 'node:assert/strict';
import { linkSync, mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ownerAmendmentTagApiRoute, readRunnerTempFile,
  appendGitHubOutput, resolveRunnerTempDirectory, resolveRunnerTempFile, validateRepositoryTreePath, validateSelfAuthorityManifest,
  writeRunnerTempFile } from '../dist/runner-temp-path.mjs';
import { classifyOwnerAmendmentTagApiStatus, ownerAmendmentTagApiUrl } from '../dist/owner-amendment-tag-api.mjs';

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
  const dir = resolveRunnerTempDirectory('owner-amendment-eligibility');
  assert.equal(realpathSync(dir), join(runnerTemp, 'owner-amendment-eligibility'));
  assert.equal(resolveRunnerTempFile(dir, 'eligibility-prompt.md'), 'owner-amendment-eligibility/eligibility-prompt.md');
  assert.throws(() => resolveRunnerTempDirectory('../outside'), /fixed runner temp child name/);
  assert.throws(() => resolveRunnerTempFile(dir, '../outside'), /fixed runner temp path/);
  const outside = join(root, 'outside'); mkdirSync(outside);
  symlinkSync(outside, join(runnerTemp, 'owner-amendment-semantic-reviewer-output'), 'dir');
  assert.throws(() => resolveRunnerTempDirectory('owner-amendment-semantic-reviewer-output'), /real direct directory/);
}));

test('uses no-follow bounded regular-file I/O beneath the fixed runner directory', () => fixture((root, runnerTemp) => {
  const dir = resolveRunnerTempDirectory('architecture-gate-owner-decision-record-input');
  writeRunnerTempFile(dir, 'decision.json', '{"ok":true}');
  assert.equal(readRunnerTempFile(dir, 'decision.json').toString(), '{"ok":true}');
  assert.throws(() => writeRunnerTempFile(dir, 'decision.json', 'overwrite'), /EEXIST/);
  const outside = join(root, 'outside.txt'); writeFileSync(outside, 'outside');
  symlinkSync(outside, join(dir, 'event.json'));
  assert.throws(() => readRunnerTempFile(dir, 'event.json'), /ELOOP|symbolic link|too many levels/i);
  assert.throws(() => readRunnerTempFile(dir, 'outside.txt'), /fixed runner temp path/);
  assert.throws(() => resolveRunnerTempDirectory('not-allowlisted'), /fixed runner temp child name/);
  process.chdir(root);
  assert.throws(() => resolveRunnerTempDirectory('owner-amendment-eligibility'), /runner temp directory/);
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

test('fixes the GitHub API origin, repository and owner-amendment tag namespace', () => {
  assert.equal(ownerAmendmentTagApiRoute('flair-agency/architecture-gatekeeper',
    'refs/tags/architecture-gatekeeper/amendments', 'a'.repeat(40),),
  `repos/flair-agency/architecture-gatekeeper/git/ref/tags/architecture-gatekeeper/amendments/${'a'.repeat(40)}`);
  assert.throws(() => ownerAmendmentTagApiRoute('attacker/repo', 'refs/tags/architecture-gatekeeper/amendments', 'a'.repeat(40)), /fixed self repository/);
  assert.throws(() => ownerAmendmentTagApiRoute('flair-agency/architecture-gatekeeper', 'refs/tags/other', 'a'.repeat(40)), /fixed self repository/);
  assert.throws(() => ownerAmendmentTagApiRoute('flair-agency/architecture-gatekeeper',
    'refs/tags/architecture-gatekeeper/amendments', 'https://example.invalid'), /exact commit SHA/);
  const expectedUrl = `https://api.github.com/repos/flair-agency/architecture-gatekeeper/git/ref/tags/architecture-gatekeeper/amendments/${'a'.repeat(40)}`;
  assert.equal(ownerAmendmentTagApiUrl('flair-agency/architecture-gatekeeper',
    'refs/tags/architecture-gatekeeper/amendments', 'a'.repeat(40)), expectedUrl);
  assert.equal(classifyOwnerAmendmentTagApiStatus({ status: 404, requestedUrl: expectedUrl, expectedUrl }), 'OWNER_AMENDMENT_TAG_NOT_FOUND');
  assert.equal(classifyOwnerAmendmentTagApiStatus({ status: 200, requestedUrl: expectedUrl, expectedUrl }), 'OWNER_AMENDMENT_TAG_FOUND');
  assert.throws(() => classifyOwnerAmendmentTagApiStatus({ status: 404,
    requestedUrl: 'https://api.github.com/repos/attacker/repo/git/ref/tags/x', expectedUrl }), /exact protected self ref request/);
  assert.throws(() => classifyOwnerAmendmentTagApiStatus({ status: 404,
    requestedUrl: expectedUrl, expectedUrl: 'https://api.github.com/repos/flair-agency/architecture-gatekeeper/git/ref/tags/architecture-gatekeeper/amendments/not-a-sha' }), /exact protected self ref request/);
  assert.throws(() => classifyOwnerAmendmentTagApiStatus({ status: 403, requestedUrl: expectedUrl, expectedUrl }), /unexpected HTTP status 403/);
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
