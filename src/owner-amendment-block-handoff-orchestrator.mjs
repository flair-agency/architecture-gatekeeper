// Run the protected self BLOCK-to-tag transport sequence. This reports tag
// transport only; a later protected merge-group/canonical verifier decides
// eligibility and acceptance.
import { buildOwnerAmendmentRecord } from './owner-amendment-record-builder.mjs';
import { discoverOwnerAmendmentBlockArtifact } from './owner-amendment-artifact-discovery.mjs';
import { inspectOwnerAmendmentSelfScope } from './owner-amendment-scope.mjs';
import { composeOwnerAmendmentBlockHandoff } from './owner-amendment-block-handoff-compose.mjs';
import { createAndReadOwnerAmendmentTag } from './owner-amendment-tag-adapter.mjs';

const SHA = /^[a-f0-9]{40}$/;
const fail = message => { throw new Error(`Owner amendment BLOCK handoff orchestration: ${message}`); };

function validateRunContext(context, repository, baseSha, bSha) {
  const keys = ['runId', 'runAttempt', 'headSha', 'aPrNumber', 'workflowPath', 'workflowRef', 'workflowSha'];
  if (!context || typeof context !== 'object' || Array.isArray(context) ||
      Object.keys(context).sort().join(',') !== [...keys].sort().join(',')) fail('trusted BLOCK run context is incomplete or has unknown fields.');
  if (![context.runId, context.runAttempt].every(value =>
    (typeof value === 'string' && /^[1-9]\d*$/.test(value)) || (Number.isSafeInteger(value) && value > 0)) ||
      !SHA.test(context.headSha ?? '') || !SHA.test(context.workflowSha ?? '') || context.workflowSha !== baseSha ||
      !Number.isSafeInteger(context.aPrNumber) || context.aPrNumber < 1 ||
      context.headSha === baseSha || context.headSha === bSha ||
      typeof context.workflowPath !== 'string' || !/^\.github\/workflows\/[A-Za-z0-9._-]+\.yml$/.test(context.workflowPath) ||
      typeof context.workflowRef !== 'string' || !/^refs\/heads\/[A-Za-z0-9._/-]+$/.test(context.workflowRef)) {
    fail('trusted BLOCK run does not bind the expected base, historical A head, and protected producer workflow.');
  }
  return context;
}

/**
 * Inspect an exact self-authority B, discover and verify its triggering BLOCK
 * artifact, construct its AmendmentRecord from the verified bytes, then
 * transport/read back the exact-B annotated tag. All configuration and Git
 * objects passed here must have been resolved by a protected-base caller.
 */
export async function orchestrateOwnerAmendmentBlockHandoff({
  repository, policy, manifest, baseSha, bSha, changedFiles,
  baseAuthorityBytes, headAuthorityBytes, blockRun, purpose,
  token, runGh, rulesetId, tagger, fetchImpl = fetch,
}) {
  try {
    if (typeof repository !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9-]*\/[A-Za-z0-9][A-Za-z0-9._-]*$/.test(repository)) {
      fail('trusted repository identity is invalid.');
    }
    if (!SHA.test(baseSha ?? '') || !SHA.test(bSha ?? '') || bSha === baseSha) fail('exact previous base and B commits are required.');
    if (!Buffer.isBuffer(baseAuthorityBytes) || !Buffer.isBuffer(headAuthorityBytes)) fail('exact authority Git object bytes are required.');
    if (typeof token !== 'string' || !token || typeof fetchImpl !== 'function' || typeof runGh !== 'function') {
      fail('authenticated GitHub and attestation verifier helpers are required.');
    }
    const scope = inspectOwnerAmendmentSelfScope({ policy, manifest, baseSha, headSha: bSha,
      changedFiles, baseAuthorityBytes, headAuthorityBytes });
    blockRun = validateRunContext(blockRun, repository, baseSha, bSha);

    const expectedRun = { repository, runId: blockRun.runId, runAttempt: blockRun.runAttempt,
      baseSha, headSha: blockRun.headSha };
    const discovered = await discoverOwnerAmendmentBlockArtifact({ expected: expectedRun, token, fetchImpl });
    if (discovered.status !== 'DISCOVERED_OWNER_AMENDMENT_BLOCK_ARTIFACT') fail(discovered.reason ?? 'BLOCK artifact discovery did not complete.');

    const context = { repository, artifactId: discovered.artifactId, runId: discovered.runId,
      runAttempt: discovered.runAttempt, baseSha, headSha: blockRun.headSha,
      aPrNumber: blockRun.aPrNumber,
      workflowPath: blockRun.workflowPath, workflowRef: blockRun.workflowRef,
      workflowSha: blockRun.workflowSha, bSha };
    const composed = await composeOwnerAmendmentBlockHandoff({ context, token, fetchImpl, runGh,
      buildAmendmentRecordBytes: reviewRecordBytes => buildOwnerAmendmentRecord({
        scope, reviewRecordBytes, repository, purpose,
      }).bytes });
    if (composed.status !== 'PREPARED_BLOCK_HANDOFF_TAG_MESSAGE') fail(composed.reason ?? 'verified BLOCK handoff could not be prepared.');

    const tagNamespace = policy.ownerAmendmentTagNamespace;
    const tagRef = `${tagNamespace}/${bSha}`;
    const tag = await createAndReadOwnerAmendmentTag({ repository, tagRef, bSha,
      tagMessage: composed.tagMessage, tagNamespace, rulesetId, token, tagger, fetchImpl });
    return Object.freeze({ status: 'TAG_TRANSPORTED_AND_READ_BACK', transportStatus: tag.transportStatus,
      repository, tagRef, bSha, tagObjectSha: tag.tagReadback.sha,
      reviewRecordSha256: composed.reviewRecordSha256,
      attestationBundleSha256: composed.attestationBundleSha256,
      amendmentRecordSha256: composed.amendmentRecordSha256 });
  } catch (error) {
    return Object.freeze({ status: 'INCOMPLETE', reason: error.message });
  }
}
