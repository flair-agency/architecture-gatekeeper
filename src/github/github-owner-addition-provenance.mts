import { createHash } from 'node:crypto';
import { inflateRawSync } from 'node:zlib';
import { rejectDuplicateJsonKeys } from '../authority-validation/authority-set.mts';
import { assertSameMultiAuthorityProvenance, validateMultiAuthorityProvenance } from '../authority-validation/multi-authority-provenance.mts';

const API = 'https://api.github.com';
const ACTIONS_APP_ID = 15368;
const ARTIFACT_MAX_BYTES = 1_048_576;
const ZIP_ENTRY_MAX_BYTES = 524_288;
const ARTIFACT_NAME_PREFIX = 'owner-addition-eligibility-evidence-';
const ARTIFACT_FILE = 'eligibility-evidence.json';
const ARTIFACT_UPLOAD_STEP = 'Preserve exact v5 pre-merge eligibility evidence';
const ARTIFACT_BINDING_STEP = 'Record exact uploaded eligibility artifact binding';
const ARTIFACT_BINDING_TITLE = 'AGK_OWNER_ADDITION_ARTIFACT_V1';
const HEX40 = /^[a-f0-9]{40}$/;
const HEX64 = /^[a-f0-9]{64}$/;
const DECIMAL = /^\d+$/;
const REQUIRED_ELIGIBILITY = ['eligible', 'onlyMissingDecision', 'preservesExistingRules', 'noContradiction',
  'noUnsupportedCompletionClaim', 'noUnrelatedUnresolvedChoices', 'matchesOrdinaryOwnerDecision'];

type JsonRecord = Record<string, unknown>;
type ApiResponse = {
  ok?: unknown;
  status?: unknown;
  json?: () => unknown | PromiseLike<unknown>;
  arrayBuffer?: () => ArrayBuffer | PromiseLike<ArrayBuffer>;
  headers?: { get?: (name: string) => unknown };
};
type FetchInit = { headers: Record<string, string>; redirect: 'follow' };
export type OwnerAdditionProvenanceFetch = (url: string, init: FetchInit) => ApiResponse | PromiseLike<ApiResponse>;
export interface VerifyOwnerAdditionEligibilityProvenanceInput {
  githubToken: unknown;
  repository: string;
  targetBranch: string;
  pullRequestNumber: number;
  baseSha: unknown;
  bSha: unknown;
  callerPath: unknown;
  jobName: unknown;
  appId?: unknown;
  runId: unknown;
  attempt: unknown;
  jobId: unknown;
  policySha256: unknown;
  expectedGatekeeperWorkflow: unknown;
  procedureDigest?: unknown;
  eligibilityDigest?: unknown;
  authoritySetDigest?: unknown;
  authorityIds?: unknown;
  mergeAt: unknown;
  fetchImpl?: OwnerAdditionProvenanceFetch;
}
export interface OwnerAdditionEligibilityProvenanceRecord {
  status: 'verified';
  selection: 'recorded-base-policy';
  workflow: { runId: string; attempt: number; jobId: string; workflowPath: string; callerPath: string };
  repository: string;
  targetBranch: string;
  pullRequestNumber: number;
  baseSha: unknown;
  bSha: unknown;
  authoritySetDigest: unknown;
  procedureDigest: unknown;
  eligibilityDigest: unknown;
  completedAt: string;
  artifactBinding: {
    checkRunId: string;
    artifactId: string;
    artifactDigest: unknown;
    annotationTitle: string;
    annotationMessage: unknown;
  };
}
export interface OwnerAdditionEligibilityProvenanceResult {
  status: 'verified';
  provenance: OwnerAdditionEligibilityProvenanceRecord;
  completedAt: string;
  authorityIds: string[];
  gatekeeperWorkflow: { path: unknown; sha: unknown };
  artifacts: {
    evidenceArtifact: { id: unknown; name: unknown; digest: unknown; createdAt: unknown };
    procedure: unknown;
    ordinaryDecision: unknown;
    eligibilityDecision: unknown;
    authoritySetProvenance: unknown;
    digests: JsonRecord;
  };
}

