import { createSign } from 'node:crypto';
import { readFileSync, realpathSync, lstatSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const repository = 'flair-agency/architecture-gatekeeper';
const namespace = 'refs/tags/architecture-gatekeeper/amendments';
const workflows = new Set(['owner-amendment-block-handoff.yml', 'owner-amendment-owner-decision-handoff.yml']);
const fail = message => { throw new Error(`Isolated GitHub ruleset readback: ${message}`); };

export function validateCompleteRuleset(value, rulesetId, tagNamespace) {
  const names = Array.isArray(value?.rules) ? value.rules.map(rule => rule?.type) : [];
  const include = value?.conditions?.ref_name?.include;
  if (value?.id !== rulesetId || value.target !== 'tag' || value.enforcement !== 'active' ||
      !Array.isArray(include) || !include.includes(`${tagNamespace}/*`) ||
      !Array.isArray(value.conditions?.ref_name?.exclude) || value.conditions.ref_name.exclude.length ||
      !Array.isArray(names) || !names.includes('update') || !names.includes('deletion') ||
      !Array.isArray(value.bypass_actors) || value.bypass_actors.length) fail('complete bypass-free tag protections are required.');
  return value;
}

export function rulesetReadbackContext(env) {
  const workflow = env.GITHUB_WORKFLOW_REF;
  if (env.GITHUB_REPOSITORY !== repository || env.GITHUB_REF !== 'refs/heads/main' ||
      env.GITHUB_EVENT_NAME !== 'repository_dispatch' ||
      ![...workflows].some(name => workflow === `${repository}/.github/workflows/${name}@refs/heads/main`) ||
      !/^[a-f0-9]{40}$/.test(env.GITHUB_SHA ?? '') ||
      ![env.GITHUB_RUN_ID, env.GITHUB_RUN_ATTEMPT, env.OWNER_AMENDMENT_TAG_RULESET_ID].every(value => /^[1-9]\d*$/.test(value ?? ''))) fail('exact protected-main handoff context is required.');
  return { repository, workflowRef: workflow, revision: env.GITHUB_SHA, runId: env.GITHUB_RUN_ID,
    runAttempt: env.GITHUB_RUN_ATTEMPT, rulesetId: Number(env.OWNER_AMENDMENT_TAG_RULESET_ID), tagNamespace: namespace };
}

/** The installation credential exists only inside this fixed-route process. */
export async function produceRulesetReadback({ env, fetchImpl = fetch, now = () => Date.now() }) {
  const context = rulesetReadbackContext(env);
  if (![env.RULESET_READBACK_APP_ID, env.RULESET_READBACK_INSTALLATION_ID].every(value => /^[1-9]\d*$/.test(value ?? '')) ||
      typeof env.RULESET_READBACK_PRIVATE_KEY !== 'string' || !env.RULESET_READBACK_PRIVATE_KEY) fail('selected App configuration is unavailable.');
  const epoch = Math.floor(now() / 1000);
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  const unsigned = `${encode({ alg: 'RS256', typ: 'JWT' })}.${encode({ iat: epoch - 60, exp: epoch + 540, iss: env.RULESET_READBACK_APP_ID })}`;
  let jwt;
  try { jwt = `${unsigned}.${createSign('RSA-SHA256').update(unsigned).sign(env.RULESET_READBACK_PRIVATE_KEY).toString('base64url')}`; }
  catch { fail('selected App key cannot sign its authentication assertion.'); }
  const api = async (path, credential, method = 'GET', body) => {
    let response;
    try { response = await fetchImpl(`https://api.github.com${path}`, { method, redirect: 'error',
      signal: AbortSignal.timeout(30_000), headers: { accept: 'application/vnd.github+json',
        authorization: `Bearer ${credential}`, 'x-github-api-version': '2022-11-28',
        ...(body ? { 'content-type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) }); }
    catch { fail('fixed GitHub request failed.'); }
    if (!response?.ok) fail(`fixed GitHub request returned HTTP ${response?.status ?? 'unknown'}.`);
    if (response.status === 204) return null;
    try { return await response.json(); } catch { fail('fixed GitHub response is invalid JSON.'); }
  };
  const installation = await api(`/repos/${repository}/installation`, jwt);
  if (installation.id !== Number(env.RULESET_READBACK_INSTALLATION_ID) || installation.app_id !== Number(env.RULESET_READBACK_APP_ID)) fail('repository installation differs from selected App.');
  const issued = await api(`/app/installations/${installation.id}/access_tokens`, jwt, 'POST',
    { repositories: ['architecture-gatekeeper'], permissions: { administration: 'write' } });
  if (typeof issued.token !== 'string' || !issued.token) fail('installation credential is unavailable.');
  let ruleset;
  try {
    const permissions = issued.permissions;
    if (permissions?.administration !== 'write' || Object.keys(permissions).some(name => name !== 'administration' && !(name === 'metadata' && permissions.metadata === 'read')) ||
        !Array.isArray(issued.repositories) || issued.repositories.length !== 1 || issued.repositories[0].full_name !== repository) fail('installation credential is not limited to the selected capability and repository.');
    ruleset = await api(`/repos/${repository}/rulesets/${context.rulesetId}`, issued.token);
    validateCompleteRuleset(ruleset, context.rulesetId, namespace);
  } finally {
    // No snapshot is released unless revocation succeeds, even after a rejected read.
    await api('/installation/token', issued.token, 'DELETE');
    issued.token = undefined;
  }
  return { version: 1, kind: 'protected-main-local-ruleset-readback', context, observedAt: now(), ruleset };
}

/** Fixed hosted-runner storage anchored to the actual checkout, not an env path. */
export function rulesetStorageDirectory(env, cwd = process.cwd()) {
  const workspace = realpathSync(cwd);
  const expectedTemp = join(dirname(dirname(workspace)), '_temp');
  if (typeof env.RUNNER_TEMP !== 'string' || /[\u0000-\u001f\u007f]/.test(env.RUNNER_TEMP) ||
      resolve(env.RUNNER_TEMP) !== expectedTemp) fail('runner storage does not match the actual hosted checkout.');
  const info = lstatSync(expectedTemp);
  if (!info.isDirectory() || info.isSymbolicLink() || realpathSync(expectedTemp) !== expectedTemp) fail('runner storage does not match the actual hosted checkout.');
  return join(expectedTemp, 'owner-amendment-ruleset-readback');
}

/** Same-job protected launcher input, not a portable authenticated receipt. */
export function readLocalRulesetReadback(file, env, { baseSha, rulesetId, tagNamespace }, now = Date.now(), cwd = process.cwd()) {
  const context = rulesetReadbackContext(env);
  const directory = rulesetStorageDirectory(env, cwd), expectedFile = join(directory, 'snapshot.json');
  const info = lstatSync(directory), fileInfo = lstatSync(expectedFile);
  if (!info.isDirectory() || info.isSymbolicLink() || (info.mode & 0o777) !== 0o700 ||
      !fileInfo.isFile() || fileInfo.isSymbolicLink() || (fileInfo.mode & 0o777) !== 0o600 ||
      typeof file !== 'string' || resolve(file) !== expectedFile) fail('local readback must be the fixed private regular snapshot.');
  const bytes = readFileSync(expectedFile);
  if (bytes.length > 65_536) fail('local readback is oversized.');
  const snapshot = JSON.parse(bytes.toString('utf8'));
  if (snapshot.version !== 1 || snapshot.kind !== 'protected-main-local-ruleset-readback' ||
      JSON.stringify(snapshot.context) !== JSON.stringify(context) || context.revision !== baseSha ||
      context.rulesetId !== rulesetId || context.tagNamespace !== tagNamespace ||
      !Number.isSafeInteger(snapshot.observedAt) || snapshot.observedAt > now || now - snapshot.observedAt > 300_000) fail('local readback context or freshness differs.');
  return validateCompleteRuleset(snapshot.ruleset, rulesetId, tagNamespace);
}
