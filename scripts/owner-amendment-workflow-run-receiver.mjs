#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { closeSync, constants, fstatSync, lstatSync, openSync, readFileSync, realpathSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { publishSelfArchitectureCheck } from '../src/github-app-check-reporter.mjs';
import { assertOwnerAmendmentTagAbsentAtAcceptance } from '../src/owner-amendment-tag-attempt.mjs';
import { adaptVerifiedWorkflowRunContext, resolveProtectedOwnerAmendmentWorkflowRunContext,
  prepareVerifiedCheckReport, sameVerifiedWorkflowRunContext } from '../src/owner-amendment-workflow-run-receiver.mjs';
import { parseCiPolicyJson, resolveCiPolicy } from '../src/resolve-ci-policy.mjs';
import { appendGitHubOutput, readRunnerTempFile, resolveRunnerTempDirectory, writeRunnerTempFile } from '../src/runner-temp-path.mjs';

const SELF = 'flair-agency/architecture-gatekeeper';
const FAIL = message => { throw new Error(`Owner amendment workflow-run receiver: ${message}`); };
const sha = value => typeof value === 'string' && /^[a-f0-9]{40}$/.test(value);
const git = args => execFileSync('git', ['-C', process.env.GITHUB_WORKSPACE, ...args], { encoding: 'utf8',
  maxBuffer: 65_536, timeout: 15_000, stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...process.env, GIT_NO_REPLACE_OBJECTS: '1' } }).trim();

