import { selectOwnerAmendmentMergeGroupBContext } from './owner-amendment-merge-group-b-context.mjs';
import { composeOwnerAmendmentMergeGroupEvidence } from './owner-amendment-merge-group-evidence.mjs';
import { parseGithubMergeGroupEvent } from './github-merge-group-event.mjs';

const SHA1 = /^[a-f0-9]{40}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const ID = /^[a-z][a-z0-9-]{0,63}$/;
const POSITIVE_INTEGER = /^[1-9]\d*$/;
const REPOSITORY = /^[A-Za-z0-9][A-Za-z0-9-]*\/[A-Za-z0-9][A-Za-z0-9._-]*$/;
const matches = (pattern, value) => typeof value === 'string' && pattern.test(value);
const fail = message => { throw new Error(`Owner amendment merge-group BLOCK bridge: ${message}`); };

/** Select exact B from a merge-group event and verify its protected BLOCK evidence. */
export async function composeOwnerAmendmentMergeGroupBlockInputs({ event, token, fetchImpl,
  selectB = selectOwnerAmendmentMergeGroupBContext,
  composeEvidence = composeOwnerAmendmentMergeGroupEvidence, ...evidenceOptions } = {}) {
  try {
    const parsedEvent = parseGithubMergeGroupEvent(event);
    if (parsedEvent?.status !== 'PARSED_MERGE_GROUP_EVENT') fail(parsedEvent?.reason ?? 'merge-group event is invalid.');
    const selected = await selectB({ event, token, fetchImpl });
    if (selected?.status !== 'SELECTED_OWNER_AMENDMENT_MERGE_GROUP_B_CONTEXT') {
      fail(selected?.reason ?? 'exact B context could not be selected.');
    }
    if (selected.repository !== parsedEvent.repository ||
        selected.mergeGroupBaseSha !== parsedEvent.baseSha || selected.mergeGroupHeadSha !== parsedEvent.headSha ||
        selected.bBaseSha !== parsedEvent.baseSha || !matches(SHA1, selected.bHeadSha) ||
        !matches(POSITIVE_INTEGER, selected.bPrNumber)) {
      fail('selected B does not bind the parsed event repository, merge-group base/head, and exact protected base.');
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
    if (!matches(REPOSITORY, evidence.repository) || !matches(SHA1, evidence.baseSha) ||
        !matches(SHA1, evidence.bSha) || !matches(SHA1, evidence.policyRevision) ||
        !matches(SHA256, evidence.policySha256) || !matches(ID, evidence.authorityId) ||
        !matches(SHA256, evidence.previousAuthoritySha256) || !matches(SHA256, evidence.proposedAuthoritySha256) ||
        !matches(SHA256, evidence.reviewRecordSha256) || !matches(SHA256, evidence.amendmentRecordSha256) ||
        !matches(SHA256, evidence.attestationBundleSha256) || !matches(SHA1, evidence.tagObjectOid) ||
        !matches(SHA1, evidence.observedTagRefOid) || !matches(POSITIVE_INTEGER, evidence.producerRunId) ||
        !matches(POSITIVE_INTEGER, evidence.producerRunAttempt)) {
      fail('verified evidence contains missing or malformed provenance fields.');
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
