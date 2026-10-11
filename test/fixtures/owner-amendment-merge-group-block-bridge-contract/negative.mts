import { composeOwnerAmendmentMergeGroupBlockInputs } from '../../../src/owner-amendment/owner-amendment-merge-group-block-bridge.mts';

const result = await composeOwnerAmendmentMergeGroupBlockInputs({ event: {}, token: 'token' });
if (result.status === 'VERIFIED_OWNER_AMENDMENT_MERGE_GROUP_BLOCK_INPUTS') {
  const repository: string = result.repository;
  const runId: string = result.producerRunId;
  result.repository = 'changed/repository';
  void [repository, runId];
}
