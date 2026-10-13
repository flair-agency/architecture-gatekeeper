import { createHash } from 'node:crypto';
import { rejectDuplicateJsonKeys } from '../authority-set.mjs';
import { assertSameMultiAuthorityProvenance, validateMultiAuthorityProvenance } from '../multi-authority-provenance.mjs';
import { decodeEvidenceZip } from './owner-addition-evidence-zip.mts';

export type GitHubOwnerAdditionProvenanceFetch = (url: string, init: {
  headers: Record<string, string>; redirect: 'follow';
}) => unknown;

export type GitHubOwnerAdditionProvenanceInput = Readonly<{
  githubToken: unknown; repository: unknown; targetBranch: unknown;
  pullRequestNumber: unknown; baseSha: unknown; bSha: unknown; callerPath: unknown;
  jobName: unknown; appId?: unknown; runId: unknown; attempt: unknown; jobId: unknown;
  policySha256: unknown; expectedGatekeeperWorkflow: unknown; mergeAt: unknown;
  procedureDigest?: unknown; eligibilityDigest?: unknown; authoritySetDigest?: unknown;
  authorityIds?: unknown; fetchImpl?: GitHubOwnerAdditionProvenanceFetch;
}>;

export type GitHubOwnerAdditionProvenanceResult = Readonly<{
  status: 'verified'; completedAt: string; authorityIds: readonly unknown[];
  provenance: Readonly<{
    status: 'verified'; selection: 'recorded-base-policy';
    workflow: Readonly<{ runId: string; attempt: number; jobId: string; workflowPath: string; callerPath: string }>;
    repository: unknown; targetBranch: string; pullRequestNumber: unknown; baseSha: unknown; bSha: unknown;
    authoritySetDigest: unknown; procedureDigest: unknown; eligibilityDigest: unknown; completedAt: string;
    artifactBinding: Readonly<{ checkRunId: string; artifactId: string; artifactDigest: unknown;
      annotationTitle: string; annotationMessage: unknown }>;
  }>;
  gatekeeperWorkflow: Readonly<{ path: unknown; sha: unknown }>;
  artifacts: Readonly<{ evidenceArtifact: Readonly<{ id: unknown; name: unknown; digest: unknown; createdAt: unknown }>;
    procedure: unknown; ordinaryDecision: unknown; eligibilityDecision: unknown;
    authoritySetProvenance: unknown; digests: Readonly<Record<string, unknown>> }>;
}>;

// Erased operational views describe the original reads/calls; they neither
// validate nested observations nor authenticate producer, custody or acceptance.
type Observation = {
  [key: string]: unknown;
  repository?: { full_name?: unknown }; head?: { sha?: unknown }; base?: { sha?: unknown; ref?: unknown };
  app?: { id?: unknown }; workflow_run?: { id?: unknown; head_sha?: unknown };
  referenced_workflows?: Observation[]; pull_requests?: Observation[];
  jobs?: Observation[]; steps?: Observation[]; artifacts?: Observation[];
  authoritySet?: Observation; members?: Observation[]; digests?: Record<string, unknown>;
};
type ExpectedWorkflowView = { path: string; sha?: unknown };
type ResponseView = { ok?: unknown; status?: unknown; json: () => unknown;
  arrayBuffer: () => ArrayBuffer | ArrayBufferView | PromiseLike<ArrayBuffer | ArrayBufferView>;
  headers?: { get?: (name: string) => unknown } };
// Native RegExp.test preserves its legacy coercion of unknown values; this
// erased callable view does not validate those values as strings.
type CoerciveRegExp = RegExp & { test: (value: unknown) => boolean };
type ReplaceView = { replace: (pattern: RegExp, replacement: string) => unknown };
type Request = { (url: string, raw?: false): Promise<Observation>; (url: string, raw: true): Promise<Buffer> };

