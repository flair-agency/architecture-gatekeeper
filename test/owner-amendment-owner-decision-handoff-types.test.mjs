import test from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const fixtureRoot = join(root, 'test/fixtures/owner-amendment-owner-decision-handoff-contract');
const configPath = join(root, 'tsconfig.json');
const config = ts.readConfigFile(configPath, ts.sys.readFile);
assert.equal(config.error, undefined);
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root, undefined, configPath);
const formatDiagnostic = item => ({
  code: item.code,
  file: item.file?.fileName,
  line: item.file && item.start !== undefined ? item.file.getLineAndCharacterOfPosition(item.start).line + 1 : undefined,
  message: ts.flattenDiagnosticMessageText(item.messageText, '\n'),
});
assert.deepEqual(parsed.errors.map(formatDiagnostic), []);
const options = { ...parsed.options, rootDir: root, noEmit: true };

function diagnosticsFor(name) {
  const file = join(fixtureRoot, name);
  const program = ts.createProgram([file], options);
  const diagnostics = ts.getPreEmitDiagnostics(program);
  const moduleDiagnostics = diagnostics.filter(item => item.file?.fileName !== file);
  assert.deepEqual(moduleDiagnostics.map(formatDiagnostic), [], 'handoff module contract must remain error-free');
  return diagnostics.filter(item => item.file?.fileName === file);
}

test('OWNER_DECISION handoff contracts accept the actual sync and awaited collaborator shapes and narrow outcomes', () => {
  assert.deepEqual(diagnosticsFor('positive.mts'), []);
});

test('OWNER_DECISION handoff contracts reject async sync-only collaborators and mutation of readonly snapshots', () => {
  const diagnostics = diagnosticsFor('negative.mts');
  assert.deepEqual(diagnostics.map(item => [item.code, item.file.getLineAndCharacterOfPosition(item.start).line + 1]), [
    [2322, 15], [2322, 16], [2540, 17], [2540, 18], [2345, 21], [2322, 24], [2322, 27], [2322, 34],
  ]);
  assert.match(ts.flattenDiagnosticMessageText(diagnostics[0].messageText, '\n'), /Promise.*OwnerAmendmentArtifactZipResult|Promise.*not assignable/i);
  assert.match(ts.flattenDiagnosticMessageText(diagnostics[1].messageText, '\n'), /Promise.*OwnerAmendmentAttestationResult|Promise.*not assignable/i);
  assert.match(ts.flattenDiagnosticMessageText(diagnostics[4].messageText, '\n'), /repository|policy|triggerRun/);
  assert.match(ts.flattenDiagnosticMessageText(diagnostics[5].messageText, '\n'), /undefined.*string|not assignable/i);
  assert.match(ts.flattenDiagnosticMessageText(diagnostics[6].messageText, '\n'), /undefined.*string|not assignable/i);
  assert.match(ts.flattenDiagnosticMessageText(diagnostics[7].messageText, '\n'), /unknown.*string|not assignable/i);
});
