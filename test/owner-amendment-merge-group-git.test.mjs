import test from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { runOwnerAmendmentMergeGroupGit } from '../scripts/owner-amendment-merge-group-git.mjs';

const fakeGitSource = `#!${process.execPath}
import { writeFileSync } from 'node:fs';
writeFileSync(process.env.TRACE_FILE, JSON.stringify({ args: process.argv.slice(2), replace: process.env.GIT_NO_REPLACE_OBJECTS }));
if (process.env.STUB_MODE === 'fail') { process.stderr.write('fixture git failure\\n'); process.exit(7); }
if (process.env.STUB_MODE === 'oversize') { process.stdout.write(Buffer.alloc(2 * 1024 * 1024 + 1, 0x78)); }
else { process.stdout.write(Buffer.from([0x00, 0x61, 0xff, 0x0a])); }
`;

function withFakeGit(t, mode = 'bytes') {
  const root = mkdtempSync(join(tmpdir(), 'merge-group-git-contract-'));
  const bin = join(root, 'bin');
  const fakeGit = join(bin, 'git');
  const traceFile = join(root, 'trace.json');
  const originalEnv = Object.fromEntries(
    ['PATH', 'GITHUB_WORKSPACE', 'GIT_NO_REPLACE_OBJECTS', 'TRACE_FILE', 'STUB_MODE']
      .map(key => [key, process.env[key]]),
  );
  const workspace = join(root, 'workspace with spaces');
  mkdirSync(bin, { recursive: true });
  writeFileSync(fakeGit, fakeGitSource, { mode: 0o700 });
  chmodSync(fakeGit, 0o700);
  process.env.PATH = `${bin}${delimiter}${originalEnv.PATH ?? ''}`;
  process.env.GITHUB_WORKSPACE = workspace;
  process.env.GIT_NO_REPLACE_OBJECTS = '0';
  process.env.TRACE_FILE = traceFile;
  process.env.STUB_MODE = mode;
  t.after(() => {
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
    rmSync(root, { recursive: true, force: true });
  });
  return { traceFile, workspace };
}

function assertContract(trace, workspace) {
  assert.deepEqual(trace.args, ['-C', workspace, 'show', 'HEAD:path with spaces']);
  assert.equal(trace.replace, '1');
}

test('merge-group Git wrapper preserves argv, environment and raw Buffer output', t => {
  const { traceFile, workspace } = withFakeGit(t);
  const output = runOwnerAmendmentMergeGroupGit(['show', 'HEAD:path with spaces']);
  assert.deepEqual(output, Buffer.from([0x00, 0x61, 0xff, 0x0a]));
  assertContract(JSON.parse(readFileSync(traceFile, 'utf8')), workspace);
});

test('merge-group Git wrapper preserves native nonzero error details', t => {
  withFakeGit(t, 'fail');
  assert.throws(() => runOwnerAmendmentMergeGroupGit(['status']), error => {
    assert.equal(error.status, 7);
    assert.match(error.stderr.toString(), /fixture git failure/);
    return true;
  });
});

test('merge-group Git wrapper enforces its existing output cap', t => {
  withFakeGit(t, 'oversize');
  assert.throws(() => runOwnerAmendmentMergeGroupGit(['oversize']), error => {
    assert.equal(error.code, 'ENOBUFS');
    return true;
  });
});

test('focused contract catches a changed replacement-object binding in an isolated copy', async t => {
  const { traceFile, workspace } = withFakeGit(t);
  const root = mkdtempSync(join(tmpdir(), 'merge-group-git-mutant-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const source = readFileSync(new URL('../scripts/owner-amendment-merge-group-git.mjs', import.meta.url), 'utf8');
  const mutant = source.replace("GIT_NO_REPLACE_OBJECTS: '1'", "GIT_NO_REPLACE_OBJECTS: '0'");
  assert.notEqual(mutant, source, 'selected mutation changes the copied helper');
  const copy = join(root, 'mutant-helper.mjs');
  writeFileSync(copy, mutant);
  const { runOwnerAmendmentMergeGroupGit: runMutant } = await import(pathToFileURL(copy));
  runMutant(['show', 'HEAD:path with spaces']);
  const observed = JSON.parse(readFileSync(traceFile, 'utf8'));
  assert.throws(() => assertContract(observed, workspace), assert.AssertionError);
});