function fail(message: string): never { throw new Error(`GitHub OWNER_ADDITION provenance: ${message}`); }
function object(value: unknown): value is JsonRecord { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function keys(value: unknown, expected: readonly string[], label: string): void {
  if (!object(value) || Object.keys(value).length !== expected.length || expected.some(key => !Object.hasOwn(value, key))) {
    fail(`${label} has missing or unknown fields.`);
  }
}
function sha256(bytes: Buffer): string { return createHash('sha256').update(bytes).digest('hex'); }
function timestamp(value: unknown, label: string): number {
  const parsed = typeof value === 'string' ? Date.parse(value) : NaN;
  if (!Number.isFinite(parsed)) fail(`${label} is missing or invalid.`);
  return parsed;
}
function same(actual: unknown, expected: unknown, label: string): void { if (actual !== expected) fail(`${label} differs from the selected exact candidate.`); }
function base64Bytes(value: unknown, label: string, maxBytes = ZIP_ENTRY_MAX_BYTES): Buffer {
  if (typeof value !== 'string' || value.length > Math.ceil(maxBytes * 4 / 3) + 4 ||
      !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) fail(`${label} is not bounded canonical base64.`);
  const bytes = Buffer.from(value, 'base64');
  if (!bytes.length || bytes.length > maxBytes || bytes.toString('base64') !== value) fail(`${label} has an invalid size or encoding.`);
  return bytes;
}
function parseJson(bytes: Buffer, label: string): unknown {
  let source: string;
  try { source = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes); }
  catch { fail(`${label} is not UTF-8.`); }
  try { rejectDuplicateJsonKeys(source, label); return JSON.parse(source); }
  catch (error) { fail(`${label} is not strict JSON (${(error as { message: unknown }).message}).`); }
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
function crc32(bytes: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

// Decode only a classic, one-entry ZIP. ZIP64, encryption, multiple entries,
// path indirection and oversized expansion are deliberately unsupported.
function decodeEvidenceZip(zipBytes: Buffer): Buffer {
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
  let output: Buffer;
  try { output = method === 0 ? Buffer.from(compressed) : inflateRawSync(compressed, { maxOutputLength: ZIP_ENTRY_MAX_BYTES }); }
  catch { fail('artifact ZIP entry cannot be safely decompressed.'); }
  if (output.length !== uncompressedSize || crc32(output) !== expectedCrc) fail('artifact ZIP entry size or CRC is invalid.');
  return output;
}

function apiUrl(path: string): string { return `${API}/repos/${path}`; }
function parseRepo(repository: unknown): string {
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
  mergeAt, fetchImpl = globalThis.fetch }: VerifyOwnerAdditionEligibilityProvenanceInput): Promise<OwnerAdditionEligibilityProvenanceResult> {
  repository = parseRepo(repository);
  if (!githubToken || typeof githubToken !== 'string') fail('GitHub token is required.');
  if (typeof targetBranch !== 'string' || !targetBranch || targetBranch.includes('..')) fail('target branch is invalid.');
  if (!Number.isSafeInteger(pullRequestNumber) || (pullRequestNumber as number) < 1 || !HEX40.test((baseSha || '') as string) || !HEX40.test((bSha || '') as string)) fail('candidate identity is invalid.');
  if (typeof callerPath !== 'string' || !/^\.github\/workflows\/[A-Za-z0-9._/-]+\.ya?ml$/.test(callerPath) || callerPath.split('/').some(part => part === '.' || part === '..')) fail('selected caller workflow path is invalid.');
  if (!object(expectedGatekeeperWorkflow) || typeof (expectedGatekeeperWorkflow as JsonRecord).path !== 'string' ||
      ((expectedGatekeeperWorkflow as JsonRecord).path as string).length < 1 || ((expectedGatekeeperWorkflow as JsonRecord).path as string).length > 512 ||
      /[\x00-\x20\x7f]/.test((expectedGatekeeperWorkflow as JsonRecord).path as string) || !HEX40.test(((expectedGatekeeperWorkflow as JsonRecord).sha || '') as string)) {
    fail('selected Gatekeeper reusable-workflow identity is invalid.');
  }
  if (typeof jobName !== 'string' || !/^[A-Za-z0-9_][A-Za-z0-9_-]{0,63} \/ owner-addition$/.test(jobName) ||
      !Number.isSafeInteger(appId) || appId !== ACTIONS_APP_ID) fail('selected producer job or GitHub Actions app is invalid.');
  if (!DECIMAL.test(String(runId)) || !Number.isSafeInteger(Number(attempt)) || Number(attempt) < 1 ||
      !DECIMAL.test(String(jobId)) || !HEX64.test((policySha256 || '') as string) ||
      (procedureDigest !== undefined && !HEX64.test(procedureDigest as string)) ||
      (eligibilityDigest !== undefined && !HEX64.test(eligibilityDigest as string)) ||
      (authoritySetDigest !== undefined && !HEX64.test(authoritySetDigest as string)) ||
      (authorityIds !== undefined && (!Array.isArray(authorityIds) || !authorityIds.length ||
        (authorityIds as unknown[]).some(id => typeof id !== 'string' || !/^[a-z][a-z0-9-]{0,63}$/.test(id)) || new Set(authorityIds as unknown[]).size !== authorityIds.length))) {
    fail('producer or expected digest binding is invalid.');
  }
  const mergeTime = timestamp(mergeAt, 'merge time');
  if (typeof fetchImpl !== 'function') fail('fetch implementation is unavailable.');
  const headers = { accept: 'application/vnd.github+json', authorization: `Bearer ${githubToken}`, 'x-github-api-version': '2022-11-28' };
  const request = async (url: string, raw = false): Promise<Buffer | JsonRecord> => {
    const response = await fetchImpl(url, { headers, redirect: 'follow' });
    if (!response?.ok) fail(`GitHub API request failed (${response?.status ?? 'no response'}).`);
    if (raw) {
      const bytes = Buffer.from(await (response as Required<Pick<ApiResponse, 'arrayBuffer'>>).arrayBuffer());
      if (!bytes.length || bytes.length > ARTIFACT_MAX_BYTES) fail('downloaded artifact exceeds its byte limit.');
      return bytes;
    }
    let value;
    try { value = await (response as Required<Pick<ApiResponse, 'json'>>).json(); } catch { fail('GitHub API returned malformed JSON.'); }
    if (!object(value)) fail('GitHub API response is not an object.');
    return value;
  };
  const run = await request(apiUrl(`${repository as string}/actions/runs/${runId}/attempts/${attempt}`)) as JsonRecord;
  same(String(run.id), String(runId), 'workflow run ID');
  same(Number(run.run_attempt), Number(attempt), 'workflow run attempt');
  same((run.repository as JsonRecord)?.full_name, repository, 'workflow repository');
  if (!['pull_request', 'pull_request_target'].includes(run.event as string)) fail('workflow event is not a supported pull-request event.');
  same(run.status, 'completed', 'workflow status');
  same(run.conclusion, 'success', 'workflow conclusion');
  if (!HEX40.test((run.head_sha || '') as string)) fail('workflow run head is invalid.');
  // pull_request_target runs execute in the base workflow context but GitHub's
  // run record still identifies the exact triggering PR head. Bind that form
  // explicitly; pull_request runs remain bound through their PR association
  // and the synthetic merge SHA used by their jobs and check runs.
  if (run.event === 'pull_request_target') same(run.head_sha, bSha, 'pull_request_target exact B head');
  if (!Array.isArray(run.referenced_workflows) || run.referenced_workflows.length > 20) fail('workflow run has no bounded reusable-workflow provenance.');
  const expectedWorkflowPath = ((expectedGatekeeperWorkflow as JsonRecord).path as string).endsWith(`@${(expectedGatekeeperWorkflow as JsonRecord).sha}`)
    ? (expectedGatekeeperWorkflow as JsonRecord).path as string : `${(expectedGatekeeperWorkflow as JsonRecord).path}@${(expectedGatekeeperWorkflow as JsonRecord).sha}`;
  const matchingGatekeeperWorkflows = (run.referenced_workflows as unknown[]).filter(workflow => (workflow as JsonRecord | null)?.path === expectedWorkflowPath);
  if (matchingGatekeeperWorkflows.length !== 1) fail('selected Gatekeeper reusable workflow is absent or ambiguous in run metadata.');
  const gatekeeperWorkflow = matchingGatekeeperWorkflows[0] as JsonRecord;
  same((gatekeeperWorkflow as JsonRecord).sha, (expectedGatekeeperWorkflow as JsonRecord).sha, 'selected Gatekeeper reusable-workflow SHA');
  if (typeof run.path !== 'string') fail('workflow run has no workflow path.');
  const runPath = run.path.split('@', 1)[0];
  same(runPath, callerPath, 'selected caller workflow path');
  if (run.path !== callerPath && (!run.path.startsWith(`${callerPath}@`) || run.path.length > callerPath.length + 256)) {
    fail('workflow run path has an invalid ref suffix.');
  }
  if (!Array.isArray(run.pull_requests) || run.pull_requests.length > 1) fail('workflow run has ambiguous pull request association.');
  if (run.pull_requests.length === 1) {
    const runPr = run.pull_requests[0];
    same(runPr.number, pullRequestNumber, 'workflow-associated pull request');
    same(runPr.head?.sha, bSha, 'workflow-associated exact B');
    same(runPr.base?.sha, baseSha, 'workflow-associated recorded base');
    same(runPr.base?.ref, targetBranch, 'workflow-associated target branch');
  } else {
    // GitHub can clear this association after merge. In that case, only an
    // exact-head run is usable; the PR and evidence artifact bind B and base.
    same(run.head_sha, bSha, 'unassociated workflow run exact B head');
  }
  const runStarted = timestamp(run.run_started_at, 'workflow run start');
  const pr = await request(apiUrl(`${repository as string}/pulls/${pullRequestNumber}`)) as JsonRecord;
  same(pr.number, pullRequestNumber, 'pull request number');
  same((pr.base as JsonRecord)?.ref, targetBranch, 'pull request target branch');
  same((pr.head as JsonRecord)?.sha, bSha, 'pull request exact B');

  const jobsPage = await request(apiUrl(`${repository as string}/actions/runs/${runId}/attempts/${attempt}/jobs?per_page=100`)) as JsonRecord;
  if (!Array.isArray(jobsPage.jobs) || !Number.isSafeInteger(jobsPage.total_count) || (jobsPage.total_count as number) > 100) fail('producer job listing is missing or exceeds the bounded page.');
  const matchingJobs = (jobsPage.jobs as unknown[]).filter(job => String((job as JsonRecord).id) === String(jobId));
  if (matchingJobs.length !== 1) fail('selected producer job ID is absent or ambiguous.');
  const job = matchingJobs[0] as JsonRecord;
  same(job.name, jobName, 'selected producer job name');
  same(job.status, 'completed', 'producer job status');
  same(job.conclusion, 'success', 'producer job conclusion');
  // Pull-request runs commonly execute on GitHub's synthetic merge SHA.
  // The run's PR snapshot binds that execution to exact B above.
  same(job.head_sha, run.head_sha, 'producer job run head');
  if (!Array.isArray(job.steps)) fail('selected producer job has no step-level provenance.');
  const uploadSteps = (job.steps as unknown[]).filter(step => (step as JsonRecord | null)?.name === ARTIFACT_UPLOAD_STEP);
  if (uploadSteps.length !== 1) fail('selected producer job must contain exactly one evidence artifact upload step.');
  const uploadStep = uploadSteps[0] as JsonRecord;
  same(uploadStep.status, 'completed', 'evidence artifact upload step status');
  same(uploadStep.conclusion, 'success', 'evidence artifact upload step conclusion');
  const uploadStartedMs = timestamp(uploadStep.started_at, 'evidence artifact upload start');
  const uploadCompletedMs = timestamp(uploadStep.completed_at, 'evidence artifact upload completion');
  if (uploadStartedMs < runStarted || uploadCompletedMs < uploadStartedMs || uploadCompletedMs > timestamp(job.completed_at, 'producer job completion')) {
    fail('evidence artifact upload step is outside the selected producer job interval.');
  }
  const bindingSteps = (job.steps as unknown[]).filter(step => (step as JsonRecord | null)?.name === ARTIFACT_BINDING_STEP);
  if (bindingSteps.length !== 1 || job.steps.indexOf(bindingSteps[0]) <= job.steps.indexOf(uploadStep)) {
    fail('selected producer job must contain exactly one post-upload artifact binding step.');
  }
  const bindingStep = bindingSteps[0] as JsonRecord;
  same(bindingStep.status, 'completed', 'artifact binding step status');
  same(bindingStep.conclusion, 'success', 'artifact binding step conclusion');
  const bindingStartedMs = timestamp(bindingStep.started_at, 'artifact binding step start');
  const bindingCompletedMs = timestamp(bindingStep.completed_at, 'artifact binding step completion');
  if (bindingStartedMs < uploadCompletedMs || bindingCompletedMs < bindingStartedMs ||
      bindingCompletedMs > timestamp(job.completed_at, 'producer job completion')) {
    fail('artifact binding step is not completed after the selected upload step.');
  }
  const completedMs = timestamp(job.completed_at, 'producer job completion');
  if (completedMs >= mergeTime || completedMs < runStarted) fail('eligibility producer did not complete within the pre-merge run interval.');
  if (typeof job.check_run_url !== 'string') fail('producer job has no check run identity.');
  const checkUrl = new URL(job.check_run_url);
  if (checkUrl.origin !== API || !new RegExp(`^/repos/${(repository as string).replace('/', '\\/')}/check-runs/\\d+$`).test(checkUrl.pathname)) fail('producer check run URL is outside the selected repository.');
  const check = await request(checkUrl.href) as JsonRecord;
  same(check.name, jobName, 'producer check-run name');
  same(check.status, 'completed', 'producer check-run status');
  same(check.conclusion, 'success', 'producer check-run conclusion');
  same(check.head_sha, run.head_sha, 'producer check-run run head');
  same((check.app as JsonRecord)?.id, ACTIONS_APP_ID, 'producer GitHub Actions app ID');
  same(String(check.id), String(checkUrl.pathname.split('/').at(-1)), 'producer check-run ID');
  const annotationUrl = `${checkUrl.href}/annotations?per_page=100`;
  const annotationResponse = await fetchImpl(annotationUrl, { headers, redirect: 'follow' });
  if (!annotationResponse?.ok) fail(`producer annotation request failed (${annotationResponse?.status ?? 'no response'}).`);
  const linkHeader = annotationResponse.headers?.get?.('link') ?? '';
  if (typeof linkHeader !== 'string' || linkHeader.trim() !== '') fail('producer annotations exceed the bounded single-page limit.');
  let annotations: unknown;
  try { annotations = await (annotationResponse as Required<Pick<ApiResponse, 'json'>>).json(); } catch { fail('GitHub returned malformed producer annotations.'); }
  if (!Array.isArray(annotations) || annotations.length > 100) fail('producer annotations response is invalid or oversized.');
  const bindingAnnotations = annotations.filter(annotation => annotation?.title === ARTIFACT_BINDING_TITLE);
  if (bindingAnnotations.length !== 1 || bindingAnnotations[0]?.annotation_level !== 'notice') {
    fail('producer check run must contain exactly one artifact binding notice.');
  }
  const bindingAnnotation = bindingAnnotations[0] as JsonRecord;

  const acceptName = `${jobName.slice(0, -' / owner-addition'.length)} / accept`;
  const acceptJobs = (jobsPage.jobs as unknown[]).filter(candidate => (candidate as JsonRecord).name === acceptName);
  if (acceptJobs.length !== 1) fail('selected Gatekeeper accept job is absent or ambiguous.');
  const acceptJob = acceptJobs[0] as JsonRecord;
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
      !new RegExp(`^/repos/${(repository as string).replace('/', '\\/')}/check-runs/\\d+$`).test(acceptCheckUrl.pathname)) {
    fail('Gatekeeper accept check run URL is outside the selected repository.');
  }
  const acceptCheck = await request(acceptCheckUrl.href) as JsonRecord;
  same(acceptCheck.name, acceptName, 'Gatekeeper accept check-run name');
  same(acceptCheck.status, 'completed', 'Gatekeeper accept check-run status');
  same(acceptCheck.conclusion, 'success', 'Gatekeeper accept check-run conclusion');
  same(acceptCheck.head_sha, run.head_sha, 'Gatekeeper accept check-run head');
  same((acceptCheck.app as JsonRecord)?.id, ACTIONS_APP_ID, 'Gatekeeper accept GitHub Actions app ID');
  same(String(acceptCheck.id), String(acceptCheckUrl.pathname.split('/').at(-1)), 'Gatekeeper accept check-run ID');

  const artifactsPage = await request(apiUrl(`${repository as string}/actions/runs/${runId}/artifacts?per_page=100`)) as JsonRecord;
  if (!Array.isArray(artifactsPage.artifacts) || !Number.isSafeInteger(artifactsPage.total_count) || (artifactsPage.total_count as number) > 100) fail('artifact listing is missing or exceeds the bounded page.');
  const artifactName = `${ARTIFACT_NAME_PREFIX}${bSha}-${attempt}`;
  const artifacts = (artifactsPage.artifacts as unknown[]).filter(artifact => (artifact as JsonRecord).name === artifactName);
  if (artifacts.length !== 1) fail('the run-scoped exact-B evidence artifact is absent or ambiguous.');
  const artifact = artifacts[0] as JsonRecord;
  if (artifact.expired !== false || !Number.isSafeInteger(artifact.id) || !Number.isSafeInteger(artifact.size_in_bytes) ||
      (artifact.size_in_bytes as number) < 1 || (artifact.size_in_bytes as number) > ARTIFACT_MAX_BYTES) fail('evidence artifact is expired or outside its byte limit.');
  same(String((artifact.workflow_run as JsonRecord)?.id), String(runId), 'artifact workflow run');
  same((artifact.workflow_run as JsonRecord)?.head_sha, run.head_sha, 'artifact workflow run head');
  const expectedBindingMessage = `id=${artifact.id};sha256=${(artifact.digest as string | undefined)?.replace(/^sha256:/, '')}`;
  same(bindingAnnotation.message, expectedBindingMessage, 'selected producer artifact ID and digest annotation');
  const createdMs = timestamp(artifact.created_at, 'artifact creation');
  if (createdMs < uploadStartedMs || createdMs > uploadCompletedMs || createdMs > completedMs || createdMs >= mergeTime) {
    fail('evidence artifact was not created during the selected upload step in the pre-merge producer job.');
  }
  if (typeof artifact.digest !== 'string' || !/^sha256:[a-f0-9]{64}$/.test(artifact.digest)) fail('artifact metadata has no SHA-256 digest.');
  const zip = await request(apiUrl(`${repository as string}/actions/artifacts/${artifact.id}/zip`), true) as Buffer;
  if (zip.length !== artifact.size_in_bytes || sha256(zip) !== artifact.digest.slice('sha256:'.length)) fail('downloaded artifact bytes do not match GitHub artifact metadata.');
  const envelope = parseJson(decodeEvidenceZip(zip as Buffer), 'eligibility evidence artifact');
  const envelopeKeys = ['version', 'repository', 'targetBranch', 'prNumber', 'baseSha', 'headSha', 'runId', 'runAttempt',
    'procedureBase64', 'ordinaryDecisionBase64', 'eligibilityDecisionBase64', 'authoritySetProvenanceBase64', 'digests'];
  keys(envelope, envelopeKeys, 'eligibility evidence artifact');
  same((envelope as JsonRecord).version, 1, 'artifact schema version');
  same((envelope as JsonRecord).repository, repository, 'artifact repository');
  same((envelope as JsonRecord).targetBranch, targetBranch, 'artifact target branch');
  same((envelope as JsonRecord).prNumber, pullRequestNumber, 'artifact pull request');
  same((envelope as JsonRecord).baseSha, baseSha, 'artifact recorded base');
  same((envelope as JsonRecord).headSha, bSha, 'artifact exact B');
  same(String((envelope as JsonRecord).runId), String(runId), 'artifact run ID');
  same(Number((envelope as JsonRecord).runAttempt), Number(attempt), 'artifact run attempt');
  keys((envelope as JsonRecord).digests, ['procedure', 'ordinaryDecision', 'eligibilityDecision', 'authoritySetProvenance'], 'artifact digests');
  const bytes = {
    procedure: base64Bytes((envelope as JsonRecord).procedureBase64, 'procedure bytes'),
    ordinaryDecision: base64Bytes((envelope as JsonRecord).ordinaryDecisionBase64, 'ordinary decision bytes'),
    eligibilityDecision: base64Bytes((envelope as JsonRecord).eligibilityDecisionBase64, 'eligibility decision bytes'),
    authoritySetProvenance: base64Bytes((envelope as JsonRecord).authoritySetProvenanceBase64, 'Authority Set provenance bytes'),
  };
  const digests: JsonRecord = {};
  for (const [name, content] of Object.entries(bytes)) {
    if (!HEX64.test((((envelope as JsonRecord).digests as JsonRecord)[name] || '') as string) || sha256(content) !== ((envelope as JsonRecord).digests as JsonRecord)[name]) fail(`${name} bytes do not match their SHA-256 digest.`);
    digests[name] = ((envelope as JsonRecord).digests as JsonRecord)[name];
  }
  if (procedureDigest !== undefined) same(digests.procedure, procedureDigest, 'exact procedure bytes digest');
  if (eligibilityDigest !== undefined) same(digests.eligibilityDecision, eligibilityDigest, 'exact eligibility decision bytes digest');
  const procedure = parseJson(bytes.procedure, 'procedure bytes');
  const ordinaryDecision = parseJson(bytes.ordinaryDecision, 'ordinary decision bytes');
  const eligibilityDecision = parseJson(bytes.eligibilityDecision, 'eligibility decision bytes');
  const authoritySetProvenance = parseJson(bytes.authoritySetProvenance, 'Authority Set provenance bytes');
  validateMultiAuthorityProvenance(authoritySetProvenance);
  validateMultiAuthorityProvenance((procedure as JsonRecord).authoritySet);
  assertSameMultiAuthorityProvenance((procedure as JsonRecord).authoritySet, authoritySetProvenance);
  const actualAuthoritySetDigest = (authoritySetProvenance as JsonRecord).setDigest;
  // The imported validator checks member IDs as strings before this map.
  const actualAuthorityIds = ((authoritySetProvenance as JsonRecord).members as { id: string }[]).map(member => member.id);
  if (authoritySetDigest !== undefined) same(actualAuthoritySetDigest, authoritySetDigest, 'selected Authority Set digest');
  if (authorityIds !== undefined && (actualAuthorityIds.length !== authorityIds.length ||
      actualAuthorityIds.some((id, index) => id !== (authorityIds as unknown[])[index]))) fail('Authority Set provenance differs from the expected selected member set.');
  same((procedure as JsonRecord).repository, repository, 'procedure repository');
  same((procedure as JsonRecord).baseSha, baseSha, 'procedure recorded base');
  same((procedure as JsonRecord).headSha, bSha, 'procedure exact B');
  same((procedure as JsonRecord).policySha256, policySha256, 'procedure recorded-base policy digest');
  same(((procedure as JsonRecord).authoritySet as JsonRecord)?.setDigest, actualAuthoritySetDigest, 'procedure selected Authority Set');
  same((authoritySetProvenance as JsonRecord).selfRepository, repository, 'Authority Set repository');
  same((authoritySetProvenance as JsonRecord).authorityRevision, baseSha, 'Authority Set recorded base');
  same((authoritySetProvenance as JsonRecord).setDigest, actualAuthoritySetDigest, 'Authority Set digest');
  same((ordinaryDecision as JsonRecord).decision, 'OWNER_DECISION', 'ordinary decision');
  same((ordinaryDecision as JsonRecord).ownerDecisionId, (procedure as JsonRecord).missingDecisionId, 'ordinary missing decision binding');
  // The ordinary review uses the recorded-base consumer schema. Some such
  // schemas have no version property; the v2 envelope and eligibility result
  // carry the route version without rewriting the model's ordinary decision.
  if ((ordinaryDecision as JsonRecord).version !== undefined) same((ordinaryDecision as JsonRecord).version, 2, 'ordinary decision schema version');
  same((ordinaryDecision as JsonRecord).authoritySetDigest, actualAuthoritySetDigest, 'ordinary decision Authority Set');
  if (!Array.isArray((ordinaryDecision as JsonRecord).authorityIds) || ((ordinaryDecision as JsonRecord).authorityIds as unknown[]).length !== actualAuthorityIds.length ||
      ((ordinaryDecision as JsonRecord).authorityIds as unknown[]).some((id: unknown, index: number) => id !== actualAuthorityIds[index])) fail('ordinary decision does not identify the complete selected Authority Set.');
  same((eligibilityDecision as JsonRecord).version, 2, 'eligibility decision schema version');
  same((eligibilityDecision as JsonRecord).authoritySetDigest, actualAuthoritySetDigest, 'eligibility Authority Set');
  if (!Array.isArray((eligibilityDecision as JsonRecord).authorityIds) || ((eligibilityDecision as JsonRecord).authorityIds as unknown[]).length !== actualAuthorityIds.length ||
      ((eligibilityDecision as JsonRecord).authorityIds as unknown[]).some((id: unknown, index: number) => id !== actualAuthorityIds[index])) fail('eligibility decision does not identify the complete selected Authority Set.');
  for (const key of REQUIRED_ELIGIBILITY) same((eligibilityDecision as JsonRecord)[key], true, `eligibility decision ${key}`);

  const completedAt = new Date(completedMs).toISOString();
  const provenance: OwnerAdditionEligibilityProvenanceRecord = {
    status: 'verified', selection: 'recorded-base-policy',
    workflow: { runId: String(runId), attempt: Number(attempt), jobId: String(jobId), workflowPath: callerPath, callerPath },
    repository, targetBranch, pullRequestNumber, baseSha, bSha, authoritySetDigest: actualAuthoritySetDigest,
    procedureDigest: digests.procedure, eligibilityDigest: digests.eligibilityDecision, completedAt,
    artifactBinding: { checkRunId: String(check.id), artifactId: String(artifact.id), artifactDigest: artifact.digest,
      annotationTitle: ARTIFACT_BINDING_TITLE, annotationMessage: bindingAnnotation.message },
  };
  return { status: 'verified', provenance, completedAt, authorityIds: actualAuthorityIds,
    gatekeeperWorkflow: { path: gatekeeperWorkflow.path, sha: gatekeeperWorkflow.sha },
    artifacts: { evidenceArtifact: { id: artifact.id, name: artifact.name, digest: artifact.digest,
      createdAt: artifact.created_at }, procedure, ordinaryDecision, eligibilityDecision, authoritySetProvenance, digests } };
}
