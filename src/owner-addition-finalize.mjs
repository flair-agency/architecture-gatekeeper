#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { realpathSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolveCiPolicy, parseCiPolicyJson } from './resolve-ci-policy.mjs';
import { verifyOwnerAdditionEligibilityProvenance } from './github-owner-addition-provenance.mjs';
import { verifyOwnerAdditionReadback } from './github-owner-addition-readback.mjs';
import { evaluateOwnerAdditionAdoption } from './owner-addition-adoption.mjs';
import { digestOwnerDecisionAddition } from './owner-decision-addition.mjs';
import { rejectDuplicateJsonKeys } from './authority-set.mjs';
import { validateMultiAuthorityProvenance } from './multi-authority-provenance.mjs';

const api = 'https://api.github.com';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');

function fail(message) { throw new Error(`OWNER_ADDITION finalizer: ${message}`); }
function object(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label} is malformed.`);
  return value;
}
function oid(value, label) {
  if (typeof value !== 'string' || !/^[a-f0-9]{40}$/.test(value)) fail(`${label} is not a SHA-1 Git object ID.`);
  return value;
}
function parseRepo(repo) {
  if (typeof repo !== 'string' || !/^[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/.test(repo)) fail('repository must be owner/name.');
  return repo;
}
function contentPath(path) {
  return path.split('/').map(encodeURIComponent).join('/');
}

export function verifyG0TagObjectEvidence(procedure, tagObject) {
  object(procedure, 'G0 procedure');
  object(tagObject, 'G0 tag object');
  if (tagObject.sha !== procedure.tagObjectOid || tagObject.object?.type !== 'commit' ||
      tagObject.object?.sha !== procedure.headSha || typeof tagObject.message !== 'string') {
    fail('immutable G0 tag object does not bind exact B.');
  }
  let additionRecord;
  try {
    rejectDuplicateJsonKeys(tagObject.message, 'G0 AdditionRecord');
    additionRecord = JSON.parse(tagObject.message);
  } catch { fail('G0 tag message is not a strict AdditionRecord JSON object.'); }
  if (digestOwnerDecisionAddition(additionRecord) !== procedure.additionRecordSha256) {
    fail('G0 tag AdditionRecord differs from the verified pre-merge procedure.');
  }
  return additionRecord;
}

export async function readG0TagObjectReadback(response, procedure) {
  if (!response || !Number.isSafeInteger(response.status)) fail('G0 tag-object readback response is malformed.');
  if (response.status === 404 || response.status === 410) return { status: 'unavailable', additionRecord: null };
  if (!response.ok) fail(`G0 immutable tag-object readback failed (${response.status}).`);
  let tagObject;
  try { tagObject = await response.json(); } catch { fail('G0 immutable tag-object response is malformed.'); }
  return { status: 'verified', additionRecord: verifyG0TagObjectEvidence(procedure, object(tagObject, 'G0 tag object')) };
}

export function summarizeG0TagRefReadback(refResult, expectedTagRef, expectedObjectOid) {
  if (!refResult) return { status: 'unavailable', ref: expectedTagRef };
  if (refResult.ref !== expectedTagRef || typeof refResult.object?.sha !== 'string') {
    return { status: 'unavailable', ref: expectedTagRef };
  }
  return { status: refResult.object.sha === expectedObjectOid ? 'matches' : 'moved',
    ref: expectedTagRef, observedObjectOid: refResult.object.sha, observedObjectType: refResult.object.type ?? null };
}

export function verifyMergeAncestorComparison(comparison, mergeSha, targetSha) {
  object(comparison, 'GitHub compare result');
  oid(mergeSha, 'merge commit SHA'); oid(targetSha, 'target commit SHA');
  if (!['ahead', 'identical'].includes(comparison.status) || comparison.base_commit?.sha !== mergeSha ||
      comparison.merge_base_commit?.sha !== mergeSha ||
      !Array.isArray(comparison.commits) || comparison.commits.length > 250 ||
      comparison.commits.some(commit => !/^[a-f0-9]{40}$/.test(commit?.sha || ''))) {
    fail('target ancestry response does not prove the exact merge commit is an ancestor within the bounded page.');
  }
  // The compare request itself uses mergeSha...targetSha. GitHub's identical
  // response omits head_commit, so exact target identity comes from that URL
  // and the separately fetched target ref/commit, not an optional response field.
  return [mergeSha, ...comparison.commits.map(commit => commit.sha)];
}

function scalar(value, label, allowEmpty = false) {
  let result = value.trim();
  if ((result.startsWith('"') && result.endsWith('"')) || (result.startsWith("'") && result.endsWith("'"))) {
    result = result.slice(1, -1);
  }
  if ((!allowEmpty && !result) || /[${}`]/.test(result)) fail(`${label} must be a literal scalar.`);
  return result;
}

