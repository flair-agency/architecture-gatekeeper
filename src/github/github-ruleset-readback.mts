import { createSign } from 'node:crypto';
import { readFileSync, realpathSync, lstatSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const repository = 'flair-agency/architecture-gatekeeper';
const namespace = 'refs/tags/architecture-gatekeeper/amendments';
const workflows = new Set(['owner-amendment-block-handoff.yml', 'owner-amendment-owner-decision-handoff.yml']);
const fail = (message: string): never => { throw new Error(`Isolated GitHub ruleset readback: ${message}`); };

export type RulesetReadbackEnvironment = Readonly<Record<string, unknown>>;
export type RulesetReadbackContext = Readonly<{
  repository: 'flair-agency/architecture-gatekeeper';
  workflowRef: string;
  revision: unknown;
  runId: unknown;
  runAttempt: unknown;
  rulesetId: number;
  tagNamespace: 'refs/tags/architecture-gatekeeper/amendments';
}>;
export type RulesetReadbackFetchResponse = Readonly<{
  ok: unknown;
  status: unknown;
  json(): unknown | PromiseLike<unknown>;
}>;
export type RulesetReadbackFetch = (
  input: string,
  init?: RequestInit,
) => RulesetReadbackFetchResponse | null | undefined | PromiseLike<RulesetReadbackFetchResponse | null | undefined>;
export type RulesetReadbackSnapshot = Readonly<{
  version: 1;
  kind: 'protected-main-local-ruleset-readback';
  context: RulesetReadbackContext;
  observedAt: number;
  ruleset: unknown;
}>;
export type ProduceRulesetReadbackOptions = Readonly<{
  env: RulesetReadbackEnvironment;
  fetchImpl?: RulesetReadbackFetch;
  now?: () => number;
}>;
export type LocalRulesetReadbackExpected = Readonly<{
  baseSha: string;
  rulesetId: number;
  tagNamespace: string;
}>;

type RulesetReadbackRuleView = { type?: unknown };
type RulesetReadbackRulesetView = {
  rules?: unknown[];
  conditions?: { ref_name?: { include?: unknown; exclude?: unknown } | null } | null;
  id?: unknown;
  target?: unknown;
  enforcement?: unknown;
  bypass_actors?: unknown;
};
type RulesetReadbackInstallationView = { id?: unknown; app_id?: unknown };
type RulesetReadbackIssuedCredentialView = {
  token?: unknown;
  permissions?: { administration?: unknown; metadata?: unknown } | null;
  repositories?: unknown;
};
type RulesetReadbackRepositoryView = { full_name?: unknown };
type RulesetReadbackSnapshotView = {
  version?: unknown;
  kind?: unknown;
  context?: unknown;
  observedAt?: unknown;
  ruleset?: unknown;
};

// Readonly annotations prevent typed reassignment; returned runtime objects remain unfrozen.

// These erased views keep the source's original repeated property operations; accessor stability is not asserted.
export function validateCompleteRuleset(value: unknown, rulesetId: number, tagNamespace: string): unknown {
  const names = Array.isArray((value as RulesetReadbackRulesetView | null | undefined)?.rules) ? (value as RulesetReadbackRulesetView).rules!.map(rule => (rule as RulesetReadbackRuleView | null | undefined)?.type) : [];
  const include = (value as RulesetReadbackRulesetView | null | undefined)?.conditions?.ref_name?.include;
  if ((value as RulesetReadbackRulesetView | null | undefined)?.id !== rulesetId || (value as RulesetReadbackRulesetView).target !== 'tag' || (value as RulesetReadbackRulesetView).enforcement !== 'active' ||
      !Array.isArray(include) || !include.includes(`${tagNamespace}/*`) ||
      !Array.isArray((value as RulesetReadbackRulesetView).conditions?.ref_name?.exclude) ||
      (((value as RulesetReadbackRulesetView).conditions as { ref_name: { exclude: unknown[] } }).ref_name.exclude).length ||
      !Array.isArray(names) || !names.includes('update') || !names.includes('deletion') ||
      !Array.isArray((value as RulesetReadbackRulesetView).bypass_actors) || ((value as RulesetReadbackRulesetView).bypass_actors as unknown[]).length) fail('complete bypass-free tag protections are required.');
  return value;
}

export function rulesetReadbackContext(env: RulesetReadbackEnvironment): RulesetReadbackContext {
  const workflow = env.GITHUB_WORKFLOW_REF;
  if (env.GITHUB_REPOSITORY !== repository || env.GITHUB_REF !== 'refs/heads/main' ||
      env.GITHUB_EVENT_NAME !== 'repository_dispatch' ||
      ![...workflows].some(name => workflow === `${repository}/.github/workflows/${name}@refs/heads/main`) ||
      !/^[a-f0-9]{40}$/.test((env.GITHUB_SHA as string | null | undefined) ?? '') ||
      ![env.GITHUB_RUN_ID, env.GITHUB_RUN_ATTEMPT, env.OWNER_AMENDMENT_TAG_RULESET_ID].every(value => /^[1-9]\d*$/.test((value as string | null | undefined) ?? ''))) fail('exact protected-main handoff context is required.');
  return { repository, workflowRef: workflow as string, revision: env.GITHUB_SHA,
    runId: env.GITHUB_RUN_ID, runAttempt: env.GITHUB_RUN_ATTEMPT, rulesetId: Number(env.OWNER_AMENDMENT_TAG_RULESET_ID), tagNamespace: namespace };
}

/** The installation credential exists only inside this fixed-route process. */
export async function produceRulesetReadback({ env, fetchImpl = fetch, now = () => Date.now() }: ProduceRulesetReadbackOptions): Promise<RulesetReadbackSnapshot> {
  const context = rulesetReadbackContext(env);
  if (![env.RULESET_READBACK_APP_ID, env.RULESET_READBACK_INSTALLATION_ID].every(value => /^[1-9]\d*$/.test((value as string | null | undefined) ?? '')) ||
      typeof env.RULESET_READBACK_PRIVATE_KEY !== 'string' || !env.RULESET_READBACK_PRIVATE_KEY) fail('selected App configuration is unavailable.');
  const epoch = Math.floor(now() / 1000);
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const unsigned = `${encode({ alg: 'RS256', typ: 'JWT' })}.${encode({ iat: epoch - 60, exp: epoch + 540, iss: env.RULESET_READBACK_APP_ID })}`;
  let jwt!: string;
  try { jwt = `${unsigned}.${createSign('RSA-SHA256').update(unsigned).sign(env.RULESET_READBACK_PRIVATE_KEY as string).toString('base64url')}`; }
  catch { fail('selected App key cannot sign its authentication assertion.'); }
  const api = async (path: string, credential: string, method = 'GET', body?: unknown): Promise<unknown> => {
    let response;
    try { response = await fetchImpl(`https://api.github.com${path}`, { method, redirect: 'error',
      signal: AbortSignal.timeout(30_000), headers: { accept: 'application/vnd.github+json',
        authorization: `Bearer ${credential}`, 'x-github-api-version': '2022-11-28',
        ...(body ? { 'content-type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) }); }
    catch { fail('fixed GitHub request failed.'); }
    if (!(response as RulesetReadbackFetchResponse | null | undefined)?.ok) fail(`fixed GitHub request returned HTTP ${(response as RulesetReadbackFetchResponse | null | undefined)?.status ?? 'unknown'}.`);
    if ((response as RulesetReadbackFetchResponse).status === 204) return null;
    try { return await (response as RulesetReadbackFetchResponse).json(); } catch { fail('fixed GitHub response is invalid JSON.'); }
  };
  const installation = await api(`/repos/${repository}/installation`, jwt);
  // API JSON remains unknown until existing runtime checks inspect its fields.
  if ((installation as RulesetReadbackInstallationView).id !== Number(env.RULESET_READBACK_INSTALLATION_ID) || (installation as RulesetReadbackInstallationView).app_id !== Number(env.RULESET_READBACK_APP_ID)) fail('repository installation differs from selected App.');
  const issued = await api(`/app/installations/${(installation as RulesetReadbackInstallationView).id}/access_tokens`, jwt, 'POST',
    { repositories: ['architecture-gatekeeper'], permissions: { administration: 'write' } });
  if (typeof (issued as RulesetReadbackIssuedCredentialView).token !== 'string' || !(issued as RulesetReadbackIssuedCredentialView).token) fail('installation credential is unavailable.');
  let ruleset;
  try {
    const permissions = (issued as RulesetReadbackIssuedCredentialView).permissions;
    if (permissions?.administration !== 'write' || Object.keys(permissions as object).some(name => name !== 'administration' && !(name === 'metadata' && permissions.metadata === 'read')) ||
        !Array.isArray((issued as RulesetReadbackIssuedCredentialView).repositories) || ((issued as RulesetReadbackIssuedCredentialView).repositories as unknown[]).length !== 1 || (((issued as RulesetReadbackIssuedCredentialView).repositories as RulesetReadbackRepositoryView[])[0]).full_name !== repository) fail('installation credential is not limited to the selected capability and repository.');
    ruleset = await api(`/repos/${repository}/rulesets/${context.rulesetId}`, (issued as RulesetReadbackIssuedCredentialView).token as string);
    validateCompleteRuleset(ruleset, context.rulesetId, namespace);
  } finally {
    // No snapshot is released unless revocation succeeds, even after a rejected read.
    await api('/installation/token', (issued as RulesetReadbackIssuedCredentialView).token as string, 'DELETE');
    (issued as RulesetReadbackIssuedCredentialView).token = undefined;
  }
  return { version: 1, kind: 'protected-main-local-ruleset-readback', context, observedAt: now(), ruleset };
}

/** Fixed hosted-runner storage anchored to the actual checkout, not an env path. */
export function rulesetStorageDirectory(env: RulesetReadbackEnvironment, cwd = process.cwd()): string {
  const workspace = realpathSync(cwd);
  const expectedTemp = join(dirname(dirname(workspace)), '_temp');
  if (typeof env.RUNNER_TEMP !== 'string' || /[\u0000-\u001f\u007f]/.test(env.RUNNER_TEMP) ||
      resolve(env.RUNNER_TEMP) !== expectedTemp) fail('runner storage does not match the actual hosted checkout.');
  const info = lstatSync(expectedTemp);
  if (!info.isDirectory() || info.isSymbolicLink() || realpathSync(expectedTemp) !== expectedTemp) fail('runner storage does not match the actual hosted checkout.');
  return join(expectedTemp, 'owner-amendment-ruleset-readback');
}

/** Same-job protected launcher input, not a portable authenticated receipt. */
export function readLocalRulesetReadback(file: unknown, env: RulesetReadbackEnvironment, { baseSha, rulesetId, tagNamespace }: LocalRulesetReadbackExpected, now = Date.now(), cwd = process.cwd()): unknown {
  const context = rulesetReadbackContext(env);
  const directory = rulesetStorageDirectory(env, cwd), expectedFile = join(directory, 'snapshot.json');
  const info = lstatSync(directory), fileInfo = lstatSync(expectedFile);
  if (!info.isDirectory() || info.isSymbolicLink() || (info.mode & 0o777) !== 0o700 ||
      !fileInfo.isFile() || fileInfo.isSymbolicLink() || (fileInfo.mode & 0o777) !== 0o600 ||
      typeof file !== 'string' || resolve(file) !== expectedFile) fail('local readback must be the fixed private regular snapshot.');
  const bytes = readFileSync(expectedFile);
  if (bytes.length > 65_536) fail('local readback is oversized.');
  const snapshot: unknown = JSON.parse(bytes.toString('utf8'));
  if ((snapshot as RulesetReadbackSnapshotView).version !== 1 || (snapshot as RulesetReadbackSnapshotView).kind !== 'protected-main-local-ruleset-readback' ||
      JSON.stringify((snapshot as RulesetReadbackSnapshotView).context) !== JSON.stringify(context) || context.revision !== baseSha ||
      context.rulesetId !== rulesetId || context.tagNamespace !== tagNamespace ||
      !Number.isSafeInteger((snapshot as RulesetReadbackSnapshotView).observedAt) || ((snapshot as RulesetReadbackSnapshotView).observedAt as number) > now || now - ((snapshot as RulesetReadbackSnapshotView).observedAt as number) > 300_000) fail('local readback context or freshness differs.');
  return validateCompleteRuleset((snapshot as RulesetReadbackSnapshotView).ruleset, rulesetId, tagNamespace);
}
