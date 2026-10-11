import { selectOwnerAmendmentMergeGroupBContext } from '../owner-amendment-merge-group-b-context.mjs';
import { composeOwnerAmendmentMergeGroupEvidence } from '../owner-amendment-merge-group-evidence.mjs';
import { parseGithubMergeGroupEvent } from '../github-merge-group-event.mjs';

const SHA1 = /^[a-f0-9]{40}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const ID = /^[a-z][a-z0-9-]{0,63}$/;
const POSITIVE_INTEGER = /^[1-9]\d*$/;
const REPOSITORY = /^[A-Za-z0-9][A-Za-z0-9-]*\/[A-Za-z0-9][A-Za-z0-9._-]*$/;
const matches = (pattern: RegExp, value: unknown): boolean => typeof value === 'string' && pattern.test(value);
const fail: (message: unknown) => never = message => { throw new Error(`Owner amendment merge-group BLOCK bridge: ${message}`); };

export type OwnerAmendmentBridgeAwaitable<T> = T | PromiseLike<T>;
export type OwnerAmendmentBridgeFetchResponse = Readonly<{
  ok?: unknown; status?: unknown; json?: () => unknown | PromiseLike<unknown>; body?: unknown;
}>;
export type OwnerAmendmentBridgeFetch = (
  input: string,
  options: { headers: Record<string, string>; redirect: 'error'; method?: string; body?: string },
) => OwnerAmendmentBridgeFetchResponse | PromiseLike<OwnerAmendmentBridgeFetchResponse>;

type SelectBInput = { event: unknown; token: unknown; fetchImpl?: OwnerAmendmentBridgeFetch };
type EvidenceInput = Record<string, unknown> & {
  repository: unknown; baseSha: unknown; bSha: unknown; token: unknown; fetchImpl?: OwnerAmendmentBridgeFetch;
};
type SelectBOperation = (input: SelectBInput) => OwnerAmendmentBridgeAwaitable<unknown>;
type ComposeEvidenceOperation = (input: EvidenceInput) => OwnerAmendmentBridgeAwaitable<unknown>;

export type ComposeOwnerAmendmentMergeGroupBlockInputsInput = {
  event?: unknown;
  token?: unknown;
  fetchImpl?: OwnerAmendmentBridgeFetch;
  selectB?: SelectBOperation;
  composeEvidence?: ComposeEvidenceOperation;
  [key: string]: unknown;
};

type SelectedContextView = {
  status?: unknown; reason?: unknown; repository?: unknown; mergeGroupBaseSha?: unknown; mergeGroupHeadSha?: unknown;
  bBaseSha?: unknown; bHeadSha?: unknown; bPrNumber?: unknown;
};
type EvidenceView = {
  status?: unknown; reason?: unknown; repository?: unknown; baseSha?: unknown; bSha?: unknown; policyRevision?: unknown;
  policySha256?: unknown; authorityId?: unknown; previousAuthoritySha256?: unknown; proposedAuthoritySha256?: unknown;
  reviewRecordSha256?: unknown; amendmentRecordSha256?: unknown; attestationBundleSha256?: unknown; tagObjectOid?: unknown;
  observedTagRefOid?: unknown; producerRunId?: unknown; producerRunAttempt?: unknown;
};

export type OwnerAmendmentMergeGroupBlockInputsResult =
  | Readonly<{
      status: 'VERIFIED_OWNER_AMENDMENT_MERGE_GROUP_BLOCK_INPUTS';
      repository: unknown; baseSha: unknown; bSha: unknown; bPrNumber: unknown; policyRevision: unknown;
      policySha256: unknown; authorityId: unknown; previousAuthoritySha256: unknown; proposedAuthoritySha256: unknown;
      reviewRecordSha256: unknown; amendmentRecordSha256: unknown; attestationBundleSha256: unknown;
      tagObjectOid: unknown; observedTagRefOid: unknown; producerRunId: unknown; producerRunAttempt: unknown;
      reason?: never;
    }>
  | Readonly<{
      status: 'INCOMPLETE'; reason: unknown;
      repository?: never; baseSha?: never; bSha?: never; bPrNumber?: never; policyRevision?: never; policySha256?: never;
      authorityId?: never; previousAuthoritySha256?: never; proposedAuthoritySha256?: never;
      reviewRecordSha256?: never; amendmentRecordSha256?: never; attestationBundleSha256?: never;
      tagObjectOid?: never; observedTagRefOid?: never; producerRunId?: never; producerRunAttempt?: never;
    }>;

