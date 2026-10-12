import {
  prepareOwnerAmendmentMergeGroupOrdinaryReview,
  type PreparedMergeGroupOrdinaryReview,
  type VerifiedMergeGroupOrdinaryPass,
} from '../../../src/owner-amendment/owner-amendment-merge-group-ordinary-review.mts';
import type { SynchronousGitCommand } from '../../../src/owner-amendment/owner-amendment-git-changes.mts';

declare const prepared: PreparedMergeGroupOrdinaryReview;
declare const result: VerifiedMergeGroupOrdinaryPass;
const bSha: string = prepared.headSha;
prepared.baseSha = 'fixed';
prepared.inputDigests.policy = 'changed';
const digest: string = result.authoritySetDigest;
void [bSha, digest];
const asynchronousGitCallback: SynchronousGitCommand = async _args => Buffer.from('commit');
void asynchronousGitCallback;
