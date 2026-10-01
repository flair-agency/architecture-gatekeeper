function fail(message) { throw new Error(message); }

// Normalize the legacy one-target BLOCK record into the trusted semantic
// validator result shape. The record format remains unchanged; `expected`
// contains the target tuple independently derived from protected Git inputs.
export function validateOwnerAmendmentBlockSemanticRecord({ bytes, expected, repository, baseSha, bSha,
  triggerProfile, authority, attestationBundleSha256, resultingAuthoritySetDigest } = {}) {
  if (!Buffer.isBuffer(bytes) || !bytes.length || bytes.length > 8_192) fail('BLOCK AmendmentRecord bytes are missing or oversized.');
  let amendment;
  try { amendment = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
  catch { fail('BLOCK AmendmentRecord is malformed.'); }
  if (triggerProfile !== 'completed-block-v1' || !Array.isArray(expected?.changes) || expected.changes.length !== 1) {
    fail('BLOCK AmendmentRecord requires exactly one protected target change.');
  }
  const change = expected.changes[0];
  if (change?.path !== authority?.authorityPath || change.beforeSha256 !== authority?.previousSha256 ||
      change.afterSha256 !== authority?.newSha256) fail('BLOCK target change differs from protected Git bytes.');
  if (amendment.version !== 2 || amendment.repository !== repository || amendment.baseSha !== baseSha || amendment.headSha !== bSha ||
      amendment.policyRevision !== baseSha || amendment.triggeringReviewSha256 !== expected.triggerReviewRecordSha256 ||
      amendment.attestationBundleSha256 !== attestationBundleSha256 || amendment.authority?.id !== authority.authorityId ||
      amendment.authority?.path !== authority.authorityPath || amendment.authority?.previousSha256 !== authority.previousSha256 ||
      amendment.authority?.newSha256 !== authority.newSha256) fail('BLOCK AmendmentRecord does not bind the exact trigger and target.');
  return { status: 'VERIFIED_OWNER_AMENDMENT_RECORD', repository, baseSha, bSha, policyRevision: baseSha,
    triggerProfile, triggerReviewRecordSha256: expected.triggerReviewRecordSha256,
    priorAuthoritySetDigest: expected.authoritySetDigest, resultingAuthoritySetDigest,
    changes: [{ path: change.path, beforeSha256: change.beforeSha256, afterSha256: change.afterSha256 }],
    targetValidated: true, purpose: amendment.purpose };
}
