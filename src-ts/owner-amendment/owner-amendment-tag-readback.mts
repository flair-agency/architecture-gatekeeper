import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TextDecoder } from 'node:util';

const API = 'https://api.github.com';
const decoder = new TextDecoder('utf-8', { fatal: true });
const SHA = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/;
const fail: (message: string) => never = message => { throw new Error(`Owner amendment tag readback: ${message}`); };

export type OwnerAmendmentTagReadbackInput = {
  repository: string;
  bSha: string;
  tagNamespace: string;
  tagRef: string;
  rulesetId: number;
  token: string;
  fetchImpl?: OwnerAmendmentTagFetch;
  readTagObject?: (repository: string, tagRef: string, tagName: string, objectOid: unknown, token: string) => Buffer | Promise<Buffer>;
};

export type OwnerAmendmentTagReadback = ReadbackResult;

export type OwnerAmendmentTagFetchResponse = {
  ok?: unknown;
  status?: unknown;
  json: () => Promise<unknown>;
};

export type OwnerAmendmentTagFetch = (
  url: string,
  options: { headers: Record<string, string>; redirect: 'error' },
) => Promise<OwnerAmendmentTagFetchResponse>;

type ValidatedInput = { owner: string; repo: string; tagName: string };
type TagResult = {
  readonly ref: string;
  readonly objectOid: unknown;
  readonly objectBytes: Buffer;
};
type ReadbackResult = {
  readonly status: 'READ_BACK_OWNER_AMENDMENT_TAG';
  readonly repository: string;
  readonly bSha: string;
  readonly tagRef: string;
  readonly tag: Readonly<TagResult>;
  readonly observedTagRefOid: unknown;
  readonly rulesetReadback: unknown;
  readonly refReadback: unknown;
};

function validateInput({ repository, bSha, tagNamespace, tagRef, rulesetId, token }: OwnerAmendmentTagReadbackInput): ValidatedInput {
  if (typeof repository !== 'string' || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) fail('repository identity is invalid.');
  if (!SHA.test(bSha ?? '')) fail('exact B commit SHA is invalid.');
  if (typeof tagNamespace !== 'string' || !/^refs\/tags\/[A-Za-z0-9._/-]+$/.test(tagNamespace) || tagNamespace.endsWith('/') || tagNamespace.includes('..')) fail('tag namespace is invalid.');
  if (tagRef !== `${tagNamespace}/${bSha}`) fail('tag ref does not identify exact B.');
  if (!Number.isSafeInteger(rulesetId) || rulesetId < 1) fail('active tag ruleset ID is invalid.');
  if (typeof token !== 'string' || !token.trim()) fail('GitHub token is required.');
  const [owner, repo] = repository.split('/');
  return { owner, repo, tagName: tagRef.slice('refs/tags/'.length) };
}

async function getJson(fetchImpl: OwnerAmendmentTagFetch, url: string, token: string): Promise<unknown> {
  const response = await fetchImpl(url, { headers: { accept: 'application/vnd.github+json', authorization: `Bearer ${token}`, 'x-github-api-version': '2022-11-28' }, redirect: 'error' });
  if (!response?.ok) fail(`GitHub API read failed with HTTP ${response?.status ?? 'unknown'}.`);
  try { return await response.json(); } catch { fail('GitHub API returned invalid JSON.'); }
}

// These private property views preserve JavaScript reads, including repeated
// accessor reads. They are not runtime shape validation or trusted payload types.
function validateRuleset(value: unknown, rulesetId: number, tagNamespace: string): void {
  type JsonView = { id?: unknown; target?: unknown; enforcement?: unknown; conditions?: { ref_name?: { include?: unknown; exclude?: unknown } }; rules?: unknown; bypass_actors?: unknown };
  const include = (value as JsonView | null | undefined)?.conditions?.ref_name?.include;
  const exclude = (value as JsonView | null | undefined)?.conditions?.ref_name?.exclude;
  const types = Array.isArray((value as JsonView | null | undefined)?.rules) ? ((value as JsonView).rules as { type?: unknown }[]).map(rule => rule?.type) : [];
  if ((value as JsonView | null | undefined)?.id !== rulesetId || (value as JsonView).target !== 'tag' || (value as JsonView).enforcement !== 'active' ||
      !Array.isArray(include) || !(include as unknown[]).includes(`${tagNamespace}/*`) || !Array.isArray(exclude) || (exclude as unknown[]).length ||
      !types.includes('update') || !types.includes('deletion') || !Array.isArray((value as JsonView).bypass_actors) || ((value as JsonView).bypass_actors as unknown[]).length) {
    fail('selected active tag ruleset does not protect the namespace against update and deletion without bypass actors.');
  }
}

function validateRef(value: unknown, tagRef: string): unknown {
  type RefView = { ref?: unknown; object?: { type?: unknown; sha?: unknown } };
  if ((value as RefView | null | undefined)?.ref !== tagRef || (value as RefView).object?.type !== 'tag' || !SHA.test((((value as RefView).object?.sha) ?? '') as string)) fail('remote ref is missing or does not resolve to an annotated tag object.');
  return (value as RefView).object!.sha;
}

