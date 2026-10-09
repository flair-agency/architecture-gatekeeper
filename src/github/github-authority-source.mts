import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { TextDecoder } from 'node:util';

// External JSON stays unknown. Local operation casts preserve the original
// reads, coercions and failures; they are not validation or provenance.
export type GitHubAuthorityAwaitable<T> = T | PromiseLike<T>;

export type GitHubAuthorityRequest = {
  repository: unknown;
  revision: unknown;
  path: unknown;
  maxBytes: unknown;
};

export type GitHubAuthorityResult = {
  repository: string;
  resolvedCommit: string;
  path: string;
  type: 'file';
  content: Buffer;
};

export type GitHubAuthoritySource = (request: GitHubAuthorityRequest) => Promise<GitHubAuthorityResult>;

export type GitHubAuthorityFetchResponse = {
  status: unknown;
  redirected?: unknown;
  url?: unknown;
  body?: GitHubAuthorityBody | null;
  headers?: { get?: (name: string) => unknown } | null;
};

export type GitHubAuthorityReader = {
  read: () => GitHubAuthorityAwaitable<{ done?: unknown; value?: unknown }>;
  cancel: () => GitHubAuthorityAwaitable<unknown>;
};

export type GitHubAuthorityBody = { getReader: () => GitHubAuthorityReader };

export type GitHubAuthorityFetchOptions = {
  method: 'GET';
  redirect: 'manual';
  signal?: AbortSignal;
  headers: {
    Accept: 'application/vnd.github+json';
    Authorization: string;
    'X-GitHub-Api-Version': '2022-11-28';
  };
};

export type GitHubAuthorityFetch = (
  url: string,
  options: GitHubAuthorityFetchOptions,
) => GitHubAuthorityAwaitable<GitHubAuthorityFetchResponse>;

export type GitHubAuthoritySourceOptions = {
  token?: unknown;
  fetchImpl?: GitHubAuthorityFetch;
  timeoutMs?: unknown;
  memberTimeoutMs?: unknown;
};

const HEX40 = /^[a-f0-9]{40}$/i;
const REPOSITORY = /^[A-Za-z0-9][A-Za-z0-9-]{0,38}\/[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/;
const SEGMENT = /^[A-Za-z0-9._-]+$/;
const MAX_FILE_BYTES = 1024 * 1024;
const MAX_METADATA_BYTES = 64 * 1024;
const MAX_TREE_BYTES = 2 * 1024 * 1024;
const MAX_TIMEOUT_MS = 30_000;
const MAX_MEMBER_TIMEOUT_MS = 30_000;
const MAX_PATH_SEGMENTS = 16;
const MAX_REQUESTS_PER_MEMBER = MAX_PATH_SEGMENTS + 3;
const BASE64_WRAP_WIDTH = 60;
const BLOB_JSON_OVERHEAD_BYTES = 16 * 1024;
const utf8 = new TextDecoder('utf-8', { fatal: true });

function fail(): never { throw new Error('GitHub authority source: source could not be verified.'); }
function shaOfBlob(content: Buffer): string {
  return createHash('sha1').update(`blob ${content.length}\0`).update(content).digest('hex');
}
function maxBase64LineBreaks(encodedLength: number): number {
  return Math.ceil(encodedLength / BASE64_WRAP_WIDTH) + 1;
}
function maxBlobResponseBytes(maxBytes: number): number {
  const encodedLength = 4 * Math.ceil(maxBytes / 3);
  // A JSON string escapes CRLF as four wire bytes per permitted line break.
  return encodedLength + 4 * maxBase64LineBreaks(encodedLength) + BLOB_JSON_OVERHEAD_BYTES;
}
function validPath(path: unknown): path is string {
  return typeof path === 'string' && path.length <= 240 && path.endsWith('.md') &&
    path.split('/').length <= MAX_PATH_SEGMENTS &&
    path.split('/').every(segment => segment && segment !== '.' && segment !== '..' && SEGMENT.test(segment));
}

async function boundedJson(fetchImpl: GitHubAuthorityFetch, url: string, token: string, maxResponseBytes: number, timeoutMs: number): Promise<unknown> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => { controller.abort(); reject(new Error('request timed out')); }, timeoutMs);
  });
  const withinTimeout = <T,>(promise: GitHubAuthorityAwaitable<T>): Promise<T> => Promise.race([promise, timeout]);
  let reader: GitHubAuthorityReader | undefined;
  let complete = false;
  try {
    const response = await withinTimeout(fetchImpl(url, {
      method: 'GET',
      redirect: 'manual',
      signal: controller.signal,
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
      },
    }));
    if (response.status !== 200 || response.redirected || (response.url && response.url !== url) || !response.body) fail();
    const declaredLength = response.headers?.get?.('content-length');
    if (declaredLength !== null && declaredLength !== undefined &&
        (!/^\d+$/.test(declaredLength as string) || Number(declaredLength) > maxResponseBytes)) fail();
    reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let length = 0;
    while (true) {
      const { done, value } = await withinTimeout(reader.read());
      if (done) break;
      if (!(value instanceof Uint8Array)) fail();
      length += value.byteLength;
      if (length > maxResponseBytes) fail();
      chunks.push(value);
    }
    const parsed: unknown = JSON.parse(utf8.decode(Buffer.concat(chunks, length)));
    complete = true;
    return parsed;
  } catch { fail(); }
  finally {
    clearTimeout(timer);
    if (reader && !complete) {
      try { Promise.resolve(reader.cancel()).catch(() => {}); } catch { /* Keep the verification error generic. */ }
    }
  }
}

