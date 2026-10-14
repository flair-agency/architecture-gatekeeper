import { materializeRegularGitSnapshot } from '../../../src/materialize-regular-git-snapshot.mjs';
import { runMaterializeRegularGitSnapshotCli } from '../../../src/review-inputs/materialize-regular-git-snapshot.mts';

declare const inputFields: {
  root: unknown;
  commit: unknown;
  path: unknown;
  outputPath: unknown;
  maxBytes: unknown;
};

const result = materializeRegularGitSnapshot(inputFields);
const observedPath: unknown = result.path;
const computedDigest: string = result.sha256;
const cliResult: void = runMaterializeRegularGitSnapshotCli();
void [observedPath, computedDigest, cliResult];
