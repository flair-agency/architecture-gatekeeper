import type { OwnerAmendmentTagReadback, OwnerAmendmentTagReadbackInput, OwnerAmendmentTagFetch } from '../../../src/owner-amendment/owner-amendment-tag-readback.mjs';

const wrongAsyncResponse: OwnerAmendmentTagFetch = async () => ({ ok: true, status: 200 });
const wrongSyncResponse: OwnerAmendmentTagFetch = () => ({ ok: true });
const wrongJsonCallback: OwnerAmendmentTagFetch = async () => ({ ok: true, json: 19 });
const wrongAsyncRaw: NonNullable<OwnerAmendmentTagReadbackInput['readTagObject']> = async () => 'not bytes';
const wrongSyncRaw: NonNullable<OwnerAmendmentTagReadbackInput['readTagObject']> = () => ({ bytes: true });
const incompleteInput: OwnerAmendmentTagReadbackInput = {};
declare const result: OwnerAmendmentTagReadback;
declare const callbackOid: Parameters<NonNullable<OwnerAmendmentTagReadbackInput['readTagObject']>>[3];
const ruleset: string = result.rulesetReadback;
const oid: string = result.tag.objectOid;
const refinedCallbackOid: string = callbackOid;
result.tagRef = 'mutable';
void [wrongAsyncResponse, wrongSyncResponse, wrongJsonCallback, wrongAsyncRaw, wrongSyncRaw, incompleteInput, ruleset, oid, refinedCallbackOid];
