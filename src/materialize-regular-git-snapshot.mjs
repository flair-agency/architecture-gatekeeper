#!/usr/bin/env node
// @ts-check
import { runMaterializeRegularGitSnapshotCli } from './review-inputs/materialize-regular-git-snapshot.mts';
export { materializeRegularGitSnapshot } from './review-inputs/materialize-regular-git-snapshot.mts';

if (process.argv[1]?.endsWith('/materialize-regular-git-snapshot.mjs')) {
  runMaterializeRegularGitSnapshotCli();
}
