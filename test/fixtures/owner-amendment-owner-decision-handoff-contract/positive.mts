import type {
  OwnerAmendmentAwaitable,
  OwnerAmendmentOwnerDecisionHandoffInput,
  OwnerAmendmentOwnerDecisionHandoffFetch,
  OwnerAmendmentOwnerDecisionExpectedArtifact,
  OwnerAmendmentOwnerDecisionHandoffResult,
  OwnerAmendmentOwnerDecisionAuthorityChange,
} from '../../../src/owner-amendment/owner-amendment-owner-decision-handoff.mts';
import type { OwnerAmendmentArtifactZipResult } from '../../../src/owner-amendment/owner-amendment-artifact-zip.mts';
import type { OwnerAmendmentAttestationResult } from '../../../src/owner-amendment/owner-amendment-attestation.mts';
import type { CreateAndReadOwnerAmendmentTagResult } from '../../../src/owner-amendment/owner-amendment-tag-adapter.mts';

const fetched = { status: 'FETCHED_OWNER_AMENDMENT_BLOCK_ARTIFACT' as const, zipBytes: Buffer.from('zip') };
const extracted: OwnerAmendmentArtifactZipResult = {
  status: 'EXTRACTED_OWNER_AMENDMENT_BLOCK_ARTIFACT',
  reviewRecordBytes: Buffer.from('{}'), attestationBundleBytes: Buffer.from('{}'),
};
const verified: OwnerAmendmentAttestationResult = { status: 'VERIFIED_PRODUCER_ATTESTATION', recordSha256: 'a'.repeat(64) };
declare const tagResult: CreateAndReadOwnerAmendmentTagResult;
const tagThenable: PromiseLike<CreateAndReadOwnerAmendmentTagResult> = {
  then<TResult1 = CreateAndReadOwnerAmendmentTagResult, TResult2 = never>(
    onfulfilled?: ((value: CreateAndReadOwnerAmendmentTagResult) => TResult1 | PromiseLike<TResult1>) | null,
    _onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve(onfulfilled ? onfulfilled(tagResult) : tagResult as unknown as TResult1);
  },
};

const callbacks: Pick<OwnerAmendmentOwnerDecisionHandoffInput, 'fetchArtifact' | 'extractArtifact' | 'verifyEvidence' | 'createTag'> = {
  fetchArtifact: () => fetched,
  extractArtifact: () => extracted,
  verifyEvidence: () => verified,
  createTag: () => tagThenable,
};
const awaitedFetchCallback: OwnerAmendmentOwnerDecisionHandoffInput['fetchArtifact'] = () => Promise.resolve(fetched);
const typedExpectedCallback: NonNullable<OwnerAmendmentOwnerDecisionHandoffInput['fetchArtifact']> = ({ expected }) => {
  const profile: 'ownerDecision' = expected.profile;
  const runId: string = expected.runId;
  const rawCandidateSha: unknown = expected.baseSha;
  void profile;
  void runId;
  void rawCandidateSha;
  return fetched;
};
declare const exactRequest: OwnerAmendmentOwnerDecisionExpectedArtifact;
void exactRequest;
const minimalSynchronousTagCallback: OwnerAmendmentOwnerDecisionHandoffInput['createTag'] = () => ({ tagReadback: { sha: 17 } });
const zipBodyOnlyFetch: OwnerAmendmentOwnerDecisionHandoffFetch = async () => ({ ok: true, status: 200, body: {} });
const standardFetch: OwnerAmendmentOwnerDecisionHandoffInput['fetchImpl'] = fetch;

declare const result: OwnerAmendmentOwnerDecisionHandoffResult;
if (result.status === 'OWNER_DECISION_TAG_TRANSPORTED_AND_READ_BACK') {
  const target: string = result.tagRef;
  const rawTransportSha: unknown = result.tagObjectSha;
  void target;
  void rawTransportSha;
} else {
  const failure: unknown = result.reason;
  void failure;
}

const readonlyChanges: readonly OwnerAmendmentOwnerDecisionAuthorityChange[] = [{ path: 'authority.md', beforeBytes: Buffer.alloc(1), afterBytes: Buffer.alloc(1) }];
void readonlyChanges;

// Promise and custom thenable outcomes are accepted only on awaited collaborators.
const awaited: OwnerAmendmentAwaitable<number> = Promise.resolve(1);
void callbacks;
void awaitedFetchCallback;
void typedExpectedCallback;
void minimalSynchronousTagCallback;
void zipBodyOnlyFetch;
void standardFetch;
void awaited;
