import { spawn } from 'node:child_process';
import { encodeGeminiCliPromptForTransport, GEMINI_CLI_STDIN_LIMIT, runGeminiCliProcess } from '../../../src/gemini-cli-process.mjs';
import { runGeminiCliProcess as groupedRun, type GeminiCliProcessOptions, type GeminiCliProcessResult } from '../../../src/gemini-cli/gemini-cli-process.mts';

const common = {
  cliEntrypoint: '/opt/gemini/cli.mjs',
  workspaceDirectory: '/work/review',
  privateParentDirectory: '/tmp/private',
  prompt: 'Review the selected evidence.',
  project: 'architecture-review',
  region: 'us-central1',
  proxyUrl: 'http://127.0.0.1:45678/',
  timeoutMs: 60_000,
  maxPromptBytes: 32_768,
  maxStdoutBytes: 4_096,
  maxStderrBytes: 4_096,
  signal: new AbortController().signal,
} as const;
const options: GeminiCliProcessOptions = { ...common, model: 'gemini-2.5-flash', thinkingBudget: 512 };
const readonlyOptions = {
  ...common,
  model: 'gemini-3.8-flash',
  thinkingLevel: 'MEDIUM',
  thinkingBudget: undefined,
  maxPromptBytes: GEMINI_CLI_STDIN_LIMIT,
} as const;
const defaultAliasFlash: GeminiCliProcessOptions = {
  ...common, model: 'gemini-3.8-flash', thinkingLevel: 'HIGH', thinkingBudget: undefined,
};
const literalFlash: GeminiCliProcessOptions<'gemini-3.8-flash'> = {
  ...common, model: 'gemini-3.8-flash', thinkingLevel: 'MEDIUM', thinkingBudget: undefined,
};
const literalOther: GeminiCliProcessOptions<'gemini-2.5-flash'> = {
  ...common, model: 'gemini-2.5-flash', thinkingBudget: 512,
};
const dynamicModel: string = process.env.GEMINI_MODEL ?? 'dynamic-model';
const dynamicLevel: GeminiCliProcessOptions = { ...common, model: dynamicModel, thinkingLevel: 'LOW' };
const dynamicBudget: GeminiCliProcessOptions = { ...common, model: dynamicModel, thinkingBudget: 256 };

const encoded: string = encodeGeminiCliPromptForTransport(options.prompt);
const actual: Promise<GeminiCliProcessResult> = runGeminiCliProcess(options);
const sameType: Promise<GeminiCliProcessResult> = groupedRun(readonlyOptions);
const aliasResult = groupedRun(defaultAliasFlash);
const literalResult = runGeminiCliProcess(literalFlash);
const otherResult = runGeminiCliProcess(literalOther);
const dynamicResults = [groupedRun(dynamicLevel), groupedRun(dynamicBudget)];
void [encoded, actual, sameType, aliasResult, literalResult, otherResult, dynamicResults];

const child = spawn(process.execPath, ['--version'], { stdio: ['ignore', 'pipe', 'pipe'] });
child.stdout.on('data', chunk => { const byteLength: number = chunk.length; void byteLength; });
child.on('close', (exitCode, signal) => {
  const code: number | null = exitCode;
  const observedSignal: NodeJS.Signals | null = signal;
  void [code, observedSignal];
});

async function observeResult() {
  const result = await groupedRun(options);
  const code: number | null = result.exitCode;
  result.cancelled = false;
  void code;
}
void observeResult;
