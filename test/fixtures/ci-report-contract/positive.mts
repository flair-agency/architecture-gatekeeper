import { classifyReview, parseAuthorityProvenance, parseLegacyAuthorityProvenance, parseOwnerAdditionProcedure,
  postInlineReview, renderReport, sanitizeReportApiContext, validateInlineFindings } from '../../../src/ci-review/ci-report.mts';
import type { ReportFetch, ReportFetchReadOptions, ReportFetchReadResponse, ReportFetchWriteOptions,
  ReportFetchWriteResponse } from '../../../src/ci-review/ci-report.mts';

const nativeReportFetch: ReportFetch = fetch;
void nativeReportFetch;

function synchronousReportFetch(url: string, options: ReportFetchReadOptions): ReportFetchReadResponse;
function synchronousReportFetch(url: string, options: ReportFetchWriteOptions): ReportFetchWriteResponse;
function synchronousReportFetch(url: string, options: ReportFetchReadOptions | ReportFetchWriteOptions): ReportFetchReadResponse | ReportFetchWriteResponse {
  if (options.method) return url.endsWith('/forbidden') ? { ok: false, status: 403 } : { ok: true };
  return { ok: true, json: () => ({ items: [] }) };
}
const synchronousReportCollaborator: ReportFetch = synchronousReportFetch;
void synchronousReportCollaborator;

function promiseLikeReportFetch(url: string, options: ReportFetchReadOptions): PromiseLike<ReportFetchReadResponse>;
function promiseLikeReportFetch(url: string, options: ReportFetchWriteOptions): PromiseLike<ReportFetchWriteResponse>;
function promiseLikeReportFetch(url: string, options: ReportFetchReadOptions | ReportFetchWriteOptions): PromiseLike<ReportFetchReadResponse | ReportFetchWriteResponse> {
  return Promise.resolve(options.method
    ? (url.endsWith('/forbidden') ? { ok: false, status: 403 } : { ok: true })
    : { ok: true, json: () => ({ items: [] }) });
}
const promiseLikeReportCollaborator: ReportFetch = promiseLikeReportFetch;
void promiseLikeReportCollaborator;

const sanitized = sanitizeReportApiContext({ apiUrl: 'https://api.github.com', repository: 'owner/repo',
  pullRequest: 42, expectedHead: 'a'.repeat(40) });
const normalized: string = sanitized.expectedHead;
void normalized;

const classified = classifyReview({ mode: 'enforced', policyResult: 'success', reviewResult: 'success',
  rawDecision: JSON.stringify({ decision: 'PASS', summary: 'ok' }) });
if (classified.conclusion === 'PASS') {
  const decision: Record<string, unknown> = classified.decision;
  void decision;
  // a successful PASS always carries its parsed decision
  const absent: null = classified.decision;
  void absent;
}
renderReport(classified);

const encoded = Buffer.from(JSON.stringify({ version: 1 })).toString('base64');
const legacy = parseLegacyAuthorityProvenance(encoded, true);
const base: unknown = legacy.baseSha;
void base;
const optional = parseLegacyAuthorityProvenance(encoded);
if (optional) {
  const reviewed: unknown = optional.reviewedSha;
  void reviewed;
}
parseOwnerAdditionProcedure(encoded, true);

const sha = 'a'.repeat(40);
const digest = 'b'.repeat(64);
const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64');
const authority = parseAuthorityProvenance(encode({ version: 1, manifestSha256: [digest], setDigest: [digest],
  members: [{ id: 'base', repository: 'owner/repo', resolvedCommit: [sha], path: 'policy.json', sha256: [digest] }] }));
const legacyRecord = { version: 1, baseSha: [sha], headSha: ['c'.repeat(40)], reviewedSha: ['d'.repeat(40)],
  policy: { path: 'policy.json', sha256: [digest] }, prompt: { path: 'prompt.md', sha256: [digest] },
  schema: { path: 'schema.json', sha256: [digest] }, validation: null,
  members: [{ path: 'policy.json', sha256: [digest] }] };
const legacyEvidence = parseLegacyAuthorityProvenance(encode(legacyRecord));
const ownerAddition = parseOwnerAdditionProcedure(encode({ procedure: 'VALID_G0_OWNER_ADDITION', grade: 'G0',
  repository: ['owner/repo'], baseSha: sha, headSha: 'c'.repeat(40), policyRevision: sha, tagObjectOid: 'e'.repeat(40),
  authorityId: ['base'], authorityPath: 'policy.json', previousAuthoritySha256: [digest], newAuthoritySha256: ['f'.repeat(64)],
  tagRef: `refs/tags/architecture-owner-addition/${'c'.repeat(40)}`, missingDecisionId: 'decision-1',
  additionRecordSha256: [digest], principalAuthentication: 'not_verified',
  semanticEligibility: 'requires_separate_protected_review' }));
renderReport(classified, { authorityProvenance: authority, legacyAuthorityProvenance: legacyEvidence,
  ownerAdditionProcedure: ownerAddition });

// regex-coerced digest values remain unknown to render consumers
const manifestDigest: string = authority?.manifestSha256;
void manifestDigest;
// regex-coerced commit values remain unknown to render consumers
const legacyBase: string = legacyEvidence?.baseSha;
void legacyBase;
// regex-coerced owner fields remain unknown to render consumers
const ownerRepository: string = ownerAddition?.repository;
void ownerRepository;
const checkedFindings = validateInlineFindings([], { expectedHead: sha, currentHead: sha, files: [], decision: 'PASS' });
// validator output may reflect external getter and Array method behavior
const findingRows: unknown[] = checkedFindings;
void findingRows;
declare const delivery: Awaited<ReturnType<typeof postInlineReview>>;
const deliveryCount: unknown = delivery.count;
void deliveryCount;
