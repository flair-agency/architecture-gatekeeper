/** Internal parsing and validation for Gemini CLI --output-format json results. */
import { validateReviewResponse, type ValidatedReviewDecision } from '../review-contract/review-contract.mts';

export interface GeminiCliResponseLimits {
  maxStdoutBytes: number;
  maxStderrBytes: number;
}

interface GeminiCliResultView {
  stdout?: unknown; stderr?: unknown; timedOut?: unknown; cancelled?: unknown;
  aborted?: unknown; signal?: unknown; error?: unknown; exitCode?: unknown;
}
interface GeminiCliEnvelopeView { response?: unknown; error?: unknown }

function requireLimit(value: unknown, name: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1) throw new Error(`Gemini CLI ${name} limit must be an explicit positive safe integer.`);
  return value as number;
}

/**
 * Check process completion and extract response text from the fixed Gemini CLI
 * JSON envelope. Limits are byte ceilings and are mandatory; nothing truncates.
 */
export function extractGeminiCliResponseText(result: unknown, limits: GeminiCliResponseLimits): string;
export function extractGeminiCliResponseText(result: unknown, { maxStdoutBytes, maxStderrBytes }: GeminiCliResponseLimits = {} as GeminiCliResponseLimits): string {
  maxStdoutBytes = requireLimit(maxStdoutBytes, 'stdout');
  maxStderrBytes = requireLimit(maxStderrBytes, 'stderr');
  if (!result || typeof result !== 'object') throw new Error('Gemini CLI result is missing.');
  const stdout = (result as GeminiCliResultView).stdout;
  const stderr = (result as GeminiCliResultView).stderr ?? '';
  if (typeof stdout !== 'string' || typeof stderr !== 'string') throw new Error('Gemini CLI output must be text.');
  if (Buffer.byteLength(stdout, 'utf8') > maxStdoutBytes || Buffer.byteLength(stderr, 'utf8') > maxStderrBytes) throw new Error('Gemini CLI output exceeded its configured size limit.');
  // Callers must map timeout and cancellation into timedOut/signal/error; no
  // adapter can infer cancellation from an otherwise successful exit result.
  if ((result as GeminiCliResultView).timedOut || (result as GeminiCliResultView).cancelled || (result as GeminiCliResultView).aborted || (result as GeminiCliResultView).signal || (result as GeminiCliResultView).error) throw new Error('Gemini CLI execution did not complete successfully.');
  if ((result as GeminiCliResultView).exitCode !== 0) throw new Error(`Gemini CLI exited unsuccessfully (${String((result as GeminiCliResultView).exitCode)}).`);
  let envelope: unknown;
  try { envelope = JSON.parse(stdout); } catch { throw new Error('Gemini CLI returned malformed JSON.'); }
  if (!envelope || typeof envelope !== 'object' || Array.isArray(envelope) || typeof (envelope as GeminiCliEnvelopeView).response !== 'string' || !((envelope as GeminiCliEnvelopeView).response as string).trim() || (envelope as GeminiCliEnvelopeView).error) {
    throw new Error('Gemini CLI returned an invalid or error response envelope.');
  }
  return (envelope as GeminiCliEnvelopeView).response as string;
}

/** Extract the CLI text and apply the existing request-bound review contract. */
export function validateGeminiCliResponse(result: unknown, request: unknown, limits: GeminiCliResponseLimits): ValidatedReviewDecision {
  const responseText = extractGeminiCliResponseText(result, limits);
  let decision: unknown;
  try { decision = JSON.parse(responseText); }
  catch { throw new Error('Gemini CLI response text is not valid decision JSON.'); }
  return validateReviewResponse(request, decision);
}
