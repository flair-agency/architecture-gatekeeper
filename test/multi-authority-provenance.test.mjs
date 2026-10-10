import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import * as provenance from '../dist/multi-authority-provenance.mjs';

const sha = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const member = overrides => ({ id: 'architecture-contract', repository: 'org/repo', resolvedCommit: 'a'.repeat(40),
  path: 'docs/architecture.md', byteLength: 1, sha256: 'b'.repeat(64), ...overrides });
const record = member();
const valid = overrides => {
  const members = overrides?.members ?? [record];
  return { version: 2, selfRepository: 'org/repo', authorityRevision: 'a'.repeat(40),
    manifestSha256: 'c'.repeat(64), setDigest: sha(members.map(item => ({ id: item.id, repository: item.repository,
      resolvedCommit: item.resolvedCommit, path: item.path, byteLength: item.byteLength, sha256: item.sha256 }))),
    members, ...overrides };
};

test('validator returns the same mutable object and preserves its current coercion behavior', () => {
  const revision = { toString: () => 'a'.repeat(40) };
  const value = valid({ authorityRevision: revision, members: [member({ repository: 'ext/repo' })] });
  assert.equal(provenance.validateMultiAuthorityProvenance(value), value);
  assert.equal(value.authorityRevision, revision);
});

test('validator rereads members and member byteLength in the existing order', () => {
  const metadataOrder = [];
  const value = valid();
  for (const key of ['version', 'selfRepository', 'authorityRevision', 'manifestSha256', 'setDigest', 'members']) {
    const captured = value[key];
    Object.defineProperty(value, key, { enumerable: true, get() { metadataOrder.push(key); return captured; } });
  }
  assert.equal(provenance.validateMultiAuthorityProvenance(value), value);
  assert.deepEqual(metadataOrder, ['version', 'selfRepository', 'authorityRevision', 'manifestSha256', 'setDigest',
    'members', 'members', 'members', 'members', 'selfRepository', 'authorityRevision', 'setDigest']);

  const byteReads = [];
  const item = member();
  Object.defineProperty(item, 'byteLength', { enumerable: true, get() { byteReads.push(byteReads.length + 1); return 1; } });
  const withGetter = valid({ members: [item], setDigest: sha([{ id: item.id, repository: item.repository,
    resolvedCommit: item.resolvedCommit, path: item.path, byteLength: 1, sha256: item.sha256 }]) });
  assert.equal(provenance.validateMultiAuthorityProvenance(withGetter), withGetter);
  assert.deepEqual(byteReads, [1, 2, 3, 4, 5, 6]);
});

test('validator preserves thrown getter identity and rejects extra keys and self-member mismatch', () => {
  const failure = new Error('getter sentinel');
  const value = valid();
  Object.defineProperty(value, 'version', { enumerable: true, get() { throw failure; } });
  assert.throws(() => provenance.validateMultiAuthorityProvenance(value), error => error === failure);
  assert.throws(() => provenance.validateMultiAuthorityProvenance(valid({ extra: true })));
  assert.throws(() => provenance.validateMultiAuthorityProvenance(valid({ members: [member({ resolvedCommit: 'd'.repeat(40) })] })));
});

test('constructor removes content, retains metadata, and validates its generated digest', () => {
  const metadata = member({ content: Buffer.from('not part of provenance') });
  const manifestSha256 = 'c'.repeat(64);
  const setDigest = sha([{ id: metadata.id, repository: metadata.repository, resolvedCommit: metadata.resolvedCommit,
    path: metadata.path, byteLength: metadata.byteLength, sha256: metadata.sha256 }]);
  const materialized = { manifestSha256, setDigest, members: [metadata] };
  const output = provenance.multiAuthorityProvenance(materialized, 'org/repo', 'a'.repeat(40));
  assert.notEqual(output, materialized);
  assert.equal(output.manifestSha256, manifestSha256);
  assert.equal(output.setDigest, setDigest);
  assert.deepEqual(output.members, [member()]);
  assert.equal(Object.hasOwn(output.members[0], 'content'), false);
  assert.throws(() => provenance.multiAuthorityProvenance({ ...materialized, members: [member({ extra: true })] }, 'org/repo', 'a'.repeat(40)));
});
