import { composeOwnerAmendmentMergeGroupEvidence } from '../../../src/owner-amendment-merge-group-evidence.mjs';
import type {
  ComposeOwnerAmendmentMergeGroupEvidenceInput,
  OwnerAmendmentMergeGroupEvidenceResult,
} from '../../../src/owner-amendment/owner-amendment-merge-group-evidence.mts';

declare const external: unknown;
declare const thenable: PromiseLike<unknown>;
declare const result: OwnerAmendmentMergeGroupEvidenceResult;
const wrongRunGit: ComposeOwnerAmendmentMergeGroupEvidenceInput = { runGit: external };
const unknownRepositoryAsString: string = result.repository;
const digestAsUnknown: unknown = result.policySha256;
result.status = 'INCOMPLETE';
const successStatus: 'VERIFIED_OWNER_AMENDMENT_MERGE_GROUP_EVIDENCE' = result.status;
const unsupportedThenableVerifier: ComposeOwnerAmendmentMergeGroupEvidenceInput = { verifyEvidence: () => thenable };
const asyncResolver: ComposeOwnerAmendmentMergeGroupEvidenceInput = { resolveGitContext: async () => ({}) };
void [composeOwnerAmendmentMergeGroupEvidence, wrongRunGit, unknownRepositoryAsString, digestAsUnknown, successStatus, unsupportedThenableVerifier, asyncResolver];
