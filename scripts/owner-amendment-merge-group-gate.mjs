import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { appendGitHubOutput, readRunnerTempFile, resolveRunnerTempDirectory, validateSelfAuthorityManifest } from '../dist/runner-temp-path.mjs';
import { classifyOwnerAmendmentTagApiStatus, ownerAmendmentTagApiUrl } from '../dist/owner-amendment-tag-api.mjs';
import { selectOwnerAmendmentMergeGroupBContext } from '../dist/owner-amendment-merge-group-b-context.mjs';
import { createOwnerAmendmentMergeGroupAcceptanceVerifier } from '../dist/owner-amendment-merge-group-acceptance.mjs';
import { resolveOwnerAmendmentHandoffGitContext } from '../dist/owner-amendment-handoff-git-context.mjs';
import { composeOwnerAmendmentMergeGroupEvidence } from '../dist/owner-amendment-merge-group-evidence.mjs';
import { discoverOwnerAmendmentBlockArtifact } from '../dist/owner-amendment-artifact-discovery.mjs';
import { fetchOwnerAmendmentBlockArtifact } from '../dist/owner-amendment-artifact.mjs';
import { extractOwnerAmendmentArtifactZip } from '../dist/owner-amendment-artifact-zip.mjs';
import { verifyOwnerAmendmentBlockEvidence } from '../dist/owner-amendment-attestation.mjs';
import { materializeAuthoritySet } from '../dist/authority-set.mjs';
import { createGitHubAuthoritySource } from '../dist/github-authority-source.mjs';
import { parseCiPolicyJson, resolveCiPolicy } from '../dist/resolve-ci-policy.mjs';
import { assertMissingOwnerAmendmentTagHasNoSuccessfulSigner,
  inspectOwnerAmendmentSemanticProducerAttempts } from '../dist/owner-amendment-semantic-producer-attempts.mjs';
import { createGitHubCliRunner } from '../dist/github-cli-runner.mjs';
import { computeOwnerAmendmentResultingAuthoritySet, deriveOwnerAmendmentGitChanges } from '../dist/owner-amendment-git-changes.mjs';

const repository = process.env.GITHUB_REPOSITORY;
const token = process.env.GH_TOKEN;
const tagRulesetId = Number(process.env.OWNER_AMENDMENT_TAG_RULESET_ID);
const api = 'https://api.github.com/';
const fail = message => { throw new Error(`Owner amendment merge-group gate: ${message}`); };
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
function selectRoute(route, selection) {
  if (!process.env.GITHUB_OUTPUT) fail('GitHub workflow output path is unavailable.');
  const values = { route, base_sha: selection.bBaseSha, b_sha: selection.bHeadSha };
  for (const [key, value] of Object.entries(values)) {
    if (typeof value !== 'string' || /[\r\n]/.test(value) || (key !== 'route' && !/^[a-f0-9]{40}$/.test(value))) fail(`selected ${key} output is invalid.`);
  }
  appendGitHubOutput(`${Object.entries(values).map(([key, value]) => `${key}=${value}`).join('\n')}\n`);
}
const git = args => execFileSync('git', ['-C', process.env.GITHUB_WORKSPACE, ...args], { encoding: 'buffer', maxBuffer: 2 * 1024 * 1024,
  timeout: 30_000,
  stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, GIT_NO_REPLACE_OBJECTS: '1' } });
const gh = createGitHubCliRunner(execFileSync);

async function getJson(url, { expectedOwnerAmendmentTagUrl } = {}) {
  let parsed;
  try { parsed = new URL(url); } catch { fail('GitHub API URL is malformed.'); }
  if (parsed.origin !== 'https://api.github.com' || parsed.username || parsed.password || parsed.hash ||
      (parsed.pathname !== '/graphql' && !parsed.pathname.startsWith('/repos/flair-agency/architecture-gatekeeper/'))) {
    fail('GitHub API request is outside the fixed self repository.');
  }
  const response = await fetch(parsed, { headers: { accept: 'application/vnd.github+json',
    authorization: `Bearer ${token}`, 'x-github-api-version': '2022-11-28' }, redirect: 'error' });
  if (response.status === 404 && expectedOwnerAmendmentTagUrl) {
    const classification = classifyOwnerAmendmentTagApiStatus({ status: response.status,
      requestedUrl: parsed.href, expectedUrl: expectedOwnerAmendmentTagUrl });
    if (classification === 'OWNER_AMENDMENT_TAG_NOT_FOUND') return null;
  }
  if (!response.ok) fail(`GitHub API read failed (${response.status}).`);
  return response.json();
}

