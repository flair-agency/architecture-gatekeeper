import { runPreparedGeminiCiReview } from '../../../src/prepared-gemini-ci-review.mts';

const limits = { maxFiles: 2, maxFileBytes: 2048, maxTotalBytes: 4096 };
const packet = {
  version: 1 as const,
  revisions: { baseSha: 'a'.repeat(40), headSha: 'b'.repeat(40), reviewedMergeSha: 'c'.repeat(40) },
  files: [], references: [], limits,
};
const base = {
  cliEntrypoint: '/opt/gemini.mjs', privateParentDirectory: '/tmp/private',
  project: 'selected-project', region: 'us-central1', timeoutMs: 5000,
  maxPromptBytes: 4096, maxStdoutBytes: 2048, maxStderrBytes: 2048,
};
const session = {
  packet, workspaceLimits: limits, workspaceParentDirectory: '/tmp/workspaces',
  credentials: { type: 'bearer' as const, value: 'parent-only-token' },
};

runPreparedGeminiCiReview({ protectedPromptText: 'review', protectedDecisionSchemaText: '{}' });
runPreparedGeminiCiReview({ protectedPromptText: 'review', protectedDecisionSchemaText: '{}', proxySessionOptions: { ...session, processOptions: { ...base, model: 'gemini-3.8-flash' } } });
runPreparedGeminiCiReview({ protectedPromptText: 'review', protectedDecisionSchemaText: '{}', proxySessionOptions: { ...session, processOptions: { ...base, model: 'gemini-2.5-flash' } } });
runPreparedGeminiCiReview({ protectedPromptText: 'review', protectedDecisionSchemaText: '{}', proxySessionOptions: { ...session, processOptions: { ...base, model: 'gemini-3.8-flash', thinkingBudget: 512 } } });
runPreparedGeminiCiReview({ protectedPromptText: 'review', protectedDecisionSchemaText: '{}', proxySessionOptions: { ...session, processOptions: { ...base, prompt: 'override', model: 'gemini-2.5-flash', thinkingBudget: 512 } } });
runPreparedGeminiCiReview({ protectedPromptText: 'review', protectedDecisionSchemaText: '{}', proxySessionOptions: { ...session, credentials: { type: 'api-key', value: 'token' }, processOptions: { ...base, model: 'gemini-2.5-flash', thinkingBudget: 512 } } });
runPreparedGeminiCiReview({ protectedPromptText: 'review', protectedDecisionSchemaText: '{}', proxySessionOptions: { ...session, processOptions: { ...base, model: 'gemini-2.5-flash' } } });
runPreparedGeminiCiReview({ protectedPromptText: 'review', protectedDecisionSchemaText: '{}', proxySessionOptions: { ...session, processOptions: { ...base, model: 'gemini-2.5-flash', thinkingBudget: 512, thinkingLevel: 'LOW' } } });
declare const unionModel: 'gemini-3.8-flash' | 'gemini-2.5-flash';
runPreparedGeminiCiReview({ protectedPromptText: 'review', protectedDecisionSchemaText: '{}', proxySessionOptions: { ...session, processOptions: { ...base, model: unionModel, thinkingBudget: 512 } } });
const invalidUnion: import('../../../src/gemini-cli/prepared-gemini-ci-review.mts').PreparedGeminiCiReviewInput<'gemini-3.8-flash' | 'gemini-2.5-flash'> = {
  protectedPromptText: 'review', protectedDecisionSchemaText: '{}',
  proxySessionOptions: { ...session, processOptions: { ...base, model: unionModel, thinkingBudget: 512 } },
};
void invalidUnion;
