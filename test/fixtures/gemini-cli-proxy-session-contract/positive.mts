import { runGeminiCliProxySession as runFlat } from '../../../src/gemini-cli-proxy-session.mjs';
import {
  runGeminiCliProxySession,
  type GeminiCliProxySessionInput,
  type GeminiCliProxySessionProcessOptions,
} from '../../../src/gemini-cli/gemini-cli-proxy-session.mts';
import type { ReviewFileContextPacket } from '../../../src/review-inputs/prepare-review-file-context.mts';

const packet: ReviewFileContextPacket = {
  version: 1,
  revisions: { baseSha: 'a'.repeat(40), headSha: 'b'.repeat(40), reviewedMergeSha: 'c'.repeat(40) },
  files: [], references: [],
  limits: { maxFiles: 2, maxFileBytes: 1024, maxTotalBytes: 2048 },
};
const input: GeminiCliProxySessionInput = {
  packet,
  workspaceLimits: { maxFiles: 2, maxFileBytes: 1024, maxTotalBytes: 2048 },
  workspaceParentDirectory: '/tmp/review-workspaces',
  credentials: { type: 'bearer', value: 'parent-only-token' },
  processOptions: {
    cliEntrypoint: '/opt/gemini/gemini.mjs', privateParentDirectory: '/tmp/gemini-private',
    prompt: 'Inspect the selected evidence.', model: 'gemini-3.8-flash', thinkingLevel: 'MEDIUM',
    project: 'selected-project', region: 'us', timeoutMs: 30_000,
    maxPromptBytes: 16_384, maxStdoutBytes: 8192, maxStderrBytes: 4096,
    signal: new AbortController().signal,
  },
};
const result: Promise<string> = runGeminiCliProxySession(input);
const facadeResult: Promise<string> = runFlat(input);
const defaultAliasFlash: GeminiCliProxySessionProcessOptions = {
  cliEntrypoint: '/opt/gemini/gemini.mjs', privateParentDirectory: '/tmp/gemini-private',
  prompt: 'Inspect the selected evidence.', model: 'gemini-3.8-flash', thinkingLevel: 'LOW',
  project: 'selected-project', region: 'us', timeoutMs: 30_000,
  maxPromptBytes: 16_384, maxStdoutBytes: 8192, maxStderrBytes: 4096,
};
const dynamicModel: string = process.env.GEMINI_MODEL ?? 'dynamic-model';
const dynamicLevel: GeminiCliProxySessionProcessOptions = {
  ...defaultAliasFlash, model: dynamicModel,
};
const dynamicBudget: GeminiCliProxySessionProcessOptions = {
  ...defaultAliasFlash, model: dynamicModel, thinkingLevel: undefined, thinkingBudget: 128,
};
const flashLiteral: GeminiCliProxySessionInput<'gemini-3.8-flash'> = {
  ...input,
  processOptions: { ...input.processOptions, model: 'gemini-3.8-flash', thinkingLevel: 'MEDIUM', thinkingBudget: undefined },
};
const otherLiteral: GeminiCliProxySessionInput<'gemini-2.5-flash'> = {
  ...input,
  processOptions: {
    cliEntrypoint: '/opt/gemini/gemini.mjs', privateParentDirectory: '/tmp/gemini-private',
    prompt: 'Inspect the selected evidence.', model: 'gemini-2.5-flash', thinkingBudget: 512,
    project: 'selected-project', region: 'us', timeoutMs: 30_000,
    maxPromptBytes: 16_384, maxStdoutBytes: 8192, maxStderrBytes: 4096,
  },
};
const extraResults = [runGeminiCliProxySession(flashLiteral), runGeminiCliProxySession(otherLiteral)];
void [result, facadeResult, dynamicLevel, dynamicBudget, extraResults];
