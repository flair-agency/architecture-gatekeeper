// Select protected-base context for the self repository's ordinary PR producer.
// This binds a review subject; it does not authorize or establish acceptance.

export type SelfPrContext = Readonly<{
  status: 'SELECTED_SELF_PR_CONTEXT'; repository: 'flair-agency/architecture-gatekeeper';
  repositoryId: 1379218762; prNumber: string; baseSha: string; headSha: string; subjectSha: string;
}>;
export type SelfPrContextResult = SelfPrContext | Readonly<{ status: 'INCOMPLETE'; reason: string }>;
export type SelfPrContextResponse = {
  status: unknown; redirected?: unknown; url?: unknown; headers?: { get?: (name: string) => unknown } | null;
  body?: { getReader: () => { read: () => Awaitable<{ done?: unknown; value?: unknown }>; cancel: () => Awaitable<unknown> } } | null;
};
export type Awaitable<T> = T | PromiseLike<T>;
export type SelfPrContextInput = Readonly<{
  eventName: unknown; event: unknown; sourceBaseSha: unknown; runtimeBaseSha: unknown; token: unknown;
  fetchImpl?: (url: string, options: { method: 'GET'; headers: Record<string, string>; redirect: 'manual'; signal: AbortSignal }) => Awaitable<SelfPrContextResponse>;
}>;

const REPOSITORY = 'flair-agency/architecture-gatekeeper' as const;
const REPOSITORY_ID = 1379218762 as const;
const API = 'https://api.github.com';
const SHA = /^[a-f0-9]{40}$/;
const ACTIONS = new Set(['opened', 'synchronize', 'reopened', 'ready_for_review', 'edited']);
const MAX_RESPONSE_BYTES = 64 * 1024;
const MAX_REQUEST_MS = 10_000;
const MAX_TOTAL_MS = 25_000;
function fail(message: string): never { throw new Error(`Self PR context: ${message}`); }
type EventView = { action?: unknown; repository?: { full_name?: unknown; id?: unknown }; pull_request?: {
  title?: unknown; body?: unknown;
  number?: unknown; draft?: unknown; state?: unknown; base?: { ref?: unknown; sha?: unknown; repo?: { full_name?: unknown; id?: unknown } };
  head?: { sha?: unknown; repo?: { full_name?: unknown; id?: unknown } };
} };
type MainRefView = { ref?: unknown; object?: { sha?: unknown; type?: unknown } };
type CommitView = { sha?: unknown; parents?: unknown };
type PullRequestView = { number?: unknown; state?: unknown; draft?: unknown; merge_commit_sha?: unknown;
  title?: unknown; body?: unknown;
  base?: { ref?: unknown; sha?: unknown; repo?: { full_name?: unknown; id?: unknown } };
  head?: { sha?: unknown; repo?: { full_name?: unknown; id?: unknown } } };

function validId(value: unknown): boolean { return Number.isSafeInteger(value) && value === REPOSITORY_ID; }
function isObject(value: unknown): value is Record<string, unknown> { return !!value && typeof value === 'object' && !Array.isArray(value); }
function purpose(pr: { title?: unknown; body?: unknown }): string {
  if (typeof pr.title !== 'string' || !pr.title.trim() || (pr.body !== null && typeof pr.body !== 'string')) fail('PR purpose is missing or malformed.');
  const value = `${pr.title}\n\n${pr.body ?? ''}`;
  if (value.includes('\0') || Buffer.byteLength(value) > 16_384) fail('PR purpose exceeds the amendment input bound.');
  return value;
}
function validateEvent(value: unknown) {
  if (!isObject(value)) fail('event payload is missing or malformed.');
  const event = value as EventView;
  if (!event.repository || event.repository.full_name !== REPOSITORY || !validId(event.repository.id)) fail('event repository is not the fixed self repository.');
  const pr = event.pull_request;
  if (!pr || !Number.isSafeInteger(pr.number) || (pr.number as number) < 1 ||
      pr.draft !== false || pr.state !== 'open' || pr.base?.ref !== 'main' ||
      pr.base.repo?.full_name !== REPOSITORY || !validId(pr.base.repo.id) ||
      pr.head?.repo?.full_name !== REPOSITORY || !validId(pr.head.repo.id) ||
      !SHA.test(pr.base.sha as string) || !SHA.test(pr.head.sha as string) || pr.base.sha === pr.head.sha) fail('event PR is closed, draft, forked, or malformed.');
  return { pr, number: String(pr.number) };
}

