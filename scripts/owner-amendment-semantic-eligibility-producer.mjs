import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { appendRunnerGitHubOutput, readRunnerTempFile, resolveRunnerTempDirectory, writeRunnerTempFile,
  validateRepositoryTreePath, validateSelfAuthorityManifest,
  ownerAmendmentTagApiUrl } from '../src/runner-temp-path.mjs';
import { createOwnerAmendmentSemanticEligibilityProducer, completeOwnerAmendmentSemanticEligibility } from '../src/owner-amendment-semantic-eligibility.mjs';
import { resolveOwnerAmendmentHandoffGitContext } from '../src/owner-amendment-handoff-git-context.mjs';
import { readOwnerAmendmentTagForMergeGroup } from '../src/owner-amendment-tag-readback.mjs';
import { verifyOwnerAmendmentBlockEvidence } from '../src/owner-amendment-attestation.mjs';
import { verifyOwnerAmendmentBlockContext } from '../src/owner-amendment-block-context-verifier.mjs';
import { verifyOwnerAmendmentOwnerDecisionContext } from '../src/owner-amendment-owner-decision-context-verifier.mjs';
import { validateOwnerAmendmentOwnerDecisionAmendmentRecord } from '../src/owner-amendment-owner-decision-amendment-record.mjs';
import { materializeAuthoritySet } from '../src/authority-set.mjs';
import { createGitHubAuthoritySource } from '../src/github-authority-source.mjs';
import { parseCiPolicyJson, resolveCiPolicy } from '../src/resolve-ci-policy.mjs';

const repository = process.env.GITHUB_REPOSITORY;
const baseSha = process.env.BASE_SHA;
const bSha = process.env.B_SHA;
const triggerProfile = process.env.TRIGGER_PROFILE;
const baseBranch = process.env.BASE_BRANCH;
const token = process.env.GH_TOKEN;
const fail = message => { throw new Error(`Owner amendment semantic producer: ${message}`); };
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const runGit = args => execFileSync('git', args, { encoding: 'buffer', maxBuffer: 2 * 1024 * 1024,
  stdio: ['ignore', 'pipe', 'pipe'] });
const gitBlob = (revision, path) => {
  if (!/^[a-f0-9]{40}$/.test(revision ?? '')) fail('Git blob revision is invalid.');
  validateRepositoryTreePath(path);
  return runGit(['--no-replace-objects', 'show', `${revision}:${path}`]);
};

function parseTagObject(objectBytes) {
  const text = new TextDecoder('utf-8', { fatal: true }).decode(objectBytes);
  const split = text.indexOf('\n\n');
  if (split < 0) fail('annotated tag object is malformed.');
  const [object, type, tag] = text.slice(0, split).split('\n');
  if (object !== `object ${bSha}` || type !== 'type commit' || !tag?.startsWith('tag refs/tags/')) fail('annotated tag header does not bind exact B.');
  const message = text.slice(split + 2);
  if (!message.endsWith('\n') || message.slice(0, -1).includes('\n')) fail('tag message is not a single JSON line.');
  const envelope = JSON.parse(message.slice(0, -1));
  const expectedKeys = ['version','profile','bSha','reviewRecordBase64','reviewRecordSha256','attestationBundleBase64','attestationBundleSha256','amendmentRecordBase64','amendmentRecordSha256'];
  const odKeys = [...expectedKeys.slice(0, 2), 'triggerProfile', ...expectedKeys.slice(2)];
  const keys = envelope.version === 2 ? expectedKeys : odKeys;
  if (Object.keys(envelope).length !== keys.length || keys.some(key => !Object.hasOwn(envelope, key)) ||
      envelope.profile !== 'self-g0' || envelope.bSha !== bSha ||
      envelope.version !== (triggerProfile === 'completed-block-v1' ? 2 : 3) ||
      (triggerProfile !== 'completed-block-v1' && envelope.triggerProfile !== triggerProfile)) fail('tag envelope does not select the previous-base trigger profile.');
  const decode = (field, digestField, label, max) => {
    const value = envelope[field];
    if (typeof value !== 'string' || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) fail(`${label} base64 is malformed.`);
    const bytes = Buffer.from(value, 'base64');
    if (!bytes.length || bytes.length > max || bytes.toString('base64') !== value || sha256(bytes) !== envelope[digestField]) fail(`${label} bytes/digest do not match.`);
    return bytes;
  };
  return { envelope, reviewRecordBytes: decode('reviewRecordBase64','reviewRecordSha256','ReviewRecord',131_072),
    attestationBundleBytes: decode('attestationBundleBase64','attestationBundleSha256','attestation bundle',65_536),
    amendmentRecordBytes: decode('amendmentRecordBase64','amendmentRecordSha256','AmendmentRecord',8_192) };
}

