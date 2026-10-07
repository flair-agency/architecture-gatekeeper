/** Internal adapter from caller-prepared protected CI inputs to the CLI proxy session. */
import { types } from 'node:util';
import { snapshotPreparedReviewData } from './prepared-review-data.mjs';
import { runGeminiCliProxySession } from './gemini-cli-proxy-session.mjs';
import { validateJsonSchemaDefinition } from './json-schema.mjs';
import { encodeGeminiCliPromptForTransport, GEMINI_CLI_STDIN_LIMIT } from './gemini-cli-process.mjs';

const INPUT_KEYS = new Set(['protectedPromptText', 'protectedDecisionSchemaText', 'protectedReviewer', 'proxySessionOptions']);
const REVIEWER_KEYS = new Set(['provider', 'model', 'thinkingLevel']);
const SESSION_KEYS = new Set(['packet', 'workspaceLimits', 'workspaceParentDirectory', 'processOptions', 'credentials', 'reserveDispatch']);
const PROCESS_KEYS = new Set([
  'cliEntrypoint', 'privateParentDirectory', 'model', 'thinkingBudget', 'thinkingLevel', 'maxOutputTokens', 'project', 'region',
  'timeoutMs', 'maxPromptBytes', 'maxStdoutBytes', 'maxStderrBytes', 'signal',
]);

function hasOnlyKeys(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || types.isProxy(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;
  const descriptors = Object.getOwnPropertyDescriptors(value);
  return Reflect.ownKeys(descriptors).every(key => typeof key === 'string' && keys.has(key) &&
    Object.hasOwn(descriptors[key], 'value') && descriptors[key].enumerable);
}

/** Capture supported configuration records before any field value is read. */
export function snapshotPreparedGeminiCiReviewInput(input) {
  if (!hasOnlyKeys(input, INPUT_KEYS) || !hasOnlyKeys(input.proxySessionOptions, SESSION_KEYS)) {
    throw new Error('Prepared Gemini CI review requires a protected prompt, schema, and explicit proxy-session options.');
  }
  const options = input.proxySessionOptions.processOptions;
  if (options && typeof options === 'object' && !types.isProxy(options) && Object.hasOwn(options, 'prompt')) {
    throw new Error('Prepared Gemini CI review does not accept process prompt overrides.');
  }
  if (!hasOnlyKeys(input.proxySessionOptions.processOptions, PROCESS_KEYS)) {
    throw new Error('Prepared Gemini CI review received unsupported process options.');
  }
  if (!hasOnlyKeys(input.protectedReviewer, REVIEWER_KEYS)) {
    throw new Error('Prepared Gemini CI review requires the complete supported protected reviewer selection.');
  }
  return { ...input, protectedReviewer: { ...input.protectedReviewer },
    proxySessionOptions: { ...input.proxySessionOptions,
      processOptions: { ...input.proxySessionOptions.processOptions } } };
}

function composePrompt(protectedPromptText, schemaText) {
  return `${protectedPromptText}\n\nProtected output schema (follow this schema exactly; downstream CI validation remains authoritative):\n${schemaText}\n`;
}

/**
 * Run a decision-only review from inputs already selected and bound by the
 * trusted protected-CI orchestrator. This adapter does not establish their
 * provenance or validate the resulting decision. The protected caller supplies
 * its resolved reviewer selection separately; this adapter verifies agreement
 * before starting any proxy or CLI, without authenticating that selection.
 */
export async function runPreparedGeminiCiReview(suppliedInput) {
  const input = snapshotPreparedGeminiCiReviewInput(suppliedInput);
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
  const reviewer = input.protectedReviewer;
  if (!hasOnlyKeys(reviewer, REVIEWER_KEYS) || Object.keys(reviewer).length !== REVIEWER_KEYS.size ||
      reviewer.provider !== 'gemini' || reviewer.model !== 'gemini-3.8-flash' || reviewer.thinkingLevel !== 'MEDIUM') {
    throw new Error('Prepared Gemini CI review requires the complete supported protected reviewer selection.');
  }
  if (processOptions.model !== reviewer.model || processOptions.thinkingLevel !== reviewer.thinkingLevel ||
      processOptions.thinkingBudget !== undefined) {
    throw new Error('Prepared Gemini CI process settings disagree with the protected reviewer selection.');
  }

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
  let schema;
  try { schema = JSON.parse(protectedDecisionSchemaText); } catch { throw new Error('Protected decision schema must be valid JSON.'); }
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) throw new Error('Protected decision schema must be a JSON Schema object.');
  validateJsonSchemaDefinition(schema);

  // Own exact evidence data before proxy startup can yield. The caller may
  // retain and mutate its packet or limits while the session is pending.
  const packet = snapshotPreparedReviewData(proxySessionOptions.packet);
  const workspaceLimits = snapshotPreparedReviewData(proxySessionOptions.workspaceLimits);
  return runGeminiCliProxySession({
    packet,
    workspaceLimits,
    workspaceParentDirectory: proxySessionOptions.workspaceParentDirectory,
    credentials: proxySessionOptions.credentials,
    ...(proxySessionOptions.reserveDispatch !== undefined ? { reserveDispatch: proxySessionOptions.reserveDispatch } : {}),
    processOptions: {
      cliEntrypoint: processOptions.cliEntrypoint,
      privateParentDirectory: processOptions.privateParentDirectory,
      prompt,
      model: processOptions.model,
      ...(Object.hasOwn(processOptions, 'thinkingBudget') ? { thinkingBudget: processOptions.thinkingBudget } : {}),
      ...(Object.hasOwn(processOptions, 'thinkingLevel') ? { thinkingLevel: processOptions.thinkingLevel } : {}),
      ...(Object.hasOwn(processOptions, 'maxOutputTokens') ? { maxOutputTokens: processOptions.maxOutputTokens } : {}),
      project: processOptions.project,
      region: processOptions.region,
      timeoutMs: processOptions.timeoutMs,
      maxPromptBytes: processOptions.maxPromptBytes,
      maxStdoutBytes: processOptions.maxStdoutBytes,
      maxStderrBytes: processOptions.maxStderrBytes,
      ...(Object.hasOwn(processOptions, 'signal') ? { signal: processOptions.signal } : {}),
    },
  });
}
