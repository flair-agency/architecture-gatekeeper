import { verifyOwnerAdditionReadback } from '../../../src/github-owner-addition-readback.mjs';
import type { GitHubOwnerAdditionReadbackInput, GitHubOwnerAdditionReadbackResult } from '../../../src/github/github-owner-addition-readback.mjs';
const external: unknown = {};
const input: GitHubOwnerAdditionReadbackInput = { repository: external, expected: external,
  pullRequest: external, mergeCommit: external, targetRef: external, targetCommit: external };
const result: GitHubOwnerAdditionReadbackResult = verifyOwnerAdditionReadback(external);
void verifyOwnerAdditionReadback(input);
const targetSha: unknown = result.targetReadback.targetSha;
const parent: unknown = result.merge.commit.parents[0];
const digest: string = result.targetReadback.authorityDigest;
const mergedAt: string = result.merge.hostMetadata.mergedAt;
void [targetSha, parent, digest, mergedAt];
