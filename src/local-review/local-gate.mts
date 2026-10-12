import { chmodSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { spawnSync, type SpawnSyncReturns } from 'node:child_process';
import { createReviewRequest, createReviewRequestAsync, repositoryRoot, validateDecision, validateReviewResponse,
  type PreparedCodexReviewRequest, type PreparedReviewRequest, type ValidatedReviewDecision } from '../review-contract/review-contract.mts';
import { executeLocalReviewer, executeLocalReviewerSync, type LocalReviewerAsyncOptions,
  type LocalReviewerSyncOptions, type LocalReviewerResult } from '../reviewer-transports/local-reviewer-execution.mts';

export type ManualReviewOutcome = ValidatedReviewDecision | { decision: ValidatedReviewDecision; execution: unknown };
export type ManualReviewSyncOptions<Result = unknown> = LocalReviewerSyncOptions<Result, PreparedCodexReviewRequest> & { executionReport?: boolean };
export type ManualReviewAsyncOptions = LocalReviewerAsyncOptions<PreparedReviewRequest> & { executionReport?: boolean };

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
// The factory may select Gemini. The existing synchronous composition rejects
// that branch before invoking Codex; this erased view retains that error path
// without claiming the complete canonical request is already Codex-only.
type CanonicalSyncOperation = (request: PreparedReviewRequest, options: ManualReviewSyncOptions) => LocalReviewerResult;
function review(task: unknown, cwd: string, previous: unknown = null, options: ManualReviewSyncOptions = {}): ManualReviewOutcome { const request = createReviewRequest(task, cwd); const result = (executeLocalReviewerSync as CanonicalSyncOperation)(withPrior(request, previous), options); const decision = validateReviewResponse(request, result.decision); return options.executionReport === true ? { decision, execution: result.execution } : decision; }
async function reviewAsync(task: unknown, cwd: string, previous: unknown = null, options: ManualReviewAsyncOptions = {}): Promise<ManualReviewOutcome> { const request = await createReviewRequestAsync(task, cwd, previous); const transportRequest = request.version === 1 ? withPrior(request, previous) : request; const result = await executeLocalReviewer(transportRequest, options); const decision = validateReviewResponse(request, result.decision); return options.executionReport === true ? { decision, execution: result.execution } : decision; }
export function runManualReview<Result = unknown>(task: string, cwd: string = process.cwd(), options: ManualReviewSyncOptions<Result> = {}): ManualReviewOutcome { return review(task, cwd, null, options); }
export async function runManualReviewAsync(task: string, cwd: string = process.cwd(), options: ManualReviewAsyncOptions = {}): Promise<ManualReviewOutcome> { return reviewAsync(task, cwd, null, options); }
export function runManualReviewCli(argv: readonly string[] = process.argv.slice(2)): void {
  const executionReport = argv[0] === '--execution-report';
  const taskArgs = executionReport ? argv.slice(1) : argv;
  const report = (task: string): Promise<void> => runManualReviewAsync(task, process.cwd(), { executionReport }).then(result => { process.stdout.write(`${JSON.stringify(result, null, 2)}\n`); }).catch(error => fail((error as ErrorView).message));
  const task = taskArgs.join(' ').trim(); if (task) { void report(task); return; }
  let input = ''; process.stdin.setEncoding('utf8'); process.stdin.on('data', chunk => { input += chunk; }); process.stdin.on('end', () => { void report(input); });
}
export function runHook<Result = unknown>(input: string, cwd: string = process.cwd(), options: ManualReviewSyncOptions<Result> = {}): void {
  try { let event: unknown; try { event = JSON.parse(input); } catch { throw new Error('Architecture gate received invalid hook JSON.'); } if ((event as HookEventView | null)?.hook_event_name !== 'UserPromptSubmit' || !(event as HookEventView).session_id || !(event as HookEventView).prompt) throw new Error('Architecture gate received unsupported or incomplete input.'); const root = repositoryRoot(((event as HookEventView).cwd || cwd) as string); const result = review((event as HookEventView).prompt, root, prior(root, (event as HookEventView).session_id), { ...options, executionReport: false }); store(root, (event as HookEventView).session_id, result, (result as HookDecisionView).reviewedRevision); if ((result as HookDecisionView).decision !== 'PASS') throw new Error(`Architecture gate ${(result as HookDecisionView).decision}: ${(result as HookDecisionView).summary}`); process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'UserPromptSubmit', additionalContext: `Architecture review:\n${JSON.stringify(result, null, 2)}` } })); } catch (error) { fail((error as ErrorView).message); }
}
export async function runHookAsync(input: string, cwd: string = process.cwd(), options: ManualReviewAsyncOptions = {}): Promise<{ hookSpecificOutput: { hookEventName: 'UserPromptSubmit'; additionalContext: string } }> {
  let event: unknown; try { event = JSON.parse(input); } catch { throw new Error('Architecture gate received invalid hook JSON.'); }
  if ((event as HookEventView | null)?.hook_event_name !== 'UserPromptSubmit' || !(event as HookEventView).session_id || !(event as HookEventView).prompt) throw new Error('Architecture gate received unsupported or incomplete input.');
  const root = repositoryRoot(((event as HookEventView).cwd || cwd) as string); const result = await reviewAsync((event as HookEventView).prompt, root, prior(root, (event as HookEventView).session_id), { ...options, executionReport: false });
  store(root, (event as HookEventView).session_id, result, (result as HookDecisionView).reviewedRevision);
  if ((result as HookDecisionView).decision !== 'PASS') throw new Error(`Architecture gate ${(result as HookDecisionView).decision}: ${(result as HookDecisionView).summary}`);
  return { hookSpecificOutput: { hookEventName: 'UserPromptSubmit', additionalContext: `Architecture review:\n${JSON.stringify(result, null, 2)}` } };
}
export function runHookCli(): void { let input = ''; process.stdin.setEncoding('utf8'); process.stdin.on('data', c => { input += c; }); process.stdin.on('end', () => { runHookAsync(input).then(result => process.stdout.write(JSON.stringify(result))).catch(error => fail((error as ErrorView).message)); }); }
export { validateDecision as validate };
