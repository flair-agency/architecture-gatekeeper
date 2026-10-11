import { selectOwnerAmendmentMergeGroupBContext as selectFlat } from '../../../src/owner-amendment-merge-group-b-context.mjs';
import {
  selectOwnerAmendmentMergeGroupBContext,
  type SelectOwnerAmendmentMergeGroupBContextInput,
  type SelectOwnerAmendmentMergeGroupBContextResult,
  type OwnerAmendmentMergeGroupBContextFetch,
} from '../../../src/owner-amendment/owner-amendment-merge-group-b-context.mts';
import { composeOwnerAmendmentMergeGroupBlockInputs } from '../../../src/owner-amendment/owner-amendment-merge-group-block-bridge.mts';
import type { OwnerAmendmentBridgeFetch } from '../../../src/owner-amendment/owner-amendment-merge-group-block-bridge.mts';

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

const nativeFetch: OwnerAmendmentMergeGroupBContextFetch = fetch;
const narrowFetch: OwnerAmendmentMergeGroupBContextFetch = (
  url: string,
  options: { method?: string; headers: Record<string, string>; body?: string; redirect: 'error' },
) => {
  const requestUrl: string = url, headers: Record<string, string> = options.headers;
  const redirect: 'error' = options.redirect;
  void [requestUrl, headers, redirect];
  return { ok: true, status: 200, json: () => ({ response: 'unknown' }) };
};
const thenableFetch: OwnerAmendmentMergeGroupBContextFetch = (_url, _options) =>
  new ImmediateThenable({ ok: true, json: () => new ImmediateThenable({ data: 'unknown' }) });
const bodyOnlyFetch: OwnerAmendmentBridgeFetch = (_url, _options) => ({ body: new Uint8Array() });

const input: SelectOwnerAmendmentMergeGroupBContextInput = { event: {}, token: 'token', fetchImpl: nativeFetch };
const flatResult: SelectOwnerAmendmentMergeGroupBContextResult = await selectFlat(input);
const physicalResult = await selectOwnerAmendmentMergeGroupBContext({ ...input, fetchImpl: narrowFetch });
const thenableResult = await selectOwnerAmendmentMergeGroupBContext({ ...input, fetchImpl: thenableFetch });
const parentBridgeComposition = await composeOwnerAmendmentMergeGroupBlockInputs({ event: {}, token: 'token', fetchImpl: bodyOnlyFetch });
if (physicalResult.status === 'SELECTED_OWNER_AMENDMENT_MERGE_GROUP_B_CONTEXT') {
  const repository: string = physicalResult.repository;
  const rawRepositoryId: unknown = physicalResult.repositoryId;
  const queueState: unknown = physicalResult.queueEntryState;
  void [repository, rawRepositoryId, queueState];
} else {
  const reason: unknown = physicalResult.reason;
  void reason;
}
void [flatResult, thenableResult, parentBridgeComposition];
