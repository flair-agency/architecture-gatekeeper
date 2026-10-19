import { parseMeasurementJson, canonicalTimestamp } from './measurement.mts';

const MAX_BYTES = 256 * 1024;
const MAX_TIME_MS = 10_000;
const CODEX_REVIEW_STEP = 'Run read-only architecture review';
const GEMINI_REVIEW_STEP = 'Review with Gemini and emit the masked report projection';
const outcomes = new Set(['success', 'failure', 'cancelled', 'skipped']);
const restOutcomes = new Set([...outcomes, 'timed_out']);
const needsOutcome = (value: unknown) => value === 'timed_out' ? 'failure' : value;
const jobName = (value: unknown): value is string => typeof value === 'string' && value.length <= 256 && /[^\s\p{Cf}\p{Default_Ignorable_Code_Point}]/u.test(value) && !/\p{Cc}/u.test(value);
function fail(): never { throw new Error('Public CI diagnostic metadata unavailable or inconsistent.'); }
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const positive = (v: unknown): v is string => typeof v === 'string' && /^[1-9][0-9]{0,19}$/.test(v);
const identifier = (v: unknown) => typeof v === 'number' ? Number.isSafeInteger(v) && v > 0 : positive(v);
function interval(start: unknown, end: unknown) {
  if (!canonicalTimestamp(start) || !canonicalTimestamp(end) || Date.parse(end) < Date.parse(start)) fail();
  return { startedAt: start, completedAt: end, elapsedMs: Date.parse(end) - Date.parse(start) };
}

/** Anonymous, two-request acquisition for one exact public repository/run/attempt.
 * No logs, artifacts, credentials, redirects, retries or pagination. Bounds apply
 * before decoding/parsing and also cover a fetch/reader that ignores abort.
 */
