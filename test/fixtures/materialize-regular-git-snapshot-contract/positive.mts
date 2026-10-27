import { materializeRegularGitSnapshot } from '../../../src/materialize-regular-git-snapshot.mts';

declare const inputFields: {
  root: unknown;
  commit: unknown;
  path: unknown;
  outputPath: unknown;
  maxBytes: unknown;
};

const result = materializeRegularGitSnapshot(inputFields);
const computedDigest: string = result.sha256;
const returnedPath: unknown = result.path;
const inputContract: Parameters<typeof materializeRegularGitSnapshot>[0] = inputFields;
void [computedDigest, returnedPath, inputContract];
