import { createHash } from 'node:crypto';
import { validateRepositoryTreePath } from './runner-temp-path.mjs';

const PROFILES = new Set(['completed-block-v1', 'completed-owner-decision-self-v1']);
const MAX_CHANGES = 32;
const MAX_DIFF_BYTES = 1_048_576;
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const fail = message => { throw new Error(`Owner amendment Git changes: ${message}`); };
const lexical = (a, b) => a < b ? -1 : a > b ? 1 : 0;

function parseNameStatus(bytes) {
  if (!Buffer.isBuffer(bytes)) fail('Git changed-path listing is missing.');
  const values = bytes.toString('utf8').split('\0');
  if (values.at(-1) !== '') fail('Git changed-path listing is truncated.');
  values.pop();
  if (values.length % 2 !== 0) fail('Git changed-path listing is malformed.');
  const paths = [];
  for (let index = 0; index < values.length; index += 2) {
    if (values[index] !== 'M') fail('B changes a non-modified path or contains a rename.');
    paths.push(validateRepositoryTreePath(values[index + 1]));
  }
  if (paths.length < 1 || paths.length > MAX_CHANGES || new Set(paths).size !== paths.length ||
      paths.some((path, index) => index > 0 && lexical(paths[index - 1], path) >= 0)) {
    fail('Git modified-path set is empty, duplicated, oversized or not in exact path order.');
  }
  return paths;
}

function validateContextLists({ profile, changedFiles, authorityChanges, actualPaths, targetPath }) {
  if (profile === 'completed-block-v1') {
    if (actualPaths.length !== 1 || actualPaths[0] !== targetPath) fail('completed BLOCK must retain its one-target change scope.');
    return;
  }
  if (!Array.isArray(changedFiles) || changedFiles.length !== actualPaths.length ||
      changedFiles.some((file, index) => !file || file.status !== 'modified' || file.path !== actualPaths[index])) {
    fail('protected changedFiles does not exactly match the complete modified Git path set.');
  }
  if (!Array.isArray(authorityChanges) || authorityChanges.length !== actualPaths.length ||
      authorityChanges.some((change, index) => !change || Object.keys(change).length !== 3 ||
        !Object.hasOwn(change, 'path') || !Object.hasOwn(change, 'beforeBytes') || !Object.hasOwn(change, 'afterBytes') ||
        change.path !== actualPaths[index])) {
    fail('protected authorityChanges does not exactly match the complete modified Git path set.');
  }
  if (!actualPaths.includes(targetPath)) fail('OWNER_DECISION changes omit the selected target authority.');
}

/** Re-read every protected B authority blob and the full unfiltered base-to-B diff. */
export function deriveOwnerAmendmentGitChanges({ profile, repository, baseSha, bSha, targetPath,
  selectedAuthorityBytes, changedFiles, authorityChanges, runGit, readBlob } = {}) {
  if (!PROFILES.has(profile) || typeof repository !== 'string' || !/^[a-f0-9]{40}$/.test(baseSha ?? '') ||
      !/^[a-f0-9]{40}$/.test(bSha ?? '') || baseSha === bSha || typeof runGit !== 'function' ||
      typeof readBlob !== 'function') fail('trusted profile, repository, revisions and Git adapters are required.');
  validateRepositoryTreePath(targetPath);
  const actualPaths = parseNameStatus(runGit(['--no-replace-objects', 'diff', '--name-status', '-z', '--no-renames', baseSha, bSha]));
  validateContextLists({ profile, changedFiles, authorityChanges, actualPaths, targetPath });
  const sourceChanges = profile === 'completed-block-v1'
    ? [{ path: targetPath, beforeBytes: selectedAuthorityBytes?.base, afterBytes: selectedAuthorityBytes?.head }]
    : authorityChanges;
  const changes = sourceChanges.map(change => {
    validateRepositoryTreePath(change.path);
    const beforeBytes = readBlob(baseSha, change.path);
    const afterBytes = readBlob(bSha, change.path);
    if (!Buffer.isBuffer(beforeBytes) || !Buffer.isBuffer(afterBytes) || !beforeBytes.length || !afterBytes.length ||
        beforeBytes.equals(afterBytes) || !beforeBytes.equals(change.beforeBytes) || !afterBytes.equals(change.afterBytes)) {
      fail(`protected Git bytes differ from authority change ${change.path}.`);
    }
    if (change.path === targetPath && (!selectedAuthorityBytes?.base?.equals(beforeBytes) ||
        !selectedAuthorityBytes?.head?.equals(afterBytes))) fail('selected target compatibility bytes differ from the exact Git change.');
    return Object.freeze({ path: change.path, beforeBytes, afterBytes });
  });
  const diffBytes = runGit(['--no-replace-objects', 'diff', '--binary', '--no-ext-diff', '--no-renames', baseSha, bSha]);
  if (!Buffer.isBuffer(diffBytes) || !diffBytes.length || diffBytes.length > MAX_DIFF_BYTES) {
    fail('complete unfiltered base-to-B diff is missing or oversized.');
  }
  return Object.freeze({ changes: Object.freeze(changes), diffBytes });
}

