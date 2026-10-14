import type { GeminiProxyConfig } from '../../../src/gemini-cli/gemini-security-proxy.mts';
import { startGeminiSecurityProxy } from '../../../src/gemini-cli/gemini-security-proxy.mts';

const missing: GeminiProxyConfig = { allowedMode: 'studio', allowedModel: 'x', credentials: { type: 'apiKey', value: 'x' }, reserveDispatch: async () => true };
const incompatible: GeminiProxyConfig = { allowedMode: 'vertex', allowedModel: 'x', allowedProject: 'p', allowedRegion: 'r', credentials: { type: 'apiKey', value: 'x' } };
const wrongCallback: GeminiProxyConfig = { allowedMode: 'studio', allowedModel: 'x', credentials: { type: 'apiKey', value: 'x' }, reserveDispatch: (value: string) => value === 'true' };
const result: Promise<string> = startGeminiSecurityProxy(missing);
void [incompatible, wrongCallback, result];
