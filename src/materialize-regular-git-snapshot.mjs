#!/usr/bin/env node
// @ts-check
import { writeFileSync } from 'node:fs';
import { readRegularGitSnapshot } from './legacy-git-snapshot.mjs';
import { trustedGitHubWorkspaceRoot } from './github-runner-workspace.mjs';

/**
 * Materialize the selected committed snapshot using the existing Git reader.
 * Inputs and the returned path remain caller observations; this helper does not
 * authenticate the output destination or establish artifact custody.
 * @param {{root: unknown, commit: unknown, path: unknown, outputPath: unknown, maxBytes?: unknown}} input
 * @returns {{path: unknown, sha256: string}}
 */
export function materializeRegularGitSnapshot({ root, commit, path, outputPath, maxBytes }) {
  if (!outputPath) throw new Error('Missing committed snapshot output path.');
  // The selected reader retains its runtime checks for root, commit, path and maxBytes.
  // @ts-expect-error The Git reader owns validation for these caller observations.
  const snapshot = readRegularGitSnapshot({ root, commit, path, maxBytes });
  // @ts-expect-error Keep the original destination observation for native path/fd validation.
  writeFileSync(outputPath, snapshot.bytes, { mode: 0o600 });
  return { path, sha256: snapshot.sha256 };
}

if (process.argv[1]?.endsWith('/materialize-regular-git-snapshot.mjs')) {
  const [, , commit, path, outputPath] = process.argv;
  if (!commit || !path || !outputPath) throw new Error('Usage: materialize-regular-git-snapshot.mjs <commit> <path> <output-path>');
  const result = materializeRegularGitSnapshot({ root: trustedGitHubWorkspaceRoot(), commit, path, outputPath });
  if (process.env.GITHUB_OUTPUT) writeFileSync(process.env.GITHUB_OUTPUT, `sha256=${result.sha256}\n`, { flag: 'a' });
}
