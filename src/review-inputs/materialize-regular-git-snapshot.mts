import { writeFileSync } from 'node:fs';
import { readRegularGitSnapshot } from '../legacy-git-snapshot.mjs';

export interface MaterializeRegularGitSnapshotInput {
  root: string;
  commit: string;
  path: string;
  outputPath: string;
  maxBytes?: number;
}

export interface MaterializedRegularGitSnapshot {
  path: string;
  sha256: string;
}

export function materializeRegularGitSnapshot({ root, commit, path, outputPath, maxBytes }: MaterializeRegularGitSnapshotInput): MaterializedRegularGitSnapshot {
  if (!outputPath) throw new Error('Missing committed snapshot output path.');
  const snapshot = readRegularGitSnapshot({ root, commit, path, maxBytes });
  writeFileSync(outputPath, snapshot.bytes, { mode: 0o600 });
  return { path, sha256: snapshot.sha256 };
}
