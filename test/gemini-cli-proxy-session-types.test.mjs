import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { compileFixtureDiagnostics } from './helpers/type-fixture-diagnostics.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const fixtureRoot = join(root, 'test/fixtures/gemini-cli-proxy-session-contract');
const configPath = join(root, 'tsconfig.json');
const config = ts.readConfigFile(configPath, ts.sys.readFile);
assert.equal(config.error, undefined);
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root, undefined, configPath);
assert.deepEqual(parsed.errors, []);
const options = { ...parsed.options, rootDir: root, noEmit: true };

const summarize = item => ({
  file: item.file?.fileName,
  line: item.file && item.start !== undefined ? item.file.getLineAndCharacterOfPosition(item.start).line + 1 : 0,
  code: item.code,
  message: ts.flattenDiagnosticMessageText(item.messageText, '\n'),
});
const diagnosticsForFixture = compileFixtureDiagnostics([
  join(fixtureRoot, 'positive.mts'), join(fixtureRoot, 'negative.mts'),
], options, 'the proxy-session implementation and every imported source module must remain error-free');

function diagnosticsFor(name) {
  return diagnosticsForFixture(join(fixtureRoot, name)).map(summarize);
}

function diagnosticsForFile(file) {
  const program = ts.createProgram([file], options);
  const diagnostics = ts.getPreEmitDiagnostics(program);
  assert.deepEqual(diagnostics.filter(item => item.file?.fileName !== file).map(summarize), [],
    'the proxy-session implementation and every imported source module must remain error-free');
  return diagnostics.filter(item => item.file?.fileName === file).map(summarize);
}

