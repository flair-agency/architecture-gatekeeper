#!/usr/bin/env node
import { appendGitHubOutput } from './runner-temp-path.mts';
import { fileURLToPath } from 'node:url';
import { changedSelectedAuthorityPaths } from './ci-review/ci-procedural-authority-change.mts';
export { changedSelectedAuthorityPaths };

function parseProvenance(encoded: string | undefined) {
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
  appendGitHubOutput(`changed=${changed.length ? 'true' : 'false'}\n` +
    `paths_base64=${Buffer.from(JSON.stringify(changed)).toString('base64')}\n`);
  console.log(`Selected same-repository Authority Set changes: ${changed.length ? changed.join(', ') : 'none'}`);
}
