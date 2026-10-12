import { classifyReview, parseLegacyAuthorityProvenance, postInlineReview, renderReport } from '../../../src/ci-review/ci-report.mts';
import type { ReportFetch, ReportFetchReadOptions, ReportFetchReadResponse, ReportFetchWriteOptions,
  ReportFetchWriteResponse } from '../../../src/ci-review/ci-report.mts';

// @ts-expect-error classification requires all routing inputs
classifyReview({ mode: 'enforced', policyResult: 'success', reviewResult: 'success' });
const optional = parseLegacyAuthorityProvenance('');
// @ts-expect-error optional provenance may be absent
const requiredBase: string = optional.baseSha;
void requiredBase;
const blocked = classifyReview({ mode: 'enforced', policyResult: 'success', reviewResult: 'success',
  rawDecision: JSON.stringify({ decision: 'BLOCK' }) });
// @ts-expect-error decision fields remain unknown until consumers narrow them
const summary: string = blocked.decision?.summary;
void summary;
// @ts-expect-error report rendering needs the typed classification result
renderReport({ conclusion: 'PASS', summary: 'ok', decision: null });
const valid = classifyReview({ mode: 'enforced', policyResult: 'success', reviewResult: 'success',
  rawDecision: JSON.stringify({ decision: 'PASS' }) });
// @ts-expect-error renderers consume the complete parser-validated authority result shape
renderReport(valid, { authorityProvenance: {} });
// @ts-expect-error required legacy evidence inputs must contain a path and digest
renderReport(valid, { legacyAuthorityProvenance: { version: 1, baseSha: 'a', headSha: 'b', reviewedSha: 'c', policy: {}, prompt: { path: 'p', sha256: 'a' }, schema: { path: 's', sha256: 'a' }, validation: null, members: [] } });
// @ts-expect-error owner-addition records require parser-validated rendered fields
renderReport(valid, { ownerAdditionProcedure: { procedure: 'VALID_G0_OWNER_ADDITION' } });
declare const delivery: Awaited<ReturnType<typeof postInlineReview>>;
// @ts-expect-error Array operations may produce a nonnumeric `count` at runtime
const numericCount: number = delivery.count;
void numericCount;

function missingJsonReportFetch(url: string, options: ReportFetchReadOptions): { ok: true };
function missingJsonReportFetch(url: string, options: ReportFetchWriteOptions): ReportFetchWriteResponse;
function missingJsonReportFetch(url: string, options: ReportFetchReadOptions | ReportFetchWriteOptions): ReportFetchReadResponse | ReportFetchWriteResponse {
  return options.method ? { ok: true } : { ok: true };
}
// @ts-expect-error successful GET responses must provide the json operation
const invalidMissingJson: ReportFetch = missingJsonReportFetch;
void invalidMissingJson;

declare const invalidJsonMethodReportFetch: {
  (url: string, options: ReportFetchReadOptions): { ok: true; json: string };
  (url: string, options: ReportFetchWriteOptions): ReportFetchWriteResponse;
};
// @ts-expect-error successful GET response json must be callable
const invalidJsonMethod: ReportFetch = invalidJsonMethodReportFetch;
void invalidJsonMethod;
