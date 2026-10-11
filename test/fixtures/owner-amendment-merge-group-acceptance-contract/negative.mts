import { createOwnerAmendmentMergeGroupAcceptanceVerifier } from '../../../src/owner-amendment/owner-amendment-merge-group-acceptance.mts';
import type { OwnerAmendmentMergeGroupAcceptanceResult } from '../../../src/owner-amendment/owner-amendment-merge-group-acceptance.mts';

declare const external: unknown;
const verifier = createOwnerAmendmentMergeGroupAcceptanceVerifier({
  selectBContext: () => ({}), resolveProtectedPolicy: () => ({}), verifyTrigger: () => ({}), verifyTag: () => ({}),
  resolveEligibilityReviewInputs: () => ({}), verifyEligibility: () => ({}),
  runtime: { repository: external, revision: external },
});
const notAwaited: OwnerAmendmentMergeGroupAcceptanceResult = verifier.verify(external);
const result = await verifier.verify(external);
if (result.status === 'VERIFIED_OWNER_AMENDMENT_G0_FOR_TRANSITION') {
  const repository: string = result.repository;
  const changes: readonly Readonly<Record<string, unknown>>[] = result.changes;
  result.adoption = 'accepted';
  void [repository, changes];
} else {
  const reason: string = result.reason;
  const missingSuccessValue: string = result.repository;
  void [reason, missingSuccessValue];
}
void notAwaited;
