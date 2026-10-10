import { parseOwnerAmendmentBlockRecord } from '../owner-amendment.mjs';

export interface OwnerAmendmentBlockSemanticExpected {
  changes?: unknown;
  triggerReviewRecordSha256?: unknown;
  authoritySetDigest?: unknown;
}

export interface OwnerAmendmentBlockSemanticAuthority {
  authorityId?: unknown;
  authorityPath?: unknown;
  previousSha256?: unknown;
  newSha256?: unknown;
}

export interface OwnerAmendmentBlockSemanticRecordInput {
  bytes?: unknown;
  expected?: OwnerAmendmentBlockSemanticExpected;
  repository?: unknown;
  baseSha?: unknown;
  bSha?: unknown;
  triggerProfile?: unknown;
  authority?: OwnerAmendmentBlockSemanticAuthority;
  attestationBundleSha256?: unknown;
  resultingAuthoritySetDigest?: unknown;
}

export interface OwnerAmendmentBlockSemanticRecordChange {
  path: unknown;
  beforeSha256: unknown;
  afterSha256: unknown;
}

export interface ValidatedOwnerAmendmentBlockSemanticRecord {
  status: 'VERIFIED_OWNER_AMENDMENT_RECORD';
  repository: unknown;
  baseSha: unknown;
  bSha: unknown;
  policyRevision: unknown;
  triggerProfile: unknown;
  triggerReviewRecordSha256: unknown;
  priorAuthoritySetDigest: unknown;
  resultingAuthoritySetDigest: unknown;
  changes: OwnerAmendmentBlockSemanticRecordChange[];
  targetValidated: true;
  purpose: unknown;
}

// This view models the subsequent ordinary property reads; casting an array
// element does not check or certify that caller-supplied element.
type ExpectedChangeView = { path?: unknown; beforeSha256?: unknown; afterSha256?: unknown };
type ParsedBlockAmendmentView = {
  version?: unknown;
  repository?: unknown;
  baseSha?: unknown;
  headSha?: unknown;
  policyRevision?: unknown;
  triggeringReviewSha256?: unknown;
  attestationBundleSha256?: unknown;
  authority?: { id?: unknown; path?: unknown; previousSha256?: unknown; newSha256?: unknown } | null;
  purpose?: unknown;
};

function fail(message: string): never { throw new Error(message); }

// Normalize the legacy one-target BLOCK record into the trusted semantic
// validator result shape. The record format remains unchanged; `expected`
// contains the target tuple independently derived from protected Git inputs.
export function validateOwnerAmendmentBlockSemanticRecord({ bytes, expected, repository, baseSha, bSha,
  triggerProfile, authority, attestationBundleSha256, resultingAuthoritySetDigest }: OwnerAmendmentBlockSemanticRecordInput = {}): ValidatedOwnerAmendmentBlockSemanticRecord {
  if (!Buffer.isBuffer(bytes) || !bytes.length || bytes.length > 8_192) fail('BLOCK AmendmentRecord bytes are missing or oversized.');
  // The parser has completed its canonical record checks before these fields are read.
  const amendment = parseOwnerAmendmentBlockRecord(bytes) as ParsedBlockAmendmentView;
  if (triggerProfile !== 'completed-block-v1' || !Array.isArray(expected?.changes) || expected.changes.length !== 1) {
    fail('BLOCK AmendmentRecord requires exactly one protected target change.');
  }
  // This erased operation view preserves the original reads; it does not
  // validate the element shape or authenticate the caller-supplied values.
  const change = (expected!.changes as unknown[])[0] as ExpectedChangeView;
  if (change?.path !== authority?.authorityPath || change.beforeSha256 !== authority?.previousSha256 ||
      change.afterSha256 !== authority?.newSha256) fail('BLOCK target change differs from protected Git bytes.');
  if (amendment.version !== 2 || amendment.repository !== repository || amendment.baseSha !== baseSha || amendment.headSha !== bSha ||
      amendment.policyRevision !== baseSha || amendment.triggeringReviewSha256 !== expected!.triggerReviewRecordSha256 ||
      amendment.attestationBundleSha256 !== attestationBundleSha256 || amendment.authority?.id !== authority!.authorityId ||
      amendment.authority?.path !== authority!.authorityPath || amendment.authority?.previousSha256 !== authority!.previousSha256 ||
      amendment.authority?.newSha256 !== authority!.newSha256) {
    fail('BLOCK AmendmentRecord does not bind the exact trigger and target.');
  }
  return { status: 'VERIFIED_OWNER_AMENDMENT_RECORD', repository, baseSha, bSha, policyRevision: baseSha,
    triggerProfile, triggerReviewRecordSha256: expected!.triggerReviewRecordSha256,
    priorAuthoritySetDigest: expected!.authoritySetDigest, resultingAuthoritySetDigest,
    changes: [{ path: change.path, beforeSha256: change.beforeSha256, afterSha256: change.afterSha256 }],
    targetValidated: true, purpose: amendment.purpose };
}
