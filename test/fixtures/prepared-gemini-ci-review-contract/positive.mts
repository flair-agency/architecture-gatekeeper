import { runPreparedGeminiCiReview as runFlat } from '../../../src/prepared-gemini-ci-review.mts';
import { runPreparedGeminiCiReview as runGrouped, type PreparedGeminiCiReviewInput } from '../../../src/gemini-cli/prepared-gemini-ci-review.mts';
import { runGeminiCliProxySession } from '../../../src/gemini-cli-proxy-session.mts';
import { runGeminiCliProcess } from '../../../src/gemini-cli-process.mts';
import { validateJsonSchemaDefinition } from '../../../src/json-schema.mts';

const limits = { maxFiles: 2, maxFileBytes: 2048, maxTotalBytes: 4096 };
const packet = {
  version: 1 as const,
  revisions: { baseSha: 'a'.repeat(40), headSha: 'b'.repeat(40), reviewedMergeSha: 'c'.repeat(40) },
  files: [], references: [], limits,
};
const processBase = {
  cliEntrypoint: '/opt/gemini.mjs', privateParentDirectory: '/tmp/private',
  project: 'selected-project', region: 'us-central1', timeoutMs: 5000,
  maxOutputTokens: 16384,
  maxPromptBytes: 4096, maxStdoutBytes: 2048, maxStderrBytes: 2048,
};
const sessionBase = {
  packet, workspaceLimits: limits, workspaceParentDirectory: '/tmp/workspaces',
  credentials: { type: 'bearer' as const, value: 'parent-only-token' },
};

const flashInput: PreparedGeminiCiReviewInput<'gemini-3.8-flash'> = {
  protectedReviewer: { provider: 'gemini', model: 'gemini-3.8-flash', thinkingLevel: 'MEDIUM' },
  protectedPromptText: 'Review selected evidence.',
  protectedDecisionSchemaText: '{"type":"object"}',
  proxySessionOptions: {
    ...sessionBase,
    processOptions: { ...processBase, model: 'gemini-3.8-flash', thinkingLevel: 'MEDIUM' },
  },
};
const budgetInput: PreparedGeminiCiReviewInput<'gemini-2.5-flash'> = {
  protectedReviewer: { provider: 'gemini', model: 'gemini-2.5-flash', thinkingLevel: 'MEDIUM' },
  protectedPromptText: 'Review selected evidence.',
  protectedDecisionSchemaText: '{"type":"object"}',
  proxySessionOptions: {
    ...sessionBase,
    processOptions: { ...processBase, model: 'gemini-2.5-flash', thinkingBudget: 512 },
  },
};
const defaultAliasFlash: PreparedGeminiCiReviewInput = {
  protectedReviewer: { provider: 'gemini', model: 'gemini-3.8-flash', thinkingLevel: 'MEDIUM' },
  protectedPromptText: 'Review selected evidence.',
  protectedDecisionSchemaText: '{"type":"object"}',
  proxySessionOptions: {
    ...sessionBase,
    processOptions: { ...processBase, model: 'gemini-3.8-flash', thinkingLevel: 'LOW' },
  },
};
const defaultAliasBudget: PreparedGeminiCiReviewInput = {
  protectedReviewer: { provider: 'gemini', model: 'gemini-2.5-flash', thinkingLevel: 'MEDIUM' },
  protectedPromptText: 'Review selected evidence.',
  protectedDecisionSchemaText: '{"type":"object"}',
  proxySessionOptions: {
    ...sessionBase,
    processOptions: { ...processBase, model: 'gemini-2.5-flash', thinkingBudget: 1024 },
  },
};
type FlashModel = 'gemini-3.8-flash' | 'gemini-2.5-flash';
declare const unionModel: FlashModel;
const correlatedUnion: PreparedGeminiCiReviewInput<FlashModel> = {
  protectedReviewer: { provider: 'gemini', model: unionModel, thinkingLevel: 'MEDIUM' },
  protectedPromptText: 'Review selected evidence.',
  protectedDecisionSchemaText: '{"type":"object"}',
  proxySessionOptions: {
    ...sessionBase,
    processOptions: unionModel === 'gemini-3.8-flash'
      ? { ...processBase, model: unionModel, thinkingLevel: 'MEDIUM' }
      : { ...processBase, model: unionModel, thinkingBudget: 512 },
  },
};
const correlatedCall = runGrouped({
  protectedReviewer: { provider: 'gemini', model: unionModel, thinkingLevel: 'MEDIUM' },
  protectedPromptText: 'Review selected evidence.',
  protectedDecisionSchemaText: '{"type":"object"}',
  proxySessionOptions: {
    ...sessionBase,
    processOptions: unionModel === 'gemini-3.8-flash'
      ? { ...processBase, model: unionModel, thinkingLevel: 'MEDIUM' }
      : { ...processBase, model: unionModel, thinkingBudget: 512 },
  },
});
const typedUnionCall = runGrouped(correlatedUnion);

const rawResponse: Promise<string> = runFlat(flashInput);
const groupedResponse: Promise<string> = runGrouped(budgetInput);
void rawResponse;
void groupedResponse;
void defaultAliasFlash;
void defaultAliasBudget;
void correlatedUnion;
void correlatedCall;
void typedUnionCall;

// These compile-only records describe model capability shapes, not runtime
// admission. The prepared adapter requires gemini-3.8-flash/MEDIUM and rejects
// every unsupported/mismatched selection before proxy or CLI startup.
// Direct lower-level callers retain their separate generic thinking contracts.
function dispatchDynamic(model: string, thinking: { thinkingBudget: number } | { thinkingLevel: 'LOW' | 'MEDIUM' | 'HIGH' }) {
  return runGrouped({
    protectedReviewer: { provider: 'gemini', model: model, thinkingLevel: 'MEDIUM' },
  protectedPromptText: 'Review selected evidence.',
    protectedDecisionSchemaText: '{"type":"object"}',
    proxySessionOptions: {
      ...sessionBase,
      processOptions: { ...processBase, model, ...thinking },
    },
  });
}
void dispatchDynamic;

// Direct typed composition stays available for code that owns lower-level
// startup orchestration. The adapter itself intentionally returns only text.
const lowerSession: Promise<string> = runGeminiCliProxySession({
  ...sessionBase,
  processOptions: {
    ...processBase, maxOutputTokens: 16384, prompt: 'already protected', model: 'gemini-3.8-flash', thinkingLevel: 'LOW',
  },
});
const lowerProcess = runGeminiCliProcess({
  ...processBase, workspaceDirectory: '/tmp/workspace', proxyUrl: 'http://127.0.0.1:1234',
  prompt: 'already protected', model: 'gemini-2.5-flash', thinkingBudget: 512,
});
void lowerSession;
void lowerProcess;
const schema: unknown = validateJsonSchemaDefinition({ type: 'object' });
void schema;