export function runnerEvent() {
  if (process.env.GITHUB_EVENT_NAME !== 'workflow_run' || !process.env.GITHUB_EVENT_PATH) {
    FAIL('a protected workflow_run event is required.');
  }
  let runnerTemp;
  try { runnerTemp = realpathSync(process.cwd()); } catch { FAIL('runner temp directory is unavailable.'); }
  if (!process.env.RUNNER_TEMP || process.env.RUNNER_TEMP !== process.cwd()) {
    FAIL('working directory is not the runner temp directory.');
  }
  const eventDirectory = join(runnerTemp, '_github_workflow');
  const eventFile = join(eventDirectory, 'event.json');
  if (process.env.GITHUB_EVENT_PATH !== eventFile) FAIL('GitHub event path is not the canonical runner event file.');
  let directoryStat;
  try { directoryStat = lstatSync(eventDirectory); } catch { FAIL('runner event directory is unavailable.'); }
  let realEventDirectory;
  try { realEventDirectory = realpathSync(eventDirectory); } catch { FAIL('runner event directory is unavailable.'); }
  if (!directoryStat.isDirectory() || directoryStat.isSymbolicLink() || realEventDirectory !== eventDirectory) {
    FAIL('runner event directory is not a real direct child of runner temp.');
  }
  let bytes;
  let fd;
  try { fd = openSync(eventFile, constants.O_RDONLY | constants.O_NONBLOCK | (constants.O_NOFOLLOW ?? 0)); }
  catch { FAIL('workflow-run selector payload is unavailable or outside its bounded runner path.'); }
  let stat;
  try { stat = fstatSync(fd); }
  catch { closeSync(fd); FAIL('workflow-run selector payload is unavailable.'); }
  if (!stat.isFile() || stat.nlink !== 1 || stat.size < 1 || stat.size > 262_144) {
    closeSync(fd); FAIL('workflow-run selector payload is not a bounded regular file.');
  }
  try { bytes = readFileSync(fd); }
  catch { FAIL('workflow-run selector payload is unavailable.'); }
  finally { closeSync(fd); }
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
const HANDOFF_LIMIT = 11_800;

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

export function decodeHandoff(encoded) {
  if (typeof encoded !== 'string' || encoded.length > 4 * Math.ceil(HANDOFF_LIMIT / 3)) FAIL('handoff output is missing or oversized.');
  const bytes = Buffer.from(encoded, 'base64');
  if (!bytes.length || bytes.length > HANDOFF_LIMIT || bytes.toString('base64') !== encoded) FAIL('handoff payload is malformed or oversized.');
  let value;
  try { value = JSON.parse(bytes.toString('utf8')); } catch { FAIL('handoff payload is invalid JSON.'); }
  if (!value || Object.keys(value).length !== 2 || !Object.hasOwn(value, 'context') || !Object.hasOwn(value, 'decision') ||
      (value.decision !== null && typeof value.decision !== 'string')) FAIL('handoff payload has an invalid shape.');
  adaptVerifiedWorkflowRunContext(value.context);
  return value;
}

function readHandoff() { return decodeHandoff(process.env.HANDOFF); }

function compareHandoff() {
  const original = readHandoff();
  const live = JSON.parse(readRunnerTempFile(contextDirectory(), 'verified-context.json', 16_384).toString('utf8'));
  if (!sameVerifiedWorkflowRunContext(original.context, live)) FAIL('reporter live context differs from original reviewer context.');
}

function printDecision() {
  const value = readHandoff();
  process.stdout.write(value.decision ?? '');
}

async function publish() {
  const handoff = readHandoff();
  const initial = handoff.context;

  // Resolve the same wake-up selectors again immediately before publication.
  const finalContext = await resolveContext({ writeFiles: false });
  const verificationOutcome = process.env.VERIFICATION_OUTCOME;
  const route = process.env.VERIFIED_ROUTE;
  const ordinaryOutcome = process.env.ORDINARY_VALIDATION_OUTCOME;
  if (route === 'amendment' && handoff.decision !== null) FAIL('amendment route handoff contains unexpected ordinary decision bytes.');
  if (verificationOutcome === 'success' && route === 'ordinary' && ordinaryOutcome === 'success') {
    const policyBytes = Buffer.from(git(['show', `${finalContext.currentMainSha}:.codex/gatekeeper/ci-policy.json`]), 'utf8');
    const policy = resolveCiPolicy(parseCiPolicyJson(policyBytes.toString('utf8')), 'main');
    if (policy.ownerAmendmentGrade === 'G0') await assertOwnerAmendmentTagAbsentAtAcceptance({
      repository: SELF, baseSha: finalContext.currentMainSha, bSha: finalContext.bHeadSha, baseBranch: 'main',
      triggerProfile: policy.ownerAmendmentTriggerProfile, policyBytes,
      readTagRef: async ({ expectedUrl }) => {
        let response;
        try { response = await fetch(expectedUrl, { headers: { accept: 'application/vnd.github+json',
          authorization: `Bearer ${process.env.GH_TOKEN}`, 'x-github-api-version': '2022-11-28' }, redirect: 'error' }); }
        catch { FAIL('protected exact-B tag lookup failed at final acceptance.'); }
        return { status: response.status, requestedUrl: expectedUrl };
      },
    });
  }
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

function handoff() {
  const directory = contextDirectory();
  const context = JSON.parse(readRunnerTempFile(directory, 'verified-context.json', 16_384).toString('utf8'));
  adaptVerifiedWorkflowRunContext(context);
  const raw = process.env.DECISION;
  if (typeof raw !== 'string' || Buffer.byteLength(raw, 'utf8') > 262_144) FAIL('ordinary decision output is missing or oversized.');
  const envelope = Buffer.from(JSON.stringify({ context, decision: raw || null }));
  if (envelope.length > HANDOFF_LIMIT) FAIL('handoff payload exceeds its fixed size limit.');
  appendGitHubOutput(`handoff=${envelope.toString('base64')}\n`);
}

async function main(argv = process.argv.slice(2)) {
  if (argv.length !== 1 || !['resolve', 'handoff', 'compare-handoff', 'print-decision', 'publish'].includes(argv[0])) FAIL('expected resolve, handoff, compare-handoff, print-decision, or publish.');
  if (argv[0] === 'resolve') await resolveContext({ writeFiles: true });
  else if (argv[0] === 'handoff') handoff();
  else if (argv[0] === 'compare-handoff') compareHandoff();
  else if (argv[0] === 'print-decision') printDecision();
  else await publish();
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch(error => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
}