const API = 'https://api.github.com';
const ACTIONS_APP_ID = 15368;
const ARTIFACT_MAX_BYTES = 1_048_576;
const ZIP_ENTRY_MAX_BYTES = 524_288;
const ARTIFACT_NAME_PREFIX = 'owner-addition-eligibility-evidence-';
const ARTIFACT_UPLOAD_STEP = 'Preserve exact v5 pre-merge eligibility evidence';
const ARTIFACT_BINDING_STEP = 'Record exact uploaded eligibility artifact binding';
const ARTIFACT_BINDING_TITLE = 'AGK_OWNER_ADDITION_ARTIFACT_V1';
const HEX40 = /^[a-f0-9]{40}$/ as CoerciveRegExp;
const HEX64 = /^[a-f0-9]{64}$/ as CoerciveRegExp;
const DECIMAL = /^\d+$/;
const REQUIRED_ELIGIBILITY = ['eligible', 'onlyMissingDecision', 'preservesExistingRules', 'noContradiction',
  'noUnsupportedCompletionClaim', 'noUnrelatedUnresolvedChoices', 'matchesOrdinaryOwnerDecision'];

function fail(message: string): never { throw new Error(`GitHub OWNER_ADDITION provenance: ${message}`); }
function object(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function keys(value: unknown, expected: readonly string[], label: string): void {
  if (!object(value) || Object.keys(value).length !== expected.length || expected.some(key => !Object.hasOwn(value, key))) {
    fail(`${label} has missing or unknown fields.`);
  }
}
function sha256(bytes: Uint8Array): string { return createHash('sha256').update(bytes).digest('hex'); }
function timestamp(value: unknown, label: string): number {
  const parsed = typeof value === 'string' ? Date.parse(value) : NaN;
  if (!Number.isFinite(parsed)) fail(`${label} is missing or invalid.`);
  return parsed;
}
function same(actual: unknown, expected: unknown, label: string): void { if (actual !== expected) fail(`${label} differs from the selected exact candidate.`); }
function base64Bytes(value: unknown, label: string, maxBytes: number = ZIP_ENTRY_MAX_BYTES): Buffer {
  if (typeof value !== 'string' || value.length > Math.ceil(maxBytes * 4 / 3) + 4 ||
      !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) fail(`${label} is not bounded canonical base64.`);
  const bytes = Buffer.from(value, 'base64');
  if (!bytes.length || bytes.length > maxBytes || bytes.toString('base64') !== value) fail(`${label} has an invalid size or encoding.`);
  return bytes;
}
function parseJson(bytes: Uint8Array, label: string): unknown {
  let source: string;
  try { source = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes); }
  catch { fail(`${label} is not UTF-8.`); }
  try { rejectDuplicateJsonKeys(source, label); return JSON.parse(source); }
  catch (error) { fail(`${label} is not strict JSON (${(error as { message?: unknown }).message}).`); }
}

