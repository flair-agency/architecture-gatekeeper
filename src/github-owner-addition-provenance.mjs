import { createHash } from 'node:crypto';
import { inflateRawSync } from 'node:zlib';
import { rejectDuplicateJsonKeys } from './authority-set.mjs';
import { assertSameMultiAuthorityProvenance, validateMultiAuthorityProvenance } from './multi-authority-provenance.mjs';

const API = 'https://api.github.com';
const ACTIONS_APP_ID = 15368;
const ARTIFACT_MAX_BYTES = 1_048_576;
const ZIP_ENTRY_MAX_BYTES = 524_288;
const ARTIFACT_NAME_PREFIX = 'owner-addition-eligibility-evidence-';
const ARTIFACT_FILE = 'eligibility-evidence.json';
const HEX40 = /^[a-f0-9]{40}$/;
const HEX64 = /^[a-f0-9]{64}$/;
const DECIMAL = /^\d+$/;
const REQUIRED_ELIGIBILITY = ['eligible', 'onlyMissingDecision', 'preservesExistingRules', 'noContradiction',
  'noUnsupportedCompletionClaim', 'noUnrelatedUnresolvedChoices', 'matchesOrdinaryOwnerDecision'];

function fail(message) { throw new Error(`GitHub OWNER_ADDITION provenance: ${message}`); }
function object(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function keys(value, expected, label) {
  if (!object(value) || Object.keys(value).length !== expected.length || expected.some(key => !Object.hasOwn(value, key))) {
    fail(`${label} has missing or unknown fields.`);
  }
}
function sha256(bytes) { return createHash('sha256').update(bytes).digest('hex'); }
function timestamp(value, label) {
  const parsed = typeof value === 'string' ? Date.parse(value) : NaN;
  if (!Number.isFinite(parsed)) fail(`${label} is missing or invalid.`);
  return parsed;
}
function same(actual, expected, label) { if (actual !== expected) fail(`${label} differs from the selected exact candidate.`); }
function base64Bytes(value, label, maxBytes = ZIP_ENTRY_MAX_BYTES) {
  if (typeof value !== 'string' || value.length > Math.ceil(maxBytes * 4 / 3) + 4 ||
      !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) fail(`${label} is not bounded canonical base64.`);
  const bytes = Buffer.from(value, 'base64');
  if (!bytes.length || bytes.length > maxBytes || bytes.toString('base64') !== value) fail(`${label} has an invalid size or encoding.`);
  return bytes;
}
function parseJson(bytes, label) {
  let source;
  try { source = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes); }
  catch { fail(`${label} is not UTF-8.`); }
  try { rejectDuplicateJsonKeys(source, label); return JSON.parse(source); }
  catch (error) { fail(`${label} is not strict JSON (${error.message}).`); }
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    table[n] = c >>> 0;
  }
  return table;
})();
function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

