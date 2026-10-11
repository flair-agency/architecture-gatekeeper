import { verifyOwnerAmendmentOwnerDecisionContext } from '../../../src/owner-amendment/owner-amendment-owner-decision-context-verifier.mts';
import type { OwnerAmendmentOwnerDecisionContextResult } from '../../../src/owner-amendment/owner-amendment-owner-decision-context-verifier.mts';

verifyOwnerAmendmentOwnerDecisionContext({ tagEnvelope: {}, trustedContext: {}, extra: 'allowed input extension' });
const invalidInput: OwnerAmendmentOwnerDecisionContextResult = verifyOwnerAmendmentOwnerDecisionContext({ tagEnvelope: {} });
if (invalidInput.status === 'VERIFIED_OWNER_DECISION_AMENDMENT_CONTEXT') {
  const repository: string = invalidInput.repository;
  invalidInput.changes.push({ path: 'authority.md' });
  void repository;
}
