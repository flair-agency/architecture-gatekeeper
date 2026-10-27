import { runGeminiCliSession as runFlat } from '../../../src/gemini-cli-session.mts';
import {
  runGeminiCliSession,
  type GeminiCliSessionInput,
  type GeminiCliSessionProcessOptions,
} from '../../../src/gemini-cli/gemini-cli-session.mts';
import type { ReviewFileContextLimits, ReviewFileContextPacket } from '../../../src/review-inputs/prepare-review-file-context.mts';

declare const packet: ReviewFileContextPacket;
declare const limits: ReviewFileContextLimits;
declare const parentDirectory: string;
const signal = new AbortController().signal;
const defaultFlash: GeminiCliSessionProcessOptions = {
  cliEntrypoint: '/opt/gemini/gemini.mjs', privateParentDirectory: '/tmp/gemini-private',
  prompt: 'Inspect the selected evidence.', model: 'gemini-3.8-flash', thinkingLevel: 'MEDIUM',
  project: 'selected-project', region: 'us', proxyUrl: 'http://127.0.0.1:45678/', timeoutMs: 30_000,
  maxPromptBytes: 16_384, maxStdoutBytes: 8192, maxStderrBytes: 4096, signal,
};
const input: GeminiCliSessionInput = { packet, workspaceLimits: limits, workspaceParentDirectory: parentDirectory, processOptions: defaultFlash };
const result: Promise<string> = runGeminiCliSession(input);
const flatResult: Promise<string> = runFlat(input);

const dynamicModel: string = process.env.GEMINI_MODEL ?? 'dynamic-model';
const dynamicBudget: GeminiCliSessionProcessOptions = { ...defaultFlash, model: dynamicModel, thinkingLevel: undefined, thinkingBudget: 512 };
const dynamicLevel: GeminiCliSessionProcessOptions = { ...defaultFlash, model: dynamicModel, thinkingBudget: undefined, thinkingLevel: 'HIGH' };
const flashLiteral: GeminiCliSessionInput<'gemini-3.8-flash'> = {
  packet, workspaceLimits: limits, workspaceParentDirectory: parentDirectory,
  processOptions: { ...defaultFlash, model: 'gemini-3.8-flash', thinkingLevel: 'LOW', thinkingBudget: undefined },
};
const otherLiteral: GeminiCliSessionInput<'gemini-2.5-flash'> = {
  packet, workspaceLimits: limits, workspaceParentDirectory: parentDirectory,
  processOptions: { ...defaultFlash, model: 'gemini-2.5-flash', thinkingLevel: undefined, thinkingBudget: 1024 },
};
type FlashModel = 'gemini-3.8-flash' | 'gemini-2.5-flash';
const unionModel: FlashModel = Math.random() ? 'gemini-3.8-flash' : 'gemini-2.5-flash';
// This explicit union must retain model/control correlation.
const correlatedUnion: GeminiCliSessionProcessOptions<FlashModel> =
  unionModel === 'gemini-3.8-flash'
    ? { ...defaultFlash, model: unionModel, thinkingLevel: 'LOW', thinkingBudget: undefined }
    : { ...defaultFlash, model: unionModel, thinkingLevel: undefined, thinkingBudget: 512 };
const correlatedInput: GeminiCliSessionInput<FlashModel> = {
  packet, workspaceLimits: limits, workspaceParentDirectory: parentDirectory,
  processOptions: correlatedUnion,
};
const typedUnionCall = runGeminiCliSession(correlatedInput);
const correlatedCall = runGeminiCliSession({
  packet, workspaceLimits: limits, workspaceParentDirectory: parentDirectory,
  processOptions: unionModel === 'gemini-3.8-flash'
    ? { ...defaultFlash, model: unionModel, thinkingLevel: 'LOW', thinkingBudget: undefined }
    : { ...defaultFlash, model: unionModel, thinkingLevel: undefined, thinkingBudget: 512 },
});
void correlatedUnion;
void [result, flatResult, dynamicBudget, dynamicLevel, correlatedCall, typedUnionCall, runGeminiCliSession(flashLiteral), runGeminiCliSession(otherLiteral)];
