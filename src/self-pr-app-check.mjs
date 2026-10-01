import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { publishSelfArchitectureCheck } from './github-app-check-reporter.mjs';

const API = 'https://api.github.com';
const SELF_REPOSITORY = 'flair-agency/architecture-gatekeeper';
const SELF_WORKFLOW_REF = `${SELF_REPOSITORY}/.github/workflows/self-architecture-gate.yml@refs/heads/main`;
const SHA = /^[a-f0-9]{40}$/;
const POSITIVE = value => Number.isSafeInteger(value) && value > 0;
const isSha = value => typeof value === 'string' && SHA.test(value);
const fail = message => { throw new Error(`Self PR App diagnostic: ${message}`); };

/** Validate the protected merge checkout against the exact event base/head tuple. */
export function verifySelfPullRequestMerge({ repository, eventName, workflowRef, baseRef, baseSha, headSha,
  reviewedSha, actualHeadSha, parents } = {}) {
  if (repository !== SELF_REPOSITORY || eventName !== 'pull_request_target' || workflowRef !== SELF_WORKFLOW_REF ||
      baseRef !== 'main' || !SHA.test(baseSha ?? '') || !SHA.test(headSha ?? '') ||
      !SHA.test(reviewedSha ?? '') || actualHeadSha !== reviewedSha || !Array.isArray(parents) || parents.length !== 2 ||
      parents.some(parent => !SHA.test(parent ?? '')) || parents[0] !== baseSha || parents[1] !== headSha) {
    fail('protected merge revision does not match the exact self pull-request base/head tuple.');
  }
  return Object.freeze({ baseSha, headSha, reviewedSha });
}

