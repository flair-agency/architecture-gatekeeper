import {
  prepareOwnerAmendmentMergeGroupOrdinaryReview as prepareFlat,
  validateOwnerAmendmentMergeGroupOrdinaryDecision as validateFlat,
} from '../../../src/owner-amendment-merge-group-ordinary-review.mjs';
import {
  prepareOwnerAmendmentMergeGroupOrdinaryReview,
  validateOwnerAmendmentMergeGroupOrdinaryDecision,
  type MergeGroupOrdinaryReviewFetchObservation,
  type MergeGroupOrdinaryReviewFetcher,
  type PrepareMergeGroupOrdinaryReviewInput,
  type PreparedMergeGroupOrdinaryReview,
  type ValidateMergeGroupOrdinaryDecisionInput,
} from '../../../src/owner-amendment/owner-amendment-merge-group-ordinary-review.mts';

class ImmediateThenable<T> implements PromiseLike<T> {
  constructor(private readonly value: T) {}
  then<TResult1 = T, TResult2 = never>(
    onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve(this.value).then(onfulfilled, onrejected);
  }
}

declare const external: unknown;
const syncFetcher: MergeGroupOrdinaryReviewFetcher = request => ({
  repository: request.repository, resolvedCommit: request.revision, path: request.path,
  type: 'file', content: Buffer.from('external'),
});
const thenableFetcher: MergeGroupOrdinaryReviewFetcher = request => new ImmediateThenable<MergeGroupOrdinaryReviewFetchObservation>({
  repository: request.repository, resolvedCommit: request.revision, path: request.path,
  type: 'file', content: Buffer.from('external'),
});
const independentlyTypedGitRunner = (args: string[]): Buffer => Buffer.from(args.join(' '));
const input: PrepareMergeGroupOrdinaryReviewInput = {
  repository: external, baseSha: external, headSha: external, selfRoot: external,
  runGit: independentlyTypedGitRunner, fetchExternal: syncFetcher,
};
const prepared: Promise<PreparedMergeGroupOrdinaryReview> = prepareOwnerAmendmentMergeGroupOrdinaryReview(input);
const flatPrepared = prepareFlat(input);
const withThenable = prepareOwnerAmendmentMergeGroupOrdinaryReview({ ...input, fetchExternal: thenableFetcher });
const decisionInput: ValidateMergeGroupOrdinaryDecisionInput = { decisionBytes: external, expected: external, prepared: external };
const result = validateOwnerAmendmentMergeGroupOrdinaryDecision(decisionInput);
const flatResult = validateFlat(decisionInput);
const preparedStatus: 'PREPARED_FRESH_MERGE_GROUP_ORDINARY_REVIEW' = (await prepared).status;
const repository: 'flair-agency/architecture-gatekeeper' = (await prepared).repository;
const rawB: unknown = (await prepared).headSha;
const policyModel: string = (await prepared).model;
const protectedSchemaBytes: Buffer = (await prepared).schemaBytes;
const computedAuthorityDigest: string = (await prepared).authority.setDigest;
const validationStatus: 'VERIFIED_FRESH_MERGE_GROUP_ORDINARY_PASS' = result.status;
const returnedRepository: unknown = result.repository;
const returnedDigest: string = result.decisionSha256;
const returnedAuthorityDigest: unknown = result.authoritySetDigest;
void [withThenable, preparedStatus, repository, rawB, policyModel, protectedSchemaBytes,
  computedAuthorityDigest, validationStatus, returnedRepository, returnedDigest, returnedAuthorityDigest, flatPrepared, flatResult];
