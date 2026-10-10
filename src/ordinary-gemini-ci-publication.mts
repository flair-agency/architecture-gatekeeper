import { randomBytes } from 'node:crypto';
import { chmod, lstat, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

export const ORDINARY_GEMINI_PUBLICATION_FRAME = 'AGK_ORDINARY_GEMINI_REPORT_V1 ';
export const ORDINARY_GEMINI_PUBLICATION_STEP = 'Review with Gemini and emit the masked report projection';
export const MAX_ORDINARY_GEMINI_PROJECTION_BYTES = 65_536;
export const MAX_ORDINARY_GEMINI_JOB_LOG_BYTES = 1_048_576;
const DISPLAY_DECISION_KEYS = ['decision', 'findings', 'summary', 'authority', 'authorityFiles', 'authorityIds',
  'responsibility', 'capabilitySurface', 'qualityGuarantees', 'reviewedScope', 'prohibitedChanges', 'gates'];

type JsonRecord = Record<string, unknown>;
type PublicationContext = {
  repository: string; runId: string; runAttempt: string; eventSha: string;
  callerWorkflowSha: string; callerWorkflowRef: string; workflowRepository: string; workflowSha: string; workflowRef: string;
  baseSha: string; headSha: string; reviewedSha: string; provider: 'gemini'; nonce: string;
};

function fail(): never { throw new Error('Ordinary Gemini report transport failed a fixed boundary check.'); }
const own = (value: unknown): value is JsonRecord => value !== null && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
const sha = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{40}$/.test(value);

function validateContext(value: unknown): PublicationContext {
  if (!own(value) || Object.keys(value).sort().join(',') !== 'baseSha,callerWorkflowRef,callerWorkflowSha,eventSha,headSha,nonce,provider,repository,reviewedSha,runAttempt,runId,workflowRef,workflowRepository,workflowSha') fail();
  const context = value as unknown as PublicationContext;
  if (typeof context.repository !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9-]{0,38}\/[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(context.repository) ||
      !/^[1-9][0-9]{0,15}$/.test(context.runId) || !/^[1-9][0-9]{0,5}$/.test(context.runAttempt) ||
      !sha(context.eventSha) || !sha(context.callerWorkflowSha) || typeof context.callerWorkflowRef !== 'string' || !context.callerWorkflowRef || context.callerWorkflowRef.length > 512 ||
      typeof context.workflowRepository !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9-]{0,38}\/[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(context.workflowRepository) ||
      typeof context.workflowRef !== 'string' || !context.workflowRef.startsWith(`${context.workflowRepository}/.github/workflows/`) ||
      !sha(context.workflowSha) || context.workflowRef.length < 1 || context.workflowRef.length > 512 ||
      !sha(context.baseSha) || !sha(context.headSha) || !sha(context.reviewedSha) ||
      new Set([context.baseSha, context.headSha, context.reviewedSha]).size !== 3 || context.provider !== 'gemini' ||
      !/^[a-f0-9]{48}$/.test(context.nonce)) fail();
  return context;
}

function validateDecision(value: unknown): JsonRecord {
  if (!own(value) || !['PASS', 'BLOCK', 'OWNER_DECISION'].includes(String(value.decision))) fail();
  const display: JsonRecord = {};
  for (const key of DISPLAY_DECISION_KEYS) if (Object.hasOwn(value, key)) display[key] = value[key];
  return display;
}

/** Build the display-only data sent through the runner-masked job log. */
export function createOrdinaryGeminiPublication(input: {
  context: Omit<PublicationContext, 'nonce'>;
  decision: unknown;
  authorityProvenance: unknown;
  policyVersion: string;
  mode: string;
  policyResult: string;
  reviewResult: string;
  conclusion: string;
  decisionDigest: string;
}): { context: PublicationContext; report: JsonRecord } {
  const context = validateContext({ ...input.context, nonce: randomBytes(24).toString('hex') });
  const decision = validateDecision(input.decision);
  if (input.policyVersion !== '6' || input.mode !== 'enforced' || input.policyResult !== 'success' || input.reviewResult !== 'success' || !own(input.authorityProvenance)) fail();
  if (input.conclusion !== decision.decision || !/^[a-f0-9]{64}$/.test(input.decisionDigest)) fail();
  const report = { mode: input.mode, policyResult: input.policyResult, reviewResult: input.reviewResult,
    policyVersion: input.policyVersion, validatedConclusion: input.conclusion, validatedDecisionDigest: input.decisionDigest,
    decision, authorityProvenance: input.authorityProvenance };
  const projection = { version: 1, kind: 'display-only', context, report };
  if (Buffer.byteLength(JSON.stringify(projection), 'utf8') > MAX_ORDINARY_GEMINI_PROJECTION_BYTES) fail();
  return projection;
}

/** Emit one bounded JSON frame while runner workflow commands are disabled. */
export function emitOrdinaryGeminiPublication(projection: unknown, write: (text: string) => void = text => process.stdout.write(text)): void {
  if (!own(projection) || projection.version !== 1 || projection.kind !== 'display-only') fail();
  const context = validateContext(projection.context);
  const json = JSON.stringify(projection);
  if (Buffer.byteLength(json, 'utf8') > MAX_ORDINARY_GEMINI_PROJECTION_BYTES || /[\r\n]/.test(json)) fail();
  const stop = `agk_ordinary_${randomBytes(32).toString('hex')}`;
  write(`::stop-commands::${stop}\n`);
  try { write(`${ORDINARY_GEMINI_PUBLICATION_FRAME}${json}\n`); }
  finally { write(`::${stop}::\n`); }
  write(`Ordinary Gemini report projection emitted for ${context.provider}; semantic decision remains in protected job outputs.\n`);
}

function expectedTuple(value: unknown): Omit<PublicationContext, 'nonce'> & { nonce: string; conclusion: string; decisionDigest: string } {
  if (!own(value) || Object.keys(value).sort().join(',') !== 'baseSha,callerWorkflowRef,callerWorkflowSha,conclusion,decisionDigest,eventSha,headSha,nonce,provider,repository,reviewedSha,runAttempt,runId,workflowRef,workflowRepository,workflowSha') fail();
  const tuple = value as unknown as Omit<PublicationContext, 'nonce'> & { nonce: string; conclusion: string; decisionDigest: string };
  validateContext({ repository: tuple.repository, runId: tuple.runId, runAttempt: tuple.runAttempt,
    eventSha: tuple.eventSha, callerWorkflowSha: tuple.callerWorkflowSha, callerWorkflowRef: tuple.callerWorkflowRef,
    workflowRepository: tuple.workflowRepository,
    workflowSha: tuple.workflowSha, workflowRef: tuple.workflowRef, baseSha: tuple.baseSha,
    headSha: tuple.headSha, reviewedSha: tuple.reviewedSha, provider: tuple.provider, nonce: tuple.nonce });
  if (!['PASS', 'BLOCK', 'OWNER_DECISION'].includes(tuple.conclusion) || !/^[a-f0-9]{64}$/.test(tuple.decisionDigest)) fail();
  return tuple;
}

/** Parse exactly one frame and bind it to protected outputs from the same run attempt. */
export function parseOrdinaryGeminiPublicationLog(log: string, expected: unknown): JsonRecord {
  const tuple = expectedTuple(expected);
  if (typeof log !== 'string' || Buffer.byteLength(log, 'utf8') > MAX_ORDINARY_GEMINI_JOB_LOG_BYTES) fail();
  const lines = log.split(/\r?\n/).map(line => line.replace(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d+Z /, ''));
  const frames = lines.filter(line => line.startsWith(ORDINARY_GEMINI_PUBLICATION_FRAME));
  if (frames.length !== 1 || Buffer.byteLength(frames[0], 'utf8') > MAX_ORDINARY_GEMINI_PROJECTION_BYTES + ORDINARY_GEMINI_PUBLICATION_FRAME.length) fail();
  let parsed: unknown;
  try { parsed = JSON.parse(frames[0].slice(ORDINARY_GEMINI_PUBLICATION_FRAME.length)); } catch { fail(); }
  if (!own(parsed) || parsed.version !== 1 || parsed.kind !== 'display-only' || !own(parsed.report)) fail();
  const context = validateContext(parsed.context);
  for (const key of ['repository', 'runId', 'runAttempt', 'eventSha', 'callerWorkflowSha', 'callerWorkflowRef', 'workflowRepository', 'workflowSha', 'workflowRef', 'baseSha', 'headSha', 'reviewedSha', 'provider', 'nonce'] as const) {
    if (context[key] !== tuple[key]) fail();
  }
  const report = parsed.report;
  if (Object.keys(report).sort().join(',') !== 'authorityProvenance,decision,mode,policyResult,policyVersion,reviewResult,validatedConclusion,validatedDecisionDigest' ||
      report.mode !== 'enforced' || report.policyResult !== 'success' || report.policyVersion !== '6' || report.reviewResult !== 'success' ||
      report.validatedConclusion !== tuple.conclusion || report.validatedDecisionDigest !== tuple.decisionDigest ||
      !own(report.authorityProvenance)) fail();
  const decision = validateDecision(report.decision);
  if (decision.decision !== tuple.conclusion || !own(report.decision) ||
      Object.keys(decision).length !== Object.keys(report.decision).length) fail();
  return parsed;
}

async function boundedBody(response: Response, limit: number, wait: <T>(value: Promise<T>) => Promise<T>): Promise<Buffer> {
  const declared = response.headers.get('content-length');
  if (declared && (!/^[0-9]+$/.test(declared) || Number(declared) > limit)) { void response.body?.cancel().catch(() => {}); fail(); }
  if (!response.body) fail();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const part = await wait(reader.read());
      if (part.done) break;
      size += part.value.byteLength;
      if (size > limit) { void reader.cancel().catch(() => {}); fail(); }
      chunks.push(part.value);
    }
  } catch { void reader.cancel().catch(() => {}); fail(); }
  return Buffer.concat(chunks.map(chunk => Buffer.from(chunk)), size);
}

