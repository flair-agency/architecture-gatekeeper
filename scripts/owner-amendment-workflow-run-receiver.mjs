#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { publishSelfArchitectureCheck } from '../src/github-app-check-reporter.mjs';
import { adaptVerifiedWorkflowRunContext, resolveProtectedOwnerAmendmentWorkflowRunContext,
  prepareVerifiedCheckReport } from '../src/owner-amendment-workflow-run-receiver.mjs';
import { appendGitHubOutput, readRunnerTempFile, resolveRunnerTempDirectory, writeRunnerTempFile } from '../src/runner-temp-path.mjs';

const SELF = 'flair-agency/architecture-gatekeeper';
const FAIL = message => { throw new Error(`Owner amendment workflow-run receiver: ${message}`); };
const sha = value => typeof value === 'string' && /^[a-f0-9]{40}$/.test(value);
const git = args => execFileSync('git', ['-C', process.env.GITHUB_WORKSPACE, ...args], { encoding: 'utf8',
  maxBuffer: 65_536, timeout: 15_000, stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...process.env, GIT_NO_REPLACE_OBJECTS: '1' } }).trim();

function runnerEvent() {
  if (process.env.GITHUB_EVENT_NAME !== 'workflow_run' || !process.env.GITHUB_EVENT_PATH) {
    FAIL('a protected workflow_run event is required.');
  }
  let bytes;
  try { bytes = readFileSync(process.env.GITHUB_EVENT_PATH); } catch { FAIL('workflow-run selector payload is unavailable.'); }
  if (bytes.length < 1 || bytes.length > 262_144) FAIL('workflow-run selector payload is outside its size limit.');
  try { return JSON.parse(bytes.toString('utf8')); } catch { FAIL('workflow-run selector payload is invalid JSON.'); }
}

function verifyProtectedCheckout(context) {
  if (process.env.GITHUB_REPOSITORY !== SELF || process.env.GITHUB_REF !== 'refs/heads/main' ||
      !sha(process.env.GITHUB_SHA) || !process.env.GITHUB_WORKSPACE) {
    FAIL('receiver must run from the protected self-repository main revision.');
  }
  let head;
  try { head = git(['rev-parse', 'HEAD']); } catch { FAIL('protected receiver checkout is unavailable.'); }
  if (!sha(head) || head !== process.env.GITHUB_SHA || head !== context.currentMainSha) {
    FAIL('protected receiver checkout does not match the independently resolved current main revision.');
  }
}

function contextDirectory() { return resolveRunnerTempDirectory('owner-amendment-merge-group'); }

async function resolveContext({ writeFiles }) {
  if (process.env.GITHUB_REPOSITORY !== SELF || !process.env.GH_TOKEN) FAIL('protected self repository and read token are required.');
  const context = await resolveProtectedOwnerAmendmentWorkflowRunContext({ event: runnerEvent(), token: process.env.GH_TOKEN });
  if (context.status !== 'SELECTED_OWNER_AMENDMENT_WORKFLOW_RUN_MERGE_GROUP_CONTEXT') {
    FAIL(context.reason ?? 'live workflow-run context is incomplete.');
  }
  adaptVerifiedWorkflowRunContext(context);
  verifyProtectedCheckout(context);
  if (writeFiles) {
    const directory = contextDirectory();
    writeRunnerTempFile(directory, 'verified-context.json', JSON.stringify(context));
    appendGitHubOutput(`queue_sha=${context.workflowRunHeadSha}\nbase_sha=${context.currentMainSha}\nb_sha=${context.bHeadSha}\nb_pr_number=${context.bPrNumber}\n`);
  }
  return context;
}

function envPositiveInteger(name) {
  const raw = process.env[name];
  if (typeof raw !== 'string' || !/^[1-9]\d*$/.test(raw)) FAIL('protected GitHub App configuration is invalid.');
  const value = Number(raw);
  if (!Number.isSafeInteger(value)) FAIL('protected GitHub App configuration is invalid.');
  return value;
}

async function publish() {
  const directory = contextDirectory();
  let initial;
  try { initial = JSON.parse(readRunnerTempFile(directory, 'verified-context.json', 16_384).toString('utf8')); }
  catch { FAIL('initial verified live queue context is unavailable.'); }
  adaptVerifiedWorkflowRunContext(initial);

  // Resolve the same wake-up selectors again immediately before publication.
  const finalContext = await resolveContext({ writeFiles: false });
  const verificationOutcome = process.env.VERIFICATION_OUTCOME;
  const route = process.env.VERIFIED_ROUTE;
  const ordinaryOutcome = process.env.ORDINARY_VALIDATION_OUTCOME;
  const report = prepareVerifiedCheckReport({ initialContext: initial, finalContext, verificationOutcome,
    route, ordinaryValidationOutcome: ordinaryOutcome });
  if (report.status !== 'PREPARED_PROTECTED_QUEUE_CHECK') FAIL('live queue or base context changed before App publication.');
  const { headSha, conclusion } = report;
  const privateKeyPem = process.env.OWNER_AMENDMENT_APP_PRIVATE_KEY;
  if (typeof privateKeyPem !== 'string' || !privateKeyPem.includes('PRIVATE KEY')) {
    FAIL('protected GitHub App credential is unavailable.');
  }
  const published = await publishSelfArchitectureCheck({ app: {
    appId: envPositiveInteger('OWNER_AMENDMENT_APP_ID'),
    installationId: envPositiveInteger('OWNER_AMENDMENT_APP_INSTALLATION_ID'),
    repositoryId: finalContext.repositoryId,
    privateKeyPem,
  }, result: { headSha, conclusion } });
  process.stdout.write(`Published protected check ${published.name} for verified queue SHA ${published.headSha}: ${published.conclusion}.\n`);
  if (conclusion !== 'success') process.exitCode = 1;
}

async function main(argv = process.argv.slice(2)) {
  if (argv.length !== 1 || !['resolve', 'publish'].includes(argv[0])) FAIL('expected resolve or publish.');
  if (argv[0] === 'resolve') await resolveContext({ writeFiles: true });
  else await publish();
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch(error => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
}
