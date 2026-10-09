import { inspectOwnerAmendmentSelfScope, type OwnerAmendmentSelfScopeResult } from '../../../src/owner-amendment/owner-amendment-scope.mjs';

const input: unknown = {
  policy: { ownerAmendmentVersion: 1 },
  manifest: { authorities: [] },
  baseSha: { toString: () => 'a'.repeat(40) },
  headSha: 'b'.repeat(40),
  changedFiles: [],
  baseAuthorityBytes: Buffer.alloc(0),
  headAuthorityBytes: Buffer.alloc(0),
};
// The function accepts external structural values as unknown. This fixture
// checks only the erased access-view contract; runtime validation stays intact.
void input;
const result: OwnerAmendmentSelfScopeResult = inspectOwnerAmendmentSelfScope({
  policy: { ownerAmendmentVersion: 1 },
  manifest: { version: 1, authorities: [] },
  baseSha: 'a'.repeat(40),
  headSha: 'b'.repeat(40),
  changedFiles: [],
  baseAuthorityBytes: Buffer.alloc(0),
  headAuthorityBytes: Buffer.alloc(0),
});
const observedBaseSha: unknown = result.baseSha;
const observedHeadSha: unknown = result.headSha;
result.authorityId.toUpperCase();
result.previousSha256.toUpperCase();
void [observedBaseSha, observedHeadSha];