/** Retrieve only the completed job log that contains the unique protected emission step. */
export async function retrieveOrdinaryGeminiPublication(input: {
  apiToken: string; expected: unknown; outputPath: string; fetchImpl?: typeof fetch; timeoutMs?: number;
}): Promise<JsonRecord> {
  const tuple = expectedTuple(input.expected);
  if (typeof input.apiToken !== 'string' || input.apiToken.length < 1 || typeof input.outputPath !== 'string' || !resolve(input.outputPath).startsWith('/')) fail();
  const fetchImpl = input.fetchImpl ?? fetch;
  const runPath = `/repos/${tuple.repository}/actions/runs/${tuple.runId}/attempts/${tuple.runAttempt}`;
  const controller = new AbortController();
  let rejectDeadline!: (reason: Error) => void;
  const deadline = new Promise<never>((_, reject) => { rejectDeadline = reject; });
  const timeoutMs = input.timeoutMs ?? 30_000;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30_000) fail();
  const timeout = setTimeout(() => { controller.abort(); rejectDeadline(new Error('timeout')); }, timeoutMs);
  const wait = <T,>(value: Promise<T>): Promise<T> => Promise.race([value, deadline]);
  let requests = 0;
  async function readResponse(response: Response, limit: number): Promise<{ response: Response; bytes: Buffer }> {
    if (response.status !== 200 || !response.body) return { response, bytes: Buffer.alloc(0) };
    return { response, bytes: await boundedBody(response, limit, wait) };
  }
  async function getApi(path: string, limit: number): Promise<{ response: Response; bytes: Buffer }> {
    if (++requests > 5) fail();
    if (!path.startsWith(`/repos/${tuple.repository}/`) || path.includes('\\') || path.includes('#') || path.startsWith('//')) fail();
    const response = await wait(fetchImpl(`https://api.github.com${path}`, { redirect: 'manual', signal: controller.signal,
      headers: { accept: 'application/vnd.github+json', authorization: `Bearer ${input.apiToken}`, 'x-github-api-version': '2022-11-28' } }));
    return readResponse(response, limit);
  }
  async function getSignedLog(location: string, limit: number): Promise<{ response: Response; bytes: Buffer }> {
    if (++requests > 5) fail();
    let signedUrl: URL;
    try { signedUrl = new URL(location); } catch { fail(); }
    if (signedUrl.protocol !== 'https:' || signedUrl.username || signedUrl.password || signedUrl.hash || signedUrl.port ||
        !/^[a-z0-9-]+\.blob\.core\.windows\.net$/.test(signedUrl.hostname)) fail();
    const response = await wait(fetchImpl(signedUrl, { redirect: 'manual', signal: controller.signal, headers: {} }));
    return readResponse(response, limit);
  }
  try {
    const runResult = await getApi(runPath, 131_072);
    if (runResult.response.status !== 200) fail();
    const run = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(runResult.bytes)) as JsonRecord;
    const runRepository = run.repository;
    if (!own(runRepository) || String(run.id) !== tuple.runId || String(run.run_attempt) !== tuple.runAttempt ||
        runRepository.full_name !== tuple.repository || run.head_sha !== tuple.headSha ||
        run.path !== tuple.callerWorkflowRef.split('@')[0].split('/').slice(2).join('/')) fail();
    if (!Array.isArray(run.referenced_workflows)) fail();
    const reusableReference = tuple.workflowRef.slice(tuple.workflowRepository.length + 1);
    const referenceAt = reusableReference.lastIndexOf('@');
    if (referenceAt < 1 || referenceAt === reusableReference.length - 1) fail();
    const reusableWorkflowPath = reusableReference.slice(0, referenceAt);
    const reusableRef = reusableReference.slice(referenceAt + 1);
    const expectedReferencedPath = `${tuple.workflowRepository}/${reusableWorkflowPath}@${tuple.workflowSha}`;
    const reusable = run.referenced_workflows.filter((item: unknown) => {
      if (!own(item) || item.path !== expectedReferencedPath || item.sha !== tuple.workflowSha) return false;
      if (Object.hasOwn(item, 'ref')) {
        if (item.ref !== reusableRef) return false;
      } else if (reusableRef !== tuple.workflowSha) return false;
      if (!Object.hasOwn(item, 'repository')) return true;
      return own(item.repository) && item.repository.full_name === tuple.workflowRepository;
    });
    if (reusable.length !== 1) fail();
    const jobsResult = await getApi(`${runPath}/jobs?per_page=100`, 131_072);
    if (jobsResult.response.status !== 200) fail();
    const jobs = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(jobsResult.bytes)) as JsonRecord;
    if (!Array.isArray(jobs.jobs) || jobs.jobs.length > 100 || jobs.total_count !== jobs.jobs.length) fail();
    const selected = jobs.jobs.filter((job: unknown) => own(job) && Array.isArray(job.steps) &&
      job.steps.some((step: unknown) => own(step) && step.name === ORDINARY_GEMINI_PUBLICATION_STEP));
    if (selected.length !== 1) fail();
    const job = selected[0] as JsonRecord;
    if (!Number.isSafeInteger(job.id) || Number(job.id) < 1 || String(job.run_id) !== tuple.runId || String(job.run_attempt) !== tuple.runAttempt ||
        job.head_sha !== tuple.headSha || job.status !== 'completed' || job.conclusion !== 'success') fail();
    const emissionSteps = (job.steps as JsonRecord[]).filter(step => step.name === ORDINARY_GEMINI_PUBLICATION_STEP);
    if (emissionSteps.length !== 1 || emissionSteps[0].status !== 'completed' || emissionSteps[0].conclusion !== 'success') fail();
    let logResult = await getApi(`/repos/${tuple.repository}/actions/jobs/${job.id}/logs`, MAX_ORDINARY_GEMINI_JOB_LOG_BYTES);
    if (logResult.response.status === 302) {
      const location = logResult.response.headers.get('location');
      if (!location) fail();
      logResult = await getSignedLog(location, MAX_ORDINARY_GEMINI_JOB_LOG_BYTES);
    }
    if (logResult.response.status !== 200) fail();
    const projection = parseOrdinaryGeminiPublicationLog(new TextDecoder('utf-8', { fatal: true }).decode(logResult.bytes), tuple);
    const path = resolve(input.outputPath);
    const expectedPath = join(resolve(process.env.RUNNER_TEMP || ''), `agk-ordinary-gemini-report-${tuple.runId}-${tuple.runAttempt}.json`);
    if (path !== expectedPath) fail();
    const parent = dirname(path);
    const parentInfo = await lstat(parent);
    if (!parentInfo.isDirectory() || parentInfo.isSymbolicLink()) fail();
    await writeFile(path, `${JSON.stringify(projection)}\n`, { flag: 'wx', mode: 0o600 });
    await chmod(path, 0o600);
    const fileInfo = await lstat(path);
    if (!fileInfo.isFile() || fileInfo.isSymbolicLink() || fileInfo.nlink !== 1 || (fileInfo.mode & 0o777) !== 0o600) fail();
    const written = await readFile(path);
    if (!written.equals(Buffer.from(`${JSON.stringify(projection)}\n`))) fail();
    return projection;
  } catch { fail(); }
  finally { clearTimeout(timeout); controller.abort(); }
}

