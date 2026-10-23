// Protected-caller lifecycle for the self PR App check. Callers must keep the
// validator in the protected workflow process; this module does not trust
// candidate artifacts or authenticate arbitrary callers.
import { beginSelfArchitectureCheck, finalizeSelfArchitectureCheck } from '../github-app-check-reporter.mjs';
import { selectSelfPrContext } from '../self-pr-context.mjs';
import type { SelfPrContext, SelfPrContextInput } from './self-pr-context.mts';

type Awaitable<T> = T | PromiseLike<T>;
type App = Parameters<typeof beginSelfArchitectureCheck>[0]['app'];
type ReporterFetch = Parameters<typeof beginSelfArchitectureCheck>[0]['fetchImpl'];
export type SelfPrRoute = 'ordinary-pass' | 'amendment-queue-eligible';
export type SelfPrTupleBinding = Readonly<Pick<SelfPrContext, 'repository'|'repositoryId'|'prNumber'|'baseSha'|'headSha'|'subjectSha'>>;
export type SelfPrValidatedResult = Readonly<{
  status: 'VALIDATED_SELF_PR_RESULT';
  route: SelfPrRoute;
  binding: SelfPrTupleBinding;
  oldSelectedAuthorityChanged: boolean;
}>;
export type SelfPrBeginInput = Readonly<{
  context: Omit<SelfPrContextInput, 'fetchImpl'>;
  contextFetchImpl: NonNullable<SelfPrContextInput['fetchImpl']>;
  getApp: () => Awaitable<App>;
  reportFetchImpl?: ReporterFetch;
  now?: number;
}>;
export type SelfPrFinishInput = SelfPrBeginInput & Readonly<{
  begun: unknown;
  validateProtectedResult: (context: SelfPrContext) => Awaitable<unknown>;
}>;

function fail(message: string): never { throw new Error(`Self PR App producer: ${message}`); }
function exactBinding(value: unknown, context: SelfPrContext): value is SelfPrTupleBinding {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>;
  return Object.keys(v).sort().join(',') === 'baseSha,headSha,prNumber,repository,repositoryId,subjectSha' &&
    v.repository === context.repository && v.repositoryId === context.repositoryId &&
    v.prNumber === context.prNumber && v.baseSha === context.baseSha &&
    v.headSha === context.headSha && v.subjectSha === context.subjectSha;
}
function same(a: SelfPrContext, b: SelfPrContext): boolean {
  return a.repository === b.repository && a.repositoryId === b.repositoryId && a.prNumber === b.prNumber &&
    a.baseSha === b.baseSha && a.headSha === b.headSha && a.subjectSha === b.subjectSha;
}
async function select(input: SelfPrBeginInput): Promise<SelfPrContext> {
  const result = await selectSelfPrContext({ ...input.context, fetchImpl: input.contextFetchImpl });
  if (result.status !== 'SELECTED_SELF_PR_CONTEXT') fail(`current protected PR context could not be selected: ${result.reason}`);
  return result;
}
function reporterOptions(input: SelfPrBeginInput) {
  return { ...(input.reportFetchImpl ? { fetchImpl: input.reportFetchImpl } : {}), ...(input.now !== undefined ? { now: input.now } : {}) };
}

/** Begin the exact test-merge check before protected review output is consumed. */
export async function beginProtectedSelfPrCheck(input: SelfPrBeginInput) {
  const context = await select(input);
  const app = await input.getApp();
  const check = await beginSelfArchitectureCheck({ app, headSha: context.subjectSha, ...reporterOptions(input) });
  return Object.freeze({ status: 'BEGUN_SELF_PR_APP_CHECK' as const, check, context });
}

/**
 * Validate a protected in-process result against fresh PR context on both
 * sides of validation, then finish the same check. Validation failures are
 * reported as failures when the protected caller can still reach GitHub.
 */
export async function finishProtectedSelfPrCheck(input: SelfPrFinishInput) {
  let context: SelfPrContext | undefined;
  let conclusion: 'success' | 'failure' = 'failure';
  let route: SelfPrRoute | undefined;
  let reason = 'protected result validation failed.';
  try {
    if (!input || typeof input.validateProtectedResult !== 'function' || !input.begun || typeof input.begun !== 'object') fail('trusted validation callback or begun check is missing.');
    const begun = input.begun as Record<string, unknown>;
    if (begun.status !== 'BEGUN_SELF_PR_APP_CHECK' || !begun.check || typeof begun.check !== 'object' || !begun.context || typeof begun.context !== 'object') fail('begun check handle is invalid.');
    const priorContext = begun.context as SelfPrContext;
    context = await select(input);
    if (!same(priorContext, context)) fail('PR context changed after check creation.');
    const validated = await input.validateProtectedResult(context);
    if (!validated || typeof validated !== 'object' || Array.isArray(validated)) fail('protected result did not produce a validated route.');
    const result = validated as Record<string, unknown>;
    if (result.status !== 'VALIDATED_SELF_PR_RESULT' || !['ordinary-pass', 'amendment-queue-eligible'].includes(String(result.route)) ||
        result.oldSelectedAuthorityChanged !== (result.route === 'amendment-queue-eligible') || !exactBinding(result.binding, context)) fail('protected review or selected old-authority result is not valid for the exact PR tuple.');
    route = result.route as SelfPrRoute;
    const finalContext = await select(input);
    if (!same(context, finalContext)) fail('PR context changed during result validation.');
    conclusion = 'success';
    reason = result.route === 'ordinary-pass' ? 'ordinary protected PASS reported.' : 'amendment eligibility reported for queue entry only.';
  } catch (error) {
    reason = error instanceof Error ? error.message : reason;
  }
  try {
    const app = await input.getApp();
    const check = (input.begun as { check: unknown }).check;
    const finalized = await finalizeSelfArchitectureCheck({ app, check, conclusion, ...reporterOptions(input) });
    return Object.freeze({ status: conclusion === 'success' ? 'REPORTED_SELF_PR_RESULT' as const : 'FAILED_SELF_PR_RESULT' as const,
      route: conclusion === 'success' ? route : undefined,
      conclusion, reason, check: finalized });
  } catch (error) {
    return Object.freeze({ status: 'INCOMPLETE' as const, conclusion, reason,
      finalizeError: error instanceof Error ? error.message : 'App check finalization failed.' });
  }
}
