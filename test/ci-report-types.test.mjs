import assert from 'node:assert/strict';
import test from 'node:test';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const fixtureRoot = join(root, 'test/fixtures/ci-report-contract');
const configPath = join(root, 'tsconfig.json');
const config = ts.readConfigFile(configPath, ts.sys.readFile);
assert.equal(config.error, undefined);
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root, undefined, configPath);
assert.deepEqual(parsed.errors, []);
assert.equal(parsed.options.strict, true);
assert.equal(parsed.options.noImplicitAny, true);
assert.equal(parsed.options.noEmitOnError, true);
const options = { ...parsed.options, rootDir: root, noEmit: true };

function diagnosticsFor(name) {
  const file = join(fixtureRoot, name);
  const diagnostics = ts.getPreEmitDiagnostics(ts.createProgram([file], options));
  const brief = diagnostics.filter(item => item.file?.fileName !== file).map(item => {
    const location = item.file && item.start !== undefined ? item.file.getLineAndCharacterOfPosition(item.start) : null;
    return { code: item.code, file: item.file?.fileName.split('/').slice(-3).join('/'),
      line: location ? location.line + 1 : null,
      message: ts.flattenDiagnosticMessageText(item.messageText, ' ').slice(0, 180) };
  });
  assert.deepEqual(brief, [], 'CI report implementation and all transitive diagnostics must remain clean');
  return diagnostics.filter(item => item.file?.fileName === file).map(item => ({
    code: item.code, line: item.file.getLineAndCharacterOfPosition(item.start).line + 1,
    message: ts.flattenDiagnosticMessageText(item.messageText, '\n'),
  }));
}

test('CI report public types distinguish successful decisions and optional provenance', () => {
  assert.deepEqual(diagnosticsFor('positive.mts'), []);
});

test('CI report negatives identify routing, unknown observations, complete results and callable fetch JSON', () => {
  const negative = diagnosticsFor('negative.mts');
  assert.deepEqual(negative.map(({ code, line }) => [code, line]), [
    [2345, 6], [2322, 9], [18047, 9], [2322, 14], [2345, 17], [2322, 21],
    [2739, 23], [2322, 25], [2322, 28], [2322, 37], [2322, 45],
  ]);
  const messages = [/rawDecision.*missing/s, /unknown.*string/s, /optional.*null/s,
    /unknown.*string/s, /decision.*null.*UnknownRecord/s, /AuthorityProvenanceV2.*AuthorityProvenanceV1/s,
    /LegacyEvidenceInput.*path, sha256/s, /OwnerAdditionProcedure.*missing/s, /unknown.*number/s,
    /json.*missing/s, /json.*string.*\(\) => unknown/s];
  negative.forEach((diagnostic, index) => assert.match(diagnostic.message, messages[index]));
});