function readRawTagObject(repository: string, tagRef: string, tagName: string, objectOid: unknown, token: string): Buffer {
  const directory = mkdtempSync(join(tmpdir(), 'ag-owner-tag-'));
  const [owner, repo] = repository.split('/');
  const remote = `https://github.com/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}.git`;
  const auth = Buffer.from(`x-access-token:${token}`).toString('base64');
  const env = { ...process.env, GIT_CONFIG_COUNT: '2',
    GIT_CONFIG_KEY_0: 'http.extraheader', GIT_CONFIG_VALUE_0: `AUTHORIZATION: basic ${auth}`,
    GIT_CONFIG_KEY_1: 'http.followRedirects', GIT_CONFIG_VALUE_1: 'false' };
  try {
    execFileSync('git', ['init', '--bare', '--quiet', directory], { env, stdio: 'ignore' });
    execFileSync('git', ['-C', directory, 'fetch', '--quiet', '--no-tags', '--force', remote, `+${tagRef}:refs/tags/${tagName}`], { env, stdio: 'ignore', timeout: 30_000 });
    const fetched = execFileSync('git', ['-C', directory, 'rev-parse', '--verify', `refs/tags/${tagName}`], { env, encoding: 'utf8' }).trim();
    if (fetched !== objectOid) fail('raw Git fetch does not match the API-observed annotated tag OID.');
    // The fetched string equality above establishes the OID for these Git calls.
    const type = execFileSync('git', ['-C', directory, 'cat-file', '-t', objectOid as string], { env, encoding: 'utf8' }).trim();
    if (type !== 'tag') fail('remote object is not an annotated tag.');
    return execFileSync('git', ['-C', directory, 'cat-file', 'tag', objectOid as string], { env, maxBuffer: 300_000 });
  } catch (error: unknown) {
    type ErrorView = { message?: { startsWith(prefix: string): boolean } };
    if ((error as ErrorView | null | undefined)?.message?.startsWith('Owner amendment tag readback:')) throw error;
    fail('raw tag object could not be fetched and read from Git.');
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

function validateRawObject(bytes: Buffer, { bSha, tagName, objectOid }: { bSha: string; tagName: string; objectOid: unknown }): void {
  if (!Buffer.isBuffer(bytes) || !bytes.length || bytes.length > 262_144) fail('raw annotated tag object is missing or oversized.');
  // Preserve the original property read before the strict hash equality check.
  const algorithm = (objectOid as { length: number }).length === 40 ? 'sha1' : 'sha256';
  const computed = createHash(algorithm).update(Buffer.from(`tag ${bytes.length}\0`)).update(bytes).digest('hex');
  if (computed !== objectOid) fail('raw annotated tag bytes do not match the observed object OID.');
  let text: string;
  try { text = decoder.decode(bytes); } catch { fail('raw annotated tag object is not valid UTF-8.'); }
  const split = text.indexOf('\n\n');
  if (split < 0) fail('annotated tag object has malformed headers or no message.');
  const headers = text.slice(0, split).split('\n');
  if (headers.length !== 4 || headers[0] !== `object ${bSha}` || headers[1] !== 'type commit' || headers[2] !== `tag ${tagName}` ||
      !/^tagger [^\n<>]+ <[^\n<>]+> [0-9]+ [+-][0-9]{4}$/.test(headers[3])) fail('annotated tag headers do not bind exact B and ref.');
  const message = text.slice(split + 2);
  if (!message.endsWith('\n') || message.slice(0, -1).includes('\n')) fail('tag message must be one newline-terminated JSON line.');
  try { JSON.parse(message.slice(0, -1)); } catch { fail('tag message is malformed JSON.'); }
}

/**
 * Read the exact protected annotated tag for merge-group validation. GitHub
 * REST supplies the live ref and ruleset; a temporary bare repository fetches
 * the ref and `cat-file` supplies its original object bytes. This is a
 * readback only: it creates no remote refs and makes no acceptance claim.
 */
// The default cast preserves the original no-argument runtime validation error;
// it does not supply valid input or bypass validation.
export async function readOwnerAmendmentTagForMergeGroup({ repository, bSha, tagNamespace, tagRef, rulesetId, token, fetchImpl = fetch, readTagObject = readRawTagObject }: OwnerAmendmentTagReadbackInput = {} as OwnerAmendmentTagReadbackInput): Promise<ReadbackResult> {
  if (typeof fetchImpl !== 'function' || typeof readTagObject !== 'function') fail('read dependencies are invalid.');
  const { owner, repo, tagName } = validateInput({ repository, bSha, tagNamespace, tagRef, rulesetId, token });
  const base = `${API}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
  const refPath = tagName.split('/').map(encodeURIComponent).join('/');
  const ruleset = await getJson(fetchImpl, `${base}/rulesets/${rulesetId}`, token);
  validateRuleset(ruleset, rulesetId, tagNamespace);
  const firstRef = await getJson(fetchImpl, `${base}/git/ref/tags/${refPath}`, token);
  const objectOid = validateRef(firstRef, tagRef);
  const objectBytes = await readTagObject(repository, tagRef, tagName, objectOid, token);
  validateRawObject(objectBytes, { bSha, tagName, objectOid });
  const finalRef = await getJson(fetchImpl, `${base}/git/ref/tags/${refPath}`, token);
  const finalOid = validateRef(finalRef, tagRef);
  if (finalOid !== objectOid) fail('tag ref changed during readback.');
  return Object.freeze({ status: 'READ_BACK_OWNER_AMENDMENT_TAG', repository, bSha, tagRef,
    tag: Object.freeze({ ref: tagRef, objectOid, objectBytes }), observedTagRefOid: finalOid,
    rulesetReadback: ruleset, refReadback: finalRef });
}