async function inspectProducerAttempts(selection) {
  const readRuns = async ({ bBaseSha, createdFrom, createdTo, page, perPage }) => {
    const runsUrl = new URL('repos/flair-agency/architecture-gatekeeper/actions/workflows/self-architecture-gate.yml/runs', api);
    runsUrl.searchParams.set('event', 'pull_request_target');
    runsUrl.searchParams.set('head_sha', bBaseSha);
    runsUrl.searchParams.set('created', `${createdFrom}..${createdTo}`);
    runsUrl.searchParams.set('per_page', String(perPage));
    runsUrl.searchParams.set('page', String(page));
    const result = await getJson(runsUrl);
    if (!Number.isSafeInteger(result.total_count) || !Array.isArray(result.workflow_runs)) fail('producer workflow run listing is malformed.');
    return { total_count: result.total_count, workflow_runs: result.workflow_runs };
  };
  const readJobs = async ({ runId, runAttempt, page, perPage }) => {
    const jobsUrl = new URL(`repos/flair-agency/architecture-gatekeeper/actions/runs/${runId}/attempts/${runAttempt}/jobs`, api);
    jobsUrl.searchParams.set('per_page', String(perPage));
    jobsUrl.searchParams.set('page', String(page));
    const result = await getJson(jobsUrl);
    if (!Number.isSafeInteger(result.total_count) || !Array.isArray(result.jobs)) fail('producer job listing is malformed.');
    return { total_count: result.total_count, jobs: result.jobs };
  };
  return inspectOwnerAmendmentSemanticProducerAttempts({ repository, bBaseSha: selection.bBaseSha, bHeadSha: selection.bHeadSha,
    bPullRequestCreatedAt: selection.bPullRequestCreatedAt, queueEnteredAt: selection.queueEnteredAt,
    listRuns: readRuns, listJobs: readJobs });
}

async function eligibilityEvidence({ selection, attempts }) {
  const chosen = attempts.latestSignerAttempt?.run;
  const chosenAttempt = attempts.latestSignerAttempt?.runAttempt;
  const job = attempts.latestSignerAttempt?.job;
  if (!chosen) fail('no completed protected-base B workflow run exists for semantic eligibility.');
  if (!chosen || job?.status !== 'completed' || job.conclusion !== 'success' || typeof job.completed_at !== 'string' ||
      Date.parse(job.completed_at) >= Date.parse(selection.queueEnteredAt)) fail('latest B semantic eligibility job did not complete successfully before queue entry.');
  const expected = { repository, runId: String(chosen.id), runAttempt: chosenAttempt,
    baseSha: selection.bBaseSha, headSha: selection.bHeadSha, profile: 'eligibility' };
  const discovered = await discoverOwnerAmendmentBlockArtifact({ expected, token });
  if (discovered.status !== 'DISCOVERED_OWNER_AMENDMENT_ELIGIBILITY_ARTIFACT') fail(discovered.reason ?? 'exact eligibility artifact was not found.');
  const fetched = await fetchOwnerAmendmentBlockArtifact({ expected: { ...expected, artifactId: discovered.artifactId }, token });
  if (fetched.status !== 'FETCHED_OWNER_AMENDMENT_ELIGIBILITY_ARTIFACT') fail(fetched.reason ?? 'exact eligibility artifact could not be fetched.');
  const extracted = extractOwnerAmendmentArtifactZip(fetched.zipBytes, { profile: 'eligibility' });
  if (extracted.status !== 'EXTRACTED_OWNER_AMENDMENT_ELIGIBILITY_ARTIFACT') fail(extracted.reason ?? 'eligibility artifact ZIP is invalid.');
  const receiptBytes = extracted.eligibilityReceiptBytes;
  let receipt;
  try { receipt = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(receiptBytes)); }
  catch { fail('eligibility receipt is invalid JSON.'); }
  const provenance = verifyOwnerAmendmentBlockEvidence({ recordBytes: receiptBytes,
    bundleBytes: extracted.attestationBundleBytes, expected: { repository,
      workflowPath: '.github/workflows/self-architecture-gate.yml', workflowSha: selection.bBaseSha,
      workflowRef: 'refs/heads/main', runId: String(chosen.id), runAttempt: chosenAttempt }, runGh: gh });
  if (provenance.status !== 'VERIFIED_PRODUCER_ATTESTATION' || provenance.recordSha256 !== hash(receiptBytes)) {
    fail(provenance.reason ?? 'eligibility receipt attestation is not trusted.');
  }
  return { status: 'VERIFIED_OWNER_AMENDMENT_ELIGIBILITY_EVIDENCE', receiptBytes,
    receiptSha256: hash(receiptBytes), artifactId: discovered.artifactId,
    artifactSha256: fetched.artifactDigest.slice('sha256:'.length), provenanceVerified: true,
    checkConclusion: 'success', completedAt: job.completed_at,
    producerWorkflowPath: '.github/workflows/self-architecture-gate.yml', producerWorkflowSha: selection.bBaseSha,
    producerWorkflowRef: 'refs/heads/main', producerRunId: String(chosen.id), producerRunAttempt: chosenAttempt,
    producerJobId: 'owner-amendment-semantic-eligibility-signer', gatekeeperRepository: receipt.gatekeeper?.repository,
    gatekeeperRevision: receipt.gatekeeper?.revision, principalAuthentication: 'not_verified',
    exactClaimAuthorization: 'not_verified' };
}

