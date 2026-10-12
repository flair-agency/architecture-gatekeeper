import { execFileSync } from 'node:child_process';
import { runOwnerAmendmentHandoff } from '../../../src/owner-amendment-handoff-cli.mjs';
import type { OwnerAmendmentHandoffPrRunContextResult } from '../../../src/owner-amendment/owner-amendment-handoff-pr-run-context.mts';
import type { OwnerAmendmentBlockHandoffInput } from '../../../src/owner-amendment/owner-amendment-block-handoff-orchestrator.mts';

const env: Record<string, unknown> = {
  GITHUB_REF: 'refs/heads/main', GITHUB_EVENT_NAME: 'repository_dispatch',
  GITHUB_EVENT_ACTION: 'owner-amendment-block-handoff-v1',
  GITHUB_REPOSITORY: 'flair-agency/architecture-gatekeeper', B_PR_NUMBER: '201',
  A_PR_NUMBER: '199', BLOCK_RUN_ID: '55', BLOCK_RUN_ATTEMPT: '2', GH_TOKEN: 'token',
};
const selectedContext: OwnerAmendmentHandoffPrRunContextResult = {
  status: 'SELECTED_OWNER_AMENDMENT_HANDOFF_PR_RUN_CONTEXT',
  repository: 'flair-agency/architecture-gatekeeper', repositoryId: 1,
  baseSha: 'a'.repeat(40), bPrNumber: '201', bHeadSha: 'b'.repeat(40),
  aPrNumber: '199', aHeadSha: 'c'.repeat(40), runId: '55', runAttempt: '2',
  workflowPath: '.github/workflows/self-architecture-gate.yml', runHeadSha: 'c'.repeat(40), runRepositoryId: 1,
};
const selectContext = async () => selectedContext;
const resolveGitContext = (_input: Parameters<typeof import('../../../src/owner-amendment/owner-amendment-handoff-git-context.mts').resolveOwnerAmendmentHandoffGitContext>[0]) => {
  throw new Error('unconfigured Git fixture');
};
const standardFetch: typeof fetch = fetch;
const standardGit: typeof execFileSync = execFileSync;
const result = runOwnerAmendmentHandoff({ env, fetchImpl: standardFetch, runGit: standardGit,
  selectContext, resolveGitContext });
const typedSyntheticFetch = (_url: string, _init: {
  headers: Record<string, string>;
  redirect?: 'error' | 'follow';
  method?: string;
  body?: string;
}) => ({ ok: true, status: 200, json: () => ({ fixture: true }), body: null });
const typedBodyOnlyFetch = (_url: string, _init: {
  headers: Record<string, string>;
  redirect?: 'error' | 'follow';
  method?: string;
  body?: string;
}) => ({ ok: true, status: 200, body: null });
runOwnerAmendmentHandoff({ fetchImpl: typedSyntheticFetch });
runOwnerAmendmentHandoff({ fetchImpl: typedBodyOnlyFetch });
const partialFetch = async () => ({ ok: true });
const syncOrchestrate = (_input: OwnerAmendmentBlockHandoffInput) => ({ status: 'INCOMPLETE' as const, reason: 'sync fixture' });
const promiseOrchestrate = async (_input: OwnerAmendmentBlockHandoffInput) => ({ status: 'INCOMPLETE' as const, reason: 'promise fixture' });
class ImmediateThenable<T> implements PromiseLike<T> {
  constructor(private readonly value: T) {}
  then<TResult1 = T, TResult2 = never>(
    onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve(this.value).then(onfulfilled, onrejected);
  }
}
const thenableSelect = () => new ImmediateThenable(selectedContext);
runOwnerAmendmentHandoff({ fetchImpl: partialFetch, orchestrate: syncOrchestrate, selectContext: () => selectedContext });
runOwnerAmendmentHandoff({ orchestrate: promiseOrchestrate, selectContext: thenableSelect });
void result;
