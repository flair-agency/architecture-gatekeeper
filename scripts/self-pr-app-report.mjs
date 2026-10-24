#!/usr/bin/env node
import { constants, openSync, closeSync, fstatSync, lstatSync, realpathSync, readSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { TextDecoder } from 'node:util';
import { pathToFileURL } from 'node:url';
import { appendGitHubOutput } from '../src/runner-temp-path.mjs';
import { beginProtectedSelfPrCheck, finishProtectedSelfPrCheck } from '../src/self-pr-app-producer.mjs';
import { parseCiPolicyJson, resolveCiPolicy } from '../src/resolve-ci-policy.mjs';
import { validateCodexPass } from '../src/ci-review/codex-pass-producer.mts';
import { contextOf, requireSelfPassContext } from '../src/ci-review/codex-pass-publication.mts';
import { finalizeSelfArchitectureCheck } from '../src/github-app-check-reporter.mjs';
import { inspectSelfAuthorityChanges } from '../src/ci-self-authority-change.mjs';
import { classifyReview } from '../src/ci-report.mjs';
import { readRunnerTempFile, resolveRunnerTempDirectory } from '../src/runner-temp-path.mjs';
import { discoverOwnerAmendmentBlockArtifact } from '../src/owner-amendment-artifact-discovery.mjs';
import { fetchOwnerAmendmentBlockArtifact } from '../src/owner-amendment-artifact.mjs';
import { extractOwnerAmendmentArtifactZip } from '../src/owner-amendment-artifact-zip.mjs';
import { verifyOwnerAmendmentBlockEvidence } from '../src/owner-amendment-attestation.mjs';
import { validateOwnerAmendmentSemanticEligibilityReceipt } from '../src/owner-amendment-semantic-eligibility.mjs';
import { trustedGitHubWorkspaceRoot } from '../src/github-runner-workspace.mjs';

const SELF = 'flair-agency/architecture-gatekeeper';
const SELF_ID = 1379218762;
const SHA = /^[a-f0-9]{40}$/;
function fail(message) { throw new Error(`Self PR App report: ${message}`); }
export function extractEligibilityArtifact(zipBytes) {
  return extractOwnerAmendmentArtifactZip(zipBytes, { profile: 'eligibility' });
}
function validateRunnerTemp(env) {
  if (realpathSync(process.cwd()) !== process.cwd() || env.RUNNER_TEMP !== process.cwd()) {
    fail('working directory must be the runner-owned temporary directory.');
  }
}
function validateProtectedWorkspace(env) {
  const workspace = trustedGitHubWorkspaceRoot();
  if (typeof workspace !== 'string' || !workspace.startsWith('/')) fail('protected workspace root is unavailable.');
  const top = execFileSync('git', ['--no-replace-objects', '-C', workspace, 'rev-parse', '--show-toplevel'],
    { encoding: 'utf8', maxBuffer: 4096, timeout: 10_000, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const head = execFileSync('git', ['--no-replace-objects', '-C', workspace, 'rev-parse', 'HEAD'],
    { encoding: 'utf8', maxBuffer: 4096, timeout: 10_000, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  if (top !== workspace || head !== env.BASE_SHA) fail('protected checkout HEAD is not the exact selected base.');
}
function fetchProtectedReviewObjects(env, context) {
  if (typeof env.GH_TOKEN !== 'string' || env.GH_TOKEN.length === 0) fail('protected read token is unavailable for immutable Git objects.');
  const workspace = trustedGitHubWorkspaceRoot();
  const remote = `https://github.com/${SELF}.git`;
  const authorization = `AUTHORIZATION: basic ${Buffer.from(`x-access-token:${env.GH_TOKEN}`, 'utf8').toString('base64')}`;
  const gitEnv = { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_COUNT: '1',
    GIT_CONFIG_KEY_0: 'http.https://github.com/.extraheader', GIT_CONFIG_VALUE_0: authorization,
    GIT_TERMINAL_PROMPT: '0', GIT_ASKPASS: '/bin/false', SSH_ASKPASS: '/bin/false', GIT_ALLOW_PROTOCOL: 'https', GIT_NO_REPLACE_OBJECTS: '1' };
  for (const sha of [context.subjectSha, context.headSha]) {
    execFileSync('git', ['--no-replace-objects', '-C', workspace, 'fetch', '--quiet', '--no-tags', '--no-recurse-submodules',
      '--no-write-fetch-head', remote, sha], { env: gitEnv, encoding: 'utf8', maxBuffer: 16_384, timeout: 60_000, stdio: ['ignore', 'ignore', 'ignore'] });
    const fetched = execFileSync('git', ['--no-replace-objects', '-C', workspace, 'rev-parse', '--verify', `${sha}^{commit}`],
      { env: gitEnv, encoding: 'utf8', maxBuffer: 4096, timeout: 10_000, stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    if (fetched !== sha) fail('protected Git fetch did not materialize the exact selected review commit.');
  }
}
function strictBase64(value, label, max = 65_536) {
  if (typeof value !== 'string' || value.length < 1 || value.length > Math.ceil(max * 4 / 3) + 8 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) fail(`${label} encoding is invalid.`);
  const bytes = Buffer.from(value, 'base64');
  if (bytes.length > max || bytes.toString('base64') !== value) fail(`${label} exceeds its bound or is not canonical base64.`);
  return bytes;
}
function boundedFile(path, max) {
  const absolute = resolve(path), before = lstatSync(absolute);
  if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1 || realpathSync(absolute) !== absolute || before.size < 1 || before.size > max) fail('protected event file is not a bounded regular file.');
  const fd = openSync(absolute, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const after = fstatSync(fd);
    if (!after.isFile() || after.nlink !== 1 || after.dev !== before.dev || after.ino !== before.ino || after.size !== before.size) fail('protected event file changed during read.');
    const bytes = Buffer.alloc(after.size); let at = 0;
    while (at < bytes.length) { const count = readSync(fd, bytes, at, bytes.length - at, at); if (!count) fail('protected event file was truncated.'); at += count; }
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } finally { closeSync(fd); }
}
function protectedCallerContext(env) {
  if (env.GITHUB_REPOSITORY !== SELF || env.GITHUB_REPOSITORY_ID !== String(SELF_ID) ||
      env.GITHUB_EVENT_NAME !== 'pull_request_target' || env.GITHUB_SHA !== env.GITHUB_WORKFLOW_SHA ||
      env.GITHUB_SHA !== env.BASE_SHA || env.GATEKEEPER_WORKFLOW_SHA !== env.BASE_SHA ||
      env.GITHUB_WORKFLOW_REF !== `${SELF}/.github/workflows/self-architecture-gate.yml@refs/heads/main` ||
      env.GATEKEEPER_WORKFLOW_REPOSITORY !== SELF || !SHA.test(env.GATEKEEPER_WORKFLOW_SHA || '') ||
      env.GATEKEEPER_WORKFLOW_REF !== `${SELF}/.github/workflows/self-architecture-gate.yml@refs/heads/main`) fail('protected caller/runtime identity is not the adopted self workflow.');
  const eventPath = resolve(process.cwd(), '_github_workflow', 'event.json');
  if (env.GITHUB_EVENT_PATH !== eventPath) fail('event path is not the fixed runner temporary event file.');
  const event = boundedFile(eventPath, 65_536);
  const pr = event?.pull_request;
  if (!pr || String(pr.number) !== env.PR_NUMBER || pr.base?.sha !== env.BASE_SHA || pr.head?.sha !== env.HEAD_SHA || env.BASE_BRANCH !== 'main') fail('protected workflow tuple differs from the trusted PR event.');
  return { event, selectorInput: { eventName: env.GITHUB_EVENT_NAME, event,
    sourceBaseSha: env.GITHUB_SHA, runtimeBaseSha: env.GATEKEEPER_WORKFLOW_SHA, token: env.GH_TOKEN } };
}
function runtimeContext(env) {
  const caller = protectedCallerContext(env);
  if (env.AGK_REVIEW_WORKFLOW_REPOSITORY !== SELF || env.AGK_REVIEW_WORKFLOW_SHA !== env.BASE_SHA) fail('trusted reusable workflow source does not match the protected base.');
  const context = contextOf({ repository: env.GITHUB_REPOSITORY, runId: env.GITHUB_RUN_ID, runAttempt: env.GITHUB_RUN_ATTEMPT,
    eventSha: env.GITHUB_SHA, callerWorkflowSha: env.GITHUB_WORKFLOW_SHA, callerWorkflowRef: env.GITHUB_WORKFLOW_REF,
    workflowRepository: env.AGK_REVIEW_WORKFLOW_REPOSITORY, workflowSha: env.AGK_REVIEW_WORKFLOW_SHA,
    workflowRef: env.AGK_REVIEW_WORKFLOW_REF, baseSha: env.BASE_SHA, headSha: env.HEAD_SHA, reviewedSha: env.AGK_REVIEWED_SHA });
  requireSelfPassContext(context);
  return { ...caller, context };
}
function getApp(env) {
  const appId = Number(env.AGK_APP_ID), installationId = Number(env.AGK_APP_INSTALLATION_ID);
  const privateKeyPem = env.AGK_APP_PRIVATE_KEY?.replace(/\\n/g, '\n');
  if (!Number.isSafeInteger(appId) || appId < 1 || !Number.isSafeInteger(installationId) || installationId < 1 || typeof privateKeyPem !== 'string') fail('dedicated App credentials are unavailable.');
  return { appId, installationId, repositoryId: SELF_ID, privateKeyPem };
}
function gitShow(cwd, sha, path, limit = 1_048_576) {
  const bytes = execFileSync('git', ['--no-replace-objects', 'show', `${sha}:${path}`], { cwd, encoding: 'buffer', maxBuffer: limit + 1, timeout: 10_000, stdio: ['ignore', 'pipe', 'pipe'] });
  if (bytes.length < 1 || bytes.length > limit) fail(`protected base file ${path} is missing or too large.`);
  return bytes;
}
async function validateOldReviewInputs(env, context) {
  if (env.AGK_MODE !== 'enforced' || env.AGK_POLICY_RESULT !== 'success' || env.AGK_REVIEW_RESULT !== 'success') fail('protected policy/review result is not successful.');
  const cwd = trustedGitHubWorkspaceRoot();
  if (!cwd || realpathSync(cwd) !== cwd) fail('protected checkout root is unavailable.');
  const policyBytes = gitShow(cwd, context.baseSha, '.codex/gatekeeper/ci-policy.json', 65_536);
  const policySha = createHash('sha256').update(policyBytes).digest('hex');
  if (policySha !== env.AGK_POLICY_SHA256) fail('reported Policy digest differs from the selected protected base.');
  const policy = resolveCiPolicy(parseCiPolicyJson(policyBytes.toString('utf8')), 'main');
  const policyVersion = JSON.parse(policyBytes.toString('utf8')).version;
  if (policy.mode !== 'enforced' || !Number.isSafeInteger(policyVersion)) fail('selected old Policy is not an enforced supported profile.');
  const decisionBytes = strictBase64(env.AGK_DECISION_BASE64, 'validated decision');
  const provenanceBytes = strictBase64(env.AGK_AUTHORITY_PROVENANCE_BASE64, 'old Authority provenance');
  const provenanceText = new TextDecoder('utf-8', { fatal: true }).decode(provenanceBytes);
  const schemaText = gitShow(cwd, context.baseSha, '.codex/gatekeeper/ci-decision.schema.json').toString('utf8');
  const rulesText = gitShow(cwd, context.baseSha, '.codex/gatekeeper/decision.validation.json').toString('utf8');
  const oldSelection = await inspectSelfAuthorityChanges({ repository: SELF, baseSha: context.baseSha, headSha: context.headSha,
    reviewedSha: context.reviewedSha, baseBranch: 'main', policyPath: '.codex/gatekeeper/ci-policy.json', policySha256: policySha,
    provenance: JSON.parse(provenanceText), cwd });
  const pass = validateCodexPass({ context, decisionText: new TextDecoder('utf-8', { fatal: true }).decode(decisionBytes), schemaText,
    rulesText, authorityText: provenanceText, legacyText: null, authorityEncoded: env.AGK_AUTHORITY_PROVENANCE_BASE64,
    legacyEncoded: '', policyVersion: String(policyVersion), mode: env.AGK_MODE,
    policyResult: env.AGK_POLICY_RESULT, reviewResult: env.AGK_REVIEW_RESULT });
  const rawDecision = new TextDecoder('utf-8', { fatal: true }).decode(decisionBytes);
  const classified = classifyReview({ mode: env.AGK_MODE, policyResult: env.AGK_POLICY_RESULT,
    reviewResult: env.AGK_REVIEW_RESULT, rawDecision });
  return { cwd, policy, policyVersion, policySha, provenance: JSON.parse(provenanceText), oldSelection, pass, classified };
}
async function validateOrdinary(env, context) {
  if (env.AGK_SELECTED_AUTHORITY_CHANGED !== 'false') fail('protected old selected-authority result is not unchanged.');
  const old = await validateOldReviewInputs(env, context);
  if (old.oldSelection.changed || !old.pass || old.classified.conclusion !== 'PASS') fail('protected result did not validate as unchanged ordinary PASS.');
  return { route: 'ordinary-pass' };
}
async function validateAmendmentEligibility(env, context) {
  if (env.AGK_SELECTED_AUTHORITY_CHANGED !== 'true' || env.AGK_AMENDMENT_SIGNER_RESULT !== 'success' ||
      env.AGK_AMENDMENT_SIGNER_STATUS !== 'prepared' ||
      typeof env.AGK_AMENDMENT_COMPLETED_AT !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(env.AGK_AMENDMENT_COMPLETED_AT) ||
      !Number.isFinite(Date.parse(env.AGK_AMENDMENT_COMPLETED_AT)) || Date.parse(env.AGK_AMENDMENT_COMPLETED_AT) > Date.now() + 5 * 60_000 ||
      env.AGK_AMENDMENT_ELIGIBILITY !== 'ELIGIBLE' || !/^[1-9]\d*$/.test(env.AGK_AMENDMENT_ARTIFACT_ID || '') ||
      !/^[a-f0-9]{64}$/.test(env.AGK_AMENDMENT_ARTIFACT_DIGEST || '')) fail('protected amendment signer result is not complete and eligible.');
  const old = await validateOldReviewInputs(env, context);
  if (!old.oldSelection.changed || !['completed-block-v1','completed-owner-decision-self-v1','owner-initiated-self-v1'].includes(old.policy.ownerAmendmentTriggerProfile) ||
      old.policy.ownerAmendmentGrade !== 'G0' || !old.provenance || !old.classified ||
      !['PASS','BLOCK','OWNER_DECISION'].includes(old.classified.conclusion) ||
      ((old.classified.conclusion === 'PASS') !== Boolean(old.pass))) fail('old selected Policy does not route this changed Authority to OWNER_AMENDMENT.');
  const childEnv = { ...process.env, BASE_SHA: context.baseSha, B_SHA: context.headSha, BASE_BRANCH: 'main',
    TRIGGER_PROFILE: old.policy.ownerAmendmentTriggerProfile, GITHUB_WORKSPACE: trustedGitHubWorkspaceRoot() };
  const prepareOutput = execFileSync(process.execPath, [resolve(old.cwd, 'scripts/owner-amendment-semantic-eligibility-producer.mjs'), 'prepare'],
    { cwd: process.cwd(), env: childEnv, encoding: 'utf8', timeout: 120_000, maxBuffer: 65_536, stdio: ['ignore', 'pipe', 'pipe'] });
  const prepareState = JSON.parse(prepareOutput);
  if (prepareState.status !== 'PREPARED_OWNER_AMENDMENT_SEMANTIC_ELIGIBILITY') fail('exact-B semantic preparation is absent.');
  const preparedBytes = readRunnerTempFile(resolveRunnerTempDirectory('owner-amendment-eligibility'), 'prepared-context.json', 131_072);
  const prepared = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(preparedBytes));
  if (prepared.repository !== SELF || prepared.baseSha !== context.baseSha || prepared.bSha !== context.headSha ||
      prepared.triggerProfile !== old.policy.ownerAmendmentTriggerProfile || prepared.policySha256 !== old.policySha) fail('recomputed semantic preparation differs from exact protected PR context.');
  const discovered = await discoverOwnerAmendmentBlockArtifact({ expected: { repository: SELF, runId: env.GITHUB_RUN_ID,
    runAttempt: env.GITHUB_RUN_ATTEMPT, baseSha: context.baseSha, headSha: context.headSha, profile: 'eligibility' }, token: env.GH_TOKEN });
  if (discovered.status !== 'DISCOVERED_OWNER_AMENDMENT_ELIGIBILITY_ARTIFACT' || discovered.artifactId !== env.AGK_AMENDMENT_ARTIFACT_ID) fail('same-run semantic eligibility artifact was not uniquely discovered.');
  const artifact = await fetchOwnerAmendmentBlockArtifact({ expected: { repository: SELF, artifactId: discovered.artifactId,
    runId: env.GITHUB_RUN_ID, runAttempt: env.GITHUB_RUN_ATTEMPT, baseSha: context.baseSha, headSha: context.headSha, profile: 'eligibility' }, token: env.GH_TOKEN });
  if (artifact.status !== 'FETCHED_OWNER_AMENDMENT_ELIGIBILITY_ARTIFACT' ||
      artifact.artifactDigest !== `sha256:${env.AGK_AMENDMENT_ARTIFACT_DIGEST}`) fail('semantic eligibility archive digest differs from protected signer output.');
  const extracted = extractEligibilityArtifact(artifact.zipBytes);
  if (extracted.status !== 'EXTRACTED_OWNER_AMENDMENT_ELIGIBILITY_ARTIFACT') fail('semantic eligibility artifact contents are malformed.');
  const attested = verifyOwnerAmendmentBlockEvidence({ recordBytes: extracted.eligibilityReceiptBytes,
    bundleBytes: extracted.attestationBundleBytes, expected: { repository: SELF,
      workflowPath: '.github/workflows/self-architecture-gate.yml', workflowSha: env.GATEKEEPER_WORKFLOW_SHA,
      workflowRef: 'refs/heads/main', runId: env.GITHUB_RUN_ID, runAttempt: env.GITHUB_RUN_ATTEMPT } });
  if (attested.status !== 'VERIFIED_PRODUCER_ATTESTATION') fail('eligibility receipt attestation is not from the exact protected workflow run.');
  const receipt = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(extracted.eligibilityReceiptBytes));
  const expectedReceipt = { ...receipt, version: prepared.triggerProfile === 'owner-initiated-self-v1' ? 2 : 1, kind: 'owner-amendment-semantic-eligibility-receipt',
    eligibility: env.AGK_AMENDMENT_ELIGIBILITY, repository: prepared.repository, baseSha: prepared.baseSha, bSha: prepared.bSha,
    triggerProfile: prepared.triggerProfile,
    ...(prepared.triggerProfile === 'owner-initiated-self-v1' ? { historicalTrigger: prepared.historicalTrigger }
      : { triggerReviewRecordSha256: prepared.triggerReviewRecordSha256 }),
    amendmentRecordSha256: prepared.amendmentRecordSha256, policyRevision: prepared.policyRevision,
    policySha256: prepared.policySha256, authoritySetDigest: prepared.authoritySetDigest,
    authorityIds: prepared.authorityIds, changes: prepared.changes, diffSha256: prepared.diffSha256,
    promptSha256: prepared.promptSha256, schemaSha256: prepared.schemaSha256, model: prepared.model,
    reasoningEffort: prepared.reasoningEffort, gatekeeper: prepared.gatekeeper, tag: prepared.tag, producer: prepared.producer };
  const verified = validateOwnerAmendmentSemanticEligibilityReceipt({ receiptBytes: extracted.eligibilityReceiptBytes, expected: expectedReceipt });
  if (verified.eligibility !== 'ELIGIBLE' || verified.receipt.producer.jobId !== 'owner-amendment-semantic-eligibility-signer') fail('authenticated semantic receipt is not exact signer ELIGIBLE output.');
  return { route: 'amendment-queue-eligible' };
}
async function main() {
  const [command] = process.argv.slice(2), env = process.env;
  if (!['begin', 'report', 'report-setup-failure'].includes(command)) fail('usage: self-pr-app-report.mjs begin|report|report-setup-failure');
  const trusted = protectedCallerContext(env);
  const producerInput = { context: trusted.selectorInput, contextFetchImpl: fetch, getApp: () => getApp(env) };
  if (command === 'begin') {
    validateRunnerTemp(env);
    validateProtectedWorkspace(env);
    const begun = await beginProtectedSelfPrCheck(producerInput);
    const { context: selected, check } = begun;
    appendGitHubOutput(`check_id=${check.id}\ncheck_sha=${check.headSha}\npr_number=${selected.prNumber}\nbase_sha=${selected.baseSha}\nhead_sha=${selected.headSha}\n`);
    return;
  }
  if (command === 'report-setup-failure') {
    validateRunnerTemp(env);
    validateProtectedWorkspace(env);
    if (!/^[1-9]\d*$/.test(env.AGK_CHECK_ID || '') || !Number.isSafeInteger(Number(env.AGK_CHECK_ID)) ||
        !SHA.test(env.AGK_CHECK_SHA || '')) fail('exact protected begin-check identity is unavailable.');
    const app = getApp(env);
    const check = { id: Number(env.AGK_CHECK_ID), name: 'architecture-gate / protected-accept', repository: SELF,
      headSha: env.AGK_CHECK_SHA, appId: app.appId };
    const finalized = await finalizeSelfArchitectureCheck({ app, check, conclusion: 'failure' });
    if (finalized.conclusion !== 'failure' || finalized.id !== check.id || finalized.headSha !== check.headSha) fail('exact begun App check did not finalize as failure.');
    appendGitHubOutput('conclusion=failure\nreason=protected runtime setup failed\n');
    return;
  }
  validateRunnerTemp(env);
  validateProtectedWorkspace(env);
  const begun = { status: 'BEGUN_SELF_PR_APP_CHECK', context: {
    status: 'SELECTED_SELF_PR_CONTEXT', repository: SELF, repositoryId: SELF_ID, prNumber: env.PR_NUMBER,
    baseSha: env.BASE_SHA, headSha: env.HEAD_SHA, subjectSha: env.AGK_CHECK_SHA },
    check: { id: Number(env.AGK_CHECK_ID), name: 'architecture-gate / protected-accept', repository: SELF,
      headSha: env.AGK_CHECK_SHA, appId: Number(env.AGK_APP_ID) } };
  const result = await finishProtectedSelfPrCheck({ ...producerInput, begun,
    validateProtectedResult: async selected => {
    validateRunnerTemp(env);
    validateProtectedWorkspace(env);
    if (env.AGK_CHECK_SHA !== selected.subjectSha) fail('begun check subject differs from the freshly selected test-merge SHA.');
    fetchProtectedReviewObjects(env, selected);
    validateProtectedWorkspace(env);
    const reportContext = runtimeContext(env).context;
    if (reportContext.baseSha !== selected.baseSha || reportContext.headSha !== selected.headSha || reportContext.reviewedSha !== selected.subjectSha) fail('trusted reusable review context differs from the current PR context.');
    let route;
    if (env.AGK_SELECTED_AUTHORITY_CHANGED === 'false') route = await validateOrdinary(env, reportContext);
    else if (env.AGK_SELECTED_AUTHORITY_CHANGED === 'true') route = await validateAmendmentEligibility(env, reportContext);
    else fail('protected old selected-authority comparison is missing.');
    return { status: 'VALIDATED_SELF_PR_RESULT', route: route.route,
      binding: { repository: selected.repository, repositoryId: selected.repositoryId, prNumber: selected.prNumber,
        baseSha: selected.baseSha, headSha: selected.headSha, subjectSha: selected.subjectSha },
      oldSelectedAuthorityChanged: env.AGK_SELECTED_AUTHORITY_CHANGED === 'true' };
    } });
  if (result.status !== 'REPORTED_SELF_PR_RESULT') fail(result.reason || 'protected PR result was not reported.');
  appendGitHubOutput(`conclusion=success\nroute=${result.route}\n`);
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => { process.stderr.write(`${error instanceof Error ? error.message : 'Self PR App report failed.'}\n`); process.exitCode = 1; });
}
