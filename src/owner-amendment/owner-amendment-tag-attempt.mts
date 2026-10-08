import { parseCiPolicyJson, resolveCiPolicy } from '../resolve-ci-policy.mjs';
import { classifyOwnerAmendmentTagApiStatus, ownerAmendmentTagApiUrl } from './owner-amendment-tag-api.mjs';

const SELF_REPOSITORY = 'flair-agency/architecture-gatekeeper';
const SHA1 = /^[a-f0-9]{40}$/;
const TRIGGER_PROFILES = new Set(['completed-block-v1', 'completed-owner-decision-self-v1']);

export type Awaitable<T> = T | PromiseLike<T>;
export type OwnerAmendmentTagRefRequest = {
  readonly expectedUrl: string;
  readonly repository: string;
  readonly tagNamespace: string;
  readonly bSha: unknown;
};
export type OwnerAmendmentTagAttemptInput = {
  repository?: unknown;
  baseSha?: unknown;
  bSha?: unknown;
  baseBranch?: unknown;
  triggerProfile?: unknown;
  policyBytes?: unknown;
  readTagRef?: (request: OwnerAmendmentTagRefRequest) => Awaitable<unknown>;
};
export type OwnerAmendmentTagAttempt =
  | Readonly<{ status: 'OWNER_AMENDMENT_NOT_APPLICABLE'; attempted: false; tagRef: null }>
  | Readonly<{ status: 'OWNER_AMENDMENT_ATTEMPT'; attempted: true; tagRef: string }>;
export type OwnerAmendmentTagAbsent = Extract<OwnerAmendmentTagAttempt, { attempted: false }>;

/** Classify an exact-B protected amendment tag before any semantic/scope validation. */
export async function classifyOwnerAmendmentTagAttempt({ repository, baseSha, bSha, baseBranch,
  triggerProfile, policyBytes, readTagRef } : OwnerAmendmentTagAttemptInput = {}): Promise<OwnerAmendmentTagAttempt> {
  if (repository !== SELF_REPOSITORY || !SHA1.test((baseSha ?? '') as string) || !SHA1.test((bSha ?? '') as string) ||
      baseSha === bSha || baseBranch !== 'main' || !TRIGGER_PROFILES.has(triggerProfile as string) ||
      !Buffer.isBuffer(policyBytes) || !policyBytes.length || typeof readTagRef !== 'function') {
    throw new Error('OWNER_AMENDMENT attempt classification requires the protected self repository, exact revisions, selected profile and trusted tag reader.');
  }
  // The existing JS policy resolver returns a branch-specific inferred union; its runtime
  // validator produces this selected-field view, but does not export that type.
  type ResolvedPolicyView = { mode: unknown; ownerAmendmentVersion: unknown; ownerAmendmentGrade: unknown;
    ownerAmendmentScope: unknown; ownerAmendmentTriggerProfile: unknown; ownerAmendmentTagNamespace: unknown };
  const policy = resolveCiPolicy(parseCiPolicyJson(policyBytes.toString('utf8')), baseBranch) as unknown as ResolvedPolicyView;
  if (policy.mode !== 'enforced' || policy.ownerAmendmentVersion !== 1 || policy.ownerAmendmentGrade !== 'G0' ||
      policy.ownerAmendmentScope !== 'authority-only' || policy.ownerAmendmentTriggerProfile !== triggerProfile ||
      !policy.ownerAmendmentTagNamespace) {
    throw new Error('Previous protected policy does not select the exact OWNER_AMENDMENT attempt profile.');
  }
  const expectedUrl = ownerAmendmentTagApiUrl(repository, policy.ownerAmendmentTagNamespace, bSha);
  // The JS policy validator checks the fixed namespace; revision observations remain unknown.
  const response = await readTagRef({ expectedUrl, repository, tagNamespace: policy.ownerAmendmentTagNamespace as string, bSha });
  // The transport response remains unknown; this erased view preserves optional JS property reads.
  const classification = classifyOwnerAmendmentTagApiStatus({ status: (response as { status?: unknown } | null | undefined)?.status,
    requestedUrl: (response as { requestedUrl?: unknown } | null | undefined)?.requestedUrl, expectedUrl });
  if (classification === 'OWNER_AMENDMENT_TAG_NOT_FOUND') {
    return Object.freeze({ status: 'OWNER_AMENDMENT_NOT_APPLICABLE', attempted: false, tagRef: null });
  }
  return Object.freeze({ status: 'OWNER_AMENDMENT_ATTEMPT', attempted: true,
    tagRef: `${policy.ownerAmendmentTagNamespace}/${bSha}` });
}

/** Re-read the protected exact-B ref at final acceptance; an earlier 404 is not reusable. */
export async function assertOwnerAmendmentTagAbsentAtAcceptance(input: OwnerAmendmentTagAttemptInput): Promise<OwnerAmendmentTagAbsent> {
  const result = await classifyOwnerAmendmentTagAttempt(input);
  if (result.attempted) {
    throw new Error('OWNER_AMENDMENT exact-B tag is present at final acceptance; stale no-tag classification cannot authorize ordinary PASS.');
  }
  return result;
}