async function readJson(fetchImpl, token, url, label) {
  let response;
  try {
    response = await fetchImpl(url, { headers: { accept: 'application/vnd.github+json',
      authorization: `Bearer ${token}`, 'x-github-api-version': '2022-11-28' }, redirect: 'error' });
  } catch { fail(`${label} readback is unavailable.`); }
  if (!response || response.status !== 200 || response.redirected || (response.url && response.url !== url)) {
    fail(`${label} readback is unavailable or redirected.`);
  }
  let value;
  try { value = await response.json(); } catch { fail(`${label} readback is invalid JSON.`); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label} readback is malformed.`);
  return value;
}

function validateReporterInputs(input) {
  if (input?.repository !== SELF_REPOSITORY || input?.eventName !== 'pull_request_target' ||
      input?.workflowRef !== SELF_WORKFLOW_REF || input?.baseRef !== 'main' || input?.draft !== false ||
      !POSITIVE(input?.prNumber) || !SHA.test(input?.baseSha ?? '') || !SHA.test(input?.headSha ?? '') ||
      !SHA.test(input?.reviewedSha ?? '') || !['success', 'failure'].includes(input?.policyResult) ||
      input.policyResult !== 'success' || input?.reviewResult !== 'success' || input?.reportResult !== 'success' ||
      !['success', 'failure'].includes(input?.acceptResult) || typeof input?.token !== 'string' ||
      !input.token.trim() || input.token.length > 4_096 || /[\r\n]/.test(input.token) ||
      typeof input.fetchImpl !== 'function') {
    fail('completed self acceptance and protected PR selectors are required.');
  }
}

/** Read live PR and main state before producing an App diagnostic on the exact PR head. */
export async function prepareSelfPullRequestAppCheck(input = {}) {
  validateReporterInputs(input);
  const prUrl = `${API}/repos/flair-agency/architecture-gatekeeper/pulls/${input.prNumber}`;
  const mainUrl = `${API}/repos/flair-agency/architecture-gatekeeper/git/ref/heads/main`;
  const [pr, main] = await Promise.all([
    readJson(input.fetchImpl, input.token, prUrl, 'live pull request'),
    readJson(input.fetchImpl, input.token, mainUrl, 'live protected main'),
  ]);
  if (pr.number !== input.prNumber || pr.state !== 'open' || pr.draft !== false ||
      !pr.base || typeof pr.base !== 'object' || !pr.head || typeof pr.head !== 'object' ||
      !pr.base.repo || typeof pr.base.repo !== 'object' || pr.base.repo.full_name !== SELF_REPOSITORY ||
      pr.base.ref !== 'main' || !isSha(pr.base.sha) || pr.base.sha.toLowerCase() !== input.baseSha ||
      !isSha(pr.head.sha) || pr.head.sha.toLowerCase() !== input.headSha || !POSITIVE(pr.base.repo.id)) {
    fail('live pull-request tuple differs from the protected review tuple.');
  }
  if (main.ref !== 'refs/heads/main' || !main.object || typeof main.object !== 'object' ||
      main.object.type !== 'commit' || !isSha(main.object.sha) || main.object.sha.toLowerCase() !== input.baseSha) {
    fail('live protected main no longer matches the reviewed base.');
  }
  return Object.freeze({ repository: SELF_REPOSITORY, prNumber: input.prNumber, baseSha: input.baseSha,
    headSha: input.headSha, reviewedSha: input.reviewedSha, repositoryId: pr.base.repo.id,
    conclusion: input.acceptResult === 'success' ? 'success' : 'failure' });
}

/** Publish only the live-verified tuple through the existing App reporter. */
export async function publishSelfPullRequestAppCheck({ app, input, fetchImpl = globalThis.fetch,
  publisher = publishSelfArchitectureCheck } = {}) {
  const context = await prepareSelfPullRequestAppCheck({ ...input, fetchImpl });
  const result = await publisher({ app: { ...app, repositoryId: context.repositoryId },
    result: { headSha: context.headSha, conclusion: context.conclusion }, fetchImpl });
  return Object.freeze({ ...context, publication: result });
}

function git(args) {
  try {
    return execFileSync('git', ['--no-replace-objects', ...args], { encoding: 'utf8', maxBuffer: 65_536,
      timeout: 15_000, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, GIT_NO_REPLACE_OBJECTS: '1' } }).trim();
  } catch { fail('protected reviewed merge commit is unavailable.'); }
}

function output(values) {
  const path = process.env.GITHUB_OUTPUT;
  if (!path || values.some(value => !SHA.test(value ?? ''))) fail('protected output file or SHA is invalid.');
  appendFileSync(path, `base_sha=${values[0]}\nhead_sha=${values[1]}\n`);
}

function verifyMergeFromEnvironment() {
  const reviewedSha = process.env.REVIEWED_SHA;
  if (!isSha(reviewedSha)) fail('protected reviewed merge SHA is invalid.');
  const actualHeadSha = git(['rev-parse', 'HEAD']);
  const parentsLine = git(['rev-list', '--parents', '-n', '1', reviewedSha]);
  const [commit, ...parents] = parentsLine.split(/\s+/);
  const tuple = verifySelfPullRequestMerge({ repository: process.env.GITHUB_REPOSITORY,
    eventName: process.env.GITHUB_EVENT_NAME, workflowRef: process.env.GITHUB_WORKFLOW_REF,
    baseRef: process.env.BASE_REF, baseSha: process.env.EVENT_BASE_SHA, headSha: process.env.EVENT_HEAD_SHA,
    reviewedSha, actualHeadSha, parents: commit === reviewedSha ? parents : [] });
  output([tuple.baseSha, tuple.headSha]);
}

function positiveEnv(name) {
  const raw = process.env[name];
  if (typeof raw !== 'string' || !/^[1-9]\d*$/.test(raw) || !Number.isSafeInteger(Number(raw))) {
    fail('protected GitHub App configuration is invalid.');
  }
  return Number(raw);
}

async function publishFromEnvironment() {
  const input = {
    repository: process.env.GITHUB_REPOSITORY,
    eventName: process.env.GITHUB_EVENT_NAME,
    workflowRef: process.env.GITHUB_WORKFLOW_REF,
    baseRef: process.env.BASE_REF,
    draft: process.env.PR_DRAFT === 'false' ? false : process.env.PR_DRAFT === 'true' ? true : undefined,
    prNumber: Number(process.env.PR_NUMBER),
    baseSha: process.env.VERIFIED_BASE_SHA,
    headSha: process.env.VERIFIED_HEAD_SHA,
    reviewedSha: process.env.REVIEWED_SHA,
    policyResult: process.env.POLICY_RESULT,
    reviewResult: process.env.REVIEW_RESULT,
    reportResult: process.env.REPORT_RESULT,
    acceptResult: process.env.ACCEPT_RESULT,
    token: process.env.GH_TOKEN,
  };
  const app = { appId: positiveEnv('OWNER_AMENDMENT_APP_ID'),
    installationId: positiveEnv('OWNER_AMENDMENT_APP_INSTALLATION_ID'),
    privateKeyPem: process.env.OWNER_AMENDMENT_APP_PRIVATE_KEY };
  const published = await publishSelfPullRequestAppCheck({ app, input });
  process.stdout.write(`Published staged self PR App check for exact protected head ${published.headSha}: ${published.conclusion}.\n`);
  if (published.conclusion !== 'success') process.exitCode = 1;
}

async function main(argv = process.argv.slice(2)) {
  if (argv.length !== 1 || !['verify-merge', 'publish-pr'].includes(argv[0])) {
    fail('expected verify-merge or publish-pr.');
  }
  if (argv[0] === 'verify-merge') verifyMergeFromEnvironment();
  else await publishFromEnvironment();
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch(error => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
}
