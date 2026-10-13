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

// selectBContext is required by the constructor's runtime guard.
createOwnerAmendmentMergeGroupAcceptanceVerifier(withoutSelectBContext);
// resolveProtectedPolicy is required by the constructor's runtime guard.
createOwnerAmendmentMergeGroupAcceptanceVerifier(withoutProtectedPolicy);
// verifyTrigger is required by the constructor's runtime guard.
createOwnerAmendmentMergeGroupAcceptanceVerifier(withoutTrigger);
// verifyTag is required by the constructor's runtime guard.
createOwnerAmendmentMergeGroupAcceptanceVerifier(withoutTag);
// resolveEligibilityReviewInputs is required by the constructor's runtime guard.
createOwnerAmendmentMergeGroupAcceptanceVerifier(withoutReviewInputs);
// verifyEligibility is required by the constructor's runtime guard.
createOwnerAmendmentMergeGroupAcceptanceVerifier(withoutEligibility);
// runtime is required by the constructor's exact-key validation.
createOwnerAmendmentMergeGroupAcceptanceVerifier(withoutRuntime);
// constructor requires the adapter object.
createOwnerAmendmentMergeGroupAcceptanceVerifier();
// an empty object omits every required collaborator and runtime.
createOwnerAmendmentMergeGroupAcceptanceVerifier({});

// runtime identity requires repository and revision.
createOwnerAmendmentMergeGroupAcceptanceVerifier({ ...complete, runtime: {} });
// runtime identity rejects null.
createOwnerAmendmentMergeGroupAcceptanceVerifier({ ...complete, runtime: null });
// runtime repository is required.
createOwnerAmendmentMergeGroupAcceptanceVerifier({ ...complete, runtime: { revision: external } });
// runtime revision is required.
createOwnerAmendmentMergeGroupAcceptanceVerifier({ ...complete, runtime: { repository: external } });
