#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

function requireHex(value, label) {
  if (typeof value !== 'string' || !/^[0-9a-f]{40}$/.test(value)) {
    throw new Error(`${label} must be a full lowercase commit or tree SHA`);
  }
  return value;
}

export function verifyProvenance(manifest, observed) {
  if (manifest?.version !== 1) throw new Error('Unsupported Codex Action provenance version');
  for (const key of ['baseCommit', 'baseTree', 'headCommit', 'headTree']) requireHex(manifest[key], key);
  if (!Array.isArray(manifest.commits) || manifest.commits.length === 0) throw new Error('Provenance commits are required');
  if (!manifest.files || Array.isArray(manifest.files) || typeof manifest.files !== 'object') throw new Error('Provenance files are required');

  for (const key of ['baseCommit', 'baseTree', 'headCommit', 'headTree']) {
    if (observed[key] !== manifest[key]) throw new Error(`${key} does not match reviewed provenance`);
  }
  if (JSON.stringify(observed.commits) !== JSON.stringify(manifest.commits)) {
    throw new Error('Commit sequence does not match reviewed provenance');
  }
  const expectedFiles = Object.keys(manifest.files).sort();
  if (JSON.stringify(observed.changedFiles) !== JSON.stringify(expectedFiles)) {
    throw new Error('Changed file set does not match reviewed provenance');
  }
  for (const path of expectedFiles) {
    if (observed.fileHashes[path] !== manifest.files[path]) throw new Error(`${path} hash does not match reviewed provenance`);
  }
  return true;
}

function git(source, args) {
  return execFileSync('git', ['-C', source, ...args], { encoding: 'utf8' }).trim();
}

export function observeRepository(source, manifest) {
  const headCommit = git(source, ['rev-parse', 'HEAD']);
  execFileSync('git', ['-C', source, 'cat-file', '-e', `${manifest.baseCommit}^{commit}`]);
  execFileSync('git', ['-C', source, 'merge-base', '--is-ancestor', manifest.baseCommit, headCommit]);
  const changedFiles = git(source, ['diff', '--name-only', manifest.baseCommit, headCommit]).split('\n').filter(Boolean).sort();
  const fileHashes = Object.fromEntries(changedFiles.map((path) => [
    path,
    createHash('sha256').update(readFileSync(resolve(source, path))).digest('hex'),
  ]));
  return {
    baseCommit: manifest.baseCommit,
    baseTree: git(source, ['rev-parse', `${manifest.baseCommit}^{tree}`]),
    headCommit,
    headTree: git(source, ['rev-parse', 'HEAD^{tree}']),
    commits: git(source, ['rev-list', '--reverse', `${manifest.baseCommit}..${headCommit}`]).split('\n').filter(Boolean),
    changedFiles,
    fileHashes,
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [manifestPath, sourcePath] = process.argv.slice(2);
  if (!manifestPath || !sourcePath) throw new Error('Usage: verify-codex-action <manifest.json> <source-checkout>');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  verifyProvenance(manifest, observeRepository(sourcePath, manifest));
  process.stdout.write(`Verified ${manifest.repository}@${manifest.headCommit}\n`);
}
