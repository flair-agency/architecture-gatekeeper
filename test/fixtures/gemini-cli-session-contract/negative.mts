import { runGeminiCliSession } from '../../../src/gemini-cli/gemini-cli-session.mts';
import type { GeminiCliSessionInput, GeminiCliSessionProcessOptions } from '../../../src/gemini-cli/gemini-cli-session.mts';

declare const valid: GeminiCliSessionInput;
runGeminiCliSession();
const empty: GeminiCliSessionInput = {};
const missingPacket: GeminiCliSessionInput = { workspaceLimits: valid.workspaceLimits, workspaceParentDirectory: valid.workspaceParentDirectory, processOptions: valid.processOptions };
const missingLimits: GeminiCliSessionInput = { packet: valid.packet, workspaceParentDirectory: valid.workspaceParentDirectory, processOptions: valid.processOptions };
const missingParent: GeminiCliSessionInput = { packet: valid.packet, workspaceLimits: valid.workspaceLimits, processOptions: valid.processOptions };
const missingProcess: GeminiCliSessionInput = { packet: valid.packet, workspaceLimits: valid.workspaceLimits, workspaceParentDirectory: valid.workspaceParentDirectory };
const workspaceOverride: GeminiCliSessionInput = { ...valid, processOptions: { ...valid.processOptions, workspaceDirectory: '/tmp/caller-selected' } };
const noThinking: GeminiCliSessionProcessOptions = { ...valid.processOptions, thinkingBudget: undefined, thinkingLevel: undefined };
const bothThinking: GeminiCliSessionProcessOptions = { ...valid.processOptions, thinkingBudget: 1, thinkingLevel: 'HIGH' };
const invalidFlash: GeminiCliSessionProcessOptions<'gemini-3.8-flash'> = { ...valid.processOptions, model: 'gemini-3.8-flash', thinkingLevel: undefined, thinkingBudget: 1 };
const invalidOther: GeminiCliSessionProcessOptions<'gemini-2.5-flash'> = { ...valid.processOptions, model: 'gemini-2.5-flash', thinkingLevel: 'HIGH', thinkingBudget: undefined };
const wrongResult: Promise<number> = runGeminiCliSession(valid);
valid.processOptions.model = 'changed';
type FlashModel = 'gemini-3.8-flash' | 'gemini-2.5-flash';
declare const unionModel: FlashModel;
const invalidUnion: GeminiCliSessionProcessOptions<FlashModel> = { ...valid.processOptions, model: unionModel, thinkingLevel: undefined, thinkingBudget: 512 };
runGeminiCliSession({
  packet: valid.packet, workspaceLimits: valid.workspaceLimits, workspaceParentDirectory: valid.workspaceParentDirectory,
  processOptions: { ...valid.processOptions, model: unionModel, thinkingLevel: undefined, thinkingBudget: 512 },
});
void [empty, missingPacket, missingLimits, missingParent, missingProcess, workspaceOverride, noThinking, bothThinking, invalidFlash, invalidOther, wrongResult];
void invalidUnion;
