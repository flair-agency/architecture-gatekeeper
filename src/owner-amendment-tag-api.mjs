import { ownerAmendmentTagApiRoute } from './runner-temp-path.mjs';

const API_ROOT = 'https://api.github.com/';

export function ownerAmendmentTagApiUrl(repository, tagNamespace, bSha) {
  return new URL(ownerAmendmentTagApiRoute(repository, tagNamespace, bSha), API_ROOT).href;
}

/** A missing tag is benign only for the exact protected self-repository ref request. */
export function classifyOwnerAmendmentTagApiStatus({ status, requestedUrl, expectedUrl }) {
  if (typeof expectedUrl !== 'string' || requestedUrl !== expectedUrl ||
      !/^https:\/\/api\.github\.com\/repos\/flair-agency\/architecture-gatekeeper\/git\/ref\/tags\/architecture-gatekeeper\/amendments\/[a-f0-9]{40}$/.test(expectedUrl)) {
    throw new Error('OWNER_AMENDMENT tag 404 does not match the exact protected self ref request.');
  }
  if (status === 404) return 'OWNER_AMENDMENT_TAG_NOT_FOUND';
  if (status === 200) return 'OWNER_AMENDMENT_TAG_FOUND';
  throw new Error(`OWNER_AMENDMENT tag lookup returned unexpected HTTP status ${status}.`);
}