function preparedContext(prepared) {
  return { repository: prepared.repository, baseSha: prepared.baseSha, bSha: prepared.bSha,
    triggerProfile: prepared.triggerProfile, triggerReviewRecordSha256: prepared.triggerReviewRecordSha256,
    amendmentRecordSha256: prepared.amendmentRecordSha256, policyRevision: prepared.policyRevision,
    policySha256: prepared.policySha256, authoritySetDigest: prepared.authoritySetDigest,
    resultingAuthoritySetDigest: prepared.resultingAuthoritySetDigest, authorityIds: [...prepared.authorityIds],
    changes: prepared.changes.map(change => ({ ...change })), diffSha256: prepared.diffSha256,
    promptSha256: prepared.promptSha256, schemaSha256: prepared.schemaSha256, model: prepared.model,
    reasoningEffort: prepared.reasoningEffort, gatekeeper: prepared.gatekeeper,
    tag: prepared.tag, producer: prepared.producer };
}

async function prepare() {
  if (repository !== 'flair-agency/architecture-gatekeeper' || !token || !['completed-block-v1','completed-owner-decision-self-v1'].includes(triggerProfile) ||
      !/^[a-f0-9]{40}$/.test(baseSha ?? '') || !/^[a-f0-9]{40}$/.test(bSha ?? '') || baseBranch !== 'main') fail('protected self profile, exact revisions, or GitHub token is invalid.');
  let policyBytes;
  try { policyBytes = gitBlob(baseSha, '.codex/gatekeeper/ci-policy.json'); }
  catch { fail('previous protected base has no readable CI policy.'); }
  const protectedPolicy = resolveCiPolicy(parseCiPolicyJson(new TextDecoder('utf-8', { fatal: true }).decode(policyBytes)), baseBranch);
  if (protectedPolicy.mode !== 'enforced' || protectedPolicy.ownerAmendmentGrade !== 'G0' ||
      protectedPolicy.ownerAmendmentTriggerProfile !== triggerProfile) return null;
  const tagRef = `${protectedPolicy.ownerAmendmentTagNamespace}/${bSha}`;
  const refUrl = ownerAmendmentTagApiUrl(repository, protectedPolicy.ownerAmendmentTagNamespace, bSha);
  const refResponse = await fetch(refUrl, { headers: { accept: 'application/vnd.github+json', authorization: `Bearer ${token}`,
    'x-github-api-version': '2022-11-28' }, redirect: 'error' });
  if (refResponse.status === 404) return null;
  if (!refResponse.ok) fail(`tag reference preflight returned HTTP ${refResponse.status}.`);
  const git = resolveOwnerAmendmentHandoffGitContext({ repository, baseSha, headSha: bSha, baseBranch,
    runGit: args => runGit(args) });
  if (!policyBytes.equals(git.policyBytes)) fail('protected policy bytes changed between resolution and context validation.');
  try { validateSelfAuthorityManifest(git.manifest); }
  catch { fail('the v0.6.0 self profile supports only a non-empty protected Authority Set in this repository.'); }
  const authority = git.scope;
  const tag = await readOwnerAmendmentTagForMergeGroup({ repository, bSha,
    tagNamespace: git.policy.ownerAmendmentTagNamespace, tagRef,
    rulesetId: Number(process.env.OWNER_AMENDMENT_TAG_RULESET_ID), token });
  if (tag.status !== 'READ_BACK_OWNER_AMENDMENT_TAG') fail('exact protected tag could not be read back.');
  const embedded = parseTagObject(tag.tag.objectBytes);
  const trigger = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(embedded.reviewRecordBytes));
  const triggerProducer = { workflowPath: trigger.workflowPath, workflowSha: trigger.workflowSha,
    workflowRef: 'refs/heads/main', runId: String(trigger.runId), runAttempt: String(trigger.runAttempt), jobId: 'owner-amendment-owner-decision-record' };
  const expectedProvenance = { repository, workflowPath: trigger.workflowPath, workflowSha: trigger.workflowSha,
    workflowRef: 'refs/heads/main', runId: String(trigger.runId), runAttempt: String(trigger.runAttempt) };
  const provenance = verifyOwnerAmendmentBlockEvidence({ recordBytes: embedded.reviewRecordBytes,
    bundleBytes: embedded.attestationBundleBytes, expected: expectedProvenance });
  if (provenance.status !== 'VERIFIED_PRODUCER_ATTESTATION') fail(provenance.reason ?? 'trigger attestation is unverified.');
  const selectedTarget = git.manifest.authorities.filter(member => member.repository === 'self' &&
    member.id === authority.authorityId && member.path === authority.authorityPath);
  if (selectedTarget.length !== 1) fail('previous protected Authority Set must contain the selected self target exactly once.');
  const materialized = await materializeAuthoritySet({ manifestBytes: git.manifestBytes, limits: git.limits,
    selfRepository: repository, selfRoot: process.cwd(), authorityRevision: baseSha,
    fetchExternal: createGitHubAuthoritySource({ token }) });
  const authoritySet = { digest: materialized.setDigest, members: materialized.members.map(member => ({ id: member.id,
    repository: member.repository, resolvedCommit: member.resolvedCommit, path: member.path,
    byteLength: member.byteLength, sha256: member.sha256, bytes: Buffer.from(member.content, 'utf8') })) };
  validateRepositoryTreePath(authority.authorityPath);
  const diffBytes = runGit(['--no-replace-objects','diff','--binary','--no-ext-diff','--no-renames',baseSha,bSha,'--',authority.authorityPath]);
  const changes = [{ path: authority.authorityPath, beforeBytes: git.authorityBytes.base, afterBytes: git.authorityBytes.head }];
  const tagRefOid = tag.tag.objectOid;
  const tagIdentity = { tagRef, tagObjectOid: tagRefOid, observedTagRefOid: tag.observedTagRefOid };
  const validateTriggerProvenance = ({ bytes, expected }) => {
    if (!bytes.equals(embedded.reviewRecordBytes) || expected.triggerReviewRecordSha256 !== sha256(bytes)) fail('trigger record differs from exact tagged bytes.');
    return { status: 'VERIFIED_OWNER_AMENDMENT_TRIGGER', repository, baseSha, triggerProfile,
      triggerReviewRecordSha256: sha256(bytes), workflowPath: expected.workflowPath, workflowSha: expected.workflowSha,
      workflowRef: expected.workflowRef, runId: expected.runId, runAttempt: expected.runAttempt };
  };
  const validateAmendmentRecord = ({ bytes, expected }) => {
    if (triggerProfile === 'completed-owner-decision-self-v1') {
      const result = validateOwnerAmendmentOwnerDecisionAmendmentRecord({ bytes, expected });
      if (result.status !== 'VERIFIED_OWNER_AMENDMENT_RECORD') fail(result.reason);
      return result;
    }
    const amendment = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    const resulting = materialized.members.map(member => ({ id: member.id, repository: member.repository,
      resolvedCommit: member.resolvedCommit, path: member.path,
      byteLength: member.path === authority.authorityPath && member.repository === repository ? git.authorityBytes.head.length : member.byteLength,
      sha256: member.path === authority.authorityPath && member.repository === repository ? authority.newSha256 : member.sha256 }));
    const resultingDigest = sha256(Buffer.from(JSON.stringify(resulting)));
    if (amendment.version !== 2 || amendment.repository !== repository || amendment.baseSha !== baseSha || amendment.headSha !== bSha ||
        amendment.policyRevision !== baseSha || amendment.triggeringReviewSha256 !== expected.triggerReviewRecordSha256 ||
        amendment.attestationBundleSha256 !== sha256(embedded.attestationBundleBytes) || amendment.authority?.id !== authority.authorityId ||
        amendment.authority?.path !== authority.authorityPath || amendment.authority?.previousSha256 !== authority.previousSha256 ||
        amendment.authority?.newSha256 !== authority.newSha256) fail('BLOCK AmendmentRecord does not bind the exact trigger and target.');
    return { status: 'VERIFIED_OWNER_AMENDMENT_RECORD', repository, baseSha, bSha, policyRevision: baseSha, triggerProfile,
      triggerReviewRecordSha256: expected.triggerReviewRecordSha256, priorAuthoritySetDigest: expected.authoritySetDigest,
      resultingAuthoritySetDigest: resultingDigest, targetValidated: true, purpose: amendment.purpose };
  };
  const validateTag = ({ expected }) => ({ status: 'VERIFIED_OWNER_AMENDMENT_TAG', repository, baseSha, bSha,
    triggerProfile, triggerReviewRecordSha256: expected.triggerReviewRecordSha256,
    amendmentRecordSha256: expected.amendmentRecordSha256, tagRef, tagObjectOid: tagRefOid, observedTagRefOid: tag.observedTagRefOid });
  const resolveProtectedInputs = () => ({ baseBranch, policyBytes, manifestBytes: git.manifestBytes, authoritySet,
    changes, diffBytes });
  const resolveExactGitDiff = () => ({ diffBytes });
  const resolveExactBFiles = ({ paths }) => ({ files: paths.map(path => ({ path, bytes: gitBlob(bSha, path) })) });
  const selectedProducer = { workflowPath: '.github/workflows/self-architecture-gate.yml', workflowSha: baseSha,
    workflowRef: 'refs/heads/main', runId: process.env.GITHUB_RUN_ID, runAttempt: process.env.GITHUB_RUN_ATTEMPT,
    jobId: 'owner-amendment-semantic-eligibility-signer' };
  const selectedGatekeeper = { repository: 'flair-agency/architecture-gatekeeper', revision: process.env.GITHUB_WORKFLOW_SHA, package: null };
  const resolveProtectedSelection = () => ({ selectedProducer, selectedGatekeeper });
  const producer = createOwnerAmendmentSemanticEligibilityProducer({ resolveProtectedInputs, resolveExactGitDiff,
    resolveExactBFiles, resolveProtectedSelection, validateTriggerProvenance, validateAmendmentRecord, validateTag });
  const prepared = producer.prepare({ repository, baseSha, bSha, baseBranch, triggerProfile, policyRevision: baseSha,
    triggerReviewRecordBytes: embedded.reviewRecordBytes, triggerProducer, amendmentRecordBytes: embedded.amendmentRecordBytes,
    tag: tagIdentity, tagObjectBytes: tag.tag.objectBytes, producer: selectedProducer,
    selectedProducer, gatekeeper: selectedGatekeeper, selectedGatekeeper, reviewModel: git.policy.model,
    reviewReasoningEffort: git.policy.reasoningEffort });
  return { prepared, producer };
}

