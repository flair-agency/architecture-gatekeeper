import type {
  OwnerAmendmentContextFetch,
  OwnerAmendmentWorkflowRunMergeGroupContextInput,
  OwnerAmendmentWorkflowRunMergeGroupContextResult,
} from '../../../src/owner-amendment/owner-amendment-workflow-run-merge-group-context.mjs';
const wrongUrl: OwnerAmendmentContextFetch = (url: number) => ({ status: 200, json: () => url });
const wrongResponse: OwnerAmendmentContextFetch = () => ({ status: '200', json: 7 });
const wrongExpected: OwnerAmendmentWorkflowRunMergeGroupContextInput = { event: {}, token: 't', expected: 17, fetchImpl: 7 };
const incompleteWithSelection = { status: 'INCOMPLETE', reason: 'failed', runId: 7 } as const;
const invalidResult: OwnerAmendmentWorkflowRunMergeGroupContextResult = incompleteWithSelection;
declare const result: OwnerAmendmentWorkflowRunMergeGroupContextResult;
const reasonAsNumber: number = result.status === 'INCOMPLETE' ? result.reason : 0;
const queueStateAsString: string = result.status === 'INCOMPLETE' ? '' : result.queueEntryState;
const enqueuedAtAsString: string = result.status === 'INCOMPLETE' ? '' : result.queueEntryEnqueuedAt;
void [wrongUrl, wrongResponse, wrongExpected, invalidResult, reasonAsNumber, queueStateAsString, enqueuedAtAsString];
const headAsString: string = result.status === 'INCOMPLETE' ? '' : result.workflowRunHeadSha;
