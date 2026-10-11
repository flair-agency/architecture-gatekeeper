import { CODEX_PASS_STEP, MAX_CODEX_LOG_BYTES, expectedOf, fail, parsePassLog, record,
  workflowReference, type PassExpected, type RecordValue } from '../ci-review/codex-pass-publication.mts';

/** Read the masked display only from the successful exact protected run attempt/job. */
export async function retrievePassDisplay(expected: PassExpected, token: string,
  fetchImpl: typeof fetch = fetch, timeoutMs = 30_000): Promise<RecordValue> {
  expectedOf(expected);
  if (typeof token !== 'string' || !token || !Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30_000) fail();
  const controller = new AbortController();
  let rejectDeadline!: (reason: Error) => void;
  const deadline = new Promise<never>((_,reject) => { rejectDeadline = reject; });
  const timer = setTimeout(() => { controller.abort(); rejectDeadline(new Error('Codex display retrieval timed out.')); },timeoutMs);
  const wait = <T,>(p: Promise<T>): Promise<T> => Promise.race([p,deadline]);
  let requests = 0;
  const root = `repos/flair-agency/architecture-gatekeeper/actions`;
  const attempt = `${root}/runs/${encodeURIComponent(expected.runId)}/attempts/${encodeURIComponent(expected.runAttempt)}`;
  async function body(response: Response, limit: number): Promise<string> {
    if (response.status !== 200 || !response.body) fail();
    const length = response.headers.get('content-length');
    if (length && (!/^[0-9]+$/.test(length) || Number(length) > limit)) fail();
    const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
    try {
      while (true) { const part = await wait(reader.read()); if (part.done) break;
        size += part.value.byteLength; if (size > limit) fail(); chunks.push(part.value); }
      return new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks));
    } catch { void reader.cancel().catch(() => {}); fail(); }
  }
  async function api(route: 'run'|'jobs'|'log', job?: number): Promise<Response> {
    if (++requests > 4) fail();
    const path = route === 'run' ? attempt : route === 'jobs' ? `${attempt}/jobs?per_page=100`
      : Number.isSafeInteger(job) && Number(job) > 0 ? `${root}/jobs/${job}/logs` : fail();
    return wait(fetchImpl(new URL(path,'https://api.github.com/'),{ redirect:'manual',signal:controller.signal,
      headers:{accept:'application/vnd.github+json',authorization:`Bearer ${token}`,'x-github-api-version':'2022-11-28'} }));
  }
  try {
    const direct = expected.workflowRef === expected.callerWorkflowRef && expected.workflowSha === expected.callerWorkflowSha;
    // Pure API support for an exact direct-source push fixture. The production
    // self CLI/reporter require distinct caller/reusable paths, so cannot enter it.
    if (direct && (expected.workflowSha !== expected.headSha || expected.eventSha !== expected.headSha)) fail();
    const caller = workflowReference(expected.callerWorkflowRef,expected.repository);
    const shortCallerRef = caller.ref.startsWith('refs/') ? caller.ref.split('/').slice(2).join('/') : caller.ref;
    const run: unknown = JSON.parse(await body(await api('run'),131_072));
    if (!record(run) || !record(run.repository) || run.repository.full_name !== expected.repository ||
        String(run.id) !== expected.runId || String(run.run_attempt) !== expected.runAttempt || run.head_sha !== expected.headSha || run.event !== (direct ? 'push' : 'pull_request_target') ||
        ![caller.path,`${caller.path}@${caller.ref}`,`${caller.path}@${shortCallerRef}`].includes(String(run.path))) fail();
    if (!direct && !Array.isArray(run.referenced_workflows)) fail();
    if (direct && run.referenced_workflows !== undefined &&
        (!Array.isArray(run.referenced_workflows) || run.referenced_workflows.length !== 0)) fail();
    const reusable = workflowReference(expected.workflowRef,expected.workflowRepository);
    const selectedRef = reusable.ref;
    const shortRef = selectedRef.startsWith('refs/') ? selectedRef.split('/').slice(2).join('/') : selectedRef;
    const workflowPath = `${expected.workflowRepository}/${reusable.path}`;
    const selected = (Array.isArray(run.referenced_workflows) ? run.referenced_workflows : []).filter((item: unknown) => {
      if (!record(item) || item.sha !== expected.workflowSha) return false;
      const selectedPath = item.path === expected.workflowRef || item.path === `${workflowPath}@${shortRef}`;
      const resolvedPath = item.path === `${workflowPath}@${expected.workflowSha}`;
      if (!selectedPath && !resolvedPath || Object.hasOwn(item,'ref') && item.ref !== selectedRef ||
          resolvedPath && selectedRef !== expected.workflowSha && item.ref !== selectedRef) return false;
      return !Object.hasOwn(item,'repository') || record(item.repository) && item.repository.full_name === expected.workflowRepository;
    });
    if (!direct && selected.length !== 1) fail();
    const jobs: unknown = JSON.parse(await body(await api('jobs'),131_072));
    if (!record(jobs) || !Array.isArray(jobs.jobs) || jobs.jobs.length > 100 || jobs.total_count !== jobs.jobs.length) fail();
    const candidates = jobs.jobs.filter((job: unknown) => record(job) && Array.isArray(job.steps) &&
      job.steps.some((step: unknown) => record(step) && step.name === CODEX_PASS_STEP));
    if (candidates.length !== 1 || !record(candidates[0])) fail();
    const job = candidates[0];
    if (!Number.isSafeInteger(job.id) || Number(job.id) < 1 || String(job.run_id) !== expected.runId ||
        String(job.run_attempt) !== expected.runAttempt || job.head_sha !== expected.headSha || job.status !== 'completed' || job.conclusion !== 'success' ||
        !Array.isArray(job.steps)) fail();
    const steps = job.steps.filter((s: unknown) => record(s) && s.name === CODEX_PASS_STEP);
    if (steps.length !== 1 || steps[0].status !== 'completed' || steps[0].conclusion !== 'success') fail();
    let response = await api('log',Number(job.id));
    if (response.status === 302) {
      const url = new URL(response.headers.get('location') || '');
      if (url.protocol !== 'https:' || url.username || url.password || url.hash || url.port ||
          !/^[a-z0-9-]+\.blob\.core\.windows\.net$/.test(url.hostname) || ++requests > 4) fail();
      response = await wait(fetchImpl(url,{redirect:'manual',signal:controller.signal,headers:{}}));
    }
    return parsePassLog(await body(response,MAX_CODEX_LOG_BYTES),expected);
  } catch { fail(); } finally { clearTimeout(timer); controller.abort(); }
}