function eligibilityReviewInputs({ selection, policy, trigger, tag, context }) {
  const workspace = process.env.GITHUB_WORKSPACE;
  if (typeof workspace !== 'string' || !workspace) fail('protected workspace is unavailable for exact eligibility input reconstruction.');
  let output;
  try {
    output = execFileSync(process.execPath, [`${workspace}/scripts/owner-amendment-semantic-eligibility-producer.mjs`, 'prepare'], {
      encoding: 'utf8', maxBuffer: 131_072, timeout: 30_000, stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, GITHUB_REPOSITORY: selection.repository, BASE_SHA: selection.bBaseSha,
        B_SHA: selection.bHeadSha, BASE_BRANCH: 'main', TRIGGER_PROFILE: policy.triggerProfile, GH_TOKEN: token,
        OWNER_AMENDMENT_TAG_RULESET_ID: String(tagRulesetId) },
    });
  } catch { fail('protected semantic preparation could not reconstruct exact B review inputs.'); }
  let summary;
  try { summary = JSON.parse(output); } catch { fail('protected semantic preparation summary is invalid.'); }
  const inputDir = resolveRunnerTempDirectory('owner-amendment-eligibility');
  let preparedBytes, promptBytes, schemaBytes;
  try {
    preparedBytes = readRunnerTempFile(inputDir, 'prepared-context.json', 131_072);
    promptBytes = readRunnerTempFile(inputDir, 'eligibility-prompt.md', 1_048_576);
    schemaBytes = readRunnerTempFile(inputDir, 'eligibility.schema.json', 1_048_576);
  } catch { fail('protected semantic preparation did not produce bounded exact input files.'); }
  let prepared;
  try {
    prepared = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(preparedBytes));
  } catch { fail('protected semantic preparation context is invalid.'); }
  const preparedKeys = ['repository', 'baseSha', 'bSha', 'triggerProfile', 'triggerReviewRecordSha256',
    'amendmentRecordSha256', 'policyRevision', 'policySha256', 'authoritySetDigest', 'priorAuthoritySetDigest', 'resultingAuthoritySetDigest',
    'authorityIds', 'changes', 'diffSha256', 'promptSha256', 'schemaSha256', 'model', 'reasoningEffort',
    'gatekeeper', 'tag', 'producer'];
  if (!prepared || typeof prepared !== 'object' || Array.isArray(prepared) ||
      Object.keys(prepared).length !== preparedKeys.length || preparedKeys.some(key => !Object.hasOwn(prepared, key)) ||
      !preparedBytes.equals(Buffer.from(`${JSON.stringify(prepared)}\n`, 'utf8')) ||
      summary.status !== 'PREPARED_OWNER_AMENDMENT_SEMANTIC_ELIGIBILITY' ||
      summary.triggerProfile !== policy.triggerProfile || summary.promptSha256 !== prepared.promptSha256 ||
      summary.schemaSha256 !== prepared.schemaSha256 || summary.model !== prepared.model ||
      summary.reasoningEffort !== prepared.reasoningEffort || prepared.repository !== selection.repository ||
      prepared.baseSha !== selection.bBaseSha || prepared.bSha !== selection.bHeadSha ||
      prepared.triggerProfile !== policy.triggerProfile || prepared.triggerReviewRecordSha256 !== trigger.reviewRecordSha256 ||
      prepared.amendmentRecordSha256 !== tag.amendmentRecordSha256 || prepared.policyRevision !== selection.bBaseSha ||
      prepared.policySha256 !== policy.policySha256 || prepared.authoritySetDigest !== policy.authoritySetDigest ||
      prepared.priorAuthoritySetDigest !== policy.authoritySetDigest ||
      !Array.isArray(prepared.authorityIds) || prepared.authorityIds.length !== policy.authorityIds.length ||
      prepared.authorityIds.some((id, index) => id !== policy.authorityIds[index]) ||
      prepared.resultingAuthoritySetDigest !== tag.resultingAuthoritySetDigest ||
      prepared.model !== policy.model || prepared.reasoningEffort !== policy.reasoningEffort ||
      !prepared.tag || prepared.tag.tagRef !== tag.tagRef || prepared.tag.tagObjectOid !== tag.tagObjectOid ||
      prepared.tag.observedTagRefOid !== tag.observedTagRefOid) {
    fail('protected semantic preparation differs from selected previous policy, exact B, trigger or tag.');
  }
  const diffBytes = git(['--no-replace-objects', 'diff', '--binary', '--no-ext-diff', '--no-renames',
    selection.bBaseSha, selection.bHeadSha]);
  if (hash(promptBytes) !== prepared.promptSha256 || hash(schemaBytes) !== prepared.schemaSha256 ||
      hash(diffBytes) !== prepared.diffSha256) {
    fail('reconstructed exact prompt, schema or B diff differs from protected preparation.');
  }
  return { status: 'RESOLVED_PROTECTED_OWNER_AMENDMENT_REVIEW_INPUTS', repository: prepared.repository,
    baseSha: prepared.baseSha, bSha: prepared.bSha, triggerProfile: prepared.triggerProfile,
    triggerReviewRecordSha256: prepared.triggerReviewRecordSha256, amendmentRecordSha256: prepared.amendmentRecordSha256,
    policySha256: prepared.policySha256, authoritySetDigest: prepared.authoritySetDigest,
    priorAuthoritySetDigest: prepared.authoritySetDigest, resultingAuthoritySetDigest: prepared.resultingAuthoritySetDigest,
    authorityIds: prepared.authorityIds, changes: prepared.changes, diffSha256: prepared.diffSha256,
    promptSha256: prepared.promptSha256, schemaSha256: prepared.schemaSha256, model: prepared.model,
    reasoningEffort: prepared.reasoningEffort, diffBytes, promptBytes, schemaBytes };
}

