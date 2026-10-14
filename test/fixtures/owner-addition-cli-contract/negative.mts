import { prepareMultiAuthorityAddition } from '../../../src/owner-addition-multiauthority.mjs';
import { validateOwnerAdditionCiCli } from '../../../src/owner-addition/owner-addition-ci-operations.mts';
import { resolveCiPolicy } from '../../../src/resolve-ci-policy.mjs';

declare const env: NodeJS.ProcessEnv;
const selected = resolveCiPolicy({ version: 1, default: { mode: 'local-only' }, branches: {} }, 'main');
void prepareMultiAuthorityAddition(env, selected, 'policy bytes');
void prepareMultiAuthorityAddition(env, selected, Buffer.from(''), { fetchExternal: 3 });
const asynchronousCli: Promise<void> = validateOwnerAdditionCiCli();
void asynchronousCli;
