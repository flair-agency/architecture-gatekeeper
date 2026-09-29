import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readRunnerTempFile, resolveRunnerTempDirectory, ownerAmendmentTagApiUrl, validateSelfAuthorityManifest } from '../src/runner-temp-path.mjs';
import { selectOwnerAmendmentMergeGroupBContext } from '../src/owner-amendment-merge-group-b-context.mjs';
import { createOwnerAmendmentMergeGroupAcceptanceVerifier } from '../src/owner-amendment-merge-group-acceptance.mjs';
import { resolveOwnerAmendmentHandoffGitContext } from '../src/owner-amendment-handoff-git-context.mjs';
import { composeOwnerAmendmentMergeGroupEvidence } from '../src/owner-amendment-merge-group-evidence.mjs';
import { discoverOwnerAmendmentBlockArtifact } from '../src/owner-amendment-artifact-discovery.mjs';
import { fetchOwnerAmendmentBlockArtifact } from '../src/owner-amendment-artifact.mjs';
import { extractOwnerAmendmentArtifactZip } from '../src/owner-amendment-artifact-zip.mjs';
import { verifyOwnerAmendmentBlockEvidence } from '../src/owner-amendment-attestation.mjs';
import { materializeAuthoritySet } from '../src/authority-set.mjs';
import { createGitHubAuthoritySource } from '../src/github-authority-source.mjs';
import { parseCiPolicyJson, resolveCiPolicy } from '../src/resolve-ci-policy.mjs';

const repository = process.env.GITHUB_REPOSITORY;
const token = process.env.GH_TOKEN;
const runtimeRevision = process.env.GATEKEEPER_RUNTIME_SHA;
const tagRulesetId = Number(process.env.OWNER_AMENDMENT_TAG_RULESET_ID);
const api = 'https://api.github.com/repos/flair-agency/architecture-gatekeeper';
const fail = message => { throw new Error(`Owner amendment merge-group gate: ${message}`); };
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const git = args => execFileSync('git', args, { encoding: 'buffer', maxBuffer: 2 * 1024 * 1024,
  timeout: 30_000, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, GIT_NO_REPLACE_OBJECTS: '1' } });
const gh = (args, maxBuffer = 2 * 1024 * 1024) => execFileSync('gh', args, { encoding: 'utf8', maxBuffer,
  timeout: 30_000, stdio: ['ignore', 'pipe', 'pipe'] });

async function getJson(url) {
  let parsed;
  try { parsed = new URL(url); } catch { fail('GitHub API URL is malformed.'); }
  if (parsed.origin !== 'https://api.github.com' || parsed.username || parsed.password || parsed.hash ||
      (parsed.pathname !== '/graphql' && !parsed.pathname.startsWith('/repos/flair-agency/architecture-gatekeeper/'))) {
    fail('GitHub API request is outside the fixed self repository.');
  }
  const response = await fetch(parsed, { headers: { accept: 'application/vnd.github+json',
    authorization: `Bearer ${token}`, 'x-github-api-version': '2022-11-28' }, redirect: 'error' });
  if (!response.ok) fail(`GitHub API read failed (${response.status}).`);
  return response.json();
}

