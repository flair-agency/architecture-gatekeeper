import { finalizeOwnerAddition, verifyG0TagObjectEvidence, verifyMergeAncestorComparison, summarizeG0TagRefReadback, readG0TagObjectReadback } from '../../../src/owner-addition-finalize.mts';
import { runOwnerAdditionFinalizeCli, type OwnerAdditionFinalizerInput, type OwnerAdditionFinalizerFetch } from '../../../src/owner-addition/finalize-owner-addition.mts';

finalizeOwnerAddition({ repository: 'example/repo' });
const wrongCompletion: Promise<void> = finalizeOwnerAddition({ repository: 'example/repo', pullRequestNumber: 1, githubToken: 'token', runId: '1' });
const invalidFetch: OwnerAdditionFinalizerFetch = (url: number) => null;
const record: string = verifyG0TagObjectEvidence({}, {});
const ancestors: string[] = verifyMergeAncestorComparison({}, 'a'.repeat(40), 'b'.repeat(40));
runOwnerAdditionFinalizeCli(['unused']);
const input = {} as OwnerAdditionFinalizerInput;
const repository: string = input.repository;
const ref = summarizeG0TagRefReadback({}, 'refs/tags/example', 'c'.repeat(40));
if (ref.status !== 'unavailable') {
  const oid: string = ref.observedObjectOid;
  void oid;
}
const response = await readG0TagObjectReadback({}, {});
if (response.status === 'verified') {
  const inferredRecord: Record<string, unknown> = response.additionRecord;
  void inferredRecord;
}
void [wrongCompletion, invalidFetch, record, ancestors, repository];
