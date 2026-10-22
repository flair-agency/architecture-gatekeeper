// Protected-caller composition for the ordinary self PR check only.
// Inputs and callbacks must remain in the adopted protected caller process;
// this module does not authenticate caller identity or candidate artifacts.
import { completePreparedCiReview } from '../complete-prepared-ci-review.mjs';
import { assertEnforcedAcceptance } from '../ci-enforced-acceptance.mjs';
import { classifyReview } from '../ci-report.mjs';
import { inspectSelfAuthorityChanges } from '../ci-self-authority-change.mjs';
import { publishSelfArchitectureCheck } from '../github-app-check-reporter.mjs';
import { selectSelfPrContext } from '../self-pr-context.mjs';
import type { SelfPrContext, SelfPrContextInput } from './self-pr-context.mts';
import { validateQueuedPrDescription } from '../pr-description-completeness.mjs';
import type { QueueCompletenessInput } from './pr-description-completeness.mts';

export type Awaitable<T> = T | PromiseLike<T>;
export type SelfPrProtectedReview = Readonly<{
  mode: unknown; policyResult: unknown; reviewResult: unknown;
  reviewBinding: unknown; preparedReview: unknown; selectedAuthorityChanged: unknown; authoritySelection: unknown;
}>;
export type SelfPrAppProducerInput = Readonly<{
  context: Omit<SelfPrContextInput, 'fetchImpl'>;
  contextFetchImpl: NonNullable<SelfPrContextInput['fetchImpl']>;
  runProtectedReview: (context: SelfPrContext) => Awaitable<unknown>;
  completeness: Omit<QueueCompletenessInput, 'prNumber' | 'baseSha' | 'headSha'>;
  getApp: () => Awaitable<unknown>;
  reportFetchImpl?: Parameters<typeof publishSelfArchitectureCheck>[0]['fetchImpl'];
  now?: number;
}>;

function fail(message: string): never { throw new Error(`Self PR App producer: ${message}`); }
function record(value: unknown): value is Record<string, unknown> { return !!value && typeof value === 'object' && !Array.isArray(value); }
const SELF_POLICY_PATH = '.codex/gatekeeper/ci-policy.json';
async function validateOldAuthoritySelection(selectionValue: unknown, preparedReview: Record<string, unknown>, context: SelfPrContext,
  reportedChanged: unknown): Promise<void> {
  if (!record(selectionValue) || typeof selectionValue.root !== 'string' || !selectionValue.root.startsWith('/') ||
      selectionValue.policyPath !== SELF_POLICY_PATH || typeof selectionValue.policySha256 !== 'string' ||
      !/^[a-f0-9]{64}$/.test(selectionValue.policySha256) || !Object.hasOwn(preparedReview, 'authorityProvenance')) {
    fail('protected old Policy and Authority Set inputs are incomplete.');
  }
  // The existing inspector resolves the actual old Policy and complete Set;
  // a callback-reported version cannot select or waive that contract.
  const comparison = await inspectSelfAuthorityChanges({ repository: context.repository, baseSha: context.baseSha,
    headSha: context.headSha, reviewedSha: context.subjectSha, baseBranch: 'main', policyPath: SELF_POLICY_PATH,
    policySha256: selectionValue.policySha256, provenance: preparedReview.authorityProvenance, cwd: selectionValue.root });
  if (comparison.changed || reportedChanged !== 'false') fail('selected old Authority changed or its protected comparison disagrees.');
}
function requireReviewBinding(value: unknown, context: SelfPrContext): void {
  if (!record(value) || Object.keys(value).sort().join(',') !== 'baseSha,headSha,prNumber,repository,reviewedSha' ||
      value.repository !== context.repository || String(value.prNumber) !== context.prNumber || value.baseSha !== context.baseSha ||
      value.headSha !== context.headSha || value.reviewedSha !== context.subjectSha) fail('protected review result is not bound to the exact selected PR tuple and test-merge subject.');
}
function sameContext(first: SelfPrContext, second: SelfPrContext): boolean {
  return first.repository === second.repository && first.repositoryId === second.repositoryId && first.prNumber === second.prNumber &&
    first.baseSha === second.baseSha && first.headSha === second.headSha && first.subjectSha === second.subjectSha;
}

