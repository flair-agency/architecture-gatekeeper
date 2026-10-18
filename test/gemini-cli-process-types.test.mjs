import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { compileFixtureDiagnostics } from './helpers/type-fixture-diagnostics.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const fixtureRoot = join(root, 'test/fixtures/gemini-cli-process-contract');
const configPath = join(root, 'tsconfig.json');
const config = ts.readConfigFile(configPath, ts.sys.readFile);
assert.equal(config.error, undefined);
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root, undefined, configPath);
const compact = diagnostic => ({
  code: diagnostic.code,
  file: diagnostic.file?.fileName,
  line: diagnostic.file && diagnostic.start !== undefined
    ? diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start).line + 1 : undefined,
  message: ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
});
assert.deepEqual(parsed.errors.map(compact), []);
const options = { ...parsed.options, rootDir: root, noEmit: true };

const diagnosticsForFixture = compileFixtureDiagnostics([
  join(fixtureRoot, 'positive.mts'), join(fixtureRoot, 'negative.mts'),
], options, 'Gemini CLI process source graph must type-check with project settings');

function diagnosticsForFile(file) {
  const diagnostics = ts.getPreEmitDiagnostics(ts.createProgram([file], options));
  assert.deepEqual(diagnostics.filter(item => item.file?.fileName !== file).map(compact), [],
    'Gemini CLI process source graph must type-check with project settings');
  return diagnostics.filter(item => item.file?.fileName === file).map(compact);
}
function diagnosticsFor(name) { return diagnosticsForFixture(join(fixtureRoot, name)).map(compact); }

function diagnosticsForSource(name, source) {
  const directory = mkdtempSync(join(root, 'test/.gemini-cli-process-contract-'));
  const file = join(directory, name);
  try {
    writeFileSync(file, source);
    return diagnosticsForFile(file);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

test('Gemini CLI process contracts compose flat/grouped entrypoints, native process options and observed results', () => {
  assert.deepEqual(diagnosticsFor('positive.mts'), []);
});

test('Gemini CLI process requires every named option and keeps nullable child outcomes honest', () => {
  const diagnostics = diagnosticsFor('negative.mts');
  assert.deepEqual(diagnostics.map(({ code, line }) => [code, line]), [
    [2554, 10], [2345, 11], [2345, 13], [2345, 15], [2345, 17], [2345, 19],
    [2345, 21], [2345, 23], [2345, 25], [2345, 27], [2345, 29], [2345, 31],
    [2345, 33], [2345, 35], [2322, 36], [2345, 37], [2540, 38], [2322, 42],
    [2322, 43], [2740, 44], [2322, 48], [2322, 49], [2322, 51], [2322, 51],
    [2322, 54], [2322, 54],
  ]);
  assert.match(diagnostics[0].message, /Expected 1 arguments/);
  assert.match(diagnostics[1].message, /GeminiCliProcessOptions|string/);
  assert.match(diagnostics[14].message, /AbortSignal|signal/);
  assert.match(diagnostics[17].message, /null.*number|number.*null/);
  assert.match(diagnostics[18].message, /null.*Signals|Signals.*null/);
  assert.match(diagnostics[19].message, /Promise.*GeminiCliProcessResult|Promise.*not assignable/i);
  assert.match(diagnostics[20].message, /thinkingLevel|thinkingBudget/);
  assert.match(diagnostics[21].message, /thinkingBudget|thinkingLevel/);
  assert.match(diagnostics[22].message, /undefined|thinkingBudget|thinkingLevel/);
  assert.match(diagnostics[23].message, /undefined|thinkingBudget|thinkingLevel/);
  assert.match(diagnostics[24].message, /undefined|thinkingBudget/);
  assert.match(diagnostics[25].message, /undefined|thinkingLevel/);
});

test('Gemini CLI process option unions preserve model and thinking-control correlation', () => {
  const diagnostics = diagnosticsForSource('union-positive.mts', `
import { runGeminiCliProcess } from '../../src/gemini-cli-process.mjs';
import type { GeminiCliProcessOptions } from '../../src/gemini-cli/gemini-cli-process.mts';
const common = { cliEntrypoint: '/opt/gemini/cli.mjs', workspaceDirectory: '/work', privateParentDirectory: '/tmp/private', prompt: 'Review.', project: 'review', region: 'us', proxyUrl: 'http://127.0.0.1:45678/', timeoutMs: 60_000, maxPromptBytes: 4096, maxStdoutBytes: 2048, maxStderrBytes: 1024 };
type SupportedModel = 'gemini-3.8-flash' | 'gemini-2.5-flash';
declare const model: SupportedModel;
declare const broadModel: string;
const correlated: GeminiCliProcessOptions<SupportedModel> = model === 'gemini-3.8-flash'
  ? { ...common, model, thinkingLevel: 'LOW' }
  : { ...common, model, thinkingBudget: 512 };
const correlatedResult = runGeminiCliProcess(correlated);
const inferredCorrelated = runGeminiCliProcess(model === 'gemini-3.8-flash'
  ? { ...common, model, thinkingLevel: 'MEDIUM' }
  : { ...common, model, thinkingBudget: 512 });
const inferredFlash = runGeminiCliProcess({ ...common, model: 'gemini-3.8-flash', thinkingLevel: 'HIGH' });
const inferredOther = runGeminiCliProcess({ ...common, model: 'gemini-2.5-flash', thinkingBudget: 256 });
const broadLevel = runGeminiCliProcess({ ...common, model: broadModel, thinkingLevel: 'LOW' });
const broadBudget = runGeminiCliProcess({ ...common, model: broadModel, thinkingBudget: 256 });
void [correlatedResult, inferredCorrelated, inferredFlash, inferredOther, broadLevel, broadBudget];
`);
  assert.deepEqual(diagnostics, []);
});

test('Gemini CLI process rejects uncorrelated union and inferred model/control combinations', () => {
  const diagnostics = diagnosticsForSource('union-negative.mts', `
import { runGeminiCliProcess } from '../../src/gemini-cli-process.mjs';
import type { GeminiCliProcessOptions } from '../../src/gemini-cli/gemini-cli-process.mts';
const common = { cliEntrypoint: '/opt/gemini/cli.mjs', workspaceDirectory: '/work', privateParentDirectory: '/tmp/private', prompt: 'Review.', project: 'review', region: 'us', proxyUrl: 'http://127.0.0.1:45678/', timeoutMs: 60_000, maxPromptBytes: 4096, maxStdoutBytes: 2048, maxStderrBytes: 1024 };
declare const model: 'gemini-3.8-flash' | 'gemini-2.5-flash';
const explicitUnion: GeminiCliProcessOptions<typeof model> = { ...common, model, thinkingBudget: 512 };
const inferredUnion = runGeminiCliProcess({ ...common, model, thinkingBudget: 512 });
const inferredFlash = runGeminiCliProcess({ ...common, model: 'gemini-3.8-flash', thinkingBudget: 512 });
const inferredOther = runGeminiCliProcess({ ...common, model: 'gemini-2.5-flash', thinkingLevel: 'HIGH' });
void [explicitUnion, inferredUnion, inferredFlash, inferredOther];
`);
  assert.deepEqual(diagnostics.map(({ code }) => code), [2322, 2345, 2322, 2322]);
  assert.match(diagnostics[0].message, /GeminiCliProcessOptions/);
  assert.match(diagnostics[1].message, /GeminiCliProcessInputForModel/);
  assert.match(diagnostics[2].message, /thinkingBudget|not assignable/i);
  assert.match(diagnostics[3].message, /thinkingLevel|not assignable/i);
});
