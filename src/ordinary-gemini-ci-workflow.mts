import { execFileSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { types } from 'node:util';
import { appendGitHubOutput } from './runner-temp-path.mjs';
import { digestDecision } from './ci-report.mjs';
import { prepareOrdinaryGeminiCiRuntime, runOrdinaryGeminiCiLauncher } from './ordinary-gemini-ci-launcher.mts';
import { createOrdinaryGeminiPublication, emitOrdinaryGeminiPublication } from './ordinary-gemini-ci-publication.mts';

const SHA = /^[a-f0-9]{40}$/;
const RELATIVE_PATH = /^(?:[A-Za-z0-9._-]+\/)*[A-Za-z0-9._-]+$/;
function fail(): never { throw new Error('Protected ordinary Gemini CI did not complete.'); }
function env(name: string): string { const value = process.env[name]; if (typeof value !== 'string' || !value) fail(); return value; }

function maskCommand(value: string): string {
  if (!value || /[\u0000\u007f]/.test(value) || value.length > 16_384) fail();
  return `::add-mask::${value.replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A')}\n`;
}

type GitExec = (file: string, args: readonly string[], options: {
  encoding: 'utf8'; maxBuffer: number; timeout: number; env: NodeJS.ProcessEnv;
  stdio: ['ignore', 'pipe', 'pipe'];
}) => string;

/** Fetch only the exact reviewed commit object; leave checkout state untouched. */
export function fetchOrdinaryGeminiReviewedObject(input: {
  root: string; repository: string; reviewedSha: string; sourceToken: string;
}, registerSecret: (secret: string) => void, runGit: GitExec = execFileSync as GitExec): void {
  if (!input || typeof input !== 'object' || !/^\//.test(input.root) || resolve(input.root) !== input.root ||
      !/^[A-Za-z0-9][A-Za-z0-9-]{0,38}\/[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(input.repository) ||
      !SHA.test(input.reviewedSha) || typeof input.sourceToken !== 'string' || !input.sourceToken ||
      input.sourceToken.length > 16_384 || /[\u0000\r\n]/.test(input.sourceToken) || typeof registerSecret !== 'function' ||
      typeof runGit !== 'function') fail();
  const authorization = `AUTHORIZATION: basic ${Buffer.from(`x-access-token:${input.sourceToken}`, 'utf8').toString('base64')}`;
  try {
    const registration = registerSecret(authorization) as unknown;
    if (registration !== undefined) {
      if (types.isPromise(registration)) void registration.catch(() => {});
      fail();
    }
  } catch { fail(); }
  const gitEnv: NodeJS.ProcessEnv = {
    PATH: process.env.PATH || '/usr/bin:/bin',
    HOME: process.env.HOME || '/tmp',
    TMPDIR: process.env.RUNNER_TEMP || '/tmp',
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_CONFIG_COUNT: '1',
    GIT_CONFIG_KEY_0: 'http.https://github.com/.extraheader',
    GIT_CONFIG_VALUE_0: authorization,
    GIT_NO_REPLACE_OBJECTS: '1',
    GIT_TERMINAL_PROMPT: '0',
    GIT_ASKPASS: '/bin/false',
    SSH_ASKPASS: '/bin/false',
    GIT_ALLOW_PROTOCOL: 'https',
  };
  try {
    runGit('git', ['--no-replace-objects', '-C', input.root, 'fetch', '--no-tags', '--no-recurse-submodules',
      '--no-write-fetch-head', `https://github.com/${input.repository}.git`, input.reviewedSha], {
      encoding: 'utf8', maxBuffer: 131_072, timeout: 60_000, env: gitEnv, stdio: ['ignore', 'pipe', 'pipe'],
    });
    const resolved = runGit('git', ['--no-replace-objects', '-C', input.root, 'rev-parse', '--verify', `${input.reviewedSha}^{commit}`], {
      encoding: 'utf8', maxBuffer: 8_192, timeout: 10_000, env: gitEnv, stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
    if (resolved !== input.reviewedSha) fail();
  } catch { fail(); }
}

export async function runOrdinaryGeminiCiWorkflow(): Promise<void> {
  const repository = env('GITHUB_REPOSITORY');
  const runId = env('GITHUB_RUN_ID');
  const runAttempt = env('GITHUB_RUN_ATTEMPT');
  const workflowSha = env('GATEKEEPER_WORKFLOW_SHA');
  const workflowRef = env('GATEKEEPER_WORKFLOW_REF');
  const workflowRepository = env('GATEKEEPER_WORKFLOW_REPOSITORY');
  const callerWorkflowSha = env('GITHUB_WORKFLOW_SHA');
  const callerWorkflowRef = env('GITHUB_WORKFLOW_REF');
  const eventSha = env('GITHUB_SHA');
  const baseSha = env('BASE_SHA');
  const headSha = env('HEAD_SHA');
  const reviewedSha = env('REVIEWED_SHA');
  const baseBranch = env('BASE_BRANCH');
  // These selector values come from the protected caller workflow. The adapter
  // resolves their bytes only from the protected base commit.
  const policyPath = env('CALLER_POLICY_PATH');
  const promptPath = env('CALLER_PROMPT_PATH');
  const schemaPath = env('CALLER_SCHEMA_PATH');
  const rawValidationPath = process.env.CALLER_VALIDATION_PATH ?? '';
  const validationPath = rawValidationPath || null;
  if (![policyPath, promptPath, schemaPath].every(path => path.length <= 240 && RELATIVE_PATH.test(path) && !path.split('/').some(part => part === '.' || part === '..')) ||
      (validationPath !== null && (validationPath.length > 240 || !RELATIVE_PATH.test(validationPath) || validationPath.split('/').some(part => part === '.' || part === '..')))) fail();
  const root = resolve(env('GITHUB_WORKSPACE'));
  const runnerTemp = resolve(env('RUNNER_TEMP'));
  if (!/^[A-Za-z0-9][A-Za-z0-9-]{0,38}\/[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(repository) ||
      !/^[1-9][0-9]{0,15}$/.test(runId) || !/^[1-9][0-9]{0,5}$/.test(runAttempt) ||
      ![workflowSha, callerWorkflowSha, eventSha, baseSha, headSha, reviewedSha].every(value => SHA.test(value)) ||
      new Set([baseSha, headSha, reviewedSha]).size !== 3 || !/^[A-Za-z0-9._/-]{1,128}$/.test(baseBranch) ||
      !workflowRef.startsWith(`${workflowRepository}/.github/workflows/`) || workflowRef.length > 512 ||
      !callerWorkflowRef.startsWith(`${repository}/.github/workflows/`) || callerWorkflowRef.length > 512 ||
      !root.startsWith('/') || !runnerTemp.startsWith('/') || root === runnerTemp) fail();

  const sourceToken = env('GATEKEEPER_SOURCE_READ_TOKEN');
  const provider = env('GCP_WIF_PROVIDER');
  const serviceAccount = env('GCP_WIF_SERVICE_ACCOUNT');
  const oidcRequestUrl = env('ACTIONS_ID_TOKEN_REQUEST_URL');
  const oidcRequestToken = env('ACTIONS_ID_TOKEN_REQUEST_TOKEN');
  const projectMatch = /@([a-z][a-z0-9-]{4,28}[a-z0-9])\.iam\.gserviceaccount\.com$/.exec(serviceAccount);
  if (!projectMatch) fail();
  const registerSecret = (secret: string): void => { process.stdout.write(maskCommand(secret)); };
  // Register the source capability before it can be used to prepare protected input.
  registerSecret(sourceToken);
  fetchOrdinaryGeminiReviewedObject({ root, repository, reviewedSha, sourceToken }, registerSecret);

  const runtimeDirectory = join(runnerTemp, `agk-ordinary-gemini-runtime-${runId}-${runAttempt}`);
  prepareOrdinaryGeminiCiRuntime({ root, baseSha, runtimeDirectory });
  const result = await runOrdinaryGeminiCiLauncher({
    host: { root, repository, baseBranch, baseSha, headSha, reviewedSha, runId, runAttempt, workflowRef,
      policyPath, promptPath, schemaPath, validationPath },
    runtime: { directory: runtimeDirectory }, sourceToken,
    wif: { workloadIdentityProvider: provider, serviceAccount, project: projectMatch[1], region: 'global',
      oidcRequestUrl, oidcRequestToken },
  }, globalThis.fetch, registerSecret) as {
    context: { repository: string; runId: string; runAttempt: string; workflowRef: string };
    bindings: { baseSha: string; headSha: string; reviewedSha: string };
    authorityProvenance: unknown;
    execution: { status: string };
    decision: { decision: string };
  };
  if (result.execution?.status !== 'completed' || !['PASS', 'BLOCK', 'OWNER_DECISION'].includes(result.decision?.decision)) fail();
  const projection = createOrdinaryGeminiPublication({
    context: { repository, runId, runAttempt, eventSha, callerWorkflowSha, callerWorkflowRef,
      workflowRepository, workflowSha, workflowRef, baseSha, headSha, reviewedSha, provider: 'gemini' },
    decision: result.decision, authorityProvenance: result.authorityProvenance,
    policyVersion: '6', mode: 'enforced', policyResult: 'success', reviewResult: 'success',
    conclusion: result.decision.decision, decisionDigest: digestDecision(result.decision),
  });
  const digest = digestDecision(result.decision);
  appendGitHubOutput(`decision_kind=${result.decision.decision}\nconclusion=${result.decision.decision}\n` +
    `decision_digest=${digest}\nprojection_nonce=${projection.context.nonce}\nreviewed_sha=${reviewedSha}\n`);
  emitOrdinaryGeminiPublication(projection);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { await runOrdinaryGeminiCiWorkflow(); }
  catch { process.stderr.write('Protected ordinary Gemini CI did not complete; review remains incomplete.\n'); process.exitCode = 1; }
}
