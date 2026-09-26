#!/usr/bin/env node
import { appendFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { validateMultiAuthorityProvenance } from './multi-authority-provenance.mjs';

const SHA = /^[a-f0-9]{40}(?:[a-f0-9]{24})?$/;

/** Return selected same-repository Authority Set members changed by this candidate. */
export function changedSelectedAuthorityPaths({ provenance, repository, baseSha, headSha, cwd = process.cwd(),
  execFile = execFileSync }) {
  validateMultiAuthorityProvenance(provenance);
  if (provenance.selfRepository !== repository || provenance.authorityRevision !== baseSha ||
      !SHA.test(baseSha) || !SHA.test(headSha) || baseSha.length !== headSha.length) {
    throw new Error('Procedural authority-change comparison does not match the recorded base and repository.');
  }
  const selectedPaths = provenance.members.filter(member => member.repository === repository).map(member => member.path);
  if (!selectedPaths.length) throw new Error('Selected Authority Set has no same-repository authority to compare.');
  const changed = execFile('git', ['diff', '--name-only', '-z', '--no-renames', baseSha, headSha, '--', ...selectedPaths],
    { cwd, encoding: 'buffer', maxBuffer: 1_000_000 }).toString('utf8').split('\0').filter(Boolean);
  if (changed.some(path => !selectedPaths.includes(path))) throw new Error('Git returned a path outside the selected Authority Set.');
  return changed;
}

function parseProvenance(encoded) {
  if (typeof encoded !== 'string' || !encoded || encoded.length > 65_536 || !/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)) {
    throw new Error('Missing or invalid protected Authority Set provenance.');
  }
  const bytes = Buffer.from(encoded, 'base64');
  if (bytes.toString('base64') !== encoded) throw new Error('Invalid protected Authority Set provenance encoding.');
  const provenance = JSON.parse(bytes.toString('utf8'));
  if (provenance?.version !== 2) throw new Error('Procedural v5 requires version-2 Authority Set provenance.');
  return provenance;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { AUTHORITY_PROVENANCE, SELF_REPOSITORY, BASE_SHA, HEAD_SHA, GITHUB_OUTPUT } = process.env;
  if (!GITHUB_OUTPUT) throw new Error('GITHUB_OUTPUT is required.');
  const changed = changedSelectedAuthorityPaths({ provenance: parseProvenance(AUTHORITY_PROVENANCE),
    repository: SELF_REPOSITORY, baseSha: BASE_SHA, headSha: HEAD_SHA });
  appendFileSync(GITHUB_OUTPUT, `changed=${changed.length ? 'true' : 'false'}\n`);
  appendFileSync(GITHUB_OUTPUT, `paths_base64=${Buffer.from(JSON.stringify(changed)).toString('base64')}\n`);
  console.log(`Selected same-repository Authority Set changes: ${changed.length ? changed.join(', ') : 'none'}`);
}
