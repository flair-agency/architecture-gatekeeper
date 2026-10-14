import type { GeminiProxyConfig } from '../../../src/gemini-cli/gemini-security-proxy.mts';
import { remainingDeadlineMs, validateGeminiRoute, startGeminiSecurityProxy } from '../../../src/gemini-cli/gemini-security-proxy.mts';

const studio: GeminiProxyConfig = {
  allowedMode: 'studio', allowedModel: 'gemini-test',
  credentials: { type: 'apiKey', value: 'synthetic' },
  reserveDispatch: () => true,
};
const vertex: GeminiProxyConfig = {
  allowedMode: 'vertex', allowedModel: 'gemini-test', allowedProject: 'project', allowedRegion: 'global',
  credentials: { type: 'bearer', value: 'synthetic' },
  reserveDispatch: () => Promise.resolve(true),
};
const route = validateGeminiRoute('/v1beta/models/gemini-test:generateContent');
const unknownResult: unknown = route;
const deadline: number = remainingDeadlineMs(10, 5);
const start: Promise<{ endpointUrl: string; shutdown: () => Promise<void> }> = startGeminiSecurityProxy(studio);
void [vertex, unknownResult, deadline, start];
