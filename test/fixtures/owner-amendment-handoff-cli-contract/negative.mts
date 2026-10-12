import { runOwnerAmendmentHandoff } from '../../../src/owner-amendment-handoff-cli.mjs';
import type { OwnerAmendmentHandoffPrRunContextResult } from '../../../src/owner-amendment/owner-amendment-handoff-pr-run-context.mts';

const selectedContext: OwnerAmendmentHandoffPrRunContextResult = {
  status: 'SELECTED_OWNER_AMENDMENT_HANDOFF_PR_RUN_CONTEXT',
  repository: 'flair-agency/architecture-gatekeeper', repositoryId: 1,
  baseSha: 'a'.repeat(40), bPrNumber: '201', bHeadSha: 'b'.repeat(40),
  aPrNumber: '199', aHeadSha: 'c'.repeat(40), runId: '55', runAttempt: '2',
  workflowPath: '.github/workflows/self-architecture-gate.yml', runHeadSha: 'c'.repeat(40), runRepositoryId: 1,
};
runOwnerAmendmentHandoff({ runGit: async () => Buffer.alloc(0) });
runOwnerAmendmentHandoff({ selectContext: async () => ({ status: 'SELECTED_OWNER_AMENDMENT_HANDOFF_PR_RUN_CONTEXT' }) });
runOwnerAmendmentHandoff({ now: () => '2026-01-01' });
const result = runOwnerAmendmentHandoff();
result.then(value => {
  if (value.status === 'INCOMPLETE') {
    const falselyNarrowedReason: string = value.reason;
    value.status = 'TAG_TRANSPORTED_AND_READ_BACK';
    void falselyNarrowedReason;
  }
});
void selectedContext;