async function main() {
  const command = process.argv[2];
  if (command === 'stage-review-output') {
    const decisionBytes = Buffer.from(process.env.DECISION ?? '', 'utf8');
    if (!decisionBytes.length || decisionBytes.length > 65_536) fail('semantic decision is missing or oversized.');
    const outputDir = resolveRunnerTempDirectory(process.env.RUNNER_TEMP, 'owner-amendment-semantic-reviewer-output');
    writeRunnerTempFile(outputDir, 'decision.json', decisionBytes);
    process.stdout.write(`${JSON.stringify({ status: 'STAGED_SEMANTIC_REVIEW_OUTPUT', bytes: decisionBytes.length })}\n`);
    return;
  }
  const outputDir = resolveRunnerTempDirectory(process.env.RUNNER_TEMP, 'owner-amendment-eligibility');
  const preparedState = await prepare();
  if (preparedState === null) {
    if (command !== 'prepare') fail('exact-B owner-amendment tag is absent.');
    process.stdout.write(`${JSON.stringify({ status: 'OWNER_AMENDMENT_NOT_APPLICABLE', triggerProfile })}\n`);
    if (process.env.GITHUB_OUTPUT) appendRunnerGitHubOutput(process.env.RUNNER_TEMP, process.env.GITHUB_OUTPUT, 'status=not-applicable\n');
    return;
  }
  const { prepared } = preparedState;
  if (command === 'prepare') {
    writeRunnerTempFile(outputDir, 'eligibility-prompt.md', prepared.promptBytes);
    writeRunnerTempFile(outputDir, 'eligibility.schema.json', prepared.schemaBytes);
    writeRunnerTempFile(outputDir, 'prepared-context.json', `${JSON.stringify(preparedContext(prepared))}\n`);
    process.stdout.write(`${JSON.stringify({ status: prepared.status, triggerProfile, promptSha256: prepared.promptSha256, schemaSha256: prepared.schemaSha256, model: prepared.model, reasoningEffort: prepared.reasoningEffort })}\n`);
    if (process.env.GITHUB_OUTPUT) appendRunnerGitHubOutput(process.env.RUNNER_TEMP, process.env.GITHUB_OUTPUT,
      `status=prepared\nmodel=${prepared.model}\neffort=${prepared.reasoningEffort}\n`);
    return;
  }
  if (command !== 'complete') fail('command must be prepare or complete.');
  const expectedContext = Buffer.from(`${JSON.stringify(preparedContext(prepared))}\n`, 'utf8');
  const contextFile = readRunnerTempFile(outputDir, 'prepared-context.json');
  const promptFile = readRunnerTempFile(outputDir, 'eligibility-prompt.md');
  const schemaFile = readRunnerTempFile(outputDir, 'eligibility.schema.json');
  if (!contextFile.equals(expectedContext) || !promptFile.equals(prepared.promptBytes) || !schemaFile.equals(prepared.schemaBytes)) {
    fail('protected B, trigger, policy, Authority Set, prompt or schema changed after semantic review preparation.');
  }
  const reviewerOutputDir = resolveRunnerTempDirectory(process.env.RUNNER_TEMP, 'owner-amendment-semantic-reviewer-output');
  const decisionBytes = readRunnerTempFile(reviewerOutputDir, 'decision.json', 65_536);
  const completed = completeOwnerAmendmentSemanticEligibility({ prepared, decisionBytes,
    producer: prepared.producer, gatekeeper: prepared.gatekeeper, reviewModel: prepared.model, reviewReasoningEffort: prepared.reasoningEffort });
  writeRunnerTempFile(outputDir, 'eligibility-receipt.json', completed.receiptBytes);
  const completedAt = new Date().toISOString();
  process.stdout.write(`${JSON.stringify({ status: completed.status, eligibility: completed.receipt.eligibility, receiptSha256: completed.receiptSha256, completedAt })}\n`);
  if (process.env.GITHUB_OUTPUT) appendRunnerGitHubOutput(process.env.RUNNER_TEMP, process.env.GITHUB_OUTPUT,
    `eligibility=${completed.receipt.eligibility}\ncompleted_at=${completedAt}\nreceipt_sha256=${completed.receiptSha256}\n`);
}

main().catch(error => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
