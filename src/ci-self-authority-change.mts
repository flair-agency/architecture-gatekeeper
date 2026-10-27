#!/usr/bin/env node
import { appendGitHubOutput } from './runner-temp-path.mts';
import { fileURLToPath } from 'node:url';
import { inspectSelfAuthorityChanges } from './ci-review/ci-self-authority-change.mts';
export { inspectSelfAuthorityChanges };

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { AUTHORITY_PROVENANCE: encoded, SELF_REPOSITORY: repository, BASE_SHA: baseSha,
    HEAD_SHA: headSha, REVIEWED_SHA: reviewedSha, BASE_BRANCH: baseBranch, POLICY_PATH: policyPath,
    POLICY_SHA256: policySha256, GITHUB_OUTPUT } = process.env;
  if (!GITHUB_OUTPUT || !encoded || encoded.length > 65_536 || !/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)) {
    throw new Error('Protected provenance and GITHUB_OUTPUT are required.');
  }
  const bytes = Buffer.from(encoded, 'base64');
  if (bytes.toString('base64') !== encoded) throw new Error('Invalid protected provenance encoding.');
  const provenance = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  const result = await inspectSelfAuthorityChanges({ repository, baseSha, headSha, reviewedSha,
    baseBranch, policyPath, policySha256, provenance, cwd: process.cwd() });
  appendGitHubOutput(`changed=${result.changed}\nconfiguration_paths_base64=${Buffer.from(JSON.stringify(result.configurationPaths)).toString('base64')}\n`);
  console.log(`Old selected Authority changed: ${result.changed}; configuration changes: ${result.configurationPaths.length}`);
}
