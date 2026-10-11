import { composeOwnerAmendmentBlockHandoff as fromFlat } from '../../../src/owner-amendment-block-handoff-compose.mjs';
import { composeOwnerAmendmentBlockHandoff as fromImplementation } from '../../../src/owner-amendment/owner-amendment-block-handoff-compose.mts';
import type { ComposeOwnerAmendmentBlockHandoffInput, ComposeOwnerAmendmentBlockHandoffResult } from '../../../src/owner-amendment/owner-amendment-block-handoff-compose.mts';

const context: unknown = unknownValue;
const fetchShape: NonNullable<ComposeOwnerAmendmentBlockHandoffInput['fetchImpl']> =
  (url: string, options: { headers: Record<string, string>; redirect: 'error' | 'follow' }) =>
    Promise.resolve({ ok: true, json: () => Promise.resolve(unknownValue), body: unknownValue });
type FetchResponse = { ok?: unknown; status?: unknown; json?: () => PromiseLike<unknown>; body?: unknown };
const thenable: PromiseLike<FetchResponse> = {
  then(resolve) {
    return Promise.resolve({ ok: true, json: () => Promise.resolve(unknownValue), body: unknownValue }).then(resolve);
  },
};
const thenableFetch: NonNullable<ComposeOwnerAmendmentBlockHandoffInput['fetchImpl']> =
  (url: string, options: { headers: Record<string, string>; redirect: 'error' | 'follow' }) => thenable;
const standardFetch: NonNullable<ComposeOwnerAmendmentBlockHandoffInput['fetchImpl']> = globalThis.fetch;
const syncRunner: NonNullable<ComposeOwnerAmendmentBlockHandoffInput['runGh']> =
  (file: string, args: readonly unknown[], options: { encoding: 'utf8'; maxBuffer: number; timeout: number; stdio: readonly ['pipe', 'pipe', 'pipe'] }) => unknownValue;
const asyncRunner: NonNullable<ComposeOwnerAmendmentBlockHandoffInput['runGh']> =
  async () => unknownValue;
const builder: NonNullable<ComposeOwnerAmendmentBlockHandoffInput['buildAmendmentRecordBytes']> =
  (recordBytes, bundleBytes) => unknownValue;

const input: ComposeOwnerAmendmentBlockHandoffInput = {
  context, token: unknownValue, amendmentRecordBytes: unknownValue,
  buildAmendmentRecordBytes: builder, fetchImpl: fetchShape, runGh: syncRunner,
};
const result = fromFlat(input);
const implementationResult = fromImplementation({ ...input, fetchImpl: thenableFetch, runGh: asyncRunner });
const status: Promise<ComposeOwnerAmendmentBlockHandoffResult> = result;
const implementationStatus: Promise<ComposeOwnerAmendmentBlockHandoffResult> = implementationResult;

async function inspect(value: ComposeOwnerAmendmentBlockHandoffResult): Promise<void> {
  if (value.status === 'PREPARED_BLOCK_HANDOFF_TAG_MESSAGE') {
    const sha: string = value.reviewRecordSha256;
    const unresolvedB: unknown = value.bSha;
    const tagMessage: string = value.tagMessage;
    void [sha, unresolvedB, tagMessage];
  } else {
    const reason: unknown = value.reason;
    void reason;
  }
}
declare const unknownValue: unknown;
void [status, implementationStatus, inspect, standardFetch];
