import type { OwnerAmendmentHandoffPrRunContextResult } from '../../../src/owner-amendment/owner-amendment-handoff-pr-run-context.mjs';

declare const result: OwnerAmendmentHandoffPrRunContextResult;
if (result.status === 'SELECTED_OWNER_AMENDMENT_HANDOFF_PR_RUN_CONTEXT') {
  const baseSha: string = result.baseSha;
}
const contradictory = { status: 'INCOMPLETE' as const, reason: 'incomplete', baseSha: 'a'.repeat(40) };
const contradiction: OwnerAmendmentHandoffPrRunContextResult = contradictory;
void contradiction;
