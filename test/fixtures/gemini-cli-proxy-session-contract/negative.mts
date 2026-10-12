import { runGeminiCliProxySession } from '../../../src/gemini-cli/gemini-cli-proxy-session.mts';
import type { GeminiCliProxySessionInput, GeminiCliProxySessionProcessOptions } from '../../../src/gemini-cli/gemini-cli-proxy-session.mts';

declare const valid: GeminiCliProxySessionInput;
runGeminiCliProxySession();
const invalidCredentials: GeminiCliProxySessionInput = { ...valid, credentials: { type: 'apiKey', value: 'not-bearer' } };
const invalidOptions: GeminiCliProxySessionInput = { ...valid, processOptions: { ...valid.processOptions, proxyUrl: 'http://127.0.0.1:1/' } };
const result = runGeminiCliProxySession(valid);
const numericResult: Promise<number> = result;
void [invalidCredentials, invalidOptions, numericResult];
const bothThinking: GeminiCliProxySessionProcessOptions = {
  ...valid.processOptions, thinkingBudget: 512, thinkingLevel: 'HIGH' as const,
};
const noThinking: GeminiCliProxySessionProcessOptions<'gemini-3.8-flash'> = {
  ...valid.processOptions, model: 'gemini-3.8-flash', thinkingBudget: undefined, thinkingLevel: undefined,
};
const invalidOtherLiteral: GeminiCliProxySessionProcessOptions<'gemini-2.5-flash'> = {
  ...valid.processOptions, model: 'gemini-2.5-flash', thinkingBudget: undefined, thinkingLevel: 'HIGH' as const,
};
const invalidFlashLiteral: GeminiCliProxySessionProcessOptions<'gemini-3.8-flash'> = {
  ...valid.processOptions, model: 'gemini-3.8-flash', thinkingBudget: 512, thinkingLevel: undefined,
};
void [bothThinking, noThinking, invalidOtherLiteral, invalidFlashLiteral];
