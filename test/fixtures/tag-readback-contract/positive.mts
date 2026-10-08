import type { OwnerAmendmentTagReadbackInput, OwnerAmendmentTagFetch } from '../../../src/owner-amendment/owner-amendment-tag-readback.mjs';
import { readOwnerAmendmentTagForMergeGroup } from '../../../src/owner-amendment/owner-amendment-tag-readback.mjs';

function thenable<T>(value: T): PromiseLike<T> { return new Promise<T>(resolve => resolve(value)); }
const syncFetch: OwnerAmendmentTagFetch = () => ({ ok: true, status: 200, json: () => ({ payload: 'unknown' }) });
const asyncFetch: OwnerAmendmentTagFetch = async () => ({ ok: true, status: 200, json: async (): Promise<unknown> => ({ payload: 'unknown' }) });
const thenableFetch: OwnerAmendmentTagFetch = () => thenable({ ok: true, status: 200, json: () => thenable({ payload: 'unknown' }) });
const scalarJsonFetch: OwnerAmendmentTagFetch = () => ({ ok: true, json: () => 17 });
const syncRaw: NonNullable<OwnerAmendmentTagReadbackInput['readTagObject']> = () => Buffer.from('raw');
const asyncRaw: NonNullable<OwnerAmendmentTagReadbackInput['readTagObject']> = async () => Buffer.from('raw');
const fetchImpl = thenableFetch;
const input: OwnerAmendmentTagReadbackInput = {
  repository: 'owner/repo', bSha: 'a'.repeat(40), tagNamespace: 'refs/tags/ns', tagRef: `refs/tags/ns/${'a'.repeat(40)}`, rulesetId: 1, token: 'token', fetchImpl,
  readTagObject: (_repository, _ref, _name, oid) => { const unknownOid: unknown = oid; if (typeof unknownOid === 'string') { const narrowed: string = unknownOid; void narrowed; } return thenable(Buffer.from(String(unknownOid))); },
};
void readOwnerAmendmentTagForMergeGroup(input).then(observation => {
  const jsonValue: unknown = observation.rulesetReadback;
  const oid: unknown = observation.tag.objectOid;
  observation.tag.objectBytes[0] = 0;
  void [jsonValue, oid];
});
void [syncFetch, asyncFetch, scalarJsonFetch, syncRaw, asyncRaw];