/** Resolve protected main, the live PR and its current test-merge ref using five bounded fixed-endpoint reads. */
export async function selectSelfPrContext(input: SelfPrContextInput): Promise<SelfPrContextResult> {
  try {
    if (!input || typeof input !== 'object' || input.eventName !== 'pull_request_target' ||
        typeof input.token !== 'string' || input.token.length < 1 || input.token.length > 4_096 ||
        /[\u0000\r\n]/.test(input.token) || !SHA.test(input.sourceBaseSha as string) || !SHA.test(input.runtimeBaseSha as string)) fail('trusted producer bindings or invocation are invalid.');
    const { pr: eventPr, number } = validateEvent(input.event);
    const reviewedPurpose = purpose(eventPr);
    const event = input.event as EventView;
    if (typeof event.action !== 'string' || !ACTIONS.has(event.action)) fail('event action is not an admitted open-PR action.');
    const fetchImpl = input.fetchImpl ?? fetch;
    if (typeof fetchImpl !== 'function') fail('GitHub API reader is unavailable.');
    const headers = { accept: 'application/vnd.github+json', authorization: `Bearer ${input.token}`, 'x-github-api-version': '2022-11-28' };
    const controller = new AbortController();
    const deadline = Date.now() + MAX_TOTAL_MS;
    const totalTimer = setTimeout(() => controller.abort(), MAX_TOTAL_MS);
    const get = async (path: string): Promise<unknown> => {
      const url = `${API}${path}`;
      const remaining = deadline - Date.now();
      if (remaining <= 0) fail('GitHub API request deadline exceeded.');
      const controllerRequest = new AbortController();
      const signal = AbortSignal.any([controller.signal, controllerRequest.signal]);
      let rejectDeadline!: (error: Error) => void;
      const timeout = new Promise<never>((_, reject) => { rejectDeadline = reject; });
      const timer = setTimeout(() => { controllerRequest.abort(); rejectDeadline(new Error('GitHub API request timed out.')); }, Math.min(MAX_REQUEST_MS, remaining));
      const withinTimeout = <T,>(value: Awaitable<T>): Promise<T> => Promise.race([Promise.resolve(value), timeout]);
      let reader: ReturnType<NonNullable<SelfPrContextResponse['body']>['getReader']> | undefined;
      let complete = false;
      try {
        const response = await withinTimeout(fetchImpl(url, { method: 'GET', headers, redirect: 'manual', signal }));
        if (!response || response.status !== 200 || response.redirected !== false || response.url !== url || !response.body) fail('GitHub API response is redirected, malformed, or unavailable.');
        const declared = response.headers?.get?.('content-length');
        if (declared !== null && declared !== undefined && (typeof declared !== 'string' || !/^\d+$/.test(declared) || Number(declared) > MAX_RESPONSE_BYTES)) fail('GitHub API response exceeds its byte bound.');
        reader = response.body.getReader();
        const chunks: Uint8Array[] = [];
        let bytes = 0;
        while (true) {
          const part = await withinTimeout(reader.read());
          if (part.done === true) break;
          if (!(part.value instanceof Uint8Array) || part.value.byteLength === 0) fail('GitHub API response body is malformed.');
          bytes += part.value.byteLength;
          if (bytes > MAX_RESPONSE_BYTES) fail('GitHub API response exceeds its byte bound.');
          chunks.push(part.value);
        }
        const decoded = new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks, bytes));
        complete = true;
        return JSON.parse(decoded) as unknown;
      } finally {
        clearTimeout(timer);
        if (reader && !complete) { try { void Promise.resolve(reader.cancel()).catch(() => {}); } catch { /* Cleanup cannot extend the bounded read. */ } }
      }
    };
    try {
      const [mainRefValue, livePrValue] = await Promise.all([
        get('/repos/flair-agency/architecture-gatekeeper/git/ref/heads/main'),
        get(`/repos/flair-agency/architecture-gatekeeper/pulls/${encodeURIComponent(number)}`),
      ]);
      if (!isObject(mainRefValue) || !isObject(livePrValue)) fail('GitHub API returned malformed main or PR metadata.');
      const mainRef = mainRefValue as MainRefView;
      const mainSha = mainRef.object?.sha;
      if (mainRef.ref !== 'refs/heads/main' || mainRef.object?.type !== 'commit' || !SHA.test(mainSha as string) ||
          mainSha !== input.sourceBaseSha || mainSha !== input.runtimeBaseSha) fail('protected source/runtime binding does not match current main.');
      const lp = livePrValue as PullRequestView;
      if (purpose(lp) !== reviewedPurpose) fail('live PR purpose differs from the reviewed event.');
      if (String(lp.number) !== number || lp.state !== 'open' || lp.draft !== false || lp.base?.ref !== 'main' ||
          lp.base?.repo?.full_name !== REPOSITORY || !validId(lp.base.repo.id) || lp.head?.repo?.full_name !== REPOSITORY || !validId(lp.head.repo.id) ||
          lp.base?.sha !== mainSha || lp.base.sha !== eventPr.base?.sha || lp.head?.sha !== eventPr.head?.sha || !SHA.test(lp.merge_commit_sha as string)) fail('live PR does not match exact same-repository event tuple and current main.');
      // The commits endpoint resolves GitHub's pseudo-ref directly; a Git refs API lookup is unsupported for refs/pull/*.
      const mergeRef = `refs/pull/${number}/merge`;
      const commitValue = await get(`/repos/flair-agency/architecture-gatekeeper/commits/${mergeRef}`);
      if (!isObject(commitValue)) fail('fresh test-merge ref is missing or malformed.');
      const commit = commitValue as CommitView;
      const subjectSha = commit.sha;
      const parents = commit.parents;
      if (!SHA.test(subjectSha as string) || subjectSha !== lp.merge_commit_sha || subjectSha === mainSha || subjectSha === lp.head?.sha ||
          !Array.isArray(parents) || parents.length !== 2 || !isObject(parents[0]) || !isObject(parents[1]) ||
          parents[0].sha !== mainSha || parents[1].sha !== lp.head?.sha) fail('test-merge commit does not have exact current base/head parents.');
      const [finalMainValue, finalPrValue] = await Promise.all([
        get('/repos/flair-agency/architecture-gatekeeper/git/ref/heads/main'),
        get(`/repos/flair-agency/architecture-gatekeeper/pulls/${encodeURIComponent(number)}`),
      ]);
      if (!isObject(finalMainValue) || !isObject(finalPrValue)) fail('final GitHub API readback is malformed.');
      const finalMain = finalMainValue as MainRefView;
      const finalPr = finalPrValue as PullRequestView;
      if (purpose(finalPr) !== reviewedPurpose) fail('PR purpose changed during context selection.');
      if (finalMain.ref !== 'refs/heads/main' || finalMain.object?.type !== 'commit' || finalMain.object?.sha !== mainSha ||
          String(finalPr.number) !== number || finalPr.state !== 'open' || finalPr.draft !== false || finalPr.base?.ref !== 'main' ||
          finalPr.base?.repo?.full_name !== REPOSITORY || !validId(finalPr.base?.repo?.id) ||
          finalPr.head?.repo?.full_name !== REPOSITORY || !validId(finalPr.head?.repo?.id) ||
          finalPr.base?.sha !== mainSha || finalPr.head?.sha !== lp.head?.sha || finalPr.merge_commit_sha !== subjectSha) {
        fail('protected main or live PR changed during context selection.');
      }
      return Object.freeze({ status: 'SELECTED_SELF_PR_CONTEXT', repository: REPOSITORY, repositoryId: REPOSITORY_ID,
        prNumber: number, baseSha: mainSha as string, headSha: lp.head.sha as string, subjectSha: subjectSha as string });
    } finally {
      clearTimeout(totalTimer);
      controller.abort();
    }
  } catch (error) {
    return Object.freeze({ status: 'INCOMPLETE', reason: error instanceof Error ? error.message : 'Self PR context: selection failed.' });
  }
}