function apiUrl(path: string, query: string = ''): string {
  return `${API}/repos/${path.split('/').map(encodeURIComponent).join('/')}${query}`;
}
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
  mergeAt, fetchImpl = globalThis.fetch }: GitHubOwnerAdditionProvenanceInput): Promise<GitHubOwnerAdditionProvenanceResult> {
  repository = parseRepo(repository);
  if (!githubToken || typeof githubToken !== 'string') fail('GitHub token is required.');
  if (typeof targetBranch !== 'string' || !targetBranch || targetBranch.includes('..')) fail('target branch is invalid.');
  if (!Number.isSafeInteger(pullRequestNumber) || (pullRequestNumber as number) < 1 || !HEX40.test(baseSha || '') || !HEX40.test(bSha || '')) fail('candidate identity is invalid.');
  if (typeof callerPath !== 'string' || !/^\.github\/workflows\/[A-Za-z0-9._/-]+\.ya?ml$/.test(callerPath) || callerPath.split('/').some(part => part === '.' || part === '..')) fail('selected caller workflow path is invalid.');
  if (!object(expectedGatekeeperWorkflow) || typeof (expectedGatekeeperWorkflow as ExpectedWorkflowView).path !== 'string' ||
      (expectedGatekeeperWorkflow as ExpectedWorkflowView).path.length < 1 || (expectedGatekeeperWorkflow as ExpectedWorkflowView).path.length > 512 ||
      /[\x00-\x20\x7f]/.test((expectedGatekeeperWorkflow as ExpectedWorkflowView).path) || !HEX40.test((expectedGatekeeperWorkflow as ExpectedWorkflowView).sha || '')) {
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
        authorityIds.some((id: unknown) => typeof id !== 'string' || !/^[a-z][a-z0-9-]{0,63}$/.test(id)) || new Set(authorityIds).size !== authorityIds.length))) {
    fail('producer or expected digest binding is invalid.');
  }
  const mergeTime = timestamp(mergeAt, 'merge time');
  if (typeof fetchImpl !== 'function') fail('fetch implementation is unavailable.');
  const headers = { accept: 'application/vnd.github+json', authorization: `Bearer ${githubToken}`, 'x-github-api-version': '2022-11-28' };
  const request = (async (url: string, raw: boolean = false) => {
    const response = await fetchImpl(url, { headers, redirect: 'follow' }) as ResponseView | null | undefined;
    if (!response?.ok) fail(`GitHub API request failed (${response?.status ?? 'no response'}).`);
    if (raw) {
      const bytes = Buffer.from((await response.arrayBuffer()) as Uint8Array);
      if (!bytes.length || bytes.length > ARTIFACT_MAX_BYTES) fail('downloaded artifact exceeds its byte limit.');
      return bytes;
    }
    let value: unknown;
    try { value = await response.json(); } catch { fail('GitHub API returned malformed JSON.'); }
    if (!object(value)) fail('GitHub API response is not an object.');
    return value as Observation;
  }) as Request;
  const run = await request(apiUrl(`${repository}/actions/runs/${runId}/attempts/${attempt}`));
  same(String(run.id), String(runId), 'workflow run ID');
  same(Number(run.run_attempt), Number(attempt), 'workflow run attempt');
  same(run.repository?.full_name, repository, 'workflow repository');
  if (!(['pull_request', 'pull_request_target'] as readonly unknown[]).includes(run.event)) fail('workflow event is not a supported pull-request event.');
  same(run.status, 'completed', 'workflow status');
  same(run.conclusion, 'success', 'workflow conclusion');
  if (!HEX40.test(run.head_sha || '')) fail('workflow run head is invalid.');
  // pull_request_target runs execute in the base workflow context but GitHub's
  // run record still identifies the exact triggering PR head. Bind that form
  // explicitly; pull_request runs remain bound through their PR association
  // and the synthetic merge SHA used by their jobs and check runs.
  if (run.event === 'pull_request_target') same(run.head_sha, bSha, 'pull_request_target exact B head');
  if (!Array.isArray(run.referenced_workflows) || run.referenced_workflows.length > 20) fail('workflow run has no bounded reusable-workflow provenance.');
  const expectedWorkflowPath = (expectedGatekeeperWorkflow as ExpectedWorkflowView).path.endsWith(`@${(expectedGatekeeperWorkflow as ExpectedWorkflowView).sha}`)
    ? (expectedGatekeeperWorkflow as ExpectedWorkflowView).path : `${(expectedGatekeeperWorkflow as ExpectedWorkflowView).path}@${(expectedGatekeeperWorkflow as ExpectedWorkflowView).sha}`;
  const matchingGatekeeperWorkflows = run.referenced_workflows.filter(workflow => workflow?.path === expectedWorkflowPath);
  if (matchingGatekeeperWorkflows.length !== 1) fail('selected Gatekeeper reusable workflow is absent or ambiguous in run metadata.');
  const gatekeeperWorkflow = matchingGatekeeperWorkflows[0];
  same(gatekeeperWorkflow.sha, (expectedGatekeeperWorkflow as ExpectedWorkflowView).sha, 'selected Gatekeeper reusable-workflow SHA');
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
  const pr = await request(apiUrl(`${repository}/pulls/${pullRequestNumber}`));
  same(pr.number, pullRequestNumber, 'pull request number');
  same(pr.base?.ref, targetBranch, 'pull request target branch');
  same(pr.head?.sha, bSha, 'pull request exact B');

  const jobsPage = await request(apiUrl(`${repository}/actions/runs/${runId}/attempts/${attempt}/jobs`, '?per_page=100'));
  if (!Array.isArray(jobsPage.jobs) || !Number.isSafeInteger(jobsPage.total_count) || (jobsPage.total_count as number) > 100) fail('producer job listing is missing or exceeds the bounded page.');
  const matchingJobs = jobsPage.jobs.filter(job => String(job.id) === String(jobId));
  if (matchingJobs.length !== 1) fail('selected producer job ID is absent or ambiguous.');
  const job = matchingJobs[0];
  same(job.name, jobName, 'selected producer job name');
  same(job.status, 'completed', 'producer job status');
  same(job.conclusion, 'success', 'producer job conclusion');
  // Pull-request runs commonly execute on GitHub's synthetic merge SHA.
  // The run's PR snapshot binds that execution to exact B above.
  same(job.head_sha, run.head_sha, 'producer job run head');
  if (!Array.isArray(job.steps)) fail('selected producer job has no step-level provenance.');
  const uploadSteps = job.steps.filter(step => step?.name === ARTIFACT_UPLOAD_STEP);
  if (uploadSteps.length !== 1) fail('selected producer job must contain exactly one evidence artifact upload step.');
  const uploadStep = uploadSteps[0];
  same(uploadStep.status, 'completed', 'evidence artifact upload step status');
  same(uploadStep.conclusion, 'success', 'evidence artifact upload step conclusion');
  const uploadStartedMs = timestamp(uploadStep.started_at, 'evidence artifact upload start');
  const uploadCompletedMs = timestamp(uploadStep.completed_at, 'evidence artifact upload completion');
  if (uploadStartedMs < runStarted || uploadCompletedMs < uploadStartedMs || uploadCompletedMs > timestamp(job.completed_at, 'producer job completion')) {
    fail('evidence artifact upload step is outside the selected producer job interval.');
  }
  const bindingSteps = job.steps.filter(step => step?.name === ARTIFACT_BINDING_STEP);
  if (bindingSteps.length !== 1 || job.steps.indexOf(bindingSteps[0]) <= job.steps.indexOf(uploadStep)) {
    fail('selected producer job must contain exactly one post-upload artifact binding step.');
  }
  const bindingStep = bindingSteps[0];
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
  const checkRunPathPrefix = `/repos/${repository}/check-runs/`;
  const checkPath = checkUrl.pathname;
  const checkRunId = checkPath.slice(checkRunPathPrefix.length);
  if (checkUrl.origin !== API || !checkPath.startsWith(checkRunPathPrefix) ||
      !DECIMAL.test(checkRunId) || checkUrl.username || checkUrl.password || checkUrl.search || checkUrl.hash) {
    fail('producer check run URL is outside the selected repository.');
  }
  const checkRunApiUrl = apiUrl(`${repository}/check-runs/${checkRunId}`);
  const check = await request(checkRunApiUrl);
  same(check.name, jobName, 'producer check-run name');
  same(check.status, 'completed', 'producer check-run status');
  same(check.conclusion, 'success', 'producer check-run conclusion');
  same(check.head_sha, run.head_sha, 'producer check-run run head');
  same(check.app?.id, ACTIONS_APP_ID, 'producer GitHub Actions app ID');
  same(String(check.id), checkRunId, 'producer check-run ID');
  const annotationUrl = `${checkRunApiUrl}/annotations?per_page=100`;
  const annotationResponse = await fetchImpl(annotationUrl, { headers, redirect: 'follow' }) as ResponseView | null | undefined;
  if (!annotationResponse?.ok) fail(`producer annotation request failed (${annotationResponse?.status ?? 'no response'}).`);
  const linkHeader = annotationResponse.headers?.get?.('link') ?? '';
  if (typeof linkHeader !== 'string' || linkHeader.trim() !== '') fail('producer annotations exceed the bounded single-page limit.');
  let annotations: unknown;
  try { annotations = await annotationResponse.json(); } catch { fail('GitHub returned malformed producer annotations.'); }
  if (!Array.isArray(annotations) || annotations.length > 100) fail('producer annotations response is invalid or oversized.');
  const bindingAnnotations = annotations.filter((annotation: unknown) => (annotation as Observation | null | undefined)?.title === ARTIFACT_BINDING_TITLE) as Observation[];
  if (bindingAnnotations.length !== 1 || bindingAnnotations[0]?.annotation_level !== 'notice') {
    fail('producer check run must contain exactly one artifact binding notice.');
  }
  const bindingAnnotation = bindingAnnotations[0];

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
  const acceptCheckPath = acceptCheckUrl.pathname;
  const acceptCheckRunId = acceptCheckPath.slice(checkRunPathPrefix.length);
  if (acceptCheckUrl.origin !== API ||
      !acceptCheckPath.startsWith(checkRunPathPrefix) || !DECIMAL.test(acceptCheckRunId) ||
      acceptCheckUrl.username || acceptCheckUrl.password || acceptCheckUrl.search || acceptCheckUrl.hash) {
    fail('Gatekeeper accept check run URL is outside the selected repository.');
  }
  const acceptCheck = await request(apiUrl(`${repository}/check-runs/${acceptCheckRunId}`));
  same(acceptCheck.name, acceptName, 'Gatekeeper accept check-run name');
  same(acceptCheck.status, 'completed', 'Gatekeeper accept check-run status');
  same(acceptCheck.conclusion, 'success', 'Gatekeeper accept check-run conclusion');
  same(acceptCheck.head_sha, run.head_sha, 'Gatekeeper accept check-run head');
  same(acceptCheck.app?.id, ACTIONS_APP_ID, 'Gatekeeper accept GitHub Actions app ID');
  same(String(acceptCheck.id), String(acceptCheckUrl.pathname.split('/').at(-1)), 'Gatekeeper accept check-run ID');

  const artifactsPage = await request(apiUrl(`${repository}/actions/runs/${runId}/artifacts`, '?per_page=100'));
  if (!Array.isArray(artifactsPage.artifacts) || !Number.isSafeInteger(artifactsPage.total_count) || (artifactsPage.total_count as number) > 100) fail('artifact listing is missing or exceeds the bounded page.');
  const artifactName = `${ARTIFACT_NAME_PREFIX}${bSha}-${attempt}`;
  const artifacts = artifactsPage.artifacts.filter(artifact => artifact.name === artifactName);
  if (artifacts.length !== 1) fail('the run-scoped exact-B evidence artifact is absent or ambiguous.');
  const artifact = artifacts[0];
  if (artifact.expired !== false || !Number.isSafeInteger(artifact.id) || !Number.isSafeInteger(artifact.size_in_bytes) ||
      (artifact.size_in_bytes as number) < 1 || (artifact.size_in_bytes as number) > ARTIFACT_MAX_BYTES) fail('evidence artifact is expired or outside its byte limit.');
  same(String(artifact.workflow_run?.id), String(runId), 'artifact workflow run');
  same(artifact.workflow_run?.head_sha, run.head_sha, 'artifact workflow run head');
  const expectedBindingMessage = `id=${artifact.id};sha256=${(artifact.digest as ReplaceView | null | undefined)?.replace(/^sha256:/, '')}`;
  same(bindingAnnotation.message, expectedBindingMessage, 'selected producer artifact ID and digest annotation');
  const createdMs = timestamp(artifact.created_at, 'artifact creation');
  if (createdMs < uploadStartedMs || createdMs > uploadCompletedMs || createdMs > completedMs || createdMs >= mergeTime) {
    fail('evidence artifact was not created during the selected upload step in the pre-merge producer job.');
  }
  if (typeof artifact.digest !== 'string' || !/^sha256:[a-f0-9]{64}$/.test(artifact.digest)) fail('artifact metadata has no SHA-256 digest.');
  const zip = await request(apiUrl(`${repository}/actions/artifacts/${artifact.id}/zip`), true);
  if (zip.length !== artifact.size_in_bytes || sha256(zip) !== artifact.digest.slice('sha256:'.length)) fail('downloaded artifact bytes do not match GitHub artifact metadata.');
  const envelope = parseJson(decodeEvidenceZip(zip), 'eligibility evidence artifact') as Observation;
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
  const digests: Record<string, unknown> = {};
  for (const [name, content] of Object.entries(bytes)) {
    if (!HEX64.test(envelope.digests![name] || '') || sha256(content) !== envelope.digests![name]) fail(`${name} bytes do not match their SHA-256 digest.`);
    digests[name] = envelope.digests![name];
  }
  if (procedureDigest !== undefined) same(digests.procedure, procedureDigest, 'exact procedure bytes digest');
  if (eligibilityDigest !== undefined) same(digests.eligibilityDecision, eligibilityDigest, 'exact eligibility decision bytes digest');
  const procedure = parseJson(bytes.procedure, 'procedure bytes') as Observation;
  const ordinaryDecision = parseJson(bytes.ordinaryDecision, 'ordinary decision bytes') as Observation;
  const eligibilityDecision = parseJson(bytes.eligibilityDecision, 'eligibility decision bytes') as Observation;
  const authoritySetProvenance = parseJson(bytes.authoritySetProvenance, 'Authority Set provenance bytes') as Observation;
  validateMultiAuthorityProvenance(authoritySetProvenance);
  validateMultiAuthorityProvenance(procedure.authoritySet);
  assertSameMultiAuthorityProvenance(procedure.authoritySet, authoritySetProvenance);
  const actualAuthoritySetDigest = authoritySetProvenance.setDigest;
  const actualAuthorityIds = authoritySetProvenance.members!.map(member => member.id);
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
  // The ordinary review uses the recorded-base consumer schema. Some such
  // schemas have no version property; the v2 envelope and eligibility result
  // carry the route version without rewriting the model's ordinary decision.
  if (ordinaryDecision.version !== undefined) same(ordinaryDecision.version, 2, 'ordinary decision schema version');
  same(ordinaryDecision.authoritySetDigest, actualAuthoritySetDigest, 'ordinary decision Authority Set');
  if (!Array.isArray(ordinaryDecision.authorityIds) || ordinaryDecision.authorityIds.length !== actualAuthorityIds.length ||
      ordinaryDecision.authorityIds.some((id: unknown, index: number) => id !== actualAuthorityIds[index])) fail('ordinary decision does not identify the complete selected Authority Set.');
  same(eligibilityDecision.version, 2, 'eligibility decision schema version');
  same(eligibilityDecision.authoritySetDigest, actualAuthoritySetDigest, 'eligibility Authority Set');
  if (!Array.isArray(eligibilityDecision.authorityIds) || eligibilityDecision.authorityIds.length !== actualAuthorityIds.length ||
      eligibilityDecision.authorityIds.some((id: unknown, index: number) => id !== actualAuthorityIds[index])) fail('eligibility decision does not identify the complete selected Authority Set.');
  for (const key of REQUIRED_ELIGIBILITY) same(eligibilityDecision[key], true, `eligibility decision ${key}`);

  const completedAt = new Date(completedMs).toISOString();
  const provenance: GitHubOwnerAdditionProvenanceResult['provenance'] = {
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
