import { verifyOwnerAmendmentOwnerDecisionContext as verifyFlat } from '../../../src/owner-amendment-owner-decision-context-verifier.mjs';
import {
  verifyOwnerAmendmentOwnerDecisionContext,
  type OwnerAmendmentOwnerDecisionContextInput,
  type OwnerAmendmentOwnerDecisionContextResult,
} from '../../../src/owner-amendment/owner-amendment-owner-decision-context-verifier.mts';

declare const external: unknown;
const input: OwnerAmendmentOwnerDecisionContextInput = { tagEnvelope: external, trustedContext: external };
const flatResult: OwnerAmendmentOwnerDecisionContextResult = verifyFlat(input);
const physicalResult = verifyOwnerAmendmentOwnerDecisionContext(input);
if (physicalResult.status === 'VERIFIED_OWNER_DECISION_AMENDMENT_CONTEXT') {
  const repo: unknown = physicalResult.repository;
  const change: Readonly<Record<string, unknown>> = physicalResult.changes[0];
  const digest: string = physicalResult.reviewRecordSha256;
  void [repo, change, digest];
} else {
  const reason: unknown = physicalResult.reason;
  void reason;
}
void flatResult;
