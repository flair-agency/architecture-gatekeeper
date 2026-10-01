import { parseCiPolicyJson, resolveCiPolicy } from './resolve-ci-policy.mjs';
import { classifyOwnerAmendmentTagApiStatus, ownerAmendmentTagApiUrl } from './owner-amendment-tag-api.mjs';

const SELF_REPOSITORY = 'flair-agency/architecture-gatekeeper';
const SHA1 = /^[a-f0-9]{40}$/;
const TRIGGER_PROFILES = new Set(['completed-block-v1', 'completed-owner-decision-self-v1']);

/** Classify an exact-B protected amendment tag before any semantic/scope validation. */
export async function classifyOwnerAmendmentTagAttempt({ repository, baseSha, bSha, baseBranch,
  triggerProfile, policyBytes, readTagRef } = {}) {
  if (repository !== SELF_REPOSITORY || !SHA1.test(baseSha ?? '') || !SHA1.test(bSha ?? '') ||
      baseSha === bSha || baseBranch !== 'main' || !TRIGGER_PROFILES.has(triggerProfile) ||
      !Buffer.isBuffer(policyBytes) || !policyBytes.length || typeof readTagRef !== 'function') {
    throw new Error('OWNER_AMENDMENT attempt classification requires the protected self repository, exact revisions, selected profile and trusted tag reader.');
  }
  const policy = resolveCiPolicy(parseCiPolicyJson(policyBytes.toString('utf8')), baseBranch);
  if (policy.mode !== 'enforced' || policy.ownerAmendmentVersion !== 1 || policy.ownerAmendmentGrade !== 'G0' ||
      policy.ownerAmendmentScope !== 'authority-only' || policy.ownerAmendmentTriggerProfile !== triggerProfile ||
      !policy.ownerAmendmentTagNamespace) {
    throw new Error('Previous protected policy does not select the exact OWNER_AMENDMENT attempt profile.');
  }
  const expectedUrl = ownerAmendmentTagApiUrl(repository, policy.ownerAmendmentTagNamespace, bSha);
  const response = await readTagRef({ expectedUrl, repository, tagNamespace: policy.ownerAmendmentTagNamespace, bSha });
  const classification = classifyOwnerAmendmentTagApiStatus({ status: response?.status,
    requestedUrl: response?.requestedUrl, expectedUrl });
  if (classification === 'OWNER_AMENDMENT_TAG_NOT_FOUND') {
    return Object.freeze({ status: 'OWNER_AMENDMENT_NOT_APPLICABLE', attempted: false, tagRef: null });
  }
  return Object.freeze({ status: 'OWNER_AMENDMENT_ATTEMPT', attempted: true,
    tagRef: `${policy.ownerAmendmentTagNamespace}/${bSha}` });
}

/** Re-read the protected exact-B ref at final acceptance; an earlier 404 is not reusable. */
export async function assertOwnerAmendmentTagAbsentAtAcceptance(input) {
  const result = await classifyOwnerAmendmentTagAttempt(input);
  if (result.attempted) {
    throw new Error('OWNER_AMENDMENT exact-B tag is present at final acceptance; stale no-tag classification cannot authorize ordinary PASS.');
  }
  return result;
}