async function main() {
  if (repository !== 'flair-agency/architecture-gatekeeper' || !token || !process.env.RUNNER_TEMP ||
      !process.env.GITHUB_WORKSPACE) {
    fail('protected self repository, workspace, or token is invalid.');
  }
  const eventDir = resolveRunnerTempDirectory('owner-amendment-merge-group');
  const event = JSON.parse(readRunnerTempFile(eventDir, 'event.json', 262_144).toString('utf8'));
  const selection = await selectOwnerAmendmentMergeGroupBContext({ event, token });
  if (selection.status !== 'SELECTED_OWNER_AMENDMENT_MERGE_GROUP_B_CONTEXT') fail(selection.reason ?? 'merge-group does not select one exact B.');
  let runtimeRevision;
  try { runtimeRevision = git(['rev-parse', 'HEAD']).toString('utf8').trim(); }
  catch { fail('checked-out protected verifier revision is unavailable.'); }
  if (!/^[a-f0-9]{40}$/.test(runtimeRevision)) fail('checked-out protected verifier revision is invalid.');
  if (runtimeRevision !== selection.bBaseSha) fail('checked-out protected verifier revision differs from the exact merge-group base.');
  let policyBytes;
  try { policyBytes = git(['show', `${selection.bBaseSha}:.codex/gatekeeper/ci-policy.json`]); }
  catch { fail('previous protected CI policy is absent.'); }
  const parsedPolicy = parseCiPolicyJson(new TextDecoder('utf-8', { fatal: true }).decode(policyBytes));
  const selectedPolicy = resolveCiPolicy(parsedPolicy, 'main');
  if (selectedPolicy.mode === 'local-only') {
    selectRoute('not-applicable', selection);
    process.stdout.write('Protected current-base policy explicitly selects local-only review.\n'); return;
  }
  if (selectedPolicy.mode !== 'enforced') fail('merge-group ordinary review currently supports only the protected enforced self policy.');

  try { git(['fetch', '--no-tags', 'origin', selection.bHeadSha]); }
  catch { fail('exact B Git object could not be fetched.'); }

  let producerAttempts = null;
  let tagResponse = null;
  if (selectedPolicy.ownerAmendmentGrade === 'G0') {
    if (!['completed-block-v1', 'completed-owner-decision-self-v1'].includes(selectedPolicy.ownerAmendmentTriggerProfile)) {
      fail('previous-base policy selected an unsupported trigger profile.');
    }
    producerAttempts = await inspectProducerAttempts(selection);
    const expectedTagUrl = ownerAmendmentTagApiUrl(repository, selectedPolicy.ownerAmendmentTagNamespace, selection.bHeadSha);
    tagResponse = await getJson(expectedTagUrl, { expectedOwnerAmendmentTagUrl: expectedTagUrl });
    if (tagResponse === null) assertMissingOwnerAmendmentTagHasNoSuccessfulSigner(producerAttempts);
  }
  if (!tagResponse) {
    selectRoute('ordinary', selection);
    process.stdout.write('No protected amendment tag selects a fresh ordinary review of the exact current base/B tuple.\n');
    return;
  }
  if (!Number.isSafeInteger(tagRulesetId) || tagRulesetId < 1) fail('active tag ruleset ID is unavailable for exact B verification.');
  const runGit = args => git(args);
  const context = resolveOwnerAmendmentHandoffGitContext({ repository, baseSha: selection.bBaseSha,
    headSha: selection.bHeadSha, baseBranch: 'main', runGit });
  try { validateSelfAuthorityManifest(context.manifest); }
  catch { fail('the v0.6.0 self profile supports only a non-empty protected Authority Set in this repository.'); }
  const source = createGitHubAuthoritySource({ token });
  const materialized = await materializeAuthoritySet({ manifestBytes: context.manifestBytes, limits: context.limits,
    selfRepository: repository, selfRoot: process.env.GITHUB_WORKSPACE, authorityRevision: selection.bBaseSha,
    fetchExternal: source, profile: context.policy.authorityProfile ?? 'v1' });
  const exactChanges = deriveOwnerAmendmentGitChanges({ profile: context.policy.ownerAmendmentTriggerProfile,
    repository, baseSha: selection.bBaseSha, bSha: selection.bHeadSha, targetPath: context.scope.authorityPath,
    selectedAuthorityBytes: context.authorityBytes, changedFiles: context.changedFiles,
    authorityChanges: context.authorityChanges, runGit: args => git(args),
    readBlob: (revision, path) => git(['--no-replace-objects', 'show', `${revision}:${path}`]) });
  const resultingSet = computeOwnerAmendmentResultingAuthoritySet({ members: materialized.members,
    changes: exactChanges.changes, repository, baseSha: selection.bBaseSha,
    expectedPriorDigest: context.policy.ownerAmendmentTriggerProfile === 'completed-owner-decision-self-v1' ? context.priorAuthoritySetDigest : undefined,
    expectedResultingDigest: context.policy.ownerAmendmentTriggerProfile === 'completed-owner-decision-self-v1' ? context.resultingAuthoritySetDigest : undefined });
  if (context.policy.ownerAmendmentTriggerProfile === 'completed-owner-decision-self-v1' &&
      (context.priorAuthoritySetDigest !== resultingSet.priorDigest || context.resultingAuthoritySetDigest !== resultingSet.resultingDigest)) {
    fail('protected OWNER_DECISION full Authority Set digests differ from exact B changes.');
  }
  const resultingDigest = resultingSet.resultingDigest;
  let evidence;
  const verify = async () => {
    evidence ??= await composeOwnerAmendmentMergeGroupEvidence({ repository, baseSha: selection.bBaseSha,
      bSha: selection.bHeadSha, runGit, tagNamespace: context.policy.ownerAmendmentTagNamespace,
      tagRef: `${context.policy.ownerAmendmentTagNamespace}/${selection.bHeadSha}`,
      rulesetId: tagRulesetId, token, resolveGitContext: () => context, runGh: gh });
    if (evidence.status !== 'VERIFIED_OWNER_AMENDMENT_MERGE_GROUP_EVIDENCE') fail(evidence.reason ?? 'trigger/tag evidence failed.');
    return evidence;
  };
  const verifier = createOwnerAmendmentMergeGroupAcceptanceVerifier({ runtime: { repository, revision: selection.bBaseSha },
    selectBContext: async () => selection,
    resolveProtectedPolicy: async () => ({ status: 'RESOLVED_PREVIOUS_OWNER_AMENDMENT_POLICY', repository,
      baseSha: selection.bBaseSha, grade: 'G0', scope: 'authority-only',
      triggerProfile: context.policy.ownerAmendmentTriggerProfile, authorityId: context.scope.authorityId,
      authorityPath: context.scope.authorityPath, authoritySha256: context.scope.previousSha256,
      tagNamespace: context.policy.ownerAmendmentTagNamespace, policySha256: hash(context.policyBytes),
      authoritySetDigest: materialized.setDigest, authorityIds: materialized.members.map(member => member.id),
      model: context.policy.model, reasoningEffort: context.policy.reasoningEffort,
      maxPromptBytes: context.policy.ownerAmendmentMaxPromptBytes }),
    verifyTrigger: async () => { const value = await verify(); return { status: 'VERIFIED_OWNER_AMENDMENT_TRIGGER',
      repository, baseSha: selection.bBaseSha, triggerProfile: value.triggerProfile,
      decision: value.triggerDecision,
      reviewRecordSha256: value.reviewRecordSha256, producerWorkflowPath: '.github/workflows/self-architecture-gate.yml',
      producerWorkflowSha: selection.bBaseSha, producerWorkflowRef: 'refs/heads/main',
      producerRunId: value.producerRunId, producerRunAttempt: value.producerRunAttempt, provenanceVerified: true }; },
    verifyTag: async () => { const value = await verify(); return { status: 'VERIFIED_OWNER_AMENDMENT_TAG',
      repository, baseSha: selection.bBaseSha, bSha: selection.bHeadSha, triggerProfile: value.triggerProfile,
      triggerReviewRecordSha256: value.reviewRecordSha256, amendmentRecordSha256: value.amendmentRecordSha256,
      authorityId: value.authorityId, authorityPath: context.scope.authorityPath,
      previousAuthoritySha256: value.previousAuthoritySha256, amendedAuthoritySha256: value.proposedAuthoritySha256,
      priorAuthoritySetDigest: value.priorAuthoritySetDigest ?? resultingSet.priorDigest,
      resultingAuthoritySetDigest: resultingDigest, changes: exactChanges.changes.map(change => ({ path: change.path,
        beforeSha256: hash(change.beforeBytes), afterSha256: hash(change.afterBytes) })),
      purpose: value.purpose, targetValidated: value.targetValidated,
      tagRef: `${context.policy.ownerAmendmentTagNamespace}/${selection.bHeadSha}`,
      tagObjectOid: value.tagObjectOid, observedTagRefOid: value.observedTagRefOid,
      protectedAgainstUpdateAndDeletion: true }; },
    resolveEligibilityReviewInputs: async ({ policy, trigger, tag }) =>
      eligibilityReviewInputs({ selection, policy, trigger, tag, context }),
    verifyEligibility: async () => eligibilityEvidence({ selection, attempts: producerAttempts }),
  });
  const result = await verifier.verify(event);
  if (result.status !== 'VERIFIED_OWNER_AMENDMENT_G0_FOR_TRANSITION') fail(result.reason ?? 'merge-group OWNER_AMENDMENT verification failed.');
  selectRoute('amendment', selection);
  process.stdout.write(`OWNER_AMENDMENT / G0 pre-transition eligibility verified; adoption and canonical placement remain pending: ${JSON.stringify(result)}\n`);
}

main().catch(error => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
