import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const fixtureRoot = join(root, 'test/fixtures/owner-amendment-owner-decision-handoff-cli-contract');
const configPath = join(root, 'tsconfig.json');
const config = ts.readConfigFile(configPath, ts.sys.readFile);
assert.equal(config.error, undefined);
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root, undefined, configPath);
assert.deepEqual(parsed.errors, []);
const options = { ...parsed.options, rootDir: root, noEmit: true };

function describe(diagnosticsForFile) {
  return diagnosticsForFile.map(item => ({
    file: item.file?.fileName,
    code: item.code,
    line: item.file.getLineAndCharacterOfPosition(item.start).line + 1,
    message: ts.flattenDiagnosticMessageText(item.messageText, '\n'),
  }));
}

const positiveFile = join(fixtureRoot, 'positive.mts');
const negativeFile = join(fixtureRoot, 'negative.mts');
const program = ts.createProgram([positiveFile, negativeFile], options);
const diagnostics = ts.getPreEmitDiagnostics(program);
const implementationDiagnostics = diagnostics.filter(item => ![positiveFile, negativeFile].includes(item.file?.fileName));
assert.equal(implementationDiagnostics.length, 0, `OWNER_DECISION CLI implementation errors: ${JSON.stringify(describe(implementationDiagnostics))}`);
const positiveDiagnostics = diagnostics.filter(item => item.file?.fileName === positiveFile);
const negativeDiagnostics = diagnostics.filter(item => item.file?.fileName === negativeFile);

test('OWNER_DECISION CLI types preserve standard fetch, sync Git, collaborator composition and honest result states', () => {
  assert.deepEqual(describe(positiveDiagnostics), []);
});

test('OWNER_DECISION CLI rejects async Git runners and false success assumptions', () => {
  assert.deepEqual(negativeDiagnostics.map(item => [item.code, item.file.getLineAndCharacterOfPosition(item.start).line + 1]), [
    [2322, 5], [2322, 11], [2322, 13],
  ]);
  assert.match(ts.flattenDiagnosticMessageText(negativeDiagnostics[0].messageText, '\n'), /Promise.*not assignable|Promise.*Buffer/i);
  assert.match(ts.flattenDiagnosticMessageText(negativeDiagnostics[1].messageText, '\n'), /unknown.*string|not assignable/i);
  assert.match(ts.flattenDiagnosticMessageText(negativeDiagnostics[2].messageText, '\n'), /undefined.*string|not assignable to type 'string'/i);
});

test('flat OWNER_DECISION CLI facade is inert on import and keeps direct-run dispatch', async t => {
  const entry = join(root, 'src/owner-amendment-owner-decision-handoff-cli.mjs');
  const writes = [];
  const originalWrite = process.stdout.write;
  const originalExitCode = process.exitCode;
  process.stdout.write = (chunk, ...args) => { writes.push(String(chunk)); return true; };
  try {
    const imported = await import(pathToFileURL(entry).href);
    assert.equal(typeof imported.runOwnerAmendmentOwnerDecisionHandoff, 'function');
  } finally {
    process.stdout.write = originalWrite;
  }
  assert.deepEqual(writes, []);
  assert.equal(process.exitCode, originalExitCode);

  const direct = spawnSync(process.execPath, [entry], { cwd: root, encoding: 'utf8', env: { PATH: process.env.PATH } });
  if (direct.error?.code === 'EPERM') return t.skip('sandbox policy blocks child processes; direct-run dispatch is checked in the standard Node test environment.');
  assert.equal(direct.status, 1);
  assert.equal(direct.stderr, '');
  assert.deepEqual(JSON.parse(direct.stdout), { status: 'INCOMPLETE', reason: 'Owner amendment OWNER_DECISION handoff caller: handoff must execute from protected main via the exact repository_dispatch action.' });
});
