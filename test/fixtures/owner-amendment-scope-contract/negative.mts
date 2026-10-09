import { inspectOwnerAmendmentSelfScope } from '../../../src/owner-amendment/owner-amendment-scope.mjs';

const result = inspectOwnerAmendmentSelfScope({
  policy: {}, manifest: {}, baseSha: {}, headSha: {}, changedFiles: [],
  baseAuthorityBytes: Buffer.alloc(0), headAuthorityBytes: Buffer.alloc(0),
});
const assumedString: string = result.baseSha;
result.authorityId = 'changed';
