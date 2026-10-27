import { readFileSync, writeFileSync } from 'node:fs';
import { createReviewRequestAsync as prepareRequest, validateReviewResponse as validateResponse, repositoryRoot } from '../review-contract.mts';
import { beginMeasurement, measurementDigest, resumeNativeMeasurement, warnMeasurementGap } from '../measurement.mts';
import { resolve } from 'node:path';
import { writePublicOutput } from '../public-output.mts';
import { trustedNativeRequestPath, trustedNativeDecisionPath } from '../native-session-paths.mts';
import type { MeasurementAttempt, MeasurementRequest } from '../measurement.mts';

// An erased operational view retains the existing optional-property reads of
// external JSON. It neither validates a request nor authorizes diagnostic data.
type RequestObservation = { repositoryRoot?: unknown; task?: unknown; requestId?: unknown };
/** @param {string[]} argv */
function injectedNativeArguments(argv: string[]) {
  const [command, requestPath, ...rest] = argv;
  return { command, requestPath, decisionPath: rest[0], rest };
}
function usage() { throw new Error('Usage: architecture-review-native prepare <request.json> <task...> | validate <request.json> <decision.json>'); }
/**
 * Run the native review CLI with optional command-line input and working directory.
 * @param {string[]} [argv]
 * @param {string} [cwd]
 * @returns {Promise<void>}
 */
export async function runNativeReviewCli(argv?: string[], cwd: string = process.cwd()): Promise<void> {
  // Original CLI session paths and explicitly injected arguments stay distinct.
  // Parse injected arrays once with the original iterator/destructuring behavior.
  const selected = argv === undefined ? {
    command: process.argv[2], requestPath: trustedNativeRequestPath(),
    decisionPath: trustedNativeDecisionPath(), rest: process.argv.slice(4),
  } : injectedNativeArguments(argv);
  const { command, requestPath, decisionPath, rest } = selected;
  // Keep required host-managed I/O intact; observe its request/validation calls.
  let measurement: MeasurementAttempt | undefined;
  let validatedDecision: unknown;
  let stage = 'preparation';
  /** @param {string} [root] */
  function startObservation(root: string = process.cwd()) {
    try {
      let selectedRoot = root;
      if (process.env.AGK_MEASUREMENT_DIR) { try { selectedRoot = repositoryRoot(root); } catch { /* preparation preserves its required error */ } }
      return beginMeasurement({ route: 'native', cwd: selectedRoot, correlation: measurementDigest(resolve(requestPath as string)) });
    } catch { warnMeasurementGap(); return {id:null,request(){},finish(){}}; }

  }
  const createReviewRequestAsync: typeof prepareRequest = async (task, root) => {
    measurement = startObservation(root);
    const request = await prepareRequest(task, root);
    measurement.request(request, { kind: 'proposed-task', taskSha256: measurementDigest(request.task) });
    return request;
  };
  const validateReviewResponse: typeof validateResponse = (request, decision) => {
    const result = validateResponse(request, decision);
    validatedDecision = result;
    return result;
  };
  try {
  if (command === 'prepare' && requestPath && rest.length) {
    const request = await createReviewRequestAsync(rest.join(' '), cwd);
    if (Object.hasOwn(request.reviewer, 'provider') ? request.reviewer.provider !== 'codex' : false) throw new Error('Native Codex review cannot apply Gemini settings; use the async local reviewer.');
    stage = 'request-persistence';
    writeFileSync(requestPath, `${JSON.stringify(request, null, 2)}\n`, { mode: 0o600, flag: 'wx' }); // native-request-persistence
    stage = 'prepare-publication';
    await writePublicOutput(`${JSON.stringify({ prompt: request.prompt, schema: request.schema, provider: 'codex', model: request.reviewer.model, reasoningEffort: request.reviewer.reasoningEffort, reviewTimeoutMs: request.reviewer.reviewTimeoutMs, requestPath }, null, 2)}\n`);
    return;
  }
  if (command === 'validate' && requestPath && rest.length === 1) {
    stage = 'request-read';
    let request: unknown;
    try { request = JSON.parse(readFileSync(requestPath, 'utf8')); } // native-request-read
    catch (error) { measurement = startObservation(cwd); throw error; }
    measurement = resumeNativeMeasurement(requestPath, request as MeasurementRequest);
    // A terminal belongs to one validation attempt. Observe a retry separately
    // instead of rewriting a previous failed or completed observation.
    if (!measurement.id) {
      measurement = startObservation(typeof (request as RequestObservation | null | undefined)?.repositoryRoot === 'string' ? (request as { repositoryRoot: string }).repositoryRoot : cwd);
      if (typeof (request as RequestObservation | null | undefined)?.task === 'string' && typeof (request as RequestObservation | null | undefined)?.requestId === 'string') {
        measurement.request(request as MeasurementRequest, { kind: 'proposed-task', taskSha256: measurementDigest((request as RequestObservation).task) });
      }
    }
    stage = 'decision-read';
    const decision: unknown = JSON.parse(readFileSync(decisionPath as string, 'utf8')); // native-decision-read
    stage = 'validation';
    const result = validateReviewResponse(request, decision);
    stage = 'publication';
    await writePublicOutput(`${JSON.stringify(result, null, 2)}\n`);
    measurement?.finish({ decision: result, publication: 'returned-to-caller', observation: { hostExecution: 'unknown' } });
    return;
  }
  usage();
  } catch (error) {
    if (command === 'validate' && requestPath && rest.length === 1 && stage === 'validation' && !measurement?.id) measurement = startObservation(cwd);
    measurement?.finish({ state: 'error', decision: validatedDecision, observation: { hostExecution: 'unknown', failureStage: stage } }); throw error; }
}
