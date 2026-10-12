#!/usr/bin/env node
// @ts-check
import { readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createReviewRequestAsync as prepareRequest, validateReviewResponse as validateResponse, repositoryRoot } from './review-contract.mjs';
import { beginMeasurement, measurementDigest, resumeNativeMeasurement } from './measurement.mts';
import { resolve } from 'node:path';
function usage() { throw new Error('Usage: architecture-review-native prepare <request.json> <task...> | validate <request.json> <decision.json>'); }
/**
 * Run the native review CLI with optional command-line input and working directory.
 * @param {string[]} [argv]
 * @param {string} [cwd]
 * @returns {Promise<void>}
 */
export async function runNativeReviewCli(argv = process.argv.slice(2), cwd = process.cwd()) {
  const [command, requestPath, ...rest] = argv;
  // Keep required host-managed I/O intact; observe its request/validation calls.
  /** @type {ReturnType<typeof beginMeasurement> | undefined} */
  let measurement;
  /** @type {unknown} */
  let validatedDecision;
  let stage = 'preparation';
  /** @param {string} [root] */
  function startObservation(root = process.cwd()) {
    let selectedRoot = root;
    if (process.env.AGK_MEASUREMENT_DIR) { try { selectedRoot = repositoryRoot(root); } catch { /* preparation will preserve its required error */ } }
    return beginMeasurement({ route: 'native', cwd: selectedRoot, correlation: measurementDigest(resolve(requestPath)) });
  }
  /** @type {typeof prepareRequest} */
  const createReviewRequestAsync = async (task, root) => {
    measurement = startObservation(root);
    const request = await prepareRequest(task, root);
    measurement.request(request, { kind: 'proposed-task', taskSha256: measurementDigest(request.task) });
    return request;
  };
  /** @type {typeof validateResponse} */
  const validateReviewResponse = (request, decision) => {
    const result = validateResponse(request, decision);
    validatedDecision = result;
    return result;
  };
  try {
  if (command === 'prepare' && requestPath && rest.length) {
    const request = await createReviewRequestAsync(rest.join(' '), cwd);
    if (Object.hasOwn(request.reviewer, 'provider') ? request.reviewer.provider !== 'codex' : false) throw new Error('Native Codex review cannot apply Gemini settings; use the async local reviewer.');
    stage = 'request-persistence';
    writeFileSync(requestPath, `${JSON.stringify(request, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
    stage = 'prepare-publication';
    process.stdout.write(`${JSON.stringify({ prompt: request.prompt, schema: request.schema, provider: 'codex', model: request.reviewer.model, reasoningEffort: request.reviewer.reasoningEffort, reviewTimeoutMs: request.reviewer.reviewTimeoutMs, requestPath }, null, 2)}\n`);
    return;
  }
  if (command === 'validate' && requestPath && rest.length === 1) {
    stage = 'request-read';
    let request;
    try { request = JSON.parse(readFileSync(requestPath, 'utf8')); }
    catch (error) { measurement = startObservation(cwd); throw error; }
    measurement = resumeNativeMeasurement(requestPath, /** @type {import('./measurement.mts').MeasurementRequest} */ (request));
    stage = 'decision-read';
    const decision = JSON.parse(readFileSync(rest[0], 'utf8'));
    stage = 'validation';
    const result = validateReviewResponse(request, decision);
    stage = 'publication';
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    measurement?.finish({ decision: result, publication: 'returned-to-caller', observation: { hostExecution: 'unknown' } });
    return;
  }
  usage();
  } catch (error) { measurement?.finish({ state: 'error', decision: validatedDecision, observation: { hostExecution: 'unknown', failureStage: stage } }); throw error; }
}
if (process.argv[1] && fileURLToPath(import.meta.url) === realpathSync(process.argv[1])) { runNativeReviewCli().catch(error => { process.stderr.write(`${error.message}\n`); process.exitCode = 2; }); }
