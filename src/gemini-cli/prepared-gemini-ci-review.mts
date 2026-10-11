/** Internal adapter from caller-prepared protected CI inputs to the CLI proxy session. */
import { runGeminiCliProxySession, type GeminiCliProxySessionInput, type GeminiCliProxySessionProcessOptions } from './gemini-cli-proxy-session.mts';
import { validateJsonSchemaDefinition } from '../authority-validation/json-schema.mts';
import { encodeGeminiCliPromptForTransport, GEMINI_CLI_STDIN_LIMIT, type GeminiCliThinkingOptions } from './gemini-cli-process.mts';

const INPUT_KEYS = new Set(['protectedPromptText', 'protectedDecisionSchemaText', 'proxySessionOptions']);
const SESSION_KEYS = new Set(['packet', 'workspaceLimits', 'workspaceParentDirectory', 'processOptions', 'credentials']);
const PROCESS_KEYS = new Set([
  'cliEntrypoint', 'privateParentDirectory', 'model', 'thinkingBudget', 'thinkingLevel', 'project', 'region',
  'timeoutMs', 'maxPromptBytes', 'maxStdoutBytes', 'maxStderrBytes', 'signal',
]);

type PreparedModelOptions<Model extends string> = Model extends string
  ? { model: Model } & GeminiCliThinkingOptions<Model>
  : never;
type PreparedProcessOptionsForModel<Model extends string> = string extends Model
  ? { model: Model } & GeminiCliThinkingOptions<Model>
  : PreparedModelOptions<Model>;
type PreparedProcessOptions<Model extends string> =
  Omit<GeminiCliProxySessionProcessOptions<string>, 'prompt' | 'model' | 'thinkingBudget' | 'thinkingLevel'> &
  PreparedProcessOptionsForModel<Model>;

export interface PreparedGeminiCiReviewInput<Model extends string = string> {
  protectedPromptText: string;
  protectedDecisionSchemaText: string;
  proxySessionOptions: Omit<GeminiCliProxySessionInput<Model>, 'processOptions'> & {
    processOptions: PreparedProcessOptions<Model>;
  };
}

function hasOnlyKeys(value: unknown, keys: ReadonlySet<string>): unknown {
  return value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).every(key => keys.has(key));
}

function composePrompt(protectedPromptText: string, schemaText: string): string {
  return `${protectedPromptText}\n\nProtected output schema (follow this schema exactly; downstream CI validation remains authoritative):\n${schemaText}\n`;
}

/**
 * Run a decision-only review from inputs already selected and bound by the
 * trusted protected-CI orchestrator. This adapter does not establish their
 * provenance or validate the resulting decision.
 */
export async function runPreparedGeminiCiReview<const Model extends string = string>(input: PreparedGeminiCiReviewInput<Model> & {
  proxySessionOptions: { processOptions: { model: Model } };
}): Promise<string> {
  if (!hasOnlyKeys(input, INPUT_KEYS) || typeof input.protectedPromptText !== 'string' ||
      !input.protectedPromptText.trim() || typeof input.protectedDecisionSchemaText !== 'string' ||
      !hasOnlyKeys(input.proxySessionOptions, SESSION_KEYS)) {
    throw new Error('Prepared Gemini CI review requires a protected prompt, schema, and explicit proxy-session options.');
  }
  const { protectedDecisionSchemaText, proxySessionOptions } = input;
  const candidateProcessOptions = proxySessionOptions.processOptions;
  if (candidateProcessOptions && typeof candidateProcessOptions === 'object' && Object.hasOwn(candidateProcessOptions, 'prompt')) {
    throw new Error('Prepared Gemini CI review does not accept process prompt overrides.');
  }
  if (!hasOnlyKeys(candidateProcessOptions, PROCESS_KEYS)) throw new Error('Prepared Gemini CI review received unsupported process options.');
  const processOptions = candidateProcessOptions;
  if (!Number.isSafeInteger(processOptions.maxPromptBytes) || processOptions.maxPromptBytes < 1 || processOptions.maxPromptBytes > GEMINI_CLI_STDIN_LIMIT) {
    throw new Error('Prepared Gemini CI review requires an explicit positive prompt byte limit no larger than the pinned CLI stdin limit.');
  }
  const prompt = composePrompt(input.protectedPromptText, protectedDecisionSchemaText);
  if (Buffer.from(prompt, 'utf8').toString('utf8') !== prompt) {
    throw new Error('Prepared Gemini CI complete prompt is not valid UTF-8 text.');
  }
  if (Buffer.byteLength(encodeGeminiCliPromptForTransport(prompt), 'utf8') > processOptions.maxPromptBytes) {
    throw new Error('Prepared Gemini CI complete prompt exceeds the selected byte limit.');
  }
  let schema: unknown;
  try { schema = JSON.parse(protectedDecisionSchemaText); } catch { throw new Error('Protected decision schema must be valid JSON.'); }
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) throw new Error('Protected decision schema must be a JSON Schema object.');
  validateJsonSchemaDefinition(schema);

  return runGeminiCliProxySession({
    packet: proxySessionOptions.packet,
    workspaceLimits: proxySessionOptions.workspaceLimits,
    workspaceParentDirectory: proxySessionOptions.workspaceParentDirectory,
    credentials: proxySessionOptions.credentials,
    // The original property reads remain live at the call boundary. This view
    // composes their declared model-specific shape with the proxy collaborator.
    processOptions: {
      cliEntrypoint: processOptions.cliEntrypoint,
      privateParentDirectory: processOptions.privateParentDirectory,
      prompt,
      model: processOptions.model,
      ...(Object.hasOwn(processOptions, 'thinkingBudget') ? { thinkingBudget: processOptions.thinkingBudget } : {}),
      ...(Object.hasOwn(processOptions, 'thinkingLevel') ? { thinkingLevel: processOptions.thinkingLevel } : {}),
      project: processOptions.project,
      region: processOptions.region,
      timeoutMs: processOptions.timeoutMs,
      maxPromptBytes: processOptions.maxPromptBytes,
      maxStdoutBytes: processOptions.maxStdoutBytes,
      maxStderrBytes: processOptions.maxStderrBytes,
      ...(Object.hasOwn(processOptions, 'signal') ? { signal: processOptions.signal } : {}),
    } as GeminiCliProxySessionProcessOptions<string>,
  });
}
