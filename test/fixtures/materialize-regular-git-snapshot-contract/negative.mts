import { materializeRegularGitSnapshot } from '../../../src/materialize-regular-git-snapshot.mjs';

declare const input: Parameters<typeof materializeRegularGitSnapshot>[0];

// The runtime guard reads outputPath and rejects its falsy absence.
const missingOutput: Parameters<typeof materializeRegularGitSnapshot>[0] = {
  root: input.root,
  commit: input.commit,
  path: input.path,
};
const result = materializeRegularGitSnapshot(input);
// The output path is a copied observation, not authenticated as a string.
const assertedPath: string = result.path;
// sha256 is the computed digest string.
const wrongDigest: number = result.sha256;
void [missingOutput, assertedPath, wrongDigest];
