import { createHash } from 'node:crypto';
import { TextDecoder } from 'node:util';
import { rejectDuplicateJsonKeys } from '../authority-set.mjs';

export type OwnerAmendmentRecordBuilderInput = Readonly<{
  scope: unknown;
  reviewRecordBytes: unknown;
  attestationBundleBytes: unknown;
  repository: unknown;
  purpose: unknown;
}>;
export type OwnerAmendmentRecord = Readonly<{
  version: 2;
  repository: string;
  baseSha: unknown;
  headSha: unknown;
  policyRevision: unknown;
  authority: { id: unknown; path: unknown; previousSha256: unknown; newSha256: unknown };
  triggeringReviewSha256: string;
  attestationBundleSha256: string;
  purpose: string;
}>;
export type OwnerAmendmentRecordBuildResult = Readonly<{
  record: OwnerAmendmentRecord;
  bytes: Buffer;
}>;

type ScopeOperationView = {
  baseSha?: unknown; headSha?: unknown; authorityId?: unknown; authorityPath?: unknown;
  previousSha256?: unknown; newSha256?: unknown;
};
type DecisionOperationView = { decision?: unknown; authorityIds?: unknown };
type AuthorityMemberOperationView = {
  id?: unknown; repository?: unknown; resolvedCommit?: unknown; path?: unknown; sha256?: unknown;
};
type AuthorityOperationView = {
  selfRepository?: unknown; authorityRevision?: unknown; members?: unknown;
};
type ReviewOperationView = {
  version?: unknown; kind?: unknown; repository?: unknown; prNumber?: unknown;
  baseSha?: unknown; headSha?: unknown; mergeSha?: unknown; workflowSha?: unknown;
  workflowPath?: unknown; runId?: unknown; runAttempt?: unknown; authority?: unknown;
  inputDigests?: unknown; decisionSha256?: unknown; decisionBytesBase64?: unknown; decision?: unknown;
};
type ErrorOperationView = { message: unknown };

const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
const SHA1 = /^[a-f0-9]{40}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const REPOSITORY = /^[A-Za-z0-9][A-Za-z0-9-]{0,38}\/[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/;
const MAX_REVIEW_RECORD_BYTES = 131_072;
const MAX_AMENDMENT_RECORD_BYTES = 8_192;

function fail(message: string): never { throw new Error(`Owner amendment record: ${message}`); }
function digest(bytes: Buffer): string { return createHash('sha256').update(bytes).digest('hex'); }
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical((value as Record<string, unknown>)[key])]));
  }
  return value;
}
function isRecord(value: unknown): unknown { return value && typeof value === 'object' && !Array.isArray(value); }
function exactKeys(value: unknown, keys: readonly string[], label: string): void {
  if (!isRecord(value) || Object.keys(value as object).length !== keys.length || keys.some(key => !Object.hasOwn(value as object, key))) {
    fail(`${label} has missing or unknown fields.`);
  }
}

function validateScope(scope: unknown): void {
  exactKeys(scope, ['baseSha', 'headSha', 'authorityId', 'authorityPath', 'previousSha256', 'newSha256'], 'inspected self scope');
  if (!SHA1.test((scope as ScopeOperationView).baseSha as string) || !SHA1.test((scope as ScopeOperationView).headSha as string) || (scope as ScopeOperationView).baseSha === (scope as ScopeOperationView).headSha ||
      typeof (scope as ScopeOperationView).authorityId !== 'string' || !/^[a-z][a-z0-9-]{0,63}$/.test((scope as ScopeOperationView).authorityId as string) ||
      typeof (scope as ScopeOperationView).authorityPath !== 'string' || !/^(?:[A-Za-z0-9._-]+\/)*[A-Za-z0-9._-]+\.md$/.test((scope as ScopeOperationView).authorityPath as string) ||
      ((scope as ScopeOperationView).authorityPath as string).length > 240 || ((scope as ScopeOperationView).authorityPath as string).split('/').some(part => part === '.' || part === '..') ||
      !SHA256.test((scope as ScopeOperationView).previousSha256 as string) || !SHA256.test((scope as ScopeOperationView).newSha256 as string) || (scope as ScopeOperationView).previousSha256 === (scope as ScopeOperationView).newSha256) {
    fail('inspected self scope is invalid.');
  }
}

