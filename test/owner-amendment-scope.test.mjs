import assert from 'node:assert/strict';
import test from 'node:test';
import { inspectOwnerAmendmentSelfScope } from '../src/owner-amendment-scope.mjs';

const baseSha = 'a'.repeat(40);
const headSha = 'b'.repeat(40);
const path = 'docs/architecture.md';
const policy = {
  ownerAmendmentVersion: 1, ownerAmendmentGrade: 'G0',
  ownerAmendmentScope: 'authority-only', ownerAmendmentTriggerProfile: 'completed-block-v1',
  ownerAmendmentAuthorityId: 'architecture-contract', ownerAmendmentAuthorityPath: path,
};
const manifest = { version: 1, authorities: [{ id: 'architecture-contract', repository: 'self',
  revision: 'authority-revision', path }] };
const valid = { policy, manifest, baseSha, headSha,
  changedFiles: [{ path, status: 'modified' }],
  baseAuthorityBytes: Buffer.from('old rule\n'), headAuthorityBytes: Buffer.from('new rule\n') };

test('binds one modified self authority to exact B without deriving acceptance', () => {
  const result = inspectOwnerAmendmentSelfScope(valid);
  assert.equal(result.baseSha, baseSha);
  assert.equal(result.headSha, headSha);
  assert.equal(result.authorityPath, path);
  assert.notEqual(result.previousSha256, result.newSha256);
  assert.equal(Object.hasOwn(result, 'accepted'), false);
});

test('rejects absent opt-in, wrong trigger, extra files, external authority and unchanged bytes', () => {
  const cases = [
    { policy: { ...policy, ownerAmendmentGrade: undefined } },
    { policy: { ...policy, ownerAmendmentAuthorityId: undefined, ownerAmendmentAuthorityPath: undefined },
      manifest: { ...manifest, authorities: [{ repository: 'self', revision: 'authority-revision' }] },
      changedFiles: [{ status: 'modified' }] },
    { policy: { ...policy, ownerAmendmentTriggerProfile: 'completed-owner-decision-self-v1' } },
    { changedFiles: [...valid.changedFiles, { path: 'src/index.mjs', status: 'modified' }] },
    { changedFiles: [{ path, status: 'added' }] },
    { manifest: { ...manifest, authorities: [{ ...manifest.authorities[0], repository: 'other/repo' }] } },
    { manifest: { ...manifest, authorities: [{ ...manifest.authorities[0], revision: headSha }] } },
    { manifest: { ...manifest, authorities: [...manifest.authorities, { id: 'other', repository: 'self', path: 'docs/other.md' }] } },
    { headAuthorityBytes: valid.baseAuthorityBytes },
    { baseSha: headSha },
  ];
  for (const changed of cases) assert.throws(() => inspectOwnerAmendmentSelfScope({ ...valid, ...changed }));
});
