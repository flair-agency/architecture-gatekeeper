import {
  assertMissingOwnerAmendmentTagHasNoSuccessfulSigner as assertFlat,
  inspectOwnerAmendmentSemanticProducerAttempts as inspectFlat,
} from '../../../src/owner-amendment-semantic-producer-attempts.mjs';
import {
  assertMissingOwnerAmendmentTagHasNoSuccessfulSigner as assertPhysical,
  inspectOwnerAmendmentSemanticProducerAttempts as inspectPhysical,
} from '../../../src/owner-amendment/owner-amendment-semantic-producer-attempts.mts';
import type {
  OwnerAmendmentSemanticProducerAttemptsInput,
  OwnerAmendmentSemanticProducerAttemptsResult,
} from '../../../src/owner-amendment/owner-amendment-semantic-producer-attempts.mts';

declare const external: unknown;
const request: OwnerAmendmentSemanticProducerAttemptsInput = {
  repository: external, bBaseSha: external, bHeadSha: external,
  bPullRequestCreatedAt: external, queueEnteredAt: external,
  listRuns(input) {
    const repository: 'flair-agency/architecture-gatekeeper' = input.repository;
    const sha: unknown = input.bBaseSha;
    const createdFrom: string = input.createdFrom;
    const page: number = input.page;
    return { total_count: external, workflow_runs: external, repository, sha, createdFrom, page };
  },
  listJobs(input) {
    const repository: 'flair-agency/architecture-gatekeeper' = input.repository;
    const runId: unknown = input.runId;
    const runAttempt: string = input.runAttempt;
    return Promise.resolve({ total_count: external, jobs: external, repository, runId, runAttempt });
  },
};
const result: Promise<OwnerAmendmentSemanticProducerAttemptsResult> = inspectFlat(request);
const physical: Promise<OwnerAmendmentSemanticProducerAttemptsResult> = inspectPhysical(request);
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
const syncCallbacks: OwnerAmendmentSemanticProducerAttemptsInput = {
  ...request, listRuns: () => external, listJobs: () => external,
};
const thenableCallbacks: OwnerAmendmentSemanticProducerAttemptsInput = {
  ...request, listRuns: () => thenable, listJobs: () => thenable,
};
async function observe(promise: Promise<OwnerAmendmentSemanticProducerAttemptsResult>): Promise<void> {
  const narrowed = await promise;
  const attempts: readonly unknown[] = narrowed.attempts;
  const successFlag: boolean = narrowed.hasSuccessfulSignerBeforeQueue;
  const latest = narrowed.latestSignerAttempt;
  if (latest !== null) {
    const run: unknown = latest.run;
    const job: unknown = latest.job;
    const runAttempt: string = latest.runAttempt;
    void [run, job, runAttempt];
  }
  assertFlat(narrowed);
  assertPhysical(external);
  void [attempts, successFlag];
}
void [result, physical, syncCallbacks, thenableCallbacks, observe];
