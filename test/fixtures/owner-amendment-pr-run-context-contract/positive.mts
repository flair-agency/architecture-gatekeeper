import type { OwnerAmendmentHandoffPrRunContextInput, OwnerAmendmentHandoffPrRunContextResult } from '../../../src/owner-amendment/owner-amendment-handoff-pr-run-context.mjs';

const syncFetch: NonNullable<OwnerAmendmentHandoffPrRunContextInput['fetchImpl']> = () => ({ ok: true, json: () => ({ untrusted: true }) });
const asyncFetch: NonNullable<OwnerAmendmentHandoffPrRunContextInput['fetchImpl']> = async () => ({ ok: true, json: async (): Promise<unknown> => ({ untrusted: true }) });
function thenable<T>(value: T): PromiseLike<T> { return Promise.resolve(value); }
const thenableFetch: NonNullable<OwnerAmendmentHandoffPrRunContextInput['fetchImpl']> = () => thenable({ ok: true, json: () => thenable({ untrusted: true }) });
const input: OwnerAmendmentHandoffPrRunContextInput = { input: { repository: 'owner/repo' }, token: 'token', fetchImpl: thenableFetch };
declare const result: OwnerAmendmentHandoffPrRunContextResult;
if (result.status === 'SELECTED_OWNER_AMENDMENT_HANDOFF_PR_RUN_CONTEXT') {
  const repository: unknown = result.repository;
  const base: unknown = result.baseSha;
  const runRepositoryId: unknown = result.runRepositoryId;
  void [repository, base, runRepositoryId];
} else {
  const reason: unknown = result.reason;
  void reason;
}
void [syncFetch, asyncFetch, input];