export function parsePinnedGatekeeperWorkflow(callerWorkflowBytes) {
  const source = Buffer.from(callerWorkflowBytes).toString('utf8');
  if (!source || source.includes('\uFFFD')) fail('caller workflow is not valid UTF-8.');
  const lines = source.split(/\r?\n/);
  const usesLines = [];
  const targetMarker = 'flair-agency/architecture-gatekeeper/.github/workflows/architecture-gate.yml';
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    const match = line.match(/^(\s*)uses:\s*(.*?)\s*$/);
    if (!match || match[2].startsWith('#')) continue;
    const use = scalar(match[2].replace(/\s+#.*$/, ''), 'caller uses value');
    if (use.includes(targetMarker)) usesLines.push({ index, indent: match[1].length, use });
  }
  if (usesLines.length !== 1) fail('recorded-base caller must contain exactly one Gatekeeper reusable workflow use.');
  const selectedUse = usesLines[0];
  if (selectedUse.indent !== 4) fail('Gatekeeper reusable workflow must be declared as a caller job, not a step.');
  let callerJobId;
  for (let index = selectedUse.index - 1; index >= 0; index--) {
    const line = lines[index];
    if (!line.trim() || line.trimStart().startsWith('#')) continue;
    const indent = line.match(/^\s*/)[0].length;
    if (indent === 2) {
      const job = line.match(/^  ([A-Za-z0-9_-]+):\s*(?:#.*)?$/);
      if (job) callerJobId = job[1];
      break;
    }
    if (indent < 2) break;
  }
  if (!callerJobId || !lines.slice(0, selectedUse.index).some(line => /^jobs:\s*$/.test(line))) {
    fail('Gatekeeper reusable workflow caller job ID is ambiguous or missing.');
  }
  const match = selectedUse.use.match(/^flair-agency\/architecture-gatekeeper\/(\.github\/workflows\/architecture-gate\.yml)@([a-f0-9]{40})$/);
  if (!match || match[1] !== '.github/workflows/architecture-gate.yml') {
    fail('Gatekeeper reusable workflow must use the exact supported path pinned to a 40-character commit SHA.');
  }
  const values = {};
  for (let index = selectedUse.index + 1; index < lines.length; index++) {
    const line = lines[index];
    if (!line.trim() || line.trimStart().startsWith('#')) continue;
    const indent = line.match(/^\s*/)[0].length;
    if (indent === selectedUse.indent && /^\s*with:\s*$/.test(line)) {
      for (let child = index + 1; child < lines.length; child++) {
        const entry = lines[child];
        if (!entry.trim() || entry.trimStart().startsWith('#')) continue;
        const childIndent = entry.match(/^\s*/)[0].length;
        if (childIndent <= selectedUse.indent) break;
        const input = entry.match(/^\s+([a-z][a-z-]*):\s*(.*?)\s*$/);
        if (!input || !['policy-path', 'prompt-path', 'schema-path', 'validation-path'].includes(input[1])) continue;
        if (Object.hasOwn(values, input[1])) fail(`caller workflow repeats ${input[1]}.`);
        values[input[1]] = scalar(input[2].replace(/\s+#.*$/, ''), `caller ${input[1]}`, input[1] === 'validation-path');
      }
      break;
    }
    if (indent <= selectedUse.indent) break;
  }
  return { path: `flair-agency/architecture-gatekeeper/${match[1]}`, sha: match[2], inputs: values, callerJobId };
}

export function validateOwnerAdditionProducerJobName(jobName, callerJobId) {
  if (typeof callerJobId !== 'string' || !/^[A-Za-z0-9_-]+$/.test(callerJobId) ||
      jobName !== `${callerJobId} / owner-addition`) {
    fail('recorded-base policy producer job must match the caller Gatekeeper job ID and owner-addition job.');
  }
  return jobName;
}

export function parseGatekeeperWorkflowDefaults(workflowBytes) {
  const source = Buffer.from(workflowBytes).toString('utf8');
  if (!source || source.includes('\uFFFD')) fail('pinned Gatekeeper workflow is not valid UTF-8.');
  const lines = source.split(/\r?\n/);
  const callLines = lines.map((line, index) => /^\s{2}workflow_call:\s*$/.test(line) ? index : -1).filter(index => index >= 0);
  if (callLines.length !== 1) fail('pinned Gatekeeper workflow has ambiguous workflow_call declarations.');
  const callIndex = callLines[0];
  const inputsIndex = lines.findIndex((line, index) => index > callIndex && /^\s{4}inputs:\s*$/.test(line));
  if (inputsIndex < 0) fail('pinned Gatekeeper workflow has no workflow_call input declarations.');
  const defaults = {};
  for (const name of ['policy-path', 'prompt-path', 'schema-path', 'validation-path']) {
    const indices = lines.map((line, index) => /^\s{6}([a-z][a-z-]*):\s*$/.exec(line)?.[1] === name ? index : -1)
      .filter(index => index > inputsIndex);
    if (indices.length !== 1) fail(`pinned Gatekeeper workflow must declare exactly one ${name} input.`);
    const start = indices[0];
    let end = start + 1;
    while (end < lines.length && (!lines[end].trim() || lines[end].match(/^\s*/)[0].length > 6)) end++;
    const defaultLines = lines.slice(start + 1, end).map(line => /^\s{8}default:\s*(.*?)\s*$/.exec(line)).filter(Boolean);
    if (defaultLines.length !== 1) fail(`pinned Gatekeeper workflow must provide exactly one literal ${name} default.`);
    defaults[name] = scalar(defaultLines[0][1], `pinned ${name} default`, name === 'validation-path');
  }
  return defaults;
}

/** Create a serializable final record only from the trusted facts passed by adapters. */
export function buildOwnerAdditionFinalRecord({ repository, targetBranch, pullRequestNumber, baseSha, bSha, bTree,
  authorityDigest, policy, selected, policySha256, policyPath, procedure, ordinaryDecision, authoritySet, eligibility,
  authoritySetProvenance, eligibilityEvidence, merge, targetReadback, identities = {}, generatedAt = new Date().toISOString() }) {
  validateMultiAuthorityProvenance(authoritySetProvenance);
  if (authoritySetProvenance.selfRepository !== repository || authoritySetProvenance.authorityRevision !== baseSha ||
      authoritySetProvenance.setDigest !== authoritySet.digest ||
      authoritySetProvenance.members.length !== authoritySet.ids.length ||
      authoritySetProvenance.members.some((member, index) => member.id !== authoritySet.ids[index])) {
    fail('verified Authority Set provenance does not match the final record binding.');
  }
  // Keep the evaluator's intentionally closed evidence shape separate from
  // the richer serialized record that carries the tag's authority binding.
  const adoptionProcedure = { status: procedure.status, digest: procedure.digest, repository: procedure.repository,
    baseSha: procedure.baseSha, bSha: procedure.bSha, targetBranch: procedure.targetBranch,
    pullRequestNumber: procedure.pullRequestNumber, tagTargetSha: procedure.tagTargetSha,
    tagObjectOid: procedure.tagObjectOid, ownerDecisionId: procedure.ownerDecisionId,
    authoritySetDigest: procedure.authoritySetDigest, authorityIds: procedure.authorityIds };
  const result = evaluateOwnerAdditionAdoption({ candidate: { repository, targetBranch,
    pullRequest: { number: pullRequestNumber }, baseSha, bSha, bTree, authorityDigest }, procedure: adoptionProcedure,
  ordinaryDecision, authoritySet, eligibility, eligibilityEvidence, merge, targetReadback });
  return {
    version: 1,
    generatedAt: new Date(Date.parse(generatedAt)).toISOString(),
    candidate: { repository, targetBranch, pullRequestNumber, baseSha, bSha, bTree },
    selectedPolicy: { path: policyPath, revision: baseSha, version: policy.version, sha256: policySha256,
      mode: selected.mode, producer: selected.adoptionEvidenceProducer,
      workflowPath: selected.adoptionEvidenceWorkflowPath, jobName: selected.adoptionEvidenceJobName },
    authoritySet: { ids: [...authoritySet.ids], digest: authoritySet.digest,
      repository: authoritySetProvenance.selfRepository, revision: authoritySetProvenance.authorityRevision,
      manifestSha256: authoritySetProvenance.manifestSha256,
      members: authoritySetProvenance.members.map(member => ({ ...member })) },
    addition: { authorityId: procedure.authorityId, authorityPath: procedure.authorityPath,
      tagRef: procedure.tagRef, tagObjectOid: procedure.tagObjectOid,
      additionRecordSha256: procedure.additionRecordSha256, ownerDecisionId: procedure.missingDecisionId,
      authoritySha256: authorityDigest, refReadback: identities.g0TagReadback ?? { status: 'unavailable' } },
    eligibility: { result: eligibility.result, digest: eligibility.digest,
      producer: result.eligibilityProducer, completedAt: result.eligibilityCompletedAt },
    merge: { sha: merge.commit.sha, parents: [...merge.commit.parents], tree: merge.commit.tree,
      mergedAt: merge.hostMetadata.mergedAt },
    canonical: { ref: targetReadback.targetRef, observedSha: targetReadback.targetSha,
      authoritySha256: targetReadback.authorityDigest },
    callerWorkflow: identities.callerWorkflow ?? { path: null, revision: baseSha, sha256: null, status: 'unavailable' },
    gatekeeper: identities.gatekeeper ?? { workflowPath: selected.adoptionEvidenceWorkflowPath,
      runtimeRevision: null, status: 'unavailable' },
    reviewInputs: { ordinary: { prompt: identities.ordinaryPrompt ?? { path: null, sha256: null, status: 'unavailable' },
        schema: identities.ordinarySchema ?? { path: null, sha256: null, status: 'unavailable' },
        validation: identities.validation ?? { path: null, sha256: null, status: 'not_selected' } },
      ownerAddition: { prompt: identities.prompt ?? { path: null, sha256: null, status: 'unavailable' },
        schema: identities.schema ?? { path: null, sha256: null, status: 'unavailable' } } },
    assurance: { principalAuthentication: result.principalAuthentication,
      hostEnforcement: 'not_verified', policyProtection: 'not_claimed',
      eligibilityProducerTime: result.eligibilityCompletedAt },
    outcome: result,
  };
}

/**
 * Fetch, validate and bind a merged B adoption. No consumer-repository files are
 * changed; the caller may write the returned record to an explicitly chosen path.
 */
export async function finalizeOwnerAddition({ repository, pullRequestNumber, githubToken, runId, attempt = 1,
  policyPath, fetchImpl = globalThis.fetch, identities = {} }) {
  repository = parseRepo(repository);
  if (!Number.isSafeInteger(pullRequestNumber) || pullRequestNumber < 1) fail('pull request number is invalid.');
  if (!githubToken || typeof githubToken !== 'string') fail('GitHub token is required.');
  if (!/^\d+$/.test(String(runId)) || !Number.isSafeInteger(Number(attempt)) || Number(attempt) < 1) fail('producer run ID and attempt are required.');
  if (!fetchImpl) fail('fetch implementation is unavailable.');
  const headers = { accept: 'application/vnd.github+json', authorization: `Bearer ${githubToken}`,
    'x-github-api-version': '2022-11-28' };
  const request = async (path, repo = repository) => {
    const response = await fetchImpl(`${api}/repos/${repo}/${path}`, { headers, redirect: 'follow' });
    if (!response?.ok) fail(`GitHub API request failed (${response?.status ?? 'no response'}).`);
    return response.json();
  };
  const file = async (path, revision, repo = repository) => {
    const item = object(await request(`contents/${contentPath(path)}?ref=${encodeURIComponent(revision)}`, repo), `${path} content`);
    if (item.type !== 'file' || item.encoding !== 'base64' || typeof item.content !== 'string') fail(`${path} is not a regular base64 file.`);
    const bytes = Buffer.from(item.content.replace(/\n/g, ''), 'base64');
    if (!bytes.length || bytes.length > 524_288) fail(`${path} is empty or exceeds its byte limit.`);
    return bytes;
  };

  const pr = object(await request(`pulls/${pullRequestNumber}`), 'pull request');
  if (pr.number !== pullRequestNumber || pr.state !== 'closed' || pr.merged !== true ||
      pr.base?.repo?.full_name?.toLowerCase() !== repository.toLowerCase()) fail('pull request is not merged into the requested repository.');
  const targetBranch = pr.base.ref;
  const mergeSha = oid(pr.merge_commit_sha, 'merge commit SHA');
  const mergeRaw = object(await request(`git/commits/${mergeSha}`), 'merge commit');
  const parents = (mergeRaw.parents || []).map(parent => oid(parent.sha, 'merge parent'));
  if (parents.length !== 2) fail('v0.5.1 finalization supports ordinary merge commits only.');
  const baseSha = parents[0];
  const bSha = oid(pr.head?.sha, 'exact B SHA');
  if (parents[1] !== bSha) fail('merge commit second parent is not exact B.');
  const mergeTree = oid(mergeRaw.tree?.sha, 'merge tree');
  const bCommit = object(await request(`git/commits/${bSha}`), 'B commit');
  const bTree = oid(bCommit.tree?.sha, 'B tree');
  if (mergeTree !== bTree) fail('merge tree differs from exact B tree.');

  const runInfo = object(await request(`actions/runs/${runId}/attempts/${attempt}`), 'selected producer run');
  if (typeof runInfo.path !== 'string') fail('selected producer run has no workflow path.');
  const callerPath = runInfo.path.split('@', 1)[0];
  if (!/^\.github\/workflows\/[A-Za-z0-9._/-]+\.ya?ml$/.test(callerPath) || callerPath.split('/').some(part => part === '.' || part === '..')) {
    fail('selected producer run caller workflow path is invalid.');
  }
  const callerWorkflowBytes = await file(callerPath, baseSha);
  const gatekeeperWorkflow = parsePinnedGatekeeperWorkflow(callerWorkflowBytes);
  const reusableWorkflowBytes = await file('.github/workflows/architecture-gate.yml', gatekeeperWorkflow.sha,
    'flair-agency/architecture-gatekeeper');
  const defaults = parseGatekeeperWorkflowDefaults(reusableWorkflowBytes);
  const callerInputs = Object.fromEntries(Object.keys(defaults).map(name => [name,
    Object.hasOwn(gatekeeperWorkflow.inputs, name) ? gatekeeperWorkflow.inputs[name] : defaults[name]]));
  for (const name of ['policy-path', 'prompt-path', 'schema-path']) {
    if (!/^(?:[A-Za-z0-9._-]+\/)*[A-Za-z0-9._-]+$/.test(callerInputs[name]) || callerInputs[name].split('/').some(part => part === '.' || part === '..')) {
      fail(`effective caller ${name} is not a safe repository path.`);
    }
  }
  if (callerInputs['validation-path'] &&
      (!/^(?:[A-Za-z0-9._-]+\/)*[A-Za-z0-9._-]+$/.test(callerInputs['validation-path']) ||
       callerInputs['validation-path'].split('/').some(part => part === '.' || part === '..'))) {
    fail('effective caller validation-path is not a safe repository path.');
  }
  if (policyPath && policyPath !== callerInputs['policy-path']) fail('explicit policy path differs from the recorded-base caller workflow input.');
  policyPath = callerInputs['policy-path'];
  const policyBytes = await file(policyPath, baseSha);
  const policy = parseCiPolicyJson(policyBytes.toString('utf8'));
  const selected = resolveCiPolicy(policy, targetBranch);
  if (policy.version !== 5 || selected.mode !== 'procedural' || selected.adoptionEvidenceProducer !== 'github-actions' ||
      selected.policyVersion !== 5 || typeof selected.adoptionEvidenceWorkflowPath !== 'string' ||
      typeof selected.adoptionEvidenceJobName !== 'string' || selected.adoptionEvidenceWorkflowPath !== callerPath) {
    fail('recorded-base policy does not select the v5 procedural GitHub Actions route.');
  }
  const jobName = validateOwnerAdditionProducerJobName(selected.adoptionEvidenceJobName, gatekeeperWorkflow.callerJobId);
  const jobs = object(await request(`actions/runs/${runId}/attempts/${attempt}/jobs?per_page=100`), 'producer jobs');
  if (!Array.isArray(jobs.jobs) || jobs.total_count > 100) fail('producer job listing is missing or too large.');
  const producerJobs = jobs.jobs.filter(job => job.name === jobName);
  if (producerJobs.length !== 1) fail('recorded-base producer job name is absent or ambiguous in the selected run.');
  const jobId = producerJobs[0].id;

  // The provenance verifier derives exact artifact digests and member IDs after
  // checking the artifact, while selecting producer solely from recorded policy.
  const provenanceResult = await verifyOwnerAdditionEligibilityProvenance({ githubToken, repository,
    targetBranch, pullRequestNumber, baseSha, bSha, callerPath, jobName, runId: String(runId), attempt: Number(attempt),
    jobId: String(jobId), mergeAt: pr.merged_at, policySha256: hash(policyBytes),
    expectedGatekeeperWorkflow: { path: gatekeeperWorkflow.path, sha: gatekeeperWorkflow.sha }, fetchImpl });
  const artifacts = provenanceResult.artifacts;
  const procedureSource = artifacts.procedure;
  const authorityPath = selected.ownerAdditionAuthorityPath;
  if (procedureSource.policySha256 !== hash(policyBytes) || procedureSource.authorityPath !== authorityPath ||
      procedureSource.repository !== repository || procedureSource.baseSha !== baseSha || procedureSource.headSha !== bSha) {
    fail('verified procedure does not match the recorded-base policy or merged B.');
  }
  const authorityBytes = await file(authorityPath, bSha);
  const authorityDigest = hash(authorityBytes);
  if (authorityDigest !== procedureSource.newAuthoritySha256) fail('B authority bytes do not match the verified G0 procedure.');
  const tagObjectResponse = await fetchImpl(`${api}/repos/${repository}/git/tags/${procedureSource.tagObjectOid}`,
    { headers, redirect: 'follow' });
  const tagObjectReadback = await readG0TagObjectReadback(tagObjectResponse, procedureSource);
  const additionRecord = tagObjectReadback.additionRecord;
  let tagRefResult = null;
  try {
    const response = await fetchImpl(`${api}/repos/${repository}/git/ref/tags/${contentPath(procedureSource.tagRef.replace(/^refs\/tags\//, ''))}`,
      { headers, redirect: 'follow' });
    if (response.ok) tagRefResult = await response.json();
  } catch { /* Point-in-time tag-ref availability is informative, not adoption evidence. */ }
  const tagRefReadback = summarizeG0TagRefReadback(tagRefResult, procedureSource.tagRef, procedureSource.tagObjectOid);
  const targetRefRaw = object(await request(`git/ref/heads/${contentPath(targetBranch)}`), 'target branch ref');
  const targetSha = oid(targetRefRaw.object?.sha, 'target branch SHA');
  const targetCommit = await request(`git/commits/${targetSha}`);
  const comparison = object(await request(`compare/${mergeSha}...${targetSha}?per_page=250`), 'target ancestry comparison');
  const ancestorShas = verifyMergeAncestorComparison(comparison, mergeSha, targetSha);
  const authorityAtTarget = await file(authorityPath, targetSha);
  const readback = verifyOwnerAdditionReadback({ repository,
    expected: { targetBranch, pullRequestNumber, baseSha, bSha, bTree, authorityPath, authorityDigest },
    pullRequest: pr,
    mergeCommit: { sha: mergeSha, tree: mergeTree, parents },
    targetRef: { ref: `refs/heads/${targetBranch}`, sha: targetSha },
    targetCommit: { sha: targetSha, ancestorShas,
      authoritySnapshot: { commitSha: targetSha, path: authorityPath, bytes: authorityAtTarget } },
  });
  const procedure = { status: 'verified', digest: artifacts.digests.procedure, repository,
    baseSha, bSha, targetBranch, pullRequestNumber, tagTargetSha: bSha,
    tagObjectOid: procedureSource.tagObjectOid, ownerDecisionId: procedureSource.missingDecisionId,
    authorityId: procedureSource.authorityId, authorityPath: procedureSource.authorityPath,
    tagRef: procedureSource.tagRef, additionRecordSha256: procedureSource.additionRecordSha256,
    missingDecisionId: procedureSource.missingDecisionId,
    authoritySetDigest: procedureSource.authoritySet.setDigest,
    authorityIds: artifacts.authoritySetProvenance.members.map(member => member.id) };
  const ordinaryDecision = { status: 'verified', decision: artifacts.ordinaryDecision.decision,
    ownerDecisionId: artifacts.ordinaryDecision.ownerDecisionId, repository, baseSha, bSha,
    authoritySetDigest: artifacts.ordinaryDecision.authoritySetDigest,
    authorityIds: artifacts.ordinaryDecision.authorityIds };
  const authoritySet = { status: 'verified', ids: procedure.authorityIds, digest: procedure.authoritySetDigest };
  const authoritySetProvenance = artifacts.authoritySetProvenance;
  const eligibility = { status: 'verified', digest: artifacts.digests.eligibilityDecision,
    result: 'eligible', repository, baseSha, bSha, pullRequestNumber,
    authoritySetDigest: procedure.authoritySetDigest, authorityIds: procedure.authorityIds };
  const eligibilityEvidence = { status: 'verified', provenance: provenanceResult.provenance,
    completedAt: provenanceResult.completedAt };
  const merged = readback.merge;
  const promptPath = selected.ownerAdditionPromptPath;
  const schemaPath = selected.ownerAdditionSchemaPath;
  const promptBytes = await file(promptPath, baseSha);
  const schemaBytes = await file(schemaPath, baseSha);
  const ordinaryPromptBytes = await file(callerInputs['prompt-path'], baseSha);
  const ordinarySchemaBytes = await file(callerInputs['schema-path'], baseSha);
  const validationPath = callerInputs['validation-path'];
  const validationBytes = validationPath ? await file(validationPath, baseSha) : null;
  const boundIdentities = { ...identities,
    callerWorkflow: { path: callerPath, revision: baseSha, sha256: hash(callerWorkflowBytes), status: 'verified',
      gatekeeperWorkflowPath: gatekeeperWorkflow.path, gatekeeperWorkflowSha: gatekeeperWorkflow.sha },
    prompt: { path: promptPath, sha256: hash(promptBytes), status: 'verified', revision: baseSha },
    schema: { path: schemaPath, sha256: hash(schemaBytes), status: 'verified', revision: baseSha },
    ordinaryPrompt: { path: callerInputs['prompt-path'], sha256: hash(ordinaryPromptBytes), status: 'verified', revision: baseSha },
    ordinarySchema: { path: callerInputs['schema-path'], sha256: hash(ordinarySchemaBytes), status: 'verified', revision: baseSha },
    validation: validationPath ? { path: validationPath, sha256: hash(validationBytes), status: 'verified', revision: baseSha }
      : { path: null, sha256: null, status: 'not_selected' },
    gatekeeper: { path: provenanceResult.gatekeeperWorkflow.path, sha: provenanceResult.gatekeeperWorkflow.sha,
      status: 'verified' },
    g0TagReadback: { ...tagRefReadback,
      ...(tagObjectReadback.status === 'verified' ? { targetSha: procedureSource.headSha } : {}),
      additionRecordSha256: procedureSource.additionRecordSha256,
      immutableTagObject: tagObjectReadback.status },
  };
  const record = buildOwnerAdditionFinalRecord({ repository, targetBranch, pullRequestNumber, baseSha, bSha, bTree,
    authorityDigest, policy, policySha256: hash(policyBytes), policyPath, procedure, ordinaryDecision, authoritySet,
    selected, eligibility, authoritySetProvenance, eligibilityEvidence, merge: merged,
    targetReadback: readback.targetReadback, identities: boundIdentities });
  if (record.outcome.adoption !== 'valid' || record.outcome.canonical !== 'verified') fail(`final adoption is ${record.outcome.adoption}/${record.outcome.canonical}.`);
  return record;
}

function tokenFromEnvironment() {
  if (process.env.GH_TOKEN || process.env.GITHUB_TOKEN) return process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
  try { return execFileSync('gh', ['auth', 'token'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); }
  catch { fail('set GH_TOKEN/GITHUB_TOKEN or authenticate gh first.'); }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === realpathSync(process.argv[1])) {
  const [repository, rawPr, ...options] = process.argv.slice(2);
  let runId, attempt = 1, policyPath, outputPath;
  for (let index = 0; index < options.length; index++) {
    const option = options[index];
    if (option === '--run-id') runId = options[++index];
    else if (option === '--attempt') attempt = Number(options[++index]);
    else if (option === '--policy-path') policyPath = options[++index];
    else if (option === '--output') outputPath = options[++index];
    else fail(`unknown option ${option}.`);
  }
  if (!repository || !rawPr || !runId) fail('usage: owner-addition-finalize <owner/repo> <PR> --run-id <id> [--attempt N] [--policy-path path] [--output path]');
  const record = await finalizeOwnerAddition({ repository, pullRequestNumber: Number(rawPr), githubToken: tokenFromEnvironment(),
    runId, attempt, policyPath });
  const json = `${JSON.stringify(record, null, 2)}\n`;
  if (outputPath) writeFileSync(outputPath, json, { flag: 'wx', mode: 0o600 });
  else process.stdout.write(json);
}
