import type { OwnerAmendmentTagReadback, OwnerAmendmentTagReadbackInput, OwnerAmendmentTagFetch } from '../../../src-ts/owner-amendment/owner-amendment-tag-readback.mjs';

const wrongFetch: OwnerAmendmentTagFetch = async () => ({ ok: true, status: 200 });
const wrongSyncFetch: OwnerAmendmentTagFetch = () => ({ ok: true, json: async () => ({}) });
const wrongSyncJson: OwnerAmendmentTagFetch = async () => ({ ok: true, json: () => ({}) });
const wrongRawCallback: NonNullable<OwnerAmendmentTagReadbackInput['readTagObject']> = async () => 'not bytes';
const wrongRawSync: NonNullable<OwnerAmendmentTagReadbackInput['readTagObject']> = () => ({ bytes: true });
const incompleteInput: OwnerAmendmentTagReadbackInput = {};
declare const result: OwnerAmendmentTagReadback;
declare const callbackOid: Parameters<NonNullable<OwnerAmendmentTagReadbackInput['readTagObject']>>[3];
const ruleset: string = result.rulesetReadback;
const oid: string = result.tag.objectOid;
const refinedCallbackOid: string = callbackOid;
result.tagRef = 'mutable';
void [wrongFetch, wrongSyncFetch, wrongSyncJson, wrongRawCallback, wrongRawSync, incompleteInput, ruleset, oid, refinedCallbackOid];
