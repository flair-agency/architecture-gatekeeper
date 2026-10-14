import { writeFileSync } from 'node:fs';
import { appendGitHubOutput } from '../runner-temp-path.mjs';
import { readRegularGitSnapshot } from '../legacy-git-snapshot.mjs';
import type { GitSnapshotOptions } from '../authority-validation/legacy-git-snapshot.mts';
import { trustedGitHubWorkspaceRoot } from '../github-runner-workspace.mjs';

export interface MaterializeRegularGitSnapshotInput {
  root: unknown;
  commit: unknown;
  path: unknown;
  outputPath: unknown;
  maxBytes?: unknown;
}

export interface MaterializedRegularGitSnapshot {
  path: unknown;
  sha256: string;
}

/**
 * Materialize the selected committed snapshot using the existing Git reader.
 * Input fields and the returned path remain observations. This does not
 * authenticate the output destination or establish artifact custody.
 */
export function materializeRegularGitSnapshot({ root, commit, path, outputPath, maxBytes }: MaterializeRegularGitSnapshotInput): MaterializedRegularGitSnapshot {
  if (!outputPath) throw new Error('Missing committed snapshot output path.');
  // This erased view only connects caller observations to the reader, which retains its runtime checks.
  const snapshot = readRegularGitSnapshot({ root, commit, path, maxBytes } as GitSnapshotOptions);
  // Keep the original observation for writeFileSync's native path/fd validation.
  writeFileSync(outputPath as Parameters<typeof writeFileSync>[0], snapshot.bytes, { mode: 0o600 });
  return { path, sha256: snapshot.sha256 };
}

export function runMaterializeRegularGitSnapshotCli(): void {
  const [, , commit, path, outputPath] = process.argv;
  if (!commit || !path || !outputPath) throw new Error('Usage: materialize-regular-git-snapshot.mjs <commit> <path> <output-path>');
  const result = materializeRegularGitSnapshot({ root: trustedGitHubWorkspaceRoot(), commit, path, outputPath });
  if (process.env.GITHUB_OUTPUT) appendGitHubOutput(`sha256=${result.sha256}\n`);
}