/** Rebind all changed self members while preserving the manifest's descriptor order. */
export function computeOwnerAmendmentResultingAuthoritySet({ members, changes, repository, baseSha,
  expectedPriorDigest, expectedResultingDigest } = {}) {
  if (!Array.isArray(members) || !members.length || !Array.isArray(changes) || !changes.length ||
      typeof repository !== 'string' || !/^[a-f0-9]{40}$/.test(baseSha ?? '')) {
    fail('complete previous Authority Set and exact changes are required.');
  }
  const descriptors = members.map(member => {
    if (!member || typeof member !== 'object' || typeof member.id !== 'string' ||
        typeof member.repository !== 'string' || typeof member.resolvedCommit !== 'string' ||
        typeof member.path !== 'string' || !Number.isSafeInteger(member.byteLength) ||
        !/^[a-f0-9]{64}$/.test(member.sha256 ?? '')) fail('materialized Authority Set member is malformed.');
    const bytes = Buffer.isBuffer(member.content) ? member.content : Buffer.from(member.content ?? '', 'utf8');
    if (!bytes.length || bytes.length !== member.byteLength || hash(bytes) !== member.sha256) {
      fail(`materialized Authority Set bytes differ from descriptor ${member.id}.`);
    }
    return { id: member.id, repository: member.repository, resolvedCommit: member.resolvedCommit,
      path: member.path, byteLength: member.byteLength, sha256: member.sha256 };
  });
  const priorDigest = hash(Buffer.from(JSON.stringify(descriptors), 'utf8'));
  if (expectedPriorDigest !== undefined && expectedPriorDigest !== priorDigest) {
    fail('protected previous Authority Set digest differs from materialized descriptors.');
  }
  const seen = new Set();
  for (const change of changes) {
    validateRepositoryTreePath(change.path);
    if (seen.has(change.path)) fail('authority change paths are duplicated.');
    seen.add(change.path);
    const matches = descriptors.map((member, index) => ({ member, index })).filter(({ member }) =>
      member.path === change.path && member.repository.toLowerCase() === repository.toLowerCase() && member.resolvedCommit === baseSha);
    if (matches.length !== 1) fail(`changed path ${change.path} does not identify exactly one previous self Authority Set member.`);
    const { index } = matches[0];
    descriptors[index] = { ...descriptors[index], byteLength: change.afterBytes.length, sha256: hash(change.afterBytes) };
  }
  const resultingDigest = hash(Buffer.from(JSON.stringify(descriptors), 'utf8'));
  if (expectedResultingDigest !== undefined && expectedResultingDigest !== resultingDigest) {
    fail('protected resulting Authority Set digest differs from all exact changed self members.');
  }
  return Object.freeze({ priorDigest, resultingDigest, descriptors: Object.freeze(descriptors.map(Object.freeze)) });
}
