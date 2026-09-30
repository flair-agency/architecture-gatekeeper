import { createHash } from 'node:crypto';
import { fetchOwnerAmendmentBlockArtifact } from './owner-amendment-artifact.mjs';
import { extractOwnerAmendmentBlockArtifactZip } from './owner-amendment-artifact-zip.mjs';
import { verifyOwnerAmendmentBlockEvidence } from './owner-amendment-attestation.mjs';
import { buildOwnerAmendmentOwnerDecisionAmendmentRecord } from './owner-amendment-owner-decision-amendment-record.mjs';
import { inspectOwnerAmendmentSelfScope } from './owner-amendment-scope.mjs';
import { createAndReadOwnerAmendmentTag } from './owner-amendment-tag-adapter.mjs';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const fail = message => { throw new Error(`Owner amendment OWNER_DECISION handoff: ${message}`); };
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;

/**
 * Verify an exact completed OWNER_DECISION run, bind it into a distinct
 * authority-only Change B record, then transport/read back the exact-B tag.
 * This is procedure/evidence handling only: it neither authenticates owner
 * identity nor declares semantic eligibility or acceptance.
 */
export async function handoffOwnerAmendmentOwnerDecision({ repository, policy, manifest, baseSha, bSha,
  changedFiles, baseAuthorityBytes, headAuthorityBytes, triggerRun, authorityId, authorityPath, purpose,
  tagNamespace, rulesetId, token, tagger, fetchImpl = fetch, runGh,
  fetchArtifact = fetchOwnerAmendmentBlockArtifact, extractArtifact = extractOwnerAmendmentBlockArtifactZip,
  verifyEvidence = verifyOwnerAmendmentBlockEvidence, createTag = createAndReadOwnerAmendmentTag }) {
  try {
    if (repository !== 'flair-agency/architecture-gatekeeper' ||
        policy?.ownerAmendmentTriggerProfile !== 'completed-owner-decision-self-v1') {
      fail('previous protected policy did not select the OWNER_DECISION self profile.');
    }
    if (typeof token !== 'string' || !token || typeof runGh !== 'function') fail('GitHub token and attestation verifier are required.');
    if (!triggerRun || !/^[1-9]\d*$/.test(String(triggerRun.runId)) || !/^[1-9]\d*$/.test(String(triggerRun.runAttempt)) ||
        !Number.isSafeInteger(triggerRun.prNumber) || triggerRun.prNumber < 1 || !/^[a-f0-9]{40}$/.test(triggerRun.headSha ?? '') ||
        triggerRun.workflowPath !== '.github/workflows/self-architecture-gate.yml' || triggerRun.workflowRef !== 'refs/heads/main' ||
        triggerRun.workflowSha !== baseSha || triggerRun.event !== 'pull_request_target') {
      fail('trusted completed OWNER_DECISION producer run does not bind the previous protected base and historical change.');
    }
    const scope = inspectOwnerAmendmentSelfScope({ policy, manifest, baseSha, headSha: bSha,
      changedFiles, baseAuthorityBytes, headAuthorityBytes });
    const expected = { repository, artifactId: triggerRun.artifactId, runId: String(triggerRun.runId),
      runAttempt: String(triggerRun.runAttempt), baseSha, headSha: triggerRun.headSha, profile: 'ownerDecision' };
    const fetched = await fetchArtifact({ expected, token, fetchImpl });
    if (fetched.status !== 'FETCHED_OWNER_AMENDMENT_BLOCK_ARTIFACT') fail(fetched.reason ?? 'exact OWNER_DECISION artifact could not be fetched.');
    const extracted = extractArtifact(fetched.zipBytes);
    if (extracted.status !== 'EXTRACTED_OWNER_AMENDMENT_BLOCK_ARTIFACT') fail(extracted.reason ?? 'exact trigger artifact could not be extracted.');

    let review;
    try { review = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(extracted.reviewRecordBytes)); }
    catch { fail('OWNER_DECISION ReviewRecord is invalid UTF-8 JSON.'); }
    if (review.kind !== 'owner-amendment-owner-decision-review-record' || review.decision?.decision !== 'OWNER_DECISION' ||
        review.repository !== repository || review.prNumber !== triggerRun.prNumber || review.baseSha !== baseSha ||
        review.headSha !== triggerRun.headSha || review.workflowSha !== triggerRun.workflowSha ||
        review.workflowPath !== triggerRun.workflowPath || String(review.runId) !== String(triggerRun.runId) ||
        String(review.runAttempt) !== String(triggerRun.runAttempt)) {
      fail('ReviewRecord is not the exact completed OWNER_DECISION selected by the protected run context.');
    }
    const producer = { repository, workflowPath: triggerRun.workflowPath, workflowSha: baseSha,
      workflowRef: triggerRun.workflowRef, runId: String(triggerRun.runId), runAttempt: String(triggerRun.runAttempt) };
    const provenance = verifyEvidence({ recordBytes: extracted.reviewRecordBytes,
      bundleBytes: extracted.attestationBundleBytes, expected: producer, runGh });
    if (provenance.status !== 'VERIFIED_PRODUCER_ATTESTATION' || provenance.recordSha256 !== sha(extracted.reviewRecordBytes)) {
      fail(provenance.reason ?? 'OWNER_DECISION producer provenance is not verified.');
    }
    const built = buildOwnerAmendmentOwnerDecisionAmendmentRecord({ reviewRecordBytes: extracted.reviewRecordBytes,
      attestationBundleBytes: extracted.attestationBundleBytes, repository, baseSha, bSha,
      authorityId: scope.authorityId, authorityPath: scope.authorityPath,
      previousAuthorityBytes: baseAuthorityBytes, amendedAuthorityBytes: headAuthorityBytes, purpose });
    const envelope = { version: 3, profile: 'self-g0', triggerProfile: 'completed-owner-decision-self-v1', bSha,
      reviewRecordBase64: extracted.reviewRecordBytes.toString('base64'), reviewRecordSha256: sha(extracted.reviewRecordBytes),
      attestationBundleBase64: extracted.attestationBundleBytes.toString('base64'), attestationBundleSha256: sha(extracted.attestationBundleBytes),
      amendmentRecordBase64: built.bytes.toString('base64'), amendmentRecordSha256: sha(built.bytes) };
    const tagMessage = `${JSON.stringify(canonical(envelope))}\n`;
    if (Buffer.byteLength(tagMessage) > 262_144) fail('profiled tag envelope exceeds its byte limit.');
    const tagRef = `${tagNamespace}/${bSha}`;
    const tag = await createTag({ repository, tagRef, bSha, tagMessage,
      tagNamespace, rulesetId, token, tagger, fetchImpl });
    return Object.freeze({ status: 'OWNER_DECISION_TAG_TRANSPORTED_AND_READ_BACK', repository, baseSha, bSha,
      triggerProfile: envelope.triggerProfile, tagRef,
      tagObjectSha: tag.tagReadback.sha, reviewRecordSha256: envelope.reviewRecordSha256,
      attestationBundleSha256: envelope.attestationBundleSha256, amendmentRecordSha256: envelope.amendmentRecordSha256,
      principalAuthentication: 'not_verified', exactClaimAuthorization: 'not_verified' });
  } catch (error) {
    return Object.freeze({ status: 'INCOMPLETE', reason: error.message });
  }
}