function decodeBlob(blob: unknown, requestedSha: string, maxBytes: number): Buffer {
  if (!blob || (blob as { sha?: unknown }).sha !== requestedSha || (blob as { encoding?: unknown }).encoding !== 'base64' ||
      !Number.isSafeInteger((blob as { size?: unknown }).size) || (blob as { size: number }).size < 1 || (blob as { size: number }).size > maxBytes ||
      typeof (blob as { content?: unknown }).content !== 'string') fail();
  const normalized = (blob as { content: string }).content.replace(/\r?\n/g, '');
  if (((blob as { content: string }).content.match(/\n/g) ?? []).length > maxBase64LineBreaks(normalized.length)) fail();
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(normalized)) fail();
  const content = Buffer.from(normalized, 'base64');
  if (content.length !== (blob as { size: number }).size || content.toString('base64') !== normalized || shaOfBlob(content) !== requestedSha) fail();
  return content;
}

/** Create a credential-confined fetchExternal adapter for immutable GitHub.com Git objects. */
export function createGitHubAuthoritySource({ token, fetchImpl = globalThis.fetch, timeoutMs = 10_000, memberTimeoutMs = 30_000 }: GitHubAuthoritySourceOptions = {}): GitHubAuthoritySource {
  if (typeof token !== 'string' || !token || token.length > 4_096 || /[\r\n]/.test(token) ||
      typeof fetchImpl !== 'function' || !Number.isSafeInteger(timeoutMs) || (timeoutMs as number) < 1 || (timeoutMs as number) > MAX_TIMEOUT_MS ||
      !Number.isSafeInteger(memberTimeoutMs) || (memberTimeoutMs as number) < 1 || (memberTimeoutMs as number) > MAX_MEMBER_TIMEOUT_MS) fail();
  return async function fetchExternal({ repository, revision, path, maxBytes }) {
    if (typeof repository !== 'string' || !REPOSITORY.test(repository) || repository.endsWith('.git') || repository.includes('..') ||
        typeof revision !== 'string' || !HEX40.test(revision) || !validPath(path) ||
        !Number.isSafeInteger(maxBytes) || (maxBytes as number) < 1 || (maxBytes as number) > MAX_FILE_BYTES) fail();

    const resolvedCommit = revision.toLowerCase();
    const root = `https://api.github.com/repos/${repository}`;
    const deadline = performance.now() + (memberTimeoutMs as number);
    let requests = 0;
    const get = (suffix: string, limit: number): Promise<unknown> => {
      if (++requests > MAX_REQUESTS_PER_MEMBER) fail();
      const remaining = Math.ceil(deadline - performance.now());
      if (remaining <= 0) fail();
      return boundedJson(fetchImpl as GitHubAuthorityFetch, `${root}${suffix}`, token, limit, Math.min(timeoutMs as number, remaining));
    };
    const metadata = await get('', MAX_METADATA_BYTES);
    if (!metadata || (metadata as { full_name?: unknown }).full_name !== repository) fail();

    const commit = await get(`/git/commits/${resolvedCommit}`, MAX_METADATA_BYTES);
    if (!commit || (commit as { sha?: unknown }).sha !== resolvedCommit || !(commit as { tree?: unknown }).tree ||
        !HEX40.test(((commit as { tree: { sha: unknown } }).tree).sha as string)) fail();

    let treeSha = (((commit as { tree: { sha: unknown } }).tree).sha as string).toLowerCase();
    const segments = path.split('/');
    let blobSha: string | undefined;
    for (let i = 0; i < segments.length; i++) {
      const tree = await get(`/git/trees/${treeSha}`, MAX_TREE_BYTES);
      if (!tree || (tree as { sha?: unknown }).sha !== treeSha || (tree as { truncated?: unknown }).truncated !== false || !Array.isArray((tree as { tree?: unknown }).tree)) fail();
      const matches = ((tree as { tree: unknown[] }).tree).filter(entry => entry && (entry as { path?: unknown }).path === segments[i]);
      if (matches.length !== 1 || !HEX40.test((matches[0] as { sha: string }).sha)) fail();
      const entry = matches[0] as { sha: string; mode?: unknown; type?: unknown; size?: unknown };
      if (i < segments.length - 1) {
        if (entry.mode !== '040000' || entry.type !== 'tree') fail();
        treeSha = entry.sha.toLowerCase();
      } else {
        if (!['100644', '100755'].includes(entry.mode as string) || entry.type !== 'blob') fail();
        if (entry.size !== undefined && (!Number.isSafeInteger(entry.size) || (entry.size as number) < 1 || (entry.size as number) > (maxBytes as number))) fail();
        blobSha = entry.sha.toLowerCase();
      }
    }

    const blob = await get(`/git/blobs/${blobSha}`, maxBlobResponseBytes(maxBytes as number));
    const content = decodeBlob(blob, blobSha as string, maxBytes as number);
    if (performance.now() > deadline) fail();
    return { repository, resolvedCommit, path, type: 'file', content };
  };
}
