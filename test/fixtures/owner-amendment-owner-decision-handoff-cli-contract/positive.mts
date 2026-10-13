import { execFileSync } from 'node:child_process';
import { runOwnerAmendmentOwnerDecisionHandoff, type OwnerAmendmentOwnerDecisionHandoffCliInput, type OwnerAmendmentOwnerDecisionHandoffCliResult } from '../../../src/owner-amendment/owner-amendment-owner-decision-handoff-cli.mts';
import type { OwnerAmendmentOwnerDecisionHandoffInput } from '../../../src/owner-amendment/owner-amendment-owner-decision-handoff.mts';

class ImmediateThenable<T> implements PromiseLike<T> {
  constructor(private readonly value: T) {}
  then<TResult1 = T, TResult2 = never>(
    onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve(this.value).then(onfulfilled, onrejected);
  }
}
const asThenable = <T,>(value: T): PromiseLike<T> => new ImmediateThenable(value);
const lightFetch: NonNullable<OwnerAmendmentOwnerDecisionHandoffCliInput['fetchImpl']> = (_url, _options) => ({
  ok: true,
  status: 200,
  json: () => ({ external: 'data remains unknown' }),
});
const narrowFetch = (_url: string, _init: {
  headers: Record<string, string>;
  redirect?: 'error' | 'follow';
  method?: string;
  body?: string;
}) => ({ ok: true, status: 200, json: () => ({ external: 'data remains unknown' }), body: null });
const defaultsCompatible: OwnerAmendmentOwnerDecisionHandoffCliInput = {
  fetchImpl: fetch,
  runGit: execFileSync,
  runGh: execFileSync,
  now: () => new Date(),
};
const result: Promise<OwnerAmendmentOwnerDecisionHandoffCliResult> = runOwnerAmendmentOwnerDecisionHandoff(defaultsCompatible);
void result;
void lightFetch;
void runOwnerAmendmentOwnerDecisionHandoff({ fetchImpl: narrowFetch });

const syncCollaborators: OwnerAmendmentOwnerDecisionHandoffCliInput = {
  selectContext: () => ({ status: 'INCOMPLETE', reason: { returned: 'synchronously' } }),
  discoverArtifact: () => ({ status: 'INCOMPLETE', reason: 11 }),
  handoff: () => ({ status: 'INCOMPLETE', reason: false }),
};
const thenableCollaborators: OwnerAmendmentOwnerDecisionHandoffCliInput = {
  selectContext: () => asThenable({ status: 'INCOMPLETE' as const, reason: ['thenable'] }),
  discoverArtifact: () => asThenable({ status: 'INCOMPLETE' as const, reason: null }),
  handoff: () => asThenable({ status: 'INCOMPLETE' as const, reason: undefined }),
};
void syncCollaborators;
void thenableCollaborators;

declare const delegatedInput: OwnerAmendmentOwnerDecisionHandoffInput;
void delegatedInput;

declare const outcome: OwnerAmendmentOwnerDecisionHandoffCliResult;
if (outcome.status === 'OWNER_DECISION_TAG_TRANSPORTED_AND_READ_BACK') {
  const typedHash: string = outcome.reviewRecordSha256;
  void typedHash;
  // Raw tag readback remains external data even on the successful status.
  // raw readback sha has no owner-established string type
  const unjustifiedString: string = outcome.tagObjectSha;
  void unjustifiedString;
} else {
  const observedReason: unknown = outcome.reason;
  void observedReason;
}
