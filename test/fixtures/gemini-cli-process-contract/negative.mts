import { encodeGeminiCliPromptForTransport, runGeminiCliProcess } from '../../../src/gemini-cli-process.mts';
import type { GeminiCliProcessOptions, GeminiCliProcessResult } from '../../../src/gemini-cli/gemini-cli-process.mts';

const valid: GeminiCliProcessOptions = {
  cliEntrypoint: '/opt/gemini/cli.mjs', workspaceDirectory: '/work/review', privateParentDirectory: '/tmp/private',
  prompt: 'Review.', model: 'gemini-2.5-flash', thinkingBudget: 512, project: 'review', region: 'us-central1',
  proxyUrl: 'http://127.0.0.1:45678/', timeoutMs: 60_000, maxPromptBytes: 32_768,
  maxStdoutBytes: 4_096, maxStderrBytes: 4_096,
};
runGeminiCliProcess();
runGeminiCliProcess({});
const { cliEntrypoint: _removed1, ...missingCliEntrypoint } = valid;
runGeminiCliProcess(missingCliEntrypoint);
const { workspaceDirectory: _removed2, ...missingWorkspaceDirectory } = valid;
runGeminiCliProcess(missingWorkspaceDirectory);
const { privateParentDirectory: _removed3, ...missingPrivateParentDirectory } = valid;
runGeminiCliProcess(missingPrivateParentDirectory);
const { prompt: _removed4, ...missingPrompt } = valid;
runGeminiCliProcess(missingPrompt);
const { model: _removed5, ...missingModel } = valid;
runGeminiCliProcess(missingModel);
const { project: _removed6, ...missingProject } = valid;
runGeminiCliProcess(missingProject);
const { region: _removed7, ...missingRegion } = valid;
runGeminiCliProcess(missingRegion);
const { proxyUrl: _removed8, ...missingProxyUrl } = valid;
runGeminiCliProcess(missingProxyUrl);
const { timeoutMs: _removed9, ...missingTimeoutMs } = valid;
runGeminiCliProcess(missingTimeoutMs);
const { maxPromptBytes: _removed10, ...missingMaxPromptBytes } = valid;
runGeminiCliProcess(missingMaxPromptBytes);
const { maxStdoutBytes: _removed11, ...missingMaxStdoutBytes } = valid;
runGeminiCliProcess(missingMaxStdoutBytes);
const { maxStderrBytes: _removed12, ...missingMaxStderrBytes } = valid;
runGeminiCliProcess(missingMaxStderrBytes);
runGeminiCliProcess({ ...valid, signal: 'cancelled' });
encodeGeminiCliPromptForTransport(17);
valid.model = 'changed';

async function observeResult() {
  const result = await runGeminiCliProcess(valid);
  const exitCode: number = result.exitCode;
  const signal: NodeJS.Signals = result.signal;
  const immediate: GeminiCliProcessResult = runGeminiCliProcess(valid);
  void [exitCode, signal, immediate];
}
void observeResult;
const missingThinking: GeminiCliProcessOptions = { ...valid, thinkingBudget: undefined, thinkingLevel: undefined };
const bothThinking: GeminiCliProcessOptions = { ...valid, thinkingLevel: 'HIGH' };
const wrongOtherModel: GeminiCliProcessOptions<'gemini-2.5-flash'> = {
  ...valid, model: 'gemini-2.5-flash', thinkingBudget: undefined, thinkingLevel: 'HIGH',
};
const wrongFlashModel: GeminiCliProcessOptions<'gemini-3.8-flash'> = {
  ...valid, model: 'gemini-3.8-flash', thinkingBudget: 512, thinkingLevel: undefined,
};
void [missingThinking, bothThinking, wrongOtherModel, wrongFlashModel];
