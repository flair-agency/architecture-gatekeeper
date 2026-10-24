import { composeOwnerAmendmentMergeGroupEvidence as composeFlat } from '../../../src/owner-amendment-merge-group-evidence.mjs';
import { composeOwnerAmendmentMergeGroupEvidence as composePhysical } from '../../../src/owner-amendment/owner-amendment-merge-group-evidence.mts';
import type {
  ComposeOwnerAmendmentMergeGroupEvidenceInput,
  OwnerAmendmentMergeGroupEvidenceResult,
} from '../../../src/owner-amendment/owner-amendment-merge-group-evidence.mts';
import type { OwnerAmendmentMergeGroupEvidenceFetch } from '../../../src/owner-amendment/owner-amendment-merge-group-evidence.mts';
import type { OwnerAmendmentBridgeFetch } from '../../../src/owner-amendment/owner-amendment-merge-group-block-bridge.mts';
import type { SynchronousGitCommand } from '../../../src/owner-amendment/owner-amendment-git-changes.mts';

declare const external: unknown;
const input: ComposeOwnerAmendmentMergeGroupEvidenceInput = {
  repository: external, baseSha: external, bSha: external, tagNamespace: external, tagRef: external,
  rulesetId: external, token: external, runGit: () => Buffer.alloc(0),
  resolveGitContext(args) {
    const repository: unknown = args.repository;
    const base: unknown = args.baseSha;
    const head: unknown = args.headSha;
    const git: SynchronousGitCommand | undefined = args.runGit;
    return { repository: args.repository, baseSha: args.baseSha, headSha: args.headSha };
  },
  readTag(args) {
    const namespace: unknown = args.tagNamespace;
    const ruleset: unknown = args.rulesetId;
    return { status: 'READ_BACK_OWNER_AMENDMENT_TAG', repository: args.repository, bSha: args.bSha,
      tagRef: args.tagRef, observedTagRefOid: external, tag: { objectOid: external, objectBytes: external } };
  },
  verifyEvidence(args) {
    const context: unknown = args.trustedContext;
    const producer: unknown = args.producerContext;
    const envelope: unknown = args.tagEnvelope;
    return { status: 'VERIFIED_OWNER_AMENDMENT_BLOCK_EVIDENCE', context, producer, envelope };
  },
};
const result: Promise<OwnerAmendmentMergeGroupEvidenceResult> = composeFlat(input);
const physical: Promise<OwnerAmendmentMergeGroupEvidenceResult> = composePhysical(input);
const nativeFetch: OwnerAmendmentMergeGroupEvidenceFetch = fetch;
const bodyOnlyFetch: OwnerAmendmentMergeGroupEvidenceFetch = (
  input: string,
  options: { headers: Record<string, string>; redirect: 'error'; method?: string; body?: string },
) => ({ body: external });
const bridgeFetch: OwnerAmendmentBridgeFetch = bodyOnlyFetch;
const wrapperFetch: OwnerAmendmentMergeGroupEvidenceFetch = bridgeFetch;

const thenable: PromiseLike<unknown> = {
  then<TResult1 = unknown, TResult2 = never>(
    onfulfilled?: ((value: unknown) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return new Promise<TResult1 | TResult2>((resolve, reject) => {
      if (onfulfilled) Promise.resolve(onfulfilled(external)).then(resolve, reject);
      else resolve(external as TResult1);
      void onrejected;
    });
  },
};
const thenableCallback: ComposeOwnerAmendmentMergeGroupEvidenceInput = { readTag: () => thenable };
const syncCallback: ComposeOwnerAmendmentMergeGroupEvidenceInput = { verifyEvidence: () => ({ status: external }) };

async function observe(value: Promise<OwnerAmendmentMergeGroupEvidenceResult>): Promise<void> {
  const state = await value;
  if (state.status === 'VERIFIED_OWNER_AMENDMENT_MERGE_GROUP_EVIDENCE') {
    const digest: string = state.policySha256;
    const arbitraryProducerValue: unknown = state.producerRunId;
    if (state.historicalTrigger === 'none') {
      const absent: 'none' = state.historicalTrigger;
      void absent;
    } else {
      const decision: 'OWNER_DECISION' | 'BLOCK' = state.triggerDecision;
      void decision;
    }
    void [digest, arbitraryProducerValue];
  } else {
    const reason: unknown = state.reason;
    void reason;
  }
}
void [result, physical, nativeFetch, bodyOnlyFetch, bridgeFetch, wrapperFetch, thenableCallback, syncCallback, observe];