/**
 * Revalidate the exact ordinary PR tuple around protected result validation,
 * then publish success through the existing dedicated-App reporter. App
 * credentials are acquired lazily only after all review, policy,
 * completeness and final-context checks pass. This function is not a trust
 * boundary when called with candidate-supplied inputs or persisted artifacts.
 */
export async function publishProtectedSelfPrResult(input: SelfPrAppProducerInput) {
  try {
    if (!input || typeof input !== 'object' || typeof input.runProtectedReview !== 'function' ||
        typeof input.getApp !== 'function' || !input.completeness || typeof input.completeness.token !== 'string' ||
        typeof input.contextFetchImpl !== 'function') fail('protected caller callbacks or read-only completeness capability are unavailable.');
    const firstResult = await selectSelfPrContext({ ...input.context, fetchImpl: input.contextFetchImpl });
    if (firstResult.status !== 'SELECTED_SELF_PR_CONTEXT') fail('initial exact PR context is incomplete.');
    const first = firstResult;

    const rawReview = await input.runProtectedReview(first);
    if (!record(rawReview) || rawReview.mode !== 'enforced' ||
        rawReview.policyResult !== 'success' || rawReview.reviewResult !== 'success' ||
        rawReview.selectedAuthorityChanged !== 'false') fail('protected ordinary review or selected-Authority comparison is incomplete.');
    requireReviewBinding(rawReview.reviewBinding, first);
    if (!record(rawReview.preparedReview)) fail('protected review validation inputs are unavailable.');
    await validateOldAuthoritySelection(rawReview.authoritySelection, rawReview.preparedReview, first, rawReview.selectedAuthorityChanged);

    const completion = completePreparedCiReview(rawReview.preparedReview as Parameters<typeof completePreparedCiReview>[0]);
    if (!record(completion) || !record(completion.execution) || completion.execution.status !== 'completed' ||
        !record(completion.execution.observations) || completion.execution.observations.hostStepOutcome !== 'success' ||
        !record(completion.execution.observations.rawResponse) || completion.execution.observations.rawResponse.status !== 'available' ||
        !record(completion.decision) || completion.decision.decision !== 'PASS') fail('protected result did not validate as a completed PASS.');

    const classified = classifyReview({ mode: rawReview.mode, policyResult: rawReview.policyResult, reviewResult: rawReview.reviewResult,
      rawDecision: JSON.stringify(completion.decision) });
    if (classified.conclusion !== 'PASS') fail('ordinary review classification did not produce PASS.');
    assertEnforcedAcceptance({ reviewResult: rawReview.reviewResult, conclusion: classified.conclusion,
      selfAuthorityCheckRequired: 'true', selectedAuthorityChanged: rawReview.selectedAuthorityChanged });

    const completeness = await validateQueuedPrDescription({ ...input.completeness, prNumber: Number(first.prNumber),
      baseSha: first.baseSha, headSha: first.headSha });
    if (completeness.status !== 'VALIDATED' || completeness.ok !== true) fail('current PR description completeness validation did not succeed.');

    const secondResult = await selectSelfPrContext({ ...input.context, fetchImpl: input.contextFetchImpl });
    if (secondResult.status !== 'SELECTED_SELF_PR_CONTEXT' || !sameContext(first, secondResult)) fail('PR context changed during validation.');

    // This callback is deliberately last; candidate or reviewer output never reaches App credentials.
    const app = await input.getApp();
    return await publishSelfArchitectureCheck({ app, result: { headSha: first.subjectSha, conclusion: 'success' },
      ...(input.reportFetchImpl ? { fetchImpl: input.reportFetchImpl } : {}), ...(input.now !== undefined ? { now: input.now } : {}) });
  } catch (error) {
    return Object.freeze({ status: 'INCOMPLETE' as const,
      reason: error instanceof Error ? error.message : 'Self PR App producer: protected validation failed.' });
  }
}