function parseVerifiedBlock(reviewRecordBytes: unknown): ReviewOperationView {
  if (!Buffer.isBuffer(reviewRecordBytes) || !reviewRecordBytes.length || reviewRecordBytes.length > MAX_REVIEW_RECORD_BYTES) {
    fail('exact verified BLOCK ReviewRecord bytes are missing or oversized.');
  }
  let source: string;
  try { source = decoder.decode(reviewRecordBytes); } catch { fail('ReviewRecord is not UTF-8.'); }
  let review: ReviewOperationView;
  try {
    rejectDuplicateJsonKeys(source, 'owner amendment ReviewRecord');
    review = JSON.parse(source) as ReviewOperationView;
  } catch (error) { fail(`ReviewRecord JSON is invalid: ${(error as ErrorOperationView).message}`); }
  const keys = ['version', 'kind', 'repository', 'prNumber', 'baseSha', 'headSha', 'mergeSha', 'workflowSha',
    'workflowPath', 'runId', 'runAttempt', 'authority', 'inputDigests', 'decisionSha256', 'decisionBytesBase64', 'decision'];
  exactKeys(review, keys, 'ReviewRecord');
  if (review.version !== 1 || review.kind !== 'owner-amendment-block-review-record' ||
      typeof review.repository !== 'string' || !REPOSITORY.test(review.repository) ||
      !Number.isSafeInteger(review.prNumber) || (review.prNumber as number) < 1 ||
      ![review.baseSha, review.headSha, review.mergeSha, review.workflowSha].every(value => SHA1.test(value as string)) ||
      typeof review.workflowPath !== 'string' || !/^\.github\/workflows\/[A-Za-z0-9._-]+\.yml$/.test(review.workflowPath) ||
      ![review.runId, review.runAttempt].every(value => typeof value === 'string' && /^[1-9]\d*$/.test(value)) ||
      !SHA256.test(review.decisionSha256 as string) || typeof review.decisionBytesBase64 !== 'string' ||
      !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(review.decisionBytesBase64)) {
    fail('ReviewRecord fields are invalid.');
  }
  if (!isRecord(review.decision) || (review.decision as DecisionOperationView).decision !== 'BLOCK' ||
      !Array.isArray((review.decision as DecisionOperationView).authorityIds) || ((review.decision as DecisionOperationView).authorityIds as unknown[]).length !== 1 ||
      typeof (review.authority as AuthorityOperationView | null | undefined)?.selfRepository !== 'string' || !Array.isArray((review.authority as AuthorityOperationView | null | undefined)?.members) ||
      ((review.authority as AuthorityOperationView).members as unknown[]).length !== 1) {
    fail('ReviewRecord is not a completed single-authority BLOCK.');
  }
  const decisionBytes = Buffer.from(review.decisionBytesBase64, 'base64');
  if (!decisionBytes.length || decisionBytes.toString('base64') !== review.decisionBytesBase64 ||
      digest(decisionBytes) !== review.decisionSha256) fail('ReviewRecord decision bytes or digest are invalid.');
  let decisionFromBytes;
  try {
    const text = decoder.decode(decisionBytes);
    rejectDuplicateJsonKeys(text, 'BLOCK decision');
    decisionFromBytes = JSON.parse(text);
  } catch (error) { fail(`ReviewRecord decision bytes are invalid: ${(error as ErrorOperationView).message}`); }
  if (JSON.stringify(canonical(decisionFromBytes)) !== JSON.stringify(canonical(review.decision))) {
    fail('ReviewRecord decision differs from its exact decision bytes.');
  }
  return review;
}

function validateBinding(review: ReviewOperationView, { scope, repository }: { scope: unknown; repository: string }): void {
  if (review.repository !== repository || (review.authority as AuthorityOperationView).selfRepository !== repository ||
      review.baseSha !== (scope as ScopeOperationView).baseSha || review.workflowSha !== (scope as ScopeOperationView).baseSha ||
      review.headSha === (scope as ScopeOperationView).baseSha || review.headSha === (scope as ScopeOperationView).headSha) {
    fail('ReviewRecord repository, base or historical head does not bind this inspected B scope.');
  }
  const authority = review.authority as AuthorityOperationView;
  const member = (authority.members as AuthorityMemberOperationView[])[0];
  if (authority.authorityRevision !== (scope as ScopeOperationView).baseSha || member.id !== (scope as ScopeOperationView).authorityId ||
      member.repository !== repository || member.path !== (scope as ScopeOperationView).authorityPath ||
      member.resolvedCommit !== (scope as ScopeOperationView).baseSha || member.sha256 !== (scope as ScopeOperationView).previousSha256 ||
      ((review.decision as DecisionOperationView).authorityIds as unknown[])[0] !== (scope as ScopeOperationView).authorityId) {
    fail('ReviewRecord authority does not match the inspected previous self authority.');
  }
}

function validatePurpose(purpose: unknown): asserts purpose is string {
  if (typeof purpose !== 'string' || purpose.length < 1 || purpose.length > 500 ||
      !/^[\x20-\x7e]+$/.test(purpose) || !purpose.trim()) {
    fail('purpose must be nonempty printable ASCII and no longer than 500 characters.');
  }
}

/** Build canonical self BLOCK AmendmentRecord v2 bytes with exact evidence digests. */
export function buildOwnerAmendmentRecord(
  { scope, reviewRecordBytes, attestationBundleBytes, repository, purpose }: OwnerAmendmentRecordBuilderInput,
): OwnerAmendmentRecordBuildResult {
  validateScope(scope);
  if (typeof repository !== 'string' || !REPOSITORY.test(repository)) fail('repository identity is invalid.');
  validatePurpose(purpose);
  if (!Buffer.isBuffer(attestationBundleBytes) || !attestationBundleBytes.length || attestationBundleBytes.length > 65_536) {
    fail('exact verified attestation bundle bytes are missing or oversized.');
  }
  const review = parseVerifiedBlock(reviewRecordBytes);
  validateBinding(review, { scope, repository });
  const amendment: OwnerAmendmentRecord = {
    version: 2,
    repository,
    baseSha: (scope as ScopeOperationView).baseSha,
    headSha: (scope as ScopeOperationView).headSha,
    policyRevision: (scope as ScopeOperationView).baseSha,
    authority: {
      id: (scope as ScopeOperationView).authorityId,
      path: (scope as ScopeOperationView).authorityPath,
      previousSha256: (scope as ScopeOperationView).previousSha256,
      newSha256: (scope as ScopeOperationView).newSha256,
    },
    triggeringReviewSha256: digest(reviewRecordBytes as Buffer),
    attestationBundleSha256: digest(attestationBundleBytes),
    purpose,
  };
  const bytes = Buffer.from(JSON.stringify(canonical(amendment)) as string);
  if (bytes.length > MAX_AMENDMENT_RECORD_BYTES) fail('AmendmentRecord exceeds its byte limit.');
  return Object.freeze({ record: Object.freeze(amendment), bytes });
}
