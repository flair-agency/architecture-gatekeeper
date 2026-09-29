import { selectOwnerAmendmentMergeGroupBContext } from './owner-amendment-merge-group-b-context.mjs';
import { composeOwnerAmendmentMergeGroupEvidence } from './owner-amendment-merge-group-evidence.mjs';

const fail = message => { throw new Error(`Owner amendment merge-group BLOCK bridge: ${message}`); };

/** Select exact B from a merge-group event and verify its protected BLOCK evidence. */
export async function composeOwnerAmendmentMergeGroupBlockInputs({ event, token, fetchImpl,
  selectB = selectOwnerAmendmentMergeGroupBContext,
  composeEvidence = composeOwnerAmendmentMergeGroupEvidence, ...evidenceOptions } = {}) {
  try {
    const selected = await selectB({ event, token, fetchImpl });
    if (selected?.status !== 'SELECTED_OWNER_AMENDMENT_MERGE_GROUP_B_CONTEXT') {
      fail(selected?.reason ?? 'exact B context could not be selected.');
    }
    if (selected.bBaseSha !== selected.mergeGroupBaseSha || selected.repository !== event?.repository?.full_name ||
        typeof selected.bHeadSha !== 'string' || !selected.bHeadSha) {
      fail('selected B does not bind the event repository and exact protected base.');
    }

    const evidence = await composeEvidence({
      ...evidenceOptions,
      repository: selected.repository,
      baseSha: selected.bBaseSha,
      bSha: selected.bHeadSha,
      token,
      fetchImpl,
    });
    if (evidence?.status !== 'VERIFIED_OWNER_AMENDMENT_MERGE_GROUP_EVIDENCE' ||
        evidence.repository !== selected.repository || evidence.baseSha !== selected.bBaseSha ||
        evidence.bSha !== selected.bHeadSha || evidence.policyRevision !== selected.bBaseSha) {
      fail(evidence?.reason ?? 'verified evidence does not bind exact selected B and protected base.');
    }

    return Object.freeze({ status: 'VERIFIED_OWNER_AMENDMENT_MERGE_GROUP_BLOCK_INPUTS',
      repository: selected.repository, baseSha: selected.bBaseSha, bSha: selected.bHeadSha,
      bPrNumber: selected.bPrNumber, policyRevision: evidence.policyRevision,
      policySha256: evidence.policySha256, authorityId: evidence.authorityId,
      previousAuthoritySha256: evidence.previousAuthoritySha256,
      proposedAuthoritySha256: evidence.proposedAuthoritySha256,
      reviewRecordSha256: evidence.reviewRecordSha256,
      amendmentRecordSha256: evidence.amendmentRecordSha256,
      attestationBundleSha256: evidence.attestationBundleSha256,
      tagObjectOid: evidence.tagObjectOid, observedTagRefOid: evidence.observedTagRefOid,
      producerRunId: evidence.producerRunId, producerRunAttempt: evidence.producerRunAttempt });
  } catch (error) {
    return Object.freeze({ status: 'INCOMPLETE', reason: error.message });
  }
}
