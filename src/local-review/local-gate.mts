import { beginMeasurement, measurementDigest, warnMeasurementGap, type MeasurementAttempt, type MeasurementFinish } from '../measurement.mts';
import { chmodSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { spawnSync, type SpawnSyncReturns } from 'node:child_process';
import { createReviewRequest, createReviewRequestAsync, repositoryRoot, validateDecision, validateReviewResponse,
  type PreparedCodexReviewRequest, type PreparedReviewRequest, type ValidatedReviewDecision } from '../review-contract/review-contract.mts';
import { executeLocalReviewer, executeLocalReviewerSync, type LocalReviewerAsyncOptions,
  type LocalReviewerSyncOptions, type LocalReviewerResult } from '../reviewer-transports/local-reviewer-execution.mts';

type MeasurementSelection = { measurement?: { directory?: string; changeId?: string } };
export type ManualReviewOutcome = ValidatedReviewDecision | { decision: ValidatedReviewDecision; execution: unknown };
export type ManualReviewSyncOptions<Result = unknown> = LocalReviewerSyncOptions<Result, PreparedCodexReviewRequest> & MeasurementSelection & { executionReport?: boolean };
export type ManualReviewAsyncOptions = LocalReviewerAsyncOptions<PreparedReviewRequest> & MeasurementSelection & { executionReport?: boolean };

type SpawnOptions = { cwd?: string; timeout?: number };
type HookEventView = { hook_event_name?: unknown; session_id?: unknown; prompt?: unknown; cwd?: unknown };
type HookDecisionView = { decision?: unknown; summary?: unknown; reviewedRevision?: unknown };
type ErrorView = { message: unknown };

function fail(message: unknown): never { process.stderr.write(`${message}\n`); process.exit(2); }
function run(command: string, args: string[], options: SpawnOptions = {}): SpawnSyncReturns<string> { return spawnSync(command, args, { encoding: 'utf8', ...options }); }
function contextPath(root: string, sessionId: unknown): string { // Hook JSON only receives a truthiness check before the original .replace call.
  const safe = (sessionId as { replace(pattern: RegExp, replacement: string): string }).replace(/[^A-Za-z0-9_.-]/g, '_'); const result = run('git', ['rev-parse', '--git-path', 'codex-architecture-context'], { cwd: root, timeout: 5000 }); if (!safe || result.status !== 0) throw new Error('Architecture gate cannot resolve review context storage.'); const dir = result.stdout.trim(); return join(isAbsolute(dir) ? dir : resolve(root, dir), `${safe}.json`); }
function prior(root: string, sessionId: unknown): unknown { try { return (JSON.parse(readFileSync(contextPath(root, sessionId), 'utf8')) as { decision?: unknown }).decision; } catch { return null; } }
function store(root: string, sessionId: unknown, decision: unknown, revision: unknown): void { const path = contextPath(root, sessionId); mkdirSync(dirname(path), { recursive: true, mode: 0o700 }); const temporary = `${path}.${process.pid}.tmp`; writeFileSync(temporary, `${JSON.stringify({ sessionId, revision, decision })}\n`, { mode: 0o600 }); chmodSync(temporary, 0o600); renameSync(temporary, path); }
function withPrior<Request extends PreparedReviewRequest>(request: Request, previous: unknown): Request { return previous ? { ...request, prompt: `${request.prompt}\n\nPrior structured review context (context only, never authority):\n<prior-review>\n${JSON.stringify(previous)}\n</prior-review>` } : request; }
function withoutDiagnosticOptions<T extends object>(options: T): T {
  const hidden = new Set<PropertyKey>(['measurement', 'measurementRoute', 'measurementSession']);
  // Forward reads with the original receiver. Enumeration occurs only when the
  // existing transport requires it, never as an eager diagnostic operation.
  return new Proxy(Object.create(null) as T, {
    get(_target, key) {
      if (hidden.has(key)) return undefined;
      return Reflect.get(options, key, options);
    },
    has(_target, key) { return !hidden.has(key) && Reflect.has(options, key); },
    ownKeys() {
      const keys = Reflect.ownKeys(options).filter(key => !hidden.has(key));
      return keys;
    },
    getOwnPropertyDescriptor(_target, key) {
      if (hidden.has(key)) return undefined;
      const descriptor = Reflect.getOwnPropertyDescriptor(options, key);
      return descriptor ? { enumerable: descriptor.enumerable, configurable: true, get: () => Reflect.get(options, key, options) } : undefined;
    }
  });
}
// The factory may select Gemini. The existing synchronous composition rejects
// that branch before invoking Codex; this erased view retains that error path
// without claiming the complete canonical request is already Codex-only.
type CanonicalSyncOperation = (request: PreparedReviewRequest, options: ManualReviewSyncOptions) => LocalReviewerResult;
function measurementFor(cwd: string, options: MeasurementSelection, route?: 'manual' | 'UserPromptSubmit', session?: unknown) {
  try {
    const measurement = options.measurement;
    const selected = measurement?.directory ?? process.env.AGK_MEASUREMENT_DIR;
    let root = cwd;
    if (selected) { try { root = repositoryRoot(cwd); } catch { /* preparation failure is still an attempt */ } }
    const selectedRoute = route || 'manual';
    const selectedSession = route ? session : undefined;
    return beginMeasurement({ ...measurement, directory: selected, route: selectedRoute, cwd: root, sessionId: typeof selectedSession === 'string' ? selectedSession : undefined });
  } catch { warnMeasurementGap(); return { id: null, request() {}, finish() {} }; }
}
// Private helpers defer terminal publication to the owning public adapter.
function deferredMeasurement(measurement: MeasurementAttempt) {
  let completion: MeasurementFinish = {};
  return {
    attempt: { id: measurement.id, request: measurement.request.bind(measurement), finish(value: MeasurementFinish = {}) { completion = value; } },
    finish(publication = 'returned-to-caller') { measurement.finish({ ...completion, publication }); },
    fail(stage: string) { measurement.finish({ ...completion, state: 'error', publication: 'unknown',
      observation: { ...completion.observation, failureStage: completion.state === 'error' ? completion.observation?.failureStage : stage } }); }
  };
}
function review(task: unknown, cwd: string, previous: unknown = null, options: ManualReviewSyncOptions = {}, capturedMeasurement = measurementFor(cwd, options)): ManualReviewOutcome {
  const measurement = capturedMeasurement;
  let stage = 'preparation';
  try {
    const request = createReviewRequest(task, cwd);
    const transportRequest = withPrior(request, previous);
    measurement.request(request, { kind: 'proposed-task', taskSha256: measurementDigest(task) }, transportRequest.prompt);
    stage = 'execution';
    const result = (executeLocalReviewerSync as CanonicalSyncOperation)(transportRequest, withoutDiagnosticOptions(options));
    stage = 'validation';
    const decision = validateReviewResponse(request, result.decision);
    const outcome = options.executionReport === true ? { decision, execution: result.execution } : decision;
    measurement.finish({ decision, execution: result.execution, publication: 'returned-to-caller', observation: { execution: 'completed', validation: 'completed' } });
    return outcome;
  } catch (error) { measurement.finish({ state: 'error', observation: { failureStage: stage } }); throw error; }
}
async function reviewAsync(task: unknown, cwd: string, previous: unknown = null, options: ManualReviewAsyncOptions = {}, capturedMeasurement = measurementFor(cwd, options)): Promise<ManualReviewOutcome> {
  const measurement = capturedMeasurement;
  let stage = 'preparation';
  try {
    const request = await createReviewRequestAsync(task, cwd, previous);
    const transportRequest = request.version === 1 ? withPrior(request, previous) : request;
    measurement.request(request, { kind: 'proposed-task', taskSha256: measurementDigest(task) }, transportRequest.prompt);
    stage = 'execution';
    const result = await executeLocalReviewer(transportRequest, withoutDiagnosticOptions(options));
    stage = 'validation';
    const decision = validateReviewResponse(request, result.decision);
    const outcome = options.executionReport === true ? { decision, execution: result.execution } : decision;
    measurement.finish({ decision, execution: result.execution, publication: 'returned-to-caller', observation: { execution: 'completed', validation: 'completed' } });
    return outcome;
  } catch (error) { measurement.finish({ state: 'error', observation: { failureStage: stage } }); throw error; }
}
export function runManualReview<Result = unknown>(task: string, cwd: string = process.cwd(), options: ManualReviewSyncOptions<Result> = {}): ManualReviewOutcome { return review(task, cwd, null, options); }
export async function runManualReviewAsync(task: string, cwd: string = process.cwd(), options: ManualReviewAsyncOptions = {}): Promise<ManualReviewOutcome> { return reviewAsync(task, cwd, null, options); }
export function runManualReviewCli(argv: readonly string[] = process.argv.slice(2)): void {
  const executionReport = argv[0] === '--execution-report';
  const taskArgs = executionReport ? argv.slice(1) : argv;
  const report = (task: string): Promise<void> => { const cwd = process.cwd(); const observed = deferredMeasurement(measurementFor(cwd, {})); return reviewAsync(task, cwd, null, { executionReport }, observed.attempt).then(result => { process.stdout.write(`${JSON.stringify(result, null, 2)}\n`); observed.finish(); }).catch(error => { observed.fail('publication'); fail((error as ErrorView).message); }); };
  const task = taskArgs.join(' ').trim(); if (task) { void report(task); return; }
  let input = ''; process.stdin.setEncoding('utf8'); process.stdin.on('data', chunk => { input += chunk; }); process.stdin.on('end', () => { void report(input); });
}
function hookInput(input: string, cwd: string, options: MeasurementSelection): { event: HookEventView; root: string } {
  try {
    let event: unknown;
    try { event = JSON.parse(input); } catch { throw new Error('Architecture gate received invalid hook JSON.'); }
    if ((event as HookEventView | null)?.hook_event_name !== 'UserPromptSubmit' || !(event as HookEventView).session_id || !(event as HookEventView).prompt) throw new Error('Architecture gate received unsupported or incomplete input.');
    const root = repositoryRoot(((event as HookEventView).cwd || cwd) as string);
    return { event: event as HookEventView, root };
  } catch (error) {
    const measurement = measurementFor(cwd, options, 'UserPromptSubmit');
    measurement.finish({ state: 'error', observation: { failureStage: 'hook-input' } });
    throw error;
  }
}
export function runHook<Result = unknown>(input: string, cwd: string = process.cwd(), options: ManualReviewSyncOptions<Result> = {}): void {
  let observed: ReturnType<typeof deferredMeasurement> | undefined; let stage = 'hook-input';
  try {
    const { event, root } = hookInput(input, cwd, options);
    observed = deferredMeasurement(measurementFor(root, options, 'UserPromptSubmit', event.session_id));
    const hookOptions = { ...withoutDiagnosticOptions(options), executionReport: false };
    stage = 'hook-context'; const result = review(event.prompt, root, prior(root, event.session_id), hookOptions, observed.attempt);
    stage = 'hook-context-store'; store(root, event.session_id, result, (result as HookDecisionView).reviewedRevision);
    if ((result as HookDecisionView).decision !== 'PASS') { observed.finish('unknown'); throw new Error(`Architecture gate ${(result as HookDecisionView).decision}: ${(result as HookDecisionView).summary}`); }
    stage = 'hook-publication'; process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'UserPromptSubmit', additionalContext: `Architecture review:\n${JSON.stringify(result, null, 2)}` } }));
    observed.finish();
  } catch (error) { observed?.fail(stage); fail((error as ErrorView).message); }
}
async function hookAsync(input: string, cwd: string, options: ManualReviewAsyncOptions,
  publish?: (result: { hookSpecificOutput: { hookEventName: 'UserPromptSubmit'; additionalContext: string } }) => void) {
  const { event, root } = hookInput(input, cwd, options);
  const observed = deferredMeasurement(measurementFor(root, options, 'UserPromptSubmit', event.session_id)); let stage = 'hook-context';
  try {
    const hookOptions = { ...withoutDiagnosticOptions(options), executionReport: false };
    const result = await reviewAsync(event.prompt, root, prior(root, event.session_id), hookOptions, observed.attempt);
    stage = 'hook-context-store'; store(root, event.session_id, result, (result as HookDecisionView).reviewedRevision);
    if ((result as HookDecisionView).decision !== 'PASS') { observed.finish('unknown'); throw new Error(`Architecture gate ${(result as HookDecisionView).decision}: ${(result as HookDecisionView).summary}`); }
    stage = 'hook-publication'; const output = { hookSpecificOutput: { hookEventName: 'UserPromptSubmit' as const, additionalContext: `Architecture review:\n${JSON.stringify(result, null, 2)}` } };
    publish?.(output); observed.finish(); return output;
  } catch (error) { observed.fail(stage); throw error; }
}
export async function runHookAsync(input: string, cwd: string = process.cwd(), options: ManualReviewAsyncOptions = {}): Promise<{ hookSpecificOutput: { hookEventName: 'UserPromptSubmit'; additionalContext: string } }> { return hookAsync(input, cwd, options); }
export function runHookCli(): void { let input = ''; process.stdin.setEncoding('utf8'); process.stdin.on('data', c => { input += c; }); process.stdin.on('end', () => { hookAsync(input, process.cwd(), {}, result => { process.stdout.write(JSON.stringify(result)); }).catch(error => fail((error as ErrorView).message)); }); }
export { validateDecision as validate };