export async function retrieveCiReviewJob(env: NodeJS.ProcessEnv, fetchImpl: typeof fetch = fetch, timeoutMs = MAX_TIME_MS) {
  const repository = env.GITHUB_REPOSITORY;
  if (env.GITHUB_SERVER_URL !== 'https://github.com' || typeof repository !== 'string' || repository.length > 200 ||
      !/^[A-Za-z0-9][A-Za-z0-9_.-]*\/[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(repository) ||
      !positive(env.GITHUB_RUN_ID) || !positive(env.GITHUB_RUN_ATTEMPT) ||
      typeof env.HEAD_SHA !== 'string' || !/^[a-f0-9]{40}$/.test(env.HEAD_SHA) ||
      (env.EVENT_SHA !== undefined && (typeof env.EVENT_SHA !== 'string' || !/^[a-f0-9]{40}$/.test(env.EVENT_SHA))) ||
      (env.REVIEW_PROVIDER !== undefined && env.REVIEW_PROVIDER !== '' && env.REVIEW_PROVIDER !== 'codex' && env.REVIEW_PROVIDER !== 'gemini') ||
      !outcomes.has(env.REVIEW_RESULT as string) ||
      (env.REVIEW_JOB_NAME !== undefined && env.REVIEW_JOB_NAME !== '' && !jobName(env.REVIEW_JOB_NAME)) || !Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > MAX_TIME_MS) fail();
  // pull_request_target REST run/job head_sha may reflect the event SHA while
  // the diagnostic record retains the PR head SHA.
  const expectedStepName = env.REVIEW_PROVIDER === 'gemini' ? GEMINI_REVIEW_STEP : CODEX_REVIEW_STEP;
  const matchesRestHeadSha = (sha: unknown): sha is string =>
    sha === env.HEAD_SHA || (typeof env.EVENT_SHA === 'string' && sha === env.EVENT_SHA);
  const [owner, name] = repository.split('/');
  const root = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/actions/runs/${encodeURIComponent(env.GITHUB_RUN_ID!)}/attempts/${encodeURIComponent(env.GITHUB_RUN_ATTEMPT!)}`;
  const controller = new AbortController();
  let rejectDeadline!: (error: Error) => void;
  const deadline = new Promise<never>((_, reject) => { rejectDeadline = reject; });
  const timer = setTimeout(() => { controller.abort(); rejectDeadline(new Error('CI diagnostic metadata deadline exceeded.')); }, timeoutMs);
  const wait = <T,>(promise: Promise<T>) => Promise.race([promise, deadline]);
  let requests = 0;
  async function read(url: string): Promise<unknown> {
    if (++requests > 2) fail();
    const response = await wait(fetchImpl(url, {method: 'GET', redirect: 'manual', signal: controller.signal,
      headers: {Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28'}}));
    if (response.status !== 200 || response.redirected || response.url && response.url !== url || !response.body) fail();
    const length = response.headers.get('content-length');
    if (length !== null && (!/^\d+$/.test(length) || Number(length) > MAX_BYTES)) fail();
    const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let bytes = 0; let complete = false;
    try {
      while (true) {
        const part = await wait(reader.read()); if (part.done) break;
        if (!(part.value instanceof Uint8Array) || part.value.byteLength === 0) fail();
        bytes += part.value.byteLength; if (bytes > MAX_BYTES) fail(); chunks.push(part.value);
      }
      const result = parseMeasurementJson(new TextDecoder('utf-8', {fatal: true}).decode(Buffer.concat(chunks, bytes)));
      complete = true; return result;
    } finally {
      if (!complete) { try { void reader.cancel().catch(() => {}); } catch { /* cancellation cannot extend the deadline */ } }
    }
  }
  try {
    const run = await read(root);
    if (!object(run) || !object(run.repository) || run.repository.full_name !== repository || run.repository.private !== false || !identifier(run.id) || !identifier(run.run_attempt) ||
        String(run.id) !== env.GITHUB_RUN_ID || String(run.run_attempt) !== env.GITHUB_RUN_ATTEMPT || !matchesRestHeadSha(run.head_sha)) fail();
    const data = await read(root + '/jobs?per_page=100');
    if (!object(data) || !Array.isArray(data.jobs) || data.jobs.length > 100 || data.total_count !== data.jobs.length) fail();
    const candidates = data.jobs.filter((job: unknown) => object(job) && Array.isArray(job.steps) &&
      (!env.REVIEW_JOB_NAME || job.name === env.REVIEW_JOB_NAME) &&
      job.steps.some((step: unknown) => object(step) && step.name === expectedStepName));
    if (candidates.length !== 1 || !object(candidates[0])) fail();
    const job = candidates[0];
    if (!Number.isSafeInteger(job.id) || Number(job.id) < 1 || !identifier(job.run_id) || !identifier(job.run_attempt) || String(job.run_id) !== env.GITHUB_RUN_ID ||
        String(job.run_attempt) !== env.GITHUB_RUN_ATTEMPT || job.run_url !== `https://api.github.com/repos/${repository}/actions/runs/${env.GITHUB_RUN_ID}` ||
        !matchesRestHeadSha(job.head_sha) || job.head_sha !== run.head_sha || job.status !== 'completed' || !restOutcomes.has(job.conclusion as string) || needsOutcome(job.conclusion) !== env.REVIEW_RESULT || !Array.isArray(job.steps)) fail();
    const steps = job.steps.filter((step: unknown) => object(step) && step.name === expectedStepName);
    if (steps.length !== 1 || !object(steps[0]) || !restOutcomes.has(steps[0].conclusion as string) || steps[0].status !== 'completed') fail();
    const timing = interval(job.started_at, job.completed_at);
    // GitHub skipped steps may carry no useful timestamps; retain that gap.
    const reviewStep = steps[0].conclusion === 'skipped' ? null : interval(steps[0].started_at, steps[0].completed_at);
    if (reviewStep && (Date.parse(reviewStep.startedAt) < Date.parse(timing.startedAt) || Date.parse(reviewStep.completedAt) > Date.parse(timing.completedAt))) fail();
    return { jobId: String(job.id), jobOutcome: job.conclusion as string, stepOutcome: steps[0].conclusion as string, jobTiming: timing, reviewTiming: reviewStep };
  } finally { clearTimeout(timer); controller.abort(); }
}
