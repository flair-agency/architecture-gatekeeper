import {
  createOwnerAmendmentMergeGroupAcceptanceVerifier,
  type OwnerAmendmentMergeGroupAcceptanceAdapters,
} from '../../../src/owner-amendment/owner-amendment-merge-group-acceptance.mts';

declare const external: unknown;
const complete: OwnerAmendmentMergeGroupAcceptanceAdapters = {
  selectBContext: () => ({}),
  resolveProtectedPolicy: () => ({}),
  verifyTrigger: () => ({}),
  verifyTag: () => ({}),
  resolveEligibilityReviewInputs: () => ({}),
  verifyEligibility: () => ({}),
  runtime: { repository: external, revision: external },
};

const { selectBContext: _selectBContext, ...withoutSelectBContext } = complete;
const { resolveProtectedPolicy: _resolveProtectedPolicy, ...withoutProtectedPolicy } = complete;
const { verifyTrigger: _verifyTrigger, ...withoutTrigger } = complete;
const { verifyTag: _verifyTag, ...withoutTag } = complete;
const { resolveEligibilityReviewInputs: _resolveEligibilityReviewInputs, ...withoutReviewInputs } = complete;
const { verifyEligibility: _verifyEligibility, ...withoutEligibility } = complete;
const { runtime: _runtime, ...withoutRuntime } = complete;
void [_selectBContext, _resolveProtectedPolicy, _verifyTrigger, _verifyTag, _resolveEligibilityReviewInputs, _verifyEligibility, _runtime];

// @ts-expect-error selectBContext is required by the constructor's runtime guard.
createOwnerAmendmentMergeGroupAcceptanceVerifier(withoutSelectBContext);
// @ts-expect-error resolveProtectedPolicy is required by the constructor's runtime guard.
createOwnerAmendmentMergeGroupAcceptanceVerifier(withoutProtectedPolicy);
// @ts-expect-error verifyTrigger is required by the constructor's runtime guard.
createOwnerAmendmentMergeGroupAcceptanceVerifier(withoutTrigger);
// @ts-expect-error verifyTag is required by the constructor's runtime guard.
createOwnerAmendmentMergeGroupAcceptanceVerifier(withoutTag);
// @ts-expect-error resolveEligibilityReviewInputs is required by the constructor's runtime guard.
createOwnerAmendmentMergeGroupAcceptanceVerifier(withoutReviewInputs);
// @ts-expect-error verifyEligibility is required by the constructor's runtime guard.
createOwnerAmendmentMergeGroupAcceptanceVerifier(withoutEligibility);
// @ts-expect-error runtime is required by the constructor's exact-key validation.
createOwnerAmendmentMergeGroupAcceptanceVerifier(withoutRuntime);
// @ts-expect-error constructor requires the adapter object.
createOwnerAmendmentMergeGroupAcceptanceVerifier();
// @ts-expect-error an empty object omits every required collaborator and runtime.
createOwnerAmendmentMergeGroupAcceptanceVerifier({});

// @ts-expect-error runtime identity requires repository and revision.
createOwnerAmendmentMergeGroupAcceptanceVerifier({ ...complete, runtime: {} });
// @ts-expect-error runtime identity rejects null.
createOwnerAmendmentMergeGroupAcceptanceVerifier({ ...complete, runtime: null });
// @ts-expect-error runtime repository is required.
createOwnerAmendmentMergeGroupAcceptanceVerifier({ ...complete, runtime: { revision: external } });
// @ts-expect-error runtime revision is required.
createOwnerAmendmentMergeGroupAcceptanceVerifier({ ...complete, runtime: { repository: external } });