// Decode only a classic, one-entry ZIP. ZIP64, encryption, multiple entries,
// path indirection and oversized expansion are deliberately unsupported.
function decodeEvidenceZip(zipBytes) {
  if (!Buffer.isBuffer(zipBytes) || zipBytes.length < 22 || zipBytes.length > ARTIFACT_MAX_BYTES) fail('downloaded artifact ZIP size is invalid.');
  let eocd = -1;
  const searchFrom = Math.max(0, zipBytes.length - 65_557);
  for (let offset = zipBytes.length - 22; offset >= searchFrom; offset--) {
    if (zipBytes.readUInt32LE(offset) === 0x06054b50) { eocd = offset; break; }
  }
  if (eocd < 0 || eocd + 22 > zipBytes.length) fail('artifact ZIP end directory is missing.');
  const disk = zipBytes.readUInt16LE(eocd + 4);
  const cdDisk = zipBytes.readUInt16LE(eocd + 6);
  const entriesDisk = zipBytes.readUInt16LE(eocd + 8);
  const entries = zipBytes.readUInt16LE(eocd + 10);
  const cdSize = zipBytes.readUInt32LE(eocd + 12);
  const cdOffset = zipBytes.readUInt32LE(eocd + 16);
  const commentLength = zipBytes.readUInt16LE(eocd + 20);
  if (disk || cdDisk || entriesDisk !== 1 || entries !== 1 || cdSize === 0xffffffff || cdOffset === 0xffffffff ||
      eocd + 22 + commentLength !== zipBytes.length || cdOffset + cdSize !== eocd) fail('artifact ZIP must be a bounded, single-entry classic ZIP.');
  if (cdOffset + 46 > eocd || zipBytes.readUInt32LE(cdOffset) !== 0x02014b50) fail('artifact ZIP central directory is malformed.');
  const flags = zipBytes.readUInt16LE(cdOffset + 8);
  const method = zipBytes.readUInt16LE(cdOffset + 10);
  const expectedCrc = zipBytes.readUInt32LE(cdOffset + 16);
  const compressedSize = zipBytes.readUInt32LE(cdOffset + 20);
  const uncompressedSize = zipBytes.readUInt32LE(cdOffset + 24);
  const nameLength = zipBytes.readUInt16LE(cdOffset + 28);
  const extraLength = zipBytes.readUInt16LE(cdOffset + 30);
  const entryCommentLength = zipBytes.readUInt16LE(cdOffset + 32);
  const localOffset = zipBytes.readUInt32LE(cdOffset + 42);
  if (flags & 1 || (flags & ~0x808) !== 0 || ![0, 8].includes(method) || compressedSize === 0xffffffff ||
      uncompressedSize === 0xffffffff || uncompressedSize < 1 || uncompressedSize > ZIP_ENTRY_MAX_BYTES ||
      cdOffset + 46 + nameLength + extraLength + entryCommentLength !== eocd || localOffset + 30 > cdOffset) {
    fail('artifact ZIP entry uses unsupported flags, compression, or size.');
  }
  const nameBytes = zipBytes.subarray(cdOffset + 46, cdOffset + 46 + nameLength);
  const name = nameBytes.toString('utf8');
  if (name !== ARTIFACT_FILE || Buffer.from(name, 'utf8').compare(nameBytes) !== 0) fail('artifact ZIP must contain only the exact eligibility evidence file.');
  if (zipBytes.readUInt32LE(localOffset) !== 0x04034b50) fail('artifact ZIP local header is malformed.');
  const localFlags = zipBytes.readUInt16LE(localOffset + 6);
  const localMethod = zipBytes.readUInt16LE(localOffset + 8);
  const localNameLength = zipBytes.readUInt16LE(localOffset + 26);
  const localExtraLength = zipBytes.readUInt16LE(localOffset + 28);
  const dataOffset = localOffset + 30 + localNameLength + localExtraLength;
  if (localFlags !== flags || localMethod !== method || dataOffset + compressedSize > cdOffset ||
      zipBytes.subarray(localOffset + 30, localOffset + 30 + localNameLength).compare(nameBytes) !== 0) {
    fail('artifact ZIP local entry does not match its central directory.');
  }
  const localCrc = zipBytes.readUInt32LE(localOffset + 14);
  const localCompressedSize = zipBytes.readUInt32LE(localOffset + 18);
  const localUncompressedSize = zipBytes.readUInt32LE(localOffset + 22);
  if (flags & 0x8) {
    if ((localCrc !== 0 && localCrc !== expectedCrc) || (localCompressedSize !== 0 && localCompressedSize !== compressedSize) ||
        (localUncompressedSize !== 0 && localUncompressedSize !== uncompressedSize)) fail('artifact ZIP local placeholder sizes conflict with its central directory.');
    const descriptorOffset = dataOffset + compressedSize;
    const descriptorLength = cdOffset - descriptorOffset;
    const hasSignature = descriptorLength === 16 && zipBytes.readUInt32LE(descriptorOffset) === 0x08074b50;
    if (descriptorLength !== 12 && !hasSignature) fail('artifact ZIP data descriptor has an unsupported layout.');
    const valueOffset = descriptorOffset + (hasSignature ? 4 : 0);
    if (zipBytes.readUInt32LE(valueOffset) !== expectedCrc || zipBytes.readUInt32LE(valueOffset + 4) !== compressedSize ||
        zipBytes.readUInt32LE(valueOffset + 8) !== uncompressedSize) fail('artifact ZIP data descriptor differs from the central directory.');
  } else if (dataOffset + compressedSize !== cdOffset || localCrc !== expectedCrc ||
      localCompressedSize !== compressedSize || localUncompressedSize !== uncompressedSize) {
    fail('artifact ZIP local sizes differ from its central directory.');
  }
  const compressed = zipBytes.subarray(dataOffset, dataOffset + compressedSize);
  let output;
  try { output = method === 0 ? Buffer.from(compressed) : inflateRawSync(compressed, { maxOutputLength: ZIP_ENTRY_MAX_BYTES }); }
  catch { fail('artifact ZIP entry cannot be safely decompressed.'); }
  if (output.length !== uncompressedSize || crc32(output) !== expectedCrc) fail('artifact ZIP entry size or CRC is invalid.');
  return output;
}

