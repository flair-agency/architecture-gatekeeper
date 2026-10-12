import {
  createOwnerAmendmentMergeGroupAcceptanceVerifier,
  type OwnerAmendmentMergeGroupAcceptanceAdapters,
  type OwnerAmendmentMergeGroupAcceptanceVerifier,
  type OwnerAmendmentMergeGroupAcceptanceResult,
} from '../../../src/owner-amendment/owner-amendment-merge-group-acceptance.mts';
import { createOwnerAmendmentMergeGroupAcceptanceVerifier as createFlat } from '../../../src/owner-amendment-merge-group-acceptance.mjs';

class ImmediateThenable<T> implements PromiseLike<T> {
  readonly #promise: Promise<T>;
  constructor(value: T) { this.#promise = Promise.resolve(value); }
  then<TResult1 = T, TResult2 = never>(
    onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return this.#promise.then(onfulfilled, onrejected);
  }
}

declare const external: unknown;
const adapters: OwnerAmendmentMergeGroupAcceptanceAdapters = {
  selectBContext: ({ event }) => { const raw: unknown = event; void raw; return { selection: external }; },
  resolveProtectedPolicy: ({ selection, baseSha }) => {
    const rawSelection: unknown = selection, rawBase: unknown = baseSha;
    void [rawSelection, rawBase];
    return new ImmediateThenable({ policy: external });
  },
  verifyTrigger: ({ selection, policy }) => { void [selection, policy]; return { trigger: external }; },
  verifyTag: ({ selection, policy, trigger }) => {
    void [selection, policy, trigger];
    return new ImmediateThenable({ tag: external });
  },
  resolveEligibilityReviewInputs: ({ selection, policy, trigger, tag }) => {
    void [selection, policy, trigger, tag];
    return { reviewInputs: external };
  },
  verifyEligibility: ({ selection, policy, trigger, tag }) => {
    void [selection, policy, trigger, tag];
    return new ImmediateThenable({ eligibility: external });
  },
  runtime: { repository: external, revision: external },
  ignoredExtension: external,
};
const verifier: OwnerAmendmentMergeGroupAcceptanceVerifier = createOwnerAmendmentMergeGroupAcceptanceVerifier(adapters);
const flatVerifier = createFlat(adapters);
const pendingResult: Promise<OwnerAmendmentMergeGroupAcceptanceResult> = verifier.verify(external);
const result: OwnerAmendmentMergeGroupAcceptanceResult = await flatVerifier.verify(external);
if (result.status === 'VERIFIED_OWNER_AMENDMENT_G0_FOR_TRANSITION') {
  const eligible: 'eligible' = result.eligibility;
  const adoption: 'pending' = result.adoption;
  const rawRepository: unknown = result.repository;
  const changes: unknown = result.changes;
  const authentication: 'not_verified' = result.assurance.principalAuthentication;
  void [eligible, adoption, rawRepository, changes, authentication];
} else {
  const reason: unknown = result.reason;
  void reason;
}
void pendingResult;