async function eligibilityEvidence({ selection, queueEnteredAt }) {
  if (!/^[a-f0-9]{40}$/.test(selection.bHeadSha ?? '')) fail('exact B SHA for producer lookup is invalid.');
  const runsUrl = new URL(`${api}/actions/runs`);
  runsUrl.searchParams.set('head_sha', selection.bHeadSha);
  runsUrl.searchParams.set('event', 'pull_request_target');
  runsUrl.searchParams.set('per_page', '100');
  const runs = await getJson(runsUrl);
  if (!Array.isArray(runs.workflow_runs) || runs.workflow_runs.length > 100) fail('producer workflow run listing is malformed.');
  const candidates = runs.workflow_runs.filter(run => run.repository?.full_name === repository &&
    run.head_repository?.full_name === repository && run.event === 'pull_request_target' &&
    run.head_sha === selection.bHeadSha && /^\.github\/workflows\/self-architecture-gate\.yml@(?:refs\/heads\/main|main)$/.test(run.path ?? '') &&
    run.status === 'completed').sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
  if (!candidates.length) fail('no completed protected-base B workflow run exists for semantic eligibility.');
  let chosen;
  let job;
  for (const run of candidates) {
    if (!Number.isSafeInteger(run.id) || run.id < 1) fail('producer run ID is invalid.');
    const attempt = String(run.run_attempt);
    if (!/^[1-9]\d*$/.test(attempt)) fail('producer run attempt is invalid.');
    const jobsUrl = `${api}/actions/runs/${run.id}/attempts/${attempt}/jobs?per_page=100`;
    const jobs = await getJson(jobsUrl);
    if (!Array.isArray(jobs.jobs) || jobs.jobs.length > 100) fail('producer job list is malformed.');
    const matches = jobs.jobs.filter(candidate => candidate.name === 'owner-amendment-semantic-eligibility-signer');
    if (matches.length > 1) fail('producer run has duplicate semantic eligibility jobs.');
    if (matches.length === 1) { chosen = run; job = matches[0]; break; }
  }
  if (!chosen || job?.status !== 'completed' || job.conclusion !== 'success' || typeof job.completed_at !== 'string' ||
      Date.parse(job.completed_at) >= Date.parse(queueEnteredAt)) fail('latest B semantic eligibility job did not complete successfully before queue entry.');
  const expected = { repository, runId: String(chosen.id), runAttempt: String(chosen.run_attempt),
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
      workflowRef: 'refs/heads/main', runId: String(chosen.id), runAttempt: String(chosen.run_attempt) }, runGh: gh });
  if (provenance.status !== 'VERIFIED_PRODUCER_ATTESTATION' || provenance.recordSha256 !== hash(receiptBytes)) {
    fail(provenance.reason ?? 'eligibility receipt attestation is not trusted.');
  }
  return { status: 'VERIFIED_OWNER_AMENDMENT_ELIGIBILITY_EVIDENCE', receiptBytes,
    receiptSha256: hash(receiptBytes), artifactId: discovered.artifactId,
    artifactSha256: fetched.artifactDigest.slice('sha256:'.length), provenanceVerified: true,
    checkConclusion: 'success', completedAt: job.completed_at,
    producerWorkflowPath: '.github/workflows/self-architecture-gate.yml', producerWorkflowSha: selection.bBaseSha,
    producerWorkflowRef: 'refs/heads/main', producerRunId: String(chosen.id), producerRunAttempt: String(chosen.run_attempt),
    producerJobId: 'owner-amendment-semantic-eligibility-signer', gatekeeperRepository: receipt.gatekeeper?.repository,
    gatekeeperRevision: receipt.gatekeeper?.revision, principalAuthentication: 'not_verified',
    exactClaimAuthorization: 'not_verified' };
}