function apiUrl(path) { return `${API}/repos/${path}`; }
function parseRepo(repository) {
  if (typeof repository !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9-]{0,38}\/[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(repository)) fail('repository identity is invalid.');
  return repository;
}

/**
 * Verify the recorded-base selected GitHub Actions producer and its exact
 * pre-merge decision artifact. Returns GitHub-derived producer and completion
 * metadata separately from the bounded, digest-checked decision bytes.
 */
export async function verifyOwnerAdditionEligibilityProvenance({ githubToken, repository, targetBranch,
  pullRequestNumber, baseSha, bSha, callerPath, jobName, appId = ACTIONS_APP_ID,
  runId, attempt, jobId, policySha256, expectedGatekeeperWorkflow,
  procedureDigest, eligibilityDigest, authoritySetDigest, authorityIds,
  mergeAt, fetchImpl = globalThis.fetch }) {
  repository = parseRepo(repository);
  if (!githubToken || typeof githubToken !== 'string') fail('GitHub token is required.');
  if (typeof targetBranch !== 'string' || !targetBranch || targetBranch.includes('..')) fail('target branch is invalid.');
  if (!Number.isSafeInteger(pullRequestNumber) || pullRequestNumber < 1 || !HEX40.test(baseSha || '') || !HEX40.test(bSha || '')) fail('candidate identity is invalid.');
  if (typeof callerPath !== 'string' || !/^\.github\/workflows\/[A-Za-z0-9._/-]+\.ya?ml$/.test(callerPath) || callerPath.split('/').some(part => part === '.' || part === '..')) fail('selected caller workflow path is invalid.');
  if (!object(expectedGatekeeperWorkflow) || typeof expectedGatekeeperWorkflow.path !== 'string' ||
      expectedGatekeeperWorkflow.path.length < 1 || expectedGatekeeperWorkflow.path.length > 512 ||
      /[\x00-\x20\x7f]/.test(expectedGatekeeperWorkflow.path) || !HEX40.test(expectedGatekeeperWorkflow.sha || '')) {
    fail('selected Gatekeeper reusable-workflow identity is invalid.');
  }
  if (typeof jobName !== 'string' || !/^[A-Za-z0-9_][A-Za-z0-9_-]{0,63} \/ owner-addition$/.test(jobName) ||
      !Number.isSafeInteger(appId) || appId !== ACTIONS_APP_ID) fail('selected producer job or GitHub Actions app is invalid.');
  if (!DECIMAL.test(String(runId)) || !Number.isSafeInteger(Number(attempt)) || Number(attempt) < 1 ||
      !DECIMAL.test(String(jobId)) || !HEX64.test(policySha256 || '') ||
      (procedureDigest !== undefined && !HEX64.test(procedureDigest)) ||
      (eligibilityDigest !== undefined && !HEX64.test(eligibilityDigest)) ||
      (authoritySetDigest !== undefined && !HEX64.test(authoritySetDigest)) ||
      (authorityIds !== undefined && (!Array.isArray(authorityIds) || !authorityIds.length ||
        authorityIds.some(id => typeof id !== 'string' || !/^[a-z][a-z0-9-]{0,63}$/.test(id)) || new Set(authorityIds).size !== authorityIds.length))) {
    fail('producer or expected digest binding is invalid.');
  }
  const mergeTime = timestamp(mergeAt, 'merge time');
  if (typeof fetchImpl !== 'function') fail('fetch implementation is unavailable.');
  const headers = { accept: 'application/vnd.github+json', authorization: `Bearer ${githubToken}`, 'x-github-api-version': '2022-11-28' };
  const request = async (url, raw = false) => {
    const response = await fetchImpl(url, { headers, redirect: 'follow' });
    if (!response?.ok) fail(`GitHub API request failed (${response?.status ?? 'no response'}).`);
    if (raw) {
      const bytes = Buffer.from(await response.arrayBuffer());
      if (!bytes.length || bytes.length > ARTIFACT_MAX_BYTES) fail('downloaded artifact exceeds its byte limit.');
      return bytes;
    }
    let value;
    try { value = await response.json(); } catch { fail('GitHub API returned malformed JSON.'); }
    if (!object(value)) fail('GitHub API response is not an object.');
    return value;
  };
  const run = await request(apiUrl(`${repository}/actions/runs/${runId}/attempts/${attempt}`));
  same(String(run.id), String(runId), 'workflow run ID');
  same(Number(run.run_attempt), Number(attempt), 'workflow run attempt');
  same(run.repository?.full_name, repository, 'workflow repository');
  if (!['pull_request', 'pull_request_target'].includes(run.event)) fail('workflow event is not a supported pull-request event.');
  same(run.status, 'completed', 'workflow status');
  same(run.conclusion, 'success', 'workflow conclusion');
  if (!HEX40.test(run.head_sha || '')) fail('workflow run head is invalid.');
  // pull_request_target runs execute in the base workflow context but GitHub's
  // run record still identifies the exact triggering PR head. Bind that form
  // explicitly; pull_request runs remain bound through their PR association
  // and the synthetic merge SHA used by their jobs and check runs.
  if (run.event === 'pull_request_target') same(run.head_sha, bSha, 'pull_request_target exact B head');
  if (!Array.isArray(run.referenced_workflows) || run.referenced_workflows.length > 20) fail('workflow run has no bounded reusable-workflow provenance.');
  const matchingGatekeeperWorkflows = run.referenced_workflows.filter(workflow => workflow?.path === expectedGatekeeperWorkflow.path);
  if (matchingGatekeeperWorkflows.length !== 1) fail('selected Gatekeeper reusable workflow is absent or ambiguous in run metadata.');
  const gatekeeperWorkflow = matchingGatekeeperWorkflows[0];
  same(gatekeeperWorkflow.sha, expectedGatekeeperWorkflow.sha, 'selected Gatekeeper reusable-workflow SHA');
  if (typeof run.path !== 'string') fail('workflow run has no workflow path.');
  const runPath = run.path.split('@', 1)[0];
  same(runPath, callerPath, 'selected caller workflow path');
  if (run.path !== callerPath && (!run.path.startsWith(`${callerPath}@`) || run.path.length > callerPath.length + 256)) {
    fail('workflow run path has an invalid ref suffix.');
  }
  if (!Array.isArray(run.pull_requests) || run.pull_requests.length !== 1) fail('workflow run must be associated with exactly one pull request.');
  const runPr = run.pull_requests[0];
  same(runPr.number, pullRequestNumber, 'workflow-associated pull request');
  same(runPr.head?.sha, bSha, 'workflow-associated exact B');
  same(runPr.base?.sha, baseSha, 'workflow-associated recorded base');
  same(runPr.base?.ref, targetBranch, 'workflow-associated target branch');
  const runStarted = timestamp(run.run_started_at, 'workflow run start');
  const pr = await request(apiUrl(`${repository}/pulls/${pullRequestNumber}`));
  same(pr.number, pullRequestNumber, 'pull request number');
  same(pr.base?.ref, targetBranch, 'pull request target branch');
  same(pr.head?.sha, bSha, 'pull request exact B');

  const jobsPage = await request(apiUrl(`${repository}/actions/runs/${runId}/attempts/${attempt}/jobs?per_page=100`));
  if (!Array.isArray(jobsPage.jobs) || !Number.isSafeInteger(jobsPage.total_count) || jobsPage.total_count > 100) fail('producer job listing is missing or exceeds the bounded page.');
  const matchingJobs = jobsPage.jobs.filter(job => String(job.id) === String(jobId));
  if (matchingJobs.length !== 1) fail('selected producer job ID is absent or ambiguous.');
  const job = matchingJobs[0];
  same(job.name, jobName, 'selected producer job name');
  same(job.status, 'completed', 'producer job status');
  same(job.conclusion, 'success', 'producer job conclusion');
  // Pull-request runs commonly execute on GitHub's synthetic merge SHA.
  // The run's PR snapshot binds that execution to exact B above.
  same(job.head_sha, run.head_sha, 'producer job run head');
  const completedMs = timestamp(job.completed_at, 'producer job completion');
  if (completedMs >= mergeTime || completedMs < runStarted) fail('eligibility producer did not complete within the pre-merge run interval.');
  if (typeof job.check_run_url !== 'string') fail('producer job has no check run identity.');
  const checkUrl = new URL(job.check_run_url);
  if (checkUrl.origin !== API || !new RegExp(`^/repos/${repository.replace('/', '\\/')}/check-runs/\\d+$`).test(checkUrl.pathname)) fail('producer check run URL is outside the selected repository.');
  const check = await request(checkUrl.href);
  same(check.name, jobName, 'producer check-run name');
  same(check.status, 'completed', 'producer check-run status');
  same(check.conclusion, 'success', 'producer check-run conclusion');
  same(check.head_sha, run.head_sha, 'producer check-run run head');
  same(check.app?.id, ACTIONS_APP_ID, 'producer GitHub Actions app ID');
  same(String(check.id), String(checkUrl.pathname.split('/').at(-1)), 'producer check-run ID');

  const acceptName = `${jobName.slice(0, -' / owner-addition'.length)} / accept`;
  const acceptJobs = jobsPage.jobs.filter(candidate => candidate.name === acceptName);
  if (acceptJobs.length !== 1) fail('selected Gatekeeper accept job is absent or ambiguous.');
  const acceptJob = acceptJobs[0];
  same(acceptJob.status, 'completed', 'Gatekeeper accept job status');
  same(acceptJob.conclusion, 'success', 'Gatekeeper accept job conclusion');
  same(acceptJob.head_sha, run.head_sha, 'Gatekeeper accept job run head');
  const acceptCompletedMs = timestamp(acceptJob.completed_at, 'Gatekeeper accept completion');
  if (acceptCompletedMs < completedMs || acceptCompletedMs >= mergeTime) {
    fail('Gatekeeper accept did not complete after eligibility and before merge.');
  }
  if (typeof acceptJob.check_run_url !== 'string') fail('Gatekeeper accept job has no check run identity.');
  const acceptCheckUrl = new URL(acceptJob.check_run_url);
  if (acceptCheckUrl.origin !== API ||
      !new RegExp(`^/repos/${repository.replace('/', '\\/')}/check-runs/\\d+$`).test(acceptCheckUrl.pathname)) {
    fail('Gatekeeper accept check run URL is outside the selected repository.');
  }
  const acceptCheck = await request(acceptCheckUrl.href);
  same(acceptCheck.name, acceptName, 'Gatekeeper accept check-run name');
  same(acceptCheck.status, 'completed', 'Gatekeeper accept check-run status');
  same(acceptCheck.conclusion, 'success', 'Gatekeeper accept check-run conclusion');
  same(acceptCheck.head_sha, run.head_sha, 'Gatekeeper accept check-run head');
  same(acceptCheck.app?.id, ACTIONS_APP_ID, 'Gatekeeper accept GitHub Actions app ID');
  same(String(acceptCheck.id), String(acceptCheckUrl.pathname.split('/').at(-1)), 'Gatekeeper accept check-run ID');

  const artifactsPage = await request(apiUrl(`${repository}/actions/runs/${runId}/artifacts?per_page=100`));
  if (!Array.isArray(artifactsPage.artifacts) || !Number.isSafeInteger(artifactsPage.total_count) || artifactsPage.total_count > 100) fail('artifact listing is missing or exceeds the bounded page.');
  const artifactName = `${ARTIFACT_NAME_PREFIX}${bSha}-${attempt}`;
  const artifacts = artifactsPage.artifacts.filter(artifact => artifact.name === artifactName);
  if (artifacts.length !== 1) fail('the run-scoped exact-B evidence artifact is absent or ambiguous.');
  const artifact = artifacts[0];
  if (artifact.expired !== false || !Number.isSafeInteger(artifact.id) || !Number.isSafeInteger(artifact.size_in_bytes) ||
      artifact.size_in_bytes < 1 || artifact.size_in_bytes > ARTIFACT_MAX_BYTES) fail('evidence artifact is expired or outside its byte limit.');
  same(String(artifact.workflow_run?.id), String(runId), 'artifact workflow run');
  same(artifact.workflow_run?.head_sha, run.head_sha, 'artifact workflow run head');
  const createdMs = timestamp(artifact.created_at, 'artifact creation');
  if (createdMs < runStarted || createdMs > completedMs || createdMs >= mergeTime) {
    fail('evidence artifact was not created during the completed pre-merge producer job.');
  }
  if (typeof artifact.digest !== 'string' || !/^sha256:[a-f0-9]{64}$/.test(artifact.digest)) fail('artifact metadata has no SHA-256 digest.');
  const zip = await request(apiUrl(`${repository}/actions/artifacts/${artifact.id}/zip`), true);
  if (zip.length !== artifact.size_in_bytes || sha256(zip) !== artifact.digest.slice('sha256:'.length)) fail('downloaded artifact bytes do not match GitHub artifact metadata.');
  const envelope = parseJson(decodeEvidenceZip(zip), 'eligibility evidence artifact');
  const envelopeKeys = ['version', 'repository', 'targetBranch', 'prNumber', 'baseSha', 'headSha', 'runId', 'runAttempt',
    'procedureBase64', 'ordinaryDecisionBase64', 'eligibilityDecisionBase64', 'authoritySetProvenanceBase64', 'digests'];
  keys(envelope, envelopeKeys, 'eligibility evidence artifact');
  same(envelope.version, 1, 'artifact schema version');
  same(envelope.repository, repository, 'artifact repository');
  same(envelope.targetBranch, targetBranch, 'artifact target branch');
  same(envelope.prNumber, pullRequestNumber, 'artifact pull request');
  same(envelope.baseSha, baseSha, 'artifact recorded base');
  same(envelope.headSha, bSha, 'artifact exact B');
  same(String(envelope.runId), String(runId), 'artifact run ID');
  same(Number(envelope.runAttempt), Number(attempt), 'artifact run attempt');
  keys(envelope.digests, ['procedure', 'ordinaryDecision', 'eligibilityDecision', 'authoritySetProvenance'], 'artifact digests');
  const bytes = {
    procedure: base64Bytes(envelope.procedureBase64, 'procedure bytes'),
    ordinaryDecision: base64Bytes(envelope.ordinaryDecisionBase64, 'ordinary decision bytes'),
    eligibilityDecision: base64Bytes(envelope.eligibilityDecisionBase64, 'eligibility decision bytes'),
    authoritySetProvenance: base64Bytes(envelope.authoritySetProvenanceBase64, 'Authority Set provenance bytes'),
  };
  const digests = {};
  for (const [name, content] of Object.entries(bytes)) {
    if (!HEX64.test(envelope.digests[name] || '') || sha256(content) !== envelope.digests[name]) fail(`${name} bytes do not match their SHA-256 digest.`);
    digests[name] = envelope.digests[name];
  }
  if (procedureDigest !== undefined) same(digests.procedure, procedureDigest, 'exact procedure bytes digest');
  if (eligibilityDigest !== undefined) same(digests.eligibilityDecision, eligibilityDigest, 'exact eligibility decision bytes digest');
  const procedure = parseJson(bytes.procedure, 'procedure bytes');
  const ordinaryDecision = parseJson(bytes.ordinaryDecision, 'ordinary decision bytes');
  const eligibilityDecision = parseJson(bytes.eligibilityDecision, 'eligibility decision bytes');
  const authoritySetProvenance = parseJson(bytes.authoritySetProvenance, 'Authority Set provenance bytes');
  validateMultiAuthorityProvenance(authoritySetProvenance);
  validateMultiAuthorityProvenance(procedure.authoritySet);
  assertSameMultiAuthorityProvenance(procedure.authoritySet, authoritySetProvenance);
  const actualAuthoritySetDigest = authoritySetProvenance.setDigest;
  const actualAuthorityIds = authoritySetProvenance.members.map(member => member.id);
  if (authoritySetDigest !== undefined) same(actualAuthoritySetDigest, authoritySetDigest, 'selected Authority Set digest');
  if (authorityIds !== undefined && (actualAuthorityIds.length !== authorityIds.length ||
      actualAuthorityIds.some((id, index) => id !== authorityIds[index]))) fail('Authority Set provenance differs from the expected selected member set.');
  same(procedure.repository, repository, 'procedure repository');
  same(procedure.baseSha, baseSha, 'procedure recorded base');
  same(procedure.headSha, bSha, 'procedure exact B');
  same(procedure.policySha256, policySha256, 'procedure recorded-base policy digest');
  same(procedure.authoritySet?.setDigest, actualAuthoritySetDigest, 'procedure selected Authority Set');
  same(authoritySetProvenance.selfRepository, repository, 'Authority Set repository');
  same(authoritySetProvenance.authorityRevision, baseSha, 'Authority Set recorded base');
  same(authoritySetProvenance.setDigest, actualAuthoritySetDigest, 'Authority Set digest');
  same(ordinaryDecision.decision, 'OWNER_DECISION', 'ordinary decision');
  same(ordinaryDecision.ownerDecisionId, procedure.missingDecisionId, 'ordinary missing decision binding');
  same(ordinaryDecision.version, 2, 'ordinary decision schema version');
  same(ordinaryDecision.authoritySetDigest, actualAuthoritySetDigest, 'ordinary decision Authority Set');
  if (!Array.isArray(ordinaryDecision.authorityIds) || ordinaryDecision.authorityIds.length !== actualAuthorityIds.length ||
      ordinaryDecision.authorityIds.some((id, index) => id !== actualAuthorityIds[index])) fail('ordinary decision does not identify the complete selected Authority Set.');
  same(eligibilityDecision.version, 2, 'eligibility decision schema version');
  same(eligibilityDecision.authoritySetDigest, actualAuthoritySetDigest, 'eligibility Authority Set');
  if (!Array.isArray(eligibilityDecision.authorityIds) || eligibilityDecision.authorityIds.length !== actualAuthorityIds.length ||
      eligibilityDecision.authorityIds.some((id, index) => id !== actualAuthorityIds[index])) fail('eligibility decision does not identify the complete selected Authority Set.');
  for (const key of REQUIRED_ELIGIBILITY) same(eligibilityDecision[key], true, `eligibility decision ${key}`);

  const completedAt = new Date(completedMs).toISOString();
  const provenance = {
    status: 'verified', selection: 'recorded-base-policy',
    workflow: { runId: String(runId), attempt: Number(attempt), jobId: String(jobId), workflowPath: callerPath, callerPath },
    repository, targetBranch, pullRequestNumber, baseSha, bSha, authoritySetDigest: actualAuthoritySetDigest,
    procedureDigest: digests.procedure, eligibilityDigest: digests.eligibilityDecision, completedAt,
  };
  return { status: 'verified', provenance, completedAt, authorityIds: actualAuthorityIds,
    gatekeeperWorkflow: { path: gatekeeperWorkflow.path, sha: gatekeeperWorkflow.sha },
    artifacts: { procedure, ordinaryDecision, eligibilityDecision, authoritySetProvenance, digests } };
}
