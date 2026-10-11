import { runOwnerAmendmentOwnerDecisionHandoff, type OwnerAmendmentOwnerDecisionHandoffCliResult } from '../../../src/owner-amendment/owner-amendment-owner-decision-handoff-cli.mts';

import type { OwnerAmendmentOwnerDecisionHandoffCliInput } from '../../../src/owner-amendment/owner-amendment-owner-decision-handoff-cli.mts';
const invalidRunner: OwnerAmendmentOwnerDecisionHandoffCliInput = {
  runGit: async () => Buffer.alloc(0),
};
void invalidRunner;

declare const outcome: OwnerAmendmentOwnerDecisionHandoffCliResult;
if (outcome.status === 'OWNER_DECISION_TAG_TRANSPORTED_AND_READ_BACK') {
  const hash: string = outcome.tagObjectSha;
  void hash;
  const reason: string = outcome.reason;
  void reason;
}
