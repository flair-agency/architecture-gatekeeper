import test from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const fixtureRoot = join(root, 'test/fixtures/owner-amendment-semantic-eligibility-contract');
const configPath = join(root, 'tsconfig.json');
const configRead = ts.readConfigFile(configPath, ts.sys.readFile);
assert.equal(configRead.error, undefined);
const parsed = ts.parseJsonConfigFileContent(configRead.config, ts.sys, root, undefined, configPath);
assert.deepEqual(parsed.errors, []);
assert.equal(parsed.options.strict, true);
assert.equal(parsed.options.noImplicitAny, true);
assert.equal(parsed.options.noEmitOnError, true);
const options = { ...parsed.options, rootDir: root, noEmit: true };
const files = ['positive.mts', 'negative.mts', 'missing-result-fields.mts'].map(name => join(fixtureRoot, name));
const diagnostics = ts.getPreEmitDiagnostics(ts.createProgram(files, options));
const relevant = diagnostics.map(item => ({ file: item.file?.fileName, line: item.file && item.start !== undefined
  ? item.file.getLineAndCharacterOfPosition(item.start).line + 1 : undefined, code: item.code,
  message: ts.flattenDiagnosticMessageText(item.messageText, '\n') }));
const summary = items => items.map(({ file, line, code }) => [file && file.slice(root.length + 1), line, code]);

test('semantic eligibility producer accepts the explicit sync callback contract', () => {
  assert.deepEqual(summary(relevant.filter(item => item.file === files[0])), []);
});

test('semantic eligibility producer rejects async callbacks for synchronous collaborator operations', () => {
  const negative = relevant.filter(item => item.file === files[1]);
  assert.deepEqual(negative.map(({ code, line }) => [code, line]), [
    [2740, 51], [2540, 59], [2554, 64], [2345, 66], [2540, 95], [2540, 98], [2322, 104],
    [2540, 110], [2540, 112], [2540, 114], [2554, 116], [2554, 118], [2554, 120],
    [2554, 122], [2554, 124], [2554, 126],
  ]);
  const messages = [/Promise.*ProtectedInputResult/s, /status.*read.only/i, /Expected 1 arguments/,
    /OwnerAmendmentSemanticEligibilityProducerDependencies.*missing/s, /receiptBytes.*read.only/i,
    /eligibility.*read.only/i, /PREPARED_OWNER_AMENDMENT_SEMANTIC_ELIGIBILITY.*VERIFIED_OWNER_AMENDMENT_SEMANTIC_ELIGIBILITY_RECEIPT/s,
    /prepare.*read.only/i, /complete.*read.only/i, /validateReceipt.*read.only/i,
    ...Array(6).fill(/Expected 1 arguments/),
  ];
  negative.forEach((diagnostic, index) => assert.match(diagnostic.message, messages[index]));
  assert.deepEqual(summary(relevant.filter(item => !files.includes(item.file))), [], 'implementation dependencies must remain error-free');
});

test('semantic eligibility callback results require every field consumed by runtime validation', () => {
  const negative = relevant.filter(item => item.file === files[2]);
  // Each omission is bound to its fixture line and the specific required field.
  // Union-member omissions use TS2322; single-result omissions use TS2741.
  const omissions = [
    [2741, 64, 'baseBranch'], [2741, 68, 'policyBytes'], [2741, 72, 'manifestBytes'],
    [2741, 76, 'authoritySet'], [2741, 80, 'changes'], [2741, 84, 'diffBytes'],
    [2741, 90, 'digest'], [2741, 94, 'members'],
    [2741, 100, 'id'], [2741, 104, 'repository'], [2741, 108, 'resolvedCommit'],
    [2741, 112, 'path'], [2741, 116, 'byteLength'], [2741, 120, 'sha256'], [2741, 124, 'bytes'],
    [2741, 130, 'path'], [2741, 134, 'beforeBytes'], [2741, 138, 'afterBytes'],
    [2741, 144, 'selectedProducer'], [2741, 148, 'selectedGatekeeper'],
    [2741, 154, 'repository'], [2741, 158, 'revision'], [2741, 162, 'package'],
    [2741, 168, 'name'], [2741, 172, 'version'], [2741, 176, 'integrity'],
    [2741, 182, 'status'], [2741, 186, 'repository'], [2741, 190, 'baseSha'],
    [2741, 194, 'triggerProfile'], [2741, 198, 'triggerReviewRecordSha256'],
    [2741, 202, 'workflowPath'], [2741, 206, 'workflowSha'], [2741, 210, 'workflowRef'],
    [2741, 214, 'runId'], [2741, 218, 'runAttempt'],
    [2322, 224, 'status'], [2322, 228, 'repository'], [2322, 232, 'baseSha'],
    [2322, 236, 'bSha'], [2322, 240, 'policyRevision'], [2322, 244, 'triggerProfile'],
    [2322, 248, 'triggerReviewRecordSha256'], [2322, 252, 'priorAuthoritySetDigest'],
    [2322, 256, 'resultingAuthoritySetDigest'], [2322, 260, 'changes'],
    [2322, 264, 'targetValidated'], [2322, 268, 'purpose'],
    [2741, 274, 'status'], [2741, 278, 'repository'], [2741, 282, 'baseSha'], [2741, 286, 'bSha'],
    [2741, 290, 'triggerProfile'], // Tag digest is profile-dependent; runtime tests enforce historical-profile evidence.
    [2741, 298, 'amendmentRecordSha256'], [2741, 302, 'tagRef'],
    [2741, 306, 'tagObjectOid'], [2741, 310, 'observedTagRefOid'],
    [2322, 316, 'authorityId'], [2322, 320, 'authorityPath'],
    [2322, 327, 'historicalTrigger'], [2322, 330, 'authorityId'], [2322, 333, 'authorityPath'],
  ];
  assert.deepEqual(negative.map(({ code, line }) => [code, line]), [
    [2322, 16], [2740, 18], [2322, 20], [2739, 22], [2322, 24], [2740, 26],
    [2322, 28], [2739, 30], [2322, 32], [2739, 34], [2322, 36], [2739, 38],
    [2322, 40], [2739, 42], [2322, 44], [2740, 46], [2322, 48], [2322, 50],
    [2322, 52], [2322, 54], [2322, 56], [2740, 58],
    ...omissions.map(([code, line]) => [code, line]),
  ]);
  const resultTypes = ['ProtectedInputResult', 'ProtectedAuthoritySetResult', 'ProtectedAuthorityMemberResult',
    'ProtectedChangeResult', 'ProtectedSelectionResult', 'SelectedGatekeeperResult', 'SelectedGatekeeperPackageResult',
    'TriggerProvenanceResult', 'AmendmentResult', 'AmendmentRecordResultBase', 'TagValidationResult'];
  resultTypes.forEach((name, index) => {
    assert.match(negative[index * 2].message, /Type 'null' is not assignable/);
    assert.match(negative[index * 2].message, new RegExp(name));
    assert.match(negative[index * 2 + 1].message, /Type '\{\}'/);
    assert.match(negative[index * 2 + 1].message, new RegExp(name));
  });
  omissions.forEach(([, , field], index) => {
    assert.match(negative[index + resultTypes.length * 2].message, new RegExp(`Property '${field}' is missing`));
  });
  assert.deepEqual(summary(relevant.filter(item => !files.includes(item.file))), [], 'all implementation and transitive sources remain strict-clean');
});
