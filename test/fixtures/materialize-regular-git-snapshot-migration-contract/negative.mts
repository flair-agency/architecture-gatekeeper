import { materializeRegularGitSnapshot } from '../../../src/materialize-regular-git-snapshot.mts';
import { runMaterializeRegularGitSnapshotCli } from '../../../src/review-inputs/materialize-regular-git-snapshot.mts';

declare const input: Parameters<typeof materializeRegularGitSnapshot>[0];

const missingOutput = materializeRegularGitSnapshot({ root: input.root, commit: input.commit, path: input.path });
const claimedAuthenticatedPath: string = materializeRegularGitSnapshot(input).path;
const wrongDigest: number = materializeRegularGitSnapshot(input).sha256;
runMaterializeRegularGitSnapshotCli('unchecked argument');
void [missingOutput, claimedAuthenticatedPath, wrongDigest];
