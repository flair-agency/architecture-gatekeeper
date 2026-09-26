#!/usr/bin/env node
import { writeFileSync } from 'node:fs';
import { readRegularGitSnapshot } from './legacy-git-snapshot.mjs';

export function materializeRegularGitSnapshot({ root, commit, path, outputPath, maxBytes }) {
  if (!outputPath) throw new Error('Missing committed snapshot output path.');
  const snapshot = readRegularGitSnapshot({ root, commit, path, maxBytes });
  writeFileSync(outputPath, snapshot.bytes, { mode: 0o600 });
  return { path, sha256: snapshot.sha256 };
}

if (process.argv[1]?.endsWith('/materialize-regular-git-snapshot.mjs')) {
  const [, , commit, path, outputPath] = process.argv;
  if (!commit || !path || !outputPath) throw new Error('Usage: materialize-regular-git-snapshot.mjs <commit> <path> <output-path>');
  const result = materializeRegularGitSnapshot({ root: process.env.GITHUB_WORKSPACE, commit, path, outputPath });
  if (process.env.GITHUB_OUTPUT) writeFileSync(process.env.GITHUB_OUTPUT, `sha256=${result.sha256}\n`, { flag: 'a' });
}
