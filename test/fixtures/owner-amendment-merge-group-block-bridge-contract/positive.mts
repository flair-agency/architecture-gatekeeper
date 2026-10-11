import { composeOwnerAmendmentMergeGroupBlockInputs as composeFlat } from '../../../src/owner-amendment-merge-group-block-bridge.mjs';
import {
  composeOwnerAmendmentMergeGroupBlockInputs,
  type ComposeOwnerAmendmentMergeGroupBlockInputsInput,
  type OwnerAmendmentMergeGroupBlockInputsResult,
} from '../../../src/owner-amendment/owner-amendment-merge-group-block-bridge.mts';
import type { OwnerAmendmentBridgeFetch } from '../../../src/owner-amendment/owner-amendment-merge-group-block-bridge.mts';

const repository = 'flair-agency/example';
const selected = {
  status: 'SELECTED_OWNER_AMENDMENT_MERGE_GROUP_B_CONTEXT', repository,
  mergeGroupBaseSha: 'a'.repeat(40), mergeGroupHeadSha: 'c'.repeat(40),
  bBaseSha: 'a'.repeat(40), bHeadSha: 'b'.repeat(40), bPrNumber: '204',
};
const verified = {
  status: 'VERIFIED_OWNER_AMENDMENT_MERGE_GROUP_EVIDENCE', repository,
  baseSha: 'a'.repeat(40), bSha: 'b'.repeat(40), policyRevision: 'a'.repeat(40), policySha256: '1'.repeat(64),
  authorityId: 'architecture', previousAuthoritySha256: '2'.repeat(64), proposedAuthoritySha256: '3'.repeat(64),
  reviewRecordSha256: '4'.repeat(64), amendmentRecordSha256: '5'.repeat(64), attestationBundleSha256: '6'.repeat(64),
  tagObjectOid: '7'.repeat(40), observedTagRefOid: '7'.repeat(40), producerRunId: '42', producerRunAttempt: '1',
};
class ImmediateThenable<T> implements PromiseLike<T> {
  readonly #promise: Promise<T>;
  constructor(value: T) { this.#promise = Promise.resolve(value); }
  then<TResult1 = T, TResult2 = never>(
    onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return this.#promise.then(onfulfilled, onrejected);
  }
}
const standardFetch: OwnerAmendmentBridgeFetch = fetch;
const partialFetch: OwnerAmendmentBridgeFetch = (_url, _options) => ({ ok: true, status: 200, json: () => ({ data: 'unknown' }) });
const partialAsyncFetch: OwnerAmendmentBridgeFetch = async (_url, _options) => ({ ok: true, body: new Uint8Array() });
const explicitlyTypedFetch: OwnerAmendmentBridgeFetch = (
  url: string,
  options: { headers: Record<string, string>; redirect: 'error'; method?: string; body?: string },
) => {
  const inputUrl: string = url, requestHeaders: Record<string, string> = options.headers;
  const requestRedirect: 'error' = options.redirect;
  void [inputUrl, requestHeaders, requestRedirect];
  return { ok: true, status: 200, json: () => ({}) };
};

const input: ComposeOwnerAmendmentMergeGroupBlockInputsInput = {
  event: {}, token: 'token', fetchImpl: standardFetch, tagNamespace: 'refs/tags/test', runGit: () => 'git',
  selectB: ({ event, token, fetchImpl }) => {
    const rawEvent: unknown = event, rawToken: unknown = token, fetchValue: OwnerAmendmentBridgeFetch | undefined = fetchImpl;
    void [rawEvent, rawToken, fetchValue];
    return selected;
  },
  composeEvidence: ({ repository: repo, baseSha, bSha, token, fetchImpl, tagNamespace }) => {
    const rawRepo: unknown = repo, rawBase: unknown = baseSha, rawB: unknown = bSha, rawToken: unknown = token;
    const rawFetch: OwnerAmendmentBridgeFetch | undefined = fetchImpl, option: unknown = tagNamespace;
    void [rawRepo, rawBase, rawB, rawToken, rawFetch, option];
    return Promise.resolve(verified);
  },
};
const result: OwnerAmendmentMergeGroupBlockInputsResult = await composeOwnerAmendmentMergeGroupBlockInputs(input);
const second = await composeFlat({ ...input, fetchImpl: partialFetch,
  selectB: () => new ImmediateThenable(selected), composeEvidence: () => verified });
const third = await composeFlat({ ...input, fetchImpl: partialAsyncFetch, selectB: () => selected,
  composeEvidence: () => new ImmediateThenable(verified) });
const fourth = await composeFlat({ ...input, fetchImpl: explicitlyTypedFetch,
  selectB: () => new ImmediateThenable(selected), composeEvidence: () => new ImmediateThenable(verified) });
if (result.status === 'VERIFIED_OWNER_AMENDMENT_MERGE_GROUP_BLOCK_INPUTS') {
  const rawRepository: unknown = result.repository;
  const rawRunId: unknown = result.producerRunId;
  void [rawRepository, rawRunId];
} else {
  const reason: unknown = result.reason;
  void reason;
}
void second;
void third;
void fourth;
