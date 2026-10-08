import test from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import {
  validateOrdinaryOwnerDecision,
  validateOrdinaryOwnerDecisionSchema,
  validateOwnerAdditionEligibility,
} from '../dist/owner-addition-validation.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const fixtureRoot = join(root, 'test/fixtures/typescript-contract');
const tsconfigPath = join(root, 'tsconfig.json');
const tsconfigRead = ts.readConfigFile(tsconfigPath, ts.sys.readFile);
assert.equal(tsconfigRead.error, undefined, 'the adopted tsconfig must parse');
const tsconfig = ts.parseJsonConfigFileContent(tsconfigRead.config, ts.sys, root, undefined, tsconfigPath);
assert.deepEqual(tsconfig.errors, [], 'the adopted tsconfig must not contain errors');
assert.equal(tsconfig.options.strict, true, 'the adopted tsconfig must keep strict mode');
assert.equal(tsconfig.options.noImplicitAny, true, 'the adopted tsconfig must keep noImplicitAny');
assert.equal(tsconfig.options.noEmitOnError, true, 'the adopted tsconfig must prevent emission after errors');
const compilerOptions = { ...tsconfig.options, rootDir: root, noEmit: true };

function diagnosticsFor(fixture) {
  const file = join(fixtureRoot, fixture);
  const program = ts.createProgram([file], { ...compilerOptions, rootDir: root });
  const diagnostics = ts.getPreEmitDiagnostics(program);
  const fixtureDiagnostics = diagnostics.filter(diagnostic => diagnostic.file?.fileName === file);
  const nonFixtureDiagnostics = diagnostics.filter(diagnostic => diagnostic.file?.fileName !== file);
  assert.deepEqual(nonFixtureDiagnostics, [], 'imports, declarations, and compiler configuration must remain error-free');
  return fixtureDiagnostics;
}

function diagnosticLines(diagnostics) {
  return diagnostics.map(diagnostic => [
    diagnostic.code,
    diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start).line + 1,
  ]);
}

test('owner-addition validation contracts accept established validator results', () => {
  assert.deepEqual(diagnosticsFor('positive.mts'), []);
});

test('owner-addition validation contracts reject missing or mistyped decision fields', () => {
  const diagnostics = diagnosticsFor('negative-fields.mts');
  assert.deepEqual(diagnosticLines(diagnostics), [[2322, 7], [2322, 11]]);
  assert.match(ts.flattenDiagnosticMessageText(diagnostics[0].messageText, '\n'), /ownerDecisionId.*missing/i);
  assert.match(ts.flattenDiagnosticMessageText(diagnostics[1].messageText, '\n'), /Type 'string' is not assignable to type 'number'/);
});

test('owner-addition validation contracts reject wrong argument types', () => {
  const diagnostics = diagnosticsFor('negative-arguments.mts');
  assert.deepEqual(diagnosticLines(diagnostics), [[2345, 3], [2345, 4]]);
  assert.ok(diagnostics.every(diagnostic => /not assignable to parameter/.test(
    ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'))));
});

test('JavaScript validator behavior retains original ID coercion and schema checks', () => {
  for (const [id, summary] of [[123, 'numeric'], [true, 'boolean'], [null, 'null']]) {
    const rawDecision = JSON.stringify({ decision: 'OWNER_DECISION', ownerDecisionId: id, summary });
    assert.deepEqual(validateOrdinaryOwnerDecision(rawDecision, id), {
      decision: 'OWNER_DECISION', ownerDecisionId: id, summary,
    });
  }
  assert.throws(() => validateOrdinaryOwnerDecisionSchema({
    required: ['ownerDecisionId'], properties: 'truthy',
  }), { message: 'Protected ordinary review schema must require ownerDecisionId.' });
  const eligibilitySchema = {
    type: 'object', additionalProperties: false,
    required: ['eligible', 'onlyMissingDecision', 'preservesExistingRules', 'noContradiction',
      'noUnsupportedCompletionClaim', 'noUnrelatedUnresolvedChoices', 'matchesOrdinaryOwnerDecision', 'summary'],
    properties: Object.fromEntries([
      'eligible', 'onlyMissingDecision', 'preservesExistingRules', 'noContradiction',
      'noUnsupportedCompletionClaim', 'noUnrelatedUnresolvedChoices', 'matchesOrdinaryOwnerDecision',
    ].map(key => [key, { type: 'boolean' }]).concat([['summary', { type: 'string' }]])),
  };
  const eligibility = Object.fromEntries(eligibilitySchema.required.filter(key => key !== 'summary').map(key => [key, true]));
  eligibility.summary = 'eligible';
  assert.deepEqual(validateOwnerAdditionEligibility(JSON.stringify(eligibility), eligibilitySchema), eligibility);
});

test('ordinary decision validation preserves strict primitive getter receivers', () => {
  const previousDescriptor = Object.getOwnPropertyDescriptor(String.prototype, 'decision');
  Object.defineProperty(String.prototype, 'decision', {
    configurable: true,
    get() { return typeof this === 'string' ? 'BLOCK' : undefined; },
  });
  try {
    const rawDecision = JSON.stringify({
      decision: 'OWNER_DECISION', ownerDecisionId: 'guard', summary: 'blocked',
      gates: { guard: 'primitive' },
    });
    assert.throws(
      () => validateOrdinaryOwnerDecision(rawDecision, 'guard'),
      { message: 'Ordinary OWNER_DECISION does not identify the exact missing decision without a BLOCK.' },
    );
  } finally {
    if (previousDescriptor) Object.defineProperty(String.prototype, 'decision', previousDescriptor);
    else delete String.prototype.decision;
  }
});
