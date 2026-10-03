/** Internal parsing and validation for Gemini CLI --output-format json results. */
import { validateReviewResponse } from './review-contract.mjs';

function requireLimit(value, name) {
  if (!Number.isSafeInteger(value) || value < 1) throw new Error(`Gemini CLI ${name} limit must be an explicit positive safe integer.`);
  return value;
}

/**
 * Check process completion and extract response text from the fixed Gemini CLI
 * JSON envelope. Limits are byte ceilings and are mandatory; nothing truncates.
 */
export function extractGeminiCliResponseText(result, { maxStdoutBytes, maxStderrBytes } = {}) {
  maxStdoutBytes = requireLimit(maxStdoutBytes, 'stdout');
  maxStderrBytes = requireLimit(maxStderrBytes, 'stderr');
  if (!result || typeof result !== 'object') throw new Error('Gemini CLI result is missing.');
  const stdout = result.stdout;
  const stderr = result.stderr ?? '';
  if (typeof stdout !== 'string' || typeof stderr !== 'string') throw new Error('Gemini CLI output must be text.');
  if (Buffer.byteLength(stdout, 'utf8') > maxStdoutBytes || Buffer.byteLength(stderr, 'utf8') > maxStderrBytes) throw new Error('Gemini CLI output exceeded its configured size limit.');
  // Callers must map timeout and cancellation into timedOut/signal/error; no
  // adapter can infer cancellation from an otherwise successful exit result.
  if (result.timedOut || result.cancelled || result.aborted || result.signal || result.error) throw new Error('Gemini CLI execution did not complete successfully.');
  if (result.exitCode !== 0) throw new Error(`Gemini CLI exited unsuccessfully (${String(result.exitCode)}).`);
  let envelope;
  try { envelope = JSON.parse(stdout); } catch { throw new Error('Gemini CLI returned malformed JSON.'); }
  if (!envelope || typeof envelope !== 'object' || Array.isArray(envelope) || typeof envelope.response !== 'string' || !envelope.response.trim() || envelope.error) {
    throw new Error('Gemini CLI returned an invalid or error response envelope.');
  }
  return envelope.response;
}

/** Extract the CLI text and apply the existing request-bound review contract. */
export function validateGeminiCliResponse(result, request, limits) {
  const responseText = extractGeminiCliResponseText(result, limits);
  let decision;
  try { decision = JSON.parse(responseText); }
  catch { throw new Error('Gemini CLI response text is not valid decision JSON.'); }
  return validateReviewResponse(request, decision);
}