/** Select exact B from a merge-group event and verify its protected BLOCK evidence. */
export async function composeOwnerAmendmentMergeGroupBlockInputs({ event, token, fetchImpl,
  selectB = selectOwnerAmendmentMergeGroupBContext as SelectBOperation,
  composeEvidence = composeOwnerAmendmentMergeGroupEvidence as ComposeEvidenceOperation, ...evidenceOptions }:
  ComposeOwnerAmendmentMergeGroupBlockInputsInput = {}): Promise<OwnerAmendmentMergeGroupBlockInputsResult> {
  try {
    const parsedEvent = parseGithubMergeGroupEvent(event);
    if (parsedEvent?.status !== 'PARSED_MERGE_GROUP_EVENT') fail(parsedEvent?.reason ?? 'merge-group event is invalid.');
    const selected = await selectB({ event, token, fetchImpl });
    if ((selected as SelectedContextView | null | undefined)?.status !== 'SELECTED_OWNER_AMENDMENT_MERGE_GROUP_B_CONTEXT') {
      fail((selected as SelectedContextView | null | undefined)?.reason ?? 'exact B context could not be selected.');
    }
    if ((selected as SelectedContextView).repository !== parsedEvent.repository ||
        (selected as SelectedContextView).mergeGroupBaseSha !== parsedEvent.baseSha || (selected as SelectedContextView).mergeGroupHeadSha !== parsedEvent.headSha ||
        (selected as SelectedContextView).bBaseSha !== parsedEvent.baseSha || !matches(SHA1, (selected as SelectedContextView).bHeadSha) ||
        !matches(POSITIVE_INTEGER, (selected as SelectedContextView).bPrNumber)) {
      fail('selected B does not bind the parsed event repository, merge-group base/head, and exact protected base.');
    }

    const evidence = await composeEvidence({
      ...evidenceOptions,
      repository: (selected as SelectedContextView).repository,
      baseSha: (selected as SelectedContextView).bBaseSha,
      bSha: (selected as SelectedContextView).bHeadSha,
      token,
      fetchImpl,
    });
    if ((evidence as EvidenceView | null | undefined)?.status !== 'VERIFIED_OWNER_AMENDMENT_MERGE_GROUP_EVIDENCE' ||
        (evidence as EvidenceView).repository !== (selected as SelectedContextView).repository || (evidence as EvidenceView).baseSha !== (selected as SelectedContextView).bBaseSha ||
        (evidence as EvidenceView).bSha !== (selected as SelectedContextView).bHeadSha || (evidence as EvidenceView).policyRevision !== (selected as SelectedContextView).bBaseSha) {
      fail((evidence as EvidenceView | null | undefined)?.reason ?? 'verified evidence does not bind exact selected B and protected base.');
    }
    if (!matches(REPOSITORY, (evidence as EvidenceView).repository) || !matches(SHA1, (evidence as EvidenceView).baseSha) ||
        !matches(SHA1, (evidence as EvidenceView).bSha) || !matches(SHA1, (evidence as EvidenceView).policyRevision) ||
        !matches(SHA256, (evidence as EvidenceView).policySha256) || !matches(ID, (evidence as EvidenceView).authorityId) ||
        !matches(SHA256, (evidence as EvidenceView).previousAuthoritySha256) || !matches(SHA256, (evidence as EvidenceView).proposedAuthoritySha256) ||
        !matches(SHA256, (evidence as EvidenceView).reviewRecordSha256) || !matches(SHA256, (evidence as EvidenceView).amendmentRecordSha256) ||
        !matches(SHA256, (evidence as EvidenceView).attestationBundleSha256) || !matches(SHA1, (evidence as EvidenceView).tagObjectOid) ||
        !matches(SHA1, (evidence as EvidenceView).observedTagRefOid) || !matches(POSITIVE_INTEGER, (evidence as EvidenceView).producerRunId) ||
        !matches(POSITIVE_INTEGER, (evidence as EvidenceView).producerRunAttempt)) {
      fail('verified evidence contains missing or malformed provenance fields.');
    }

    return Object.freeze({ status: 'VERIFIED_OWNER_AMENDMENT_MERGE_GROUP_BLOCK_INPUTS',
      repository: (selected as SelectedContextView).repository, baseSha: (selected as SelectedContextView).bBaseSha,
      bSha: (selected as SelectedContextView).bHeadSha, bPrNumber: (selected as SelectedContextView).bPrNumber,
      policyRevision: (evidence as EvidenceView).policyRevision,
      policySha256: (evidence as EvidenceView).policySha256, authorityId: (evidence as EvidenceView).authorityId,
      previousAuthoritySha256: (evidence as EvidenceView).previousAuthoritySha256,
      proposedAuthoritySha256: (evidence as EvidenceView).proposedAuthoritySha256,
      reviewRecordSha256: (evidence as EvidenceView).reviewRecordSha256,
      amendmentRecordSha256: (evidence as EvidenceView).amendmentRecordSha256,
      attestationBundleSha256: (evidence as EvidenceView).attestationBundleSha256,
      tagObjectOid: (evidence as EvidenceView).tagObjectOid, observedTagRefOid: (evidence as EvidenceView).observedTagRefOid,
      producerRunId: (evidence as EvidenceView).producerRunId, producerRunAttempt: (evidence as EvidenceView).producerRunAttempt });
  } catch (error: unknown) {
    return Object.freeze({ status: 'INCOMPLETE', reason: (error as { message: unknown }).message });
  }
}
