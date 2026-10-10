#!/usr/bin/env node
import { writeFileSync } from 'node:fs';
import { materializeRegularGitSnapshot } from './review-inputs/materialize-regular-git-snapshot.mts';
import { trustedGitHubWorkspaceRoot } from './github-runner-workspace.mjs';

export { materializeRegularGitSnapshot };

if (process.argv[1]?.endsWith('/materialize-regular-git-snapshot.mjs')) {
  const [, , commit, path, outputPath] = process.argv;
  if (!commit || !path || !outputPath) throw new Error('Usage: materialize-regular-git-snapshot.mjs <commit> <path> <output-path>');
  const result = materializeRegularGitSnapshot({ root: trustedGitHubWorkspaceRoot(), commit, path, outputPath });
  if (process.env.GITHUB_OUTPUT) writeFileSync(process.env.GITHUB_OUTPUT, `sha256=${result.sha256}\n`, { flag: 'a' });
}
