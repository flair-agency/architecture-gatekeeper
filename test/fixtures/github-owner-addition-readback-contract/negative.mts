import type { GitHubOwnerAdditionReadbackResult } from '../../../src/github/github-owner-addition-readback.mjs';
declare const result: GitHubOwnerAdditionReadbackResult;
const trustedSha: string = result.targetReadback.targetSha;
result.targetReadback.authorityDigest = 'changed';
const trustedParent: string = result.merge.commit.parents[0];
const wrongStatus: 'complete' = result.merge.hostMetadata.status;
void [trustedSha, trustedParent, wrongStatus];