async function main() {
  if (repository !== 'flair-agency/architecture-gatekeeper' || !token || !process.env.RUNNER_TEMP ||
      !/^[a-f0-9]{40}$/.test(runtimeRevision ?? '')) {
    fail('protected self repository, runtime revision, or token is invalid.');
  }
  const eventDir = resolveRunnerTempDirectory(process.env.RUNNER_TEMP, 'owner-amendment-merge-group');
  const event = JSON.parse(readRunnerTempFile(eventDir, 'event.json', 262_144).toString('utf8'));
  const selection = await selectOwnerAmendmentMergeGroupBContext({ event, token });
  if (selection.status !== 'SELECTED_OWNER_AMENDMENT_MERGE_GROUP_B_CONTEXT') fail(selection.reason ?? 'merge-group does not select one exact B.');
  if (runtimeRevision !== selection.bBaseSha) fail('checked-out protected verifier revision differs from the exact merge-group base.');
  let policyBytes;
  try { policyBytes = git(['show', `${selection.bBaseSha}:.codex/gatekeeper/ci-policy.json`]); }
  catch { fail('previous protected CI policy is absent.'); }
  const parsedPolicy = parseCiPolicyJson(new TextDecoder('utf-8', { fatal: true }).decode(policyBytes));
  const selectedPolicy = resolveCiPolicy(parsedPolicy, 'main');
  if (selectedPolicy.mode !== 'enforced' || selectedPolicy.ownerAmendmentGrade !== 'G0') {
    process.stdout.write('OWNER_AMENDMENT_NOT_APPLICABLE: previous-base policy has no active G0 route.\n'); return;
  }
  if (!['completed-block-v1', 'completed-owner-decision-self-v1'].includes(selectedPolicy.ownerAmendmentTriggerProfile)) {
    fail('previous-base policy selected an unsupported trigger profile.');
  }
  const exactTagRef = `${selectedPolicy.ownerAmendmentTagNamespace}/${selection.bHeadSha}`;
  const tagResponse = await fetch(ownerAmendmentTagApiUrl(repository, selectedPolicy.ownerAmendmentTagNamespace, selection.bHeadSha), {
    headers: { accept: 'application/vnd.github+json', authorization: `Bearer ${token}`,
      'x-github-api-version': '2022-11-28' }, redirect: 'error' });
  if (tagResponse.status === 404) {
    process.stdout.write('OWNER_AMENDMENT_NOT_APPLICABLE: exact B has no protected amendment tag.\n'); return;
  }
  if (!tagResponse.ok) fail(`exact B tag preflight failed (${tagResponse.status}).`);
  if (!Number.isSafeInteger(tagRulesetId) || tagRulesetId < 1) fail('active tag ruleset ID is unavailable for exact B verification.');
  try { git(['fetch', '--no-tags', 'origin', selection.bHeadSha]); } catch { fail('exact B Git object could not be fetched.'); }
  const runGit = args => git(args);
  const context = resolveOwnerAmendmentHandoffGitContext({ repository, baseSha: selection.bBaseSha,
    headSha: selection.bHeadSha, baseBranch: 'main', runGit });
  try { validateSelfAuthorityManifest(context.manifest); }
  catch { fail('the v0.6.0 self profile supports only a non-empty protected Authority Set in this repository.'); }
  const source = createGitHubAuthoritySource({ token });
  const materialized = await materializeAuthoritySet({ manifestBytes: context.manifestBytes, limits: context.limits,
    selfRepository: repository, selfRoot: process.cwd(), authorityRevision: selection.bBaseSha,
    fetchExternal: source, profile: context.policy.authorityProfile ?? 'v1' });
  const resultingDescriptors = materialized.members.map(member => ({ id: member.id, repository: member.repository,
    resolvedCommit: member.resolvedCommit, path: member.path, byteLength: member.byteLength, sha256: member.sha256 }));
  const targetIndex = resultingDescriptors.findIndex(member => member.id === context.scope.authorityId && member.path === context.scope.authorityPath && member.repository === repository);
  if (targetIndex < 0) fail('complete previous Authority Set omits the selected target.');
  resultingDescriptors[targetIndex] = { ...resultingDescriptors[targetIndex], byteLength: context.authorityBytes.head.length,
    sha256: hash(context.authorityBytes.head) };
  const resultingDigest = hash(Buffer.from(JSON.stringify(resultingDescriptors), 'utf8'));
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
      authoritySetDigest: materialized.setDigest, authorityIds: materialized.members.map(member => member.id) }),
    verifyTrigger: async () => { const value = await verify(); return { status: 'VERIFIED_OWNER_AMENDMENT_TRIGGER',
      repository, baseSha: selection.bBaseSha, triggerProfile: value.triggerProfile,
      decision: value.triggerDecision, ownerDecisionId: value.ownerDecisionId,
      reviewRecordSha256: value.reviewRecordSha256, producerWorkflowPath: '.github/workflows/self-architecture-gate.yml',
      producerWorkflowSha: selection.bBaseSha, producerWorkflowRef: 'refs/heads/main',
      producerRunId: value.producerRunId, producerRunAttempt: value.producerRunAttempt, provenanceVerified: true }; },
    verifyTag: async () => { const value = await verify(); return { status: 'VERIFIED_OWNER_AMENDMENT_TAG',
      repository, baseSha: selection.bBaseSha, bSha: selection.bHeadSha, triggerProfile: value.triggerProfile,
      triggerReviewRecordSha256: value.reviewRecordSha256, amendmentRecordSha256: value.amendmentRecordSha256,
      authorityId: value.authorityId, authorityPath: context.scope.authorityPath,
      previousAuthoritySha256: value.previousAuthoritySha256, amendedAuthoritySha256: value.proposedAuthoritySha256,
      priorAuthoritySetDigest: value.priorAuthoritySetDigest, resultingAuthoritySetDigest: resultingDigest,
      purpose: value.purpose, targetValidated: value.targetValidated,
      tagRef: `${context.policy.ownerAmendmentTagNamespace}/${selection.bHeadSha}`,
      tagObjectOid: value.tagObjectOid, observedTagRefOid: value.observedTagRefOid,
      protectedAgainstUpdateAndDeletion: true }; },
    verifyEligibility: async () => eligibilityEvidence({ selection, queueEnteredAt: selection.queueEnteredAt }),
  });
  const result = await verifier.verify(event);
  if (result.status !== 'ACCEPTED_OWNER_AMENDMENT_G0') fail(result.reason ?? 'merge-group OWNER_AMENDMENT verification failed.');
  process.stdout.write(`OWNER_AMENDMENT / G0 accepted: ${JSON.stringify(result)}\n`);
}

main().catch(error => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