function diagnosticsForSource(name, source) {
  const directory = mkdtempSync(join(root, 'test/.gemini-cli-proxy-contract-'));
  const file = join(directory, name);
  try {
    writeFileSync(file, source);
    return diagnosticsForFile(file);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

test('Gemini proxy-session contract accepts complete mandatory input through grouped and flat exports', () => {
  assert.deepEqual(diagnosticsFor('positive.mts'), []);
});

test('Gemini proxy-session contract rejects missing input, unsupported credentials/options, and wrong results', () => {
  const diagnostics = diagnosticsFor('negative.mts');
  assert.deepEqual(diagnostics.map(item => [item.code, item.line]), [
    [2554, 5], [2322, 6], [2322, 7], [2322, 9], [2322, 11],
    [2322, 15], [2322, 18], [2322, 18], [2322, 21], [2322, 21],
  ]);
  assert.match(diagnostics[0].message, /Expected 1 arguments/);
  assert.match(diagnostics[1].message, /bearer|not assignable/i);
  assert.match(diagnostics[2].message, /proxyUrl|does not exist/i);
  assert.match(diagnostics[3].message, /Promise.*number|not assignable/i);
  assert.match(diagnostics[4].message, /thinkingBudget|thinkingLevel|not assignable/i);
  assert.match(diagnostics[5].message, /undefined|thinkingLevel/);
  assert.match(diagnostics[6].message, /undefined|thinkingBudget/);
  assert.match(diagnostics[7].message, /thinkingLevel|not assignable/i);
  assert.match(diagnostics[8].message, /thinkingBudget|not assignable/i);
  assert.match(diagnostics[9].message, /thinkingLevel|not assignable/i);
});

test('Gemini proxy-session unions preserve model and thinking-control correlation', () => {
  const diagnostics = diagnosticsForSource('union-positive.mts', `
import { runGeminiCliProxySession } from '../../src/gemini-cli/gemini-cli-proxy-session.mts';
import type { GeminiCliProxySessionInput, GeminiCliProxySessionProcessOptions } from '../../src/gemini-cli/gemini-cli-proxy-session.mts';
import type { ReviewFileContextLimits, ReviewFileContextPacket } from '../../src/review-inputs/prepare-review-file-context.mts';
declare const packet: ReviewFileContextPacket;
declare const workspaceLimits: ReviewFileContextLimits;
type SupportedModel = 'gemini-3.8-flash' | 'gemini-2.5-flash';
declare const model: SupportedModel;
declare const broadModel: string;
const common = { cliEntrypoint: '/opt/gemini/cli.mjs', privateParentDirectory: '/tmp/private', prompt: 'Review.', project: 'review', region: 'us', timeoutMs: 60_000, maxPromptBytes: 4096, maxStdoutBytes: 2048, maxStderrBytes: 1024 };
const base = { packet, workspaceLimits, workspaceParentDirectory: '/tmp/workspaces', credentials: { type: 'bearer' as const, value: 'parent-token' } };
const correlatedOptions: GeminiCliProxySessionProcessOptions<SupportedModel> = model === 'gemini-3.8-flash'
  ? { ...common, model, thinkingLevel: 'LOW' }
  : { ...common, model, thinkingBudget: 512 };
const correlatedInput: GeminiCliProxySessionInput<SupportedModel> = { ...base, processOptions: correlatedOptions };
const correlatedInputResult = runGeminiCliProxySession(correlatedInput);
const inferredCorrelated = runGeminiCliProxySession({ ...base, processOptions: model === 'gemini-3.8-flash'
  ? { ...common, model, thinkingLevel: 'MEDIUM' }
  : { ...common, model, thinkingBudget: 512 } });
const inferredFlash = runGeminiCliProxySession({ ...base, processOptions: { ...common, model: 'gemini-3.8-flash', thinkingLevel: 'HIGH' } });
const inferredOther = runGeminiCliProxySession({ ...base, processOptions: { ...common, model: 'gemini-2.5-flash', thinkingBudget: 256 } });
const broadLevel = runGeminiCliProxySession({ ...base, processOptions: { ...common, model: broadModel, thinkingLevel: 'LOW' } });
const broadBudget = runGeminiCliProxySession({ ...base, processOptions: { ...common, model: broadModel, thinkingBudget: 256 } });
void [correlatedInputResult, inferredCorrelated, inferredFlash, inferredOther, broadLevel, broadBudget];
`);
  assert.deepEqual(diagnostics, []);
});

test('Gemini proxy-session rejects uncorrelated union and inferred model/control combinations', () => {
  const diagnostics = diagnosticsForSource('union-negative.mts', `
import { runGeminiCliProxySession } from '../../src/gemini-cli/gemini-cli-proxy-session.mts';
import type { GeminiCliProxySessionProcessOptions } from '../../src/gemini-cli/gemini-cli-proxy-session.mts';
import type { ReviewFileContextLimits, ReviewFileContextPacket } from '../../src/review-inputs/prepare-review-file-context.mts';
declare const packet: ReviewFileContextPacket;
declare const workspaceLimits: ReviewFileContextLimits;
declare const model: 'gemini-3.8-flash' | 'gemini-2.5-flash';
const common = { cliEntrypoint: '/opt/gemini/cli.mjs', privateParentDirectory: '/tmp/private', prompt: 'Review.', project: 'review', region: 'us', timeoutMs: 60_000, maxPromptBytes: 4096, maxStdoutBytes: 2048, maxStderrBytes: 1024 };
const base = { packet, workspaceLimits, workspaceParentDirectory: '/tmp/workspaces', credentials: { type: 'bearer' as const, value: 'parent-token' } };
const explicitUnion: GeminiCliProxySessionProcessOptions<typeof model> = { ...common, model, thinkingBudget: 512 };
const inferredUnion = runGeminiCliProxySession({ ...base, processOptions: { ...common, model, thinkingBudget: 512 } });
const inferredFlash = runGeminiCliProxySession({ ...base, processOptions: { ...common, model: 'gemini-3.8-flash', thinkingBudget: 512 } });
const inferredOther = runGeminiCliProxySession({ ...base, processOptions: { ...common, model: 'gemini-2.5-flash', thinkingLevel: 'HIGH' } });
void [explicitUnion, inferredUnion, inferredFlash, inferredOther];
`);
  assert.deepEqual(diagnostics.map(({ code }) => code), [2322, 2322, 2322, 2322]);
  assert.match(diagnostics[0].message, /GeminiCliProxySessionProcessOptions/);
  assert.match(diagnostics[1].message, /GeminiCliProxySessionProcessOptions/);
  assert.match(diagnostics[2].message, /thinkingBudget|not assignable/i);
  assert.match(diagnostics[3].message, /thinkingLevel|not assignable/i);
});
