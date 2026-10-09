import type {
  OwnerAmendmentContextFetch,
  OwnerAmendmentWorkflowRunMergeGroupContextInput,
  OwnerAmendmentWorkflowRunMergeGroupContextResult,
} from '../../../src/owner-amendment/owner-amendment-workflow-run-merge-group-context.mjs';
import { resolveOwnerAmendmentWorkflowRunMergeGroupContext } from '../../../src/owner-amendment/owner-amendment-workflow-run-merge-group-context.mjs';

function thenable<T>(value: T): PromiseLike<T> { return Promise.resolve<T>(value); }
const response = { status: 200, json: () => ({ external: 'unknown' }) };
const syncFetch: OwnerAmendmentContextFetch = () => response;
const promiseFetch: OwnerAmendmentContextFetch = async () => ({ status: 200, json: async (): Promise<unknown> => ({ external: 'unknown' }) });
const thenableFetch: OwnerAmendmentContextFetch = () => thenable({ status: 200, json: () => thenable<unknown>(17) });
const input: OwnerAmendmentWorkflowRunMergeGroupContextInput = {
  event: { workflow_run: { id: 7, run_attempt: 2 } }, token: 'token',
  expected: { repository: 'owner/repo', repositoryId: 1, workflowId: 2, workflowPath: '.github/workflows/check.yml', targetBranch: 'main' },
  fetchImpl: thenableFetch,
};
declare const result: OwnerAmendmentWorkflowRunMergeGroupContextResult;
if (result.status === 'INCOMPLETE') {
  const reason: string = result.reason;
  void reason;
} else {
  const runId: number = result.runId;
  const headSha: unknown = result.workflowRunHeadSha;
  const queueState: unknown = result.queueEntryState;
  const enqueuedAt: unknown = result.queueEntryEnqueuedAt;
  if (typeof result.queueEntryState === 'string') {
    const narrowedState: string = result.queueEntryState;
    void narrowedState;
  }
  void [runId, headSha, queueState, enqueuedAt];
}
void [resolveOwnerAmendmentWorkflowRunMergeGroupContext(input), syncFetch, promiseFetch];

void resolveOwnerAmendmentWorkflowRunMergeGroupContext();
