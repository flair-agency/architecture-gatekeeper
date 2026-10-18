import test from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { compileFixtureDiagnostics, summarizeDiagnostics } from './helpers/type-fixture-diagnostics.mjs';
import { evaluateOwnerAdditionAdoption } from '../src/owner-addition-adoption.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const fixtureRoot = join(root, 'test/fixtures/owner-decision-addition-contract');
const configPath = join(root, 'tsconfig.json');
const config = ts.readConfigFile(configPath, ts.sys.readFile);
assert.equal(config.error, undefined);
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root, undefined, configPath);
assert.deepEqual(parsed.errors, []);
const options = { ...parsed.options, rootDir: root, noEmit: true };

const diagnosticsForFixture = compileFixtureDiagnostics([
  join(fixtureRoot, 'positive.mts'), join(fixtureRoot, 'negative.mts'),
], options, 'owner decision addition module contract must remain error-free');

function diagnosticsFor(name) {
  return diagnosticsForFixture(join(fixtureRoot, name));
}

test('owner decision addition procedure types preserve unknown repository output and flat exports', () => {
  assert.deepEqual(summarizeDiagnostics(diagnosticsFor('positive.mts')), []);
});

test('owner decision addition procedure types reject incomplete input and stronger status claims', () => {
  const diagnostics = diagnosticsFor('negative.mts');
  assert.deepEqual(diagnostics.map(item => [item.code, item.file.getLineAndCharacterOfPosition(item.start).line + 1]), [
    [2741, 6], [2322, 14], [2322, 15], [2322, 22], [2322, 23], [2322, 25],
  ]);
  assert.match(ts.flattenDiagnosticMessageText(diagnostics[0].messageText, '\n'), /tag/);
  assert.match(ts.flattenDiagnosticMessageText(diagnostics[1].messageText, '\n'), /unknown.*string|not assignable/i);
  assert.match(ts.flattenDiagnosticMessageText(diagnostics[2].messageText, '\n'), /"G0".*"VERIFIED"|not assignable/i);
  assert.match(ts.flattenDiagnosticMessageText(diagnostics[3].messageText, '\n'), /"not_verified".*"owner_authorized"|not assignable/i);
  assert.match(ts.flattenDiagnosticMessageText(diagnostics[4].messageText, '\n'), /"pending".*"valid"|not assignable/i);
  assert.match(ts.flattenDiagnosticMessageText(diagnostics[5].messageText, '\n'), /unknown.*not assignable/i);
});

test('adoption preserves existing repeated getter reads', () => {
  let repositoryReads = 0;
  const candidate = {
    get repository() { repositoryReads += 1; return repositoryReads === 1 ? 'org/repo' : ''; },
    targetBranch: 'main', pullRequest: { number: 1 }, baseSha: 'a'.repeat(40), bSha: 'b'.repeat(40),
    bTree: 'c'.repeat(40), authorityDigest: 'd'.repeat(64),
  };
  assert.throws(() => evaluateOwnerAdditionAdoption({ candidate, procedure: null, ordinaryDecision: null,
    authoritySet: null, eligibility: null, eligibilityEvidence: null, merge: null, targetReadback: null }),
  /Candidate identity is invalid/);
  assert.equal(repositoryReads, 2);
});
