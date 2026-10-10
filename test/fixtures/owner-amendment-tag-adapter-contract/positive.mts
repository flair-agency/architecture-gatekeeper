import { createAndReadOwnerAmendmentTag } from '../../../src/owner-amendment-tag-adapter.mjs';
import type {
  CreateAndReadOwnerAmendmentTagResult,
  OwnerAmendmentTagFetch,
  OwnerAmendmentTagRequestOptions,
  OwnerAmendmentTagResponse,
} from '../../../src/owner-amendment-tag-adapter.mjs';

const input = {
  repository: 'owner/repo', tagRef: `refs/tags/release/${'a'.repeat(40)}`, bSha: 'a'.repeat(40),
  tagMessage: '{}\n', tagNamespace: 'refs/tags/release', rulesetId: 2, token: 'token',
  tagger: { name: 'Tagger', email: 'tagger@example.com', date: '2026-01-01T00:00:00.000Z' },
};
const standardFetch: OwnerAmendmentTagFetch = globalThis.fetch;
const requiredOptionsFetch: OwnerAmendmentTagFetch = (_url: string, _init: OwnerAmendmentTagRequestOptions) => new Response('{}');
const syncJson: OwnerAmendmentTagResponse = { ok: true, status: 200, json: () => ({}) };
const asyncJson: OwnerAmendmentTagResponse = { ok: true, status: 200, json: async () => ({}) };
const jsonPromise = Promise.resolve({});
const thenableJson: OwnerAmendmentTagResponse = { ok: true, status: 200, json: () => ({ then: jsonPromise.then.bind(jsonPromise) }) };
const syncFetch: OwnerAmendmentTagFetch = (_url, _init) => ({ ok: true, status: 200, json: () => ({}) });
const asyncFetch: OwnerAmendmentTagFetch = async (_url, _init) => new Response('{}');
const responsePromise = Promise.resolve(new Response('{}'));
const thenableFetch: OwnerAmendmentTagFetch = (_url, _init) => ({ then: responsePromise.then.bind(responsePromise) });
const supplied: unknown = {};
const already: Promise<CreateAndReadOwnerAmendmentTagResult> = createAndReadOwnerAmendmentTag({ ...input, rulesetReadback: supplied });
for (const fetchImpl of [standardFetch, requiredOptionsFetch, syncFetch, asyncFetch, thenableFetch]) {
  void createAndReadOwnerAmendmentTag({ ...input, fetchImpl, rulesetReadback: supplied });
}
for (const response of [syncJson, asyncJson, thenableJson]) void response;
already.then(result => {
  if (result.transportStatus === 'ALREADY_PRESENT_AND_READ_BACK') {
    const observation: unknown = result.refReadback;
    void observation;
  } else {
    const observation: unknown = result.tagReadback;
    void observation;
  }
});
