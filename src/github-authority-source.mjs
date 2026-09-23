import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { TextDecoder } from 'node:util';

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
const utf8 = new TextDecoder('utf-8', { fatal: true });

function fail() { throw new Error('GitHub authority source: source could not be verified.'); }
function shaOfBlob(content) {
  return createHash('sha1').update(`blob ${content.length}\0`).update(content).digest('hex');
}
function validPath(path) {
  return typeof path === 'string' && path.length <= 240 && path.endsWith('.md') &&
    path.split('/').length <= MAX_PATH_SEGMENTS &&
    path.split('/').every(segment => segment && segment !== '.' && segment !== '..' && SEGMENT.test(segment));
}

async function boundedJson(fetchImpl, url, token, maxResponseBytes, timeoutMs) {
  const controller = new AbortController();
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => { controller.abort(); reject(new Error('request timed out')); }, timeoutMs);
  });
  const withinTimeout = promise => Promise.race([promise, timeout]);
  let reader;
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
        (!/^\d+$/.test(declaredLength) || Number(declaredLength) > maxResponseBytes)) fail();
    reader = response.body.getReader();
    const chunks = [];
    let length = 0;
    while (true) {
      const { done, value } = await withinTimeout(reader.read());
      if (done) break;
      if (!(value instanceof Uint8Array)) fail();
      length += value.byteLength;
      if (length > maxResponseBytes) fail();
      chunks.push(value);
    }
    const parsed = JSON.parse(utf8.decode(Buffer.concat(chunks, length)));
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

function decodeBlob(blob, requestedSha, maxBytes) {
  if (!blob || blob.sha !== requestedSha || blob.encoding !== 'base64' ||
      !Number.isSafeInteger(blob.size) || blob.size < 1 || blob.size > maxBytes ||
      typeof blob.content !== 'string') fail();
  const normalized = blob.content.replace(/\r?\n/g, '');
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(normalized)) fail();
  const content = Buffer.from(normalized, 'base64');
  if (content.length !== blob.size || content.toString('base64') !== normalized || shaOfBlob(content) !== requestedSha) fail();
  return content;
}

/** Create a credential-confined fetchExternal adapter for immutable GitHub.com Git objects. */
export function createGitHubAuthoritySource({ token, fetchImpl = globalThis.fetch, timeoutMs = 10_000, memberTimeoutMs = 30_000 } = {}) {
  if (typeof token !== 'string' || !token || token.length > 4_096 || /[\r\n]/.test(token) ||
      typeof fetchImpl !== 'function' || !Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > MAX_TIMEOUT_MS ||
      !Number.isSafeInteger(memberTimeoutMs) || memberTimeoutMs < 1 || memberTimeoutMs > MAX_MEMBER_TIMEOUT_MS) fail();
  return async function fetchExternal({ repository, revision, path, maxBytes }) {
    if (typeof repository !== 'string' || !REPOSITORY.test(repository) || repository.endsWith('.git') || repository.includes('..') ||
        typeof revision !== 'string' || !HEX40.test(revision) || !validPath(path) ||
        !Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > MAX_FILE_BYTES) fail();

    const resolvedCommit = revision.toLowerCase();
    const root = `https://api.github.com/repos/${repository}`;
    const deadline = performance.now() + memberTimeoutMs;
    let requests = 0;
    const get = (suffix, limit) => {
      if (++requests > MAX_REQUESTS_PER_MEMBER) fail();
      const remaining = Math.ceil(deadline - performance.now());
      if (remaining <= 0) fail();
      return boundedJson(fetchImpl, `${root}${suffix}`, token, limit, Math.min(timeoutMs, remaining));
    };
    const metadata = await get('', MAX_METADATA_BYTES);
    if (!metadata || metadata.full_name !== repository) fail();

    const commit = await get(`/git/commits/${resolvedCommit}`, MAX_METADATA_BYTES);
    if (!commit || commit.sha !== resolvedCommit || !commit.tree || !HEX40.test(commit.tree.sha)) fail();

    let treeSha = commit.tree.sha.toLowerCase();
    const segments = path.split('/');
    let blobSha;
    for (let i = 0; i < segments.length; i++) {
      const tree = await get(`/git/trees/${treeSha}`, MAX_TREE_BYTES);
      if (!tree || tree.sha !== treeSha || tree.truncated !== false || !Array.isArray(tree.tree)) fail();
      const matches = tree.tree.filter(entry => entry && entry.path === segments[i]);
      if (matches.length !== 1 || !HEX40.test(matches[0].sha)) fail();
      const entry = matches[0];
      if (i < segments.length - 1) {
        if (entry.mode !== '040000' || entry.type !== 'tree') fail();
        treeSha = entry.sha.toLowerCase();
      } else {
        if (!['100644', '100755'].includes(entry.mode) || entry.type !== 'blob') fail();
        if (entry.size !== undefined && (!Number.isSafeInteger(entry.size) || entry.size < 1 || entry.size > maxBytes)) fail();
        blobSha = entry.sha.toLowerCase();
      }
    }

    const blob = await get(`/git/blobs/${blobSha}`, Math.min(MAX_FILE_BYTES, maxBytes) * 4 / 3 + 16_384);
    const content = decodeBlob(blob, blobSha, maxBytes);
    if (performance.now() > deadline) fail();
    return { repository, resolvedCommit, path, type: 'file', content };
  };
}
