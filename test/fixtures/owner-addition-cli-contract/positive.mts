import { prepareMultiAuthorityAddition } from '../../../src/owner-addition-multiauthority.mjs';
import { resolveSingleOwnerAdditionAuthorityId } from '../../../src/owner-addition-ci.mjs';
import { validateOwnerAdditionCiCli } from '../../../src/owner-addition/owner-addition-ci-operations.mts';
import type { AuthorityFetchRequest } from '../../../src/authority-validation/authority-set.mts';
import { resolveCiPolicy } from '../../../src/resolve-ci-policy.mjs';

declare const env: NodeJS.ProcessEnv;
declare const policyBytes: Buffer;
const selected = resolveCiPolicy({ version: 1, default: { mode: 'local-only' }, branches: {} }, 'main');
const id: string = resolveSingleOwnerAdditionAuthorityId('/repo', 'a'.repeat(40), selected, 'docs/authority.md');
const synchronousFetch = (request: AuthorityFetchRequest) => ({
  repository: request.repository, resolvedCommit: request.revision, path: request.path,
  type: 'file', content: Buffer.from('authority'),
});
const asynchronousFetch = async (request: AuthorityFetchRequest) => ({
  repository: request.repository, resolvedCommit: request.revision, path: request.path,
  type: 'file', content: Buffer.from('authority'),
});
const thenable: PromiseLike<unknown> = {
  then<TResult1 = unknown, TResult2 = never>(
    onfulfilled?: ((value: unknown) => TResult1 | PromiseLike<TResult1>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve(onfulfilled ? onfulfilled({}) : undefined) as PromiseLike<TResult1 | TResult2>;
  },
};
void prepareMultiAuthorityAddition(env, selected, policyBytes, { fetchExternal: synchronousFetch });
void prepareMultiAuthorityAddition(env, selected, policyBytes, { fetchExternal: asynchronousFetch });
void prepareMultiAuthorityAddition(env, selected, policyBytes, { fetchExternal: () => thenable });
const cliResult: void = validateOwnerAdditionCiCli();
void [id, cliResult];
