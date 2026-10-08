import type { OwnerAmendmentTagReadbackInput, OwnerAmendmentTagFetch } from '../../../src-ts/owner-amendment/owner-amendment-tag-readback.mjs';
import { readOwnerAmendmentTagForMergeGroup } from '../../../src-ts/owner-amendment/owner-amendment-tag-readback.mjs';

const fetchImpl: OwnerAmendmentTagFetch = async () => ({
  ok: true,
  status: 200,
  json: async (): Promise<unknown> => ({ arbitrary: 'API payload stays unknown' }),
});
const input: OwnerAmendmentTagReadbackInput = {
  repository: 'owner/repo', bSha: 'a'.repeat(40), tagNamespace: 'refs/tags/ns',
  tagRef: `refs/tags/ns/${'a'.repeat(40)}`, rulesetId: 1, token: 'token', fetchImpl,
  readTagObject: async () => Buffer.from('raw'),
};
const result = readOwnerAmendmentTagForMergeGroup(input);
void result.then(observation => {
  const payload: unknown = observation.rulesetReadback;
  const oid: unknown = observation.observedTagRefOid;
  void payload;
  void oid;
});

const syncRawInput: OwnerAmendmentTagReadbackInput = {
  ...input, readTagObject: (_repository, _ref, _name, oid) => {
    const observedOid: unknown = oid;
    if (typeof observedOid === 'string') {
      const refinedOid: string = observedOid;
      void refinedOid;
    }
    return Buffer.from('raw');
  },
};
void readOwnerAmendmentTagForMergeGroup(syncRawInput).then(observation => {
  const rawBytes: Buffer = observation.tag.objectBytes;
  rawBytes[0] = 0; // Only the tag's fields are frozen, not the Buffer contents.
});
