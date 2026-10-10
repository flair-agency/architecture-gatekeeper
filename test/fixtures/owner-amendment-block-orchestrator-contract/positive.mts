import { orchestrateOwnerAmendmentBlockHandoff } from '../../../src/owner-amendment-block-handoff-orchestrator.mjs';
import type { OwnerAmendmentBlockHandoffFetch, OwnerAmendmentBlockHandoffInput } from '../../../src/owner-amendment/owner-amendment-block-handoff-orchestrator.mts';
import type { OwnerAmendmentTagRequestOptions } from '../../../src/owner-amendment/owner-amendment-tag-adapter.mts';

const callbackFetch = (url: string, init: { headers: Record<string, string>; redirect?: 'error' | 'follow'; method?: string; body?: string }) => ({
  ok: true,
  status: 200,
  json: () => Promise.resolve({ url, method: init.method }),
  body: null,
});
const promiseLike = <T,>(value: T): PromiseLike<T> => Promise.resolve(value);
const thenableFetch: OwnerAmendmentBlockHandoffFetch = () => promiseLike({
  ok: true, status: 200, json: () => ({ accepted: true }), body: null,
});
const standardFetch: OwnerAmendmentBlockHandoffFetch = fetch;
const actualRequests = (url: string, init: { headers: Record<string, string>; redirect: 'error' | 'follow' } | OwnerAmendmentTagRequestOptions) =>
  ({ ok: true, status: 200, json: () => ({ url, headers: init.headers }) });
const compatibleActualRequests: OwnerAmendmentBlockHandoffFetch = actualRequests;
const streamingFetch: OwnerAmendmentBlockHandoffFetch = (url: string) =>
  url.endsWith('/zip') ? { ok: true, status: 200, body: new ReadableStream<Uint8Array>() }
    : { ok: true, status: 200, json: () => ({}) };
const input: OwnerAmendmentBlockHandoffInput<{ toString(): string }> = {
  repository: 'flair-agency/architecture-gatekeeper',
  policy: { ownerAmendmentTagNamespace: 'refs/tags/example' },
  manifest: {},
  baseSha: { toString: () => 'a'.repeat(40) },
  bSha: { toString: () => 'b'.repeat(40) },
  changedFiles: [],
  baseAuthorityBytes: Buffer.alloc(1),
  headAuthorityBytes: Buffer.alloc(1),
  blockRun: {},
  purpose: 'test',
  token: 'token',
  runGh: (_file, _args, _options) => '[]',
  rulesetId: 7,
  tagger: { name: 'test', email: 'test@example.invalid', date: '2026-01-01T00:00:00.000Z' },
  fetchImpl: standardFetch,
};

const compatibleCallback: OwnerAmendmentBlockHandoffFetch = callbackFetch;
void [compatibleCallback, compatibleActualRequests, thenableFetch, streamingFetch];
const result = await orchestrateOwnerAmendmentBlockHandoff(input);
if (result.status === 'TAG_TRANSPORTED_AND_READ_BACK') {
  const originalBShape: typeof input.bSha = result.bSha;
  const composedDigest: string = result.reviewRecordSha256;
  const fixedStatus: 'TAG_TRANSPORTED_AND_READ_BACK' = result.status;
  const ref: string = result.tagRef;
  const objectSha: unknown = result.tagObjectSha;
  const transport: 'ALREADY_PRESENT_AND_READ_BACK' | 'CREATED_AND_READ_BACK' = result.transportStatus;
  void [originalBShape, composedDigest, fixedStatus, ref, objectSha, transport];
} else {
  const reason: unknown = result.reason;
  void reason;
}
