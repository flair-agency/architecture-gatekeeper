import { selectOwnerAmendmentMergeGroupBContext } from '../../../src/owner-amendment/owner-amendment-merge-group-b-context.mts';

const result = await selectOwnerAmendmentMergeGroupBContext({ event: {}, token: 'token' });
if (result.status === 'SELECTED_OWNER_AMENDMENT_MERGE_GROUP_B_CONTEXT') {
  const repositoryId: string = result.repositoryId;
  const queueState: string = result.queueEntryState;
  result.repository = 'changed/repository';
  void [repositoryId, queueState];
} else {
  const repository: string = result.repository;
  void repository;
}
