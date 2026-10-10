const API = 'https://api.github.com';
const SHA = /^[a-f0-9]{40}$/;

function fail(message: string): never {
  throw new Error(`Owner amendment tag transport: ${message}`);
}

function record(value: unknown, label: string): asserts value is object {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label} is invalid.`);
}

function parseRepository(repository: string): string[] {
  if (typeof repository !== 'string' || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) {
    fail('trusted repository must be owner/name.');
  }
  return repository.split('/');
}

type Tagger = Readonly<{ name: string; email: string; date: string }>;
type OwnerAmendmentTagInput = Readonly<{
  repository: string;
  tagRef: string;
  bSha: string;
  tagMessage: string;
  tagNamespace: string;
  rulesetId: number;
  token: string;
  tagger: Tagger;
}>;
type RequestOptions = Readonly<{ token: string; method?: string; body?: unknown; allowNotFound?: boolean }>;
export type OwnerAmendmentTagResponse = Readonly<{
  ok: unknown;
  status: unknown;
  json(): unknown | PromiseLike<unknown>;
}>;
export type OwnerAmendmentTagRequestOptions = Readonly<{
  method: string;
  headers: Readonly<{
    accept: string;
    authorization: string;
    'x-github-api-version': string;
    'content-type'?: string;
  }>;
  body?: string;
}>;
export type OwnerAmendmentTagFetch = (
  input: string,
  init: OwnerAmendmentTagRequestOptions,
) => OwnerAmendmentTagResponse | PromiseLike<OwnerAmendmentTagResponse>;
type CreateAndReadOwnerAmendmentTagInput = OwnerAmendmentTagInput & Readonly<{
  rulesetReadback?: unknown;
  fetchImpl?: OwnerAmendmentTagFetch;
}>;
type OwnerAmendmentTagResult = Readonly<{
  repository: string;
  tagRef: string;
  bSha: string;
  rulesetReadback: unknown;
  refReadback: unknown;
  tagReadback: unknown;
}>;
type RulesetView = {
  conditions?: { ref_name?: { include?: unknown; exclude?: unknown } };
  rules?: unknown;
  id?: unknown;
  target?: unknown;
  enforcement?: unknown;
  bypass_actors?: unknown;
};
type RefView = { ref?: unknown; object?: { sha?: unknown; type?: unknown } };
type TagView = { sha?: unknown; tag?: unknown; message?: unknown; object?: { sha?: unknown; type?: unknown } };
export type CreateAndReadOwnerAmendmentTagResult =
  | (OwnerAmendmentTagResult & Readonly<{ transportStatus: 'ALREADY_PRESENT_AND_READ_BACK' }>)
  | (OwnerAmendmentTagResult & Readonly<{ transportStatus: 'CREATED_AND_READ_BACK' }>);

function validateInput({ repository, tagRef, bSha, tagMessage, tagNamespace, rulesetId, token, tagger }: OwnerAmendmentTagInput) {
  parseRepository(repository);
  if (!SHA.test(bSha ?? '')) fail('exact B commit SHA is invalid.');
  if (typeof tagNamespace !== 'string' || !/^refs\/tags\/[A-Za-z0-9._/-]+$/.test(tagNamespace) ||
      tagNamespace.endsWith('/') || tagNamespace.includes('..')) fail('protected tag namespace is invalid.');
  const expectedRef = `${tagNamespace}/${bSha}`;
  if (tagRef !== expectedRef) fail('tag ref does not identify exact B in the selected namespace.');
  if (typeof tagMessage !== 'string' || !tagMessage.endsWith('\n') || Buffer.byteLength(tagMessage, 'utf8') > 262_144) {
    fail('prevalidated canonical tag message is absent or oversized.');
  }
  if (!Number.isSafeInteger(rulesetId) || rulesetId < 1) fail('selected tag ruleset ID is invalid.');
  if (typeof token !== 'string' || !token.trim()) fail('GitHub token is required.');
  record(tagger, 'tagger');
  if (typeof tagger.name !== 'string' || !tagger.name.trim() || tagger.name.length > 100 ||
      typeof tagger.email !== 'string' || !/^[^\s<>@]+@[^\s<>@]+$/.test(tagger.email) || tagger.email.length > 254 ||
      typeof tagger.date !== 'string' || !Number.isFinite(Date.parse(tagger.date)) || new Date(tagger.date).toISOString() !== tagger.date) {
    fail('tagger metadata is invalid.');
  }
  return { owner: repository.split('/')[0], repo: repository.split('/')[1], tagName: tagRef.slice('refs/tags/'.length) };
}

async function requestJson(fetchImpl: OwnerAmendmentTagFetch, url: string, { token, method = 'GET', body, allowNotFound = false }: RequestOptions): Promise<unknown> {
  const response = await fetchImpl(url, {
    method,
    headers: {
      accept: 'application/vnd.github+json',
      authorization: `Bearer ${token}`,
      'x-github-api-version': '2022-11-28',
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (allowNotFound && (response as OwnerAmendmentTagResponse).status === 404) return null;
  if (!(response as OwnerAmendmentTagResponse).ok) fail(`GitHub API ${method} ${new URL(url).pathname} returned HTTP ${(response as OwnerAmendmentTagResponse).status}.`);
  try { return await (response as OwnerAmendmentTagResponse).json(); } catch { fail('GitHub API returned invalid JSON.'); }
}

function validateRuleset(ruleset: unknown, { rulesetId, tagNamespace }: Readonly<{ rulesetId: number; tagNamespace: string }>): void {
  record(ruleset, 'ruleset readback');
  const includes = (ruleset as RulesetView).conditions?.ref_name?.include;
  const rules = (ruleset as RulesetView).rules;
  const ruleTypes = Array.isArray(rules) ? rules.map(rule => (rule as { type?: unknown } | null | undefined)?.type) : [];
  if ((ruleset as RulesetView).id !== rulesetId || (ruleset as RulesetView).target !== 'tag' || (ruleset as RulesetView).enforcement !== 'active' ||
      !Array.isArray(includes) || !includes.includes(`${tagNamespace}/*`) ||
      !Array.isArray((ruleset as RulesetView).conditions?.ref_name?.exclude) || ((ruleset as RulesetView).conditions as { ref_name: { exclude: unknown[] } }).ref_name.exclude.length !== 0 ||
      !ruleTypes.includes('update') || !ruleTypes.includes('deletion') ||
      !Array.isArray((ruleset as RulesetView).bypass_actors) || ((ruleset as { bypass_actors: unknown[] }).bypass_actors).length !== 0) {
    fail('selected active tag ruleset does not read back update/deletion restrictions without bypass for the namespace.');
  }
}

function validateTagReadback(tagReadback: unknown, { tagObjectSha, tagName, tagMessage, bSha }: Readonly<{ tagObjectSha: string; tagName: string; tagMessage: string; bSha: string }>): void {
  record(tagReadback, 'remote annotated tag object readback');
  if ((tagReadback as TagView).sha !== tagObjectSha || (tagReadback as TagView).tag !== tagName || (tagReadback as TagView).message !== tagMessage ||
      (tagReadback as TagView).object?.sha !== bSha || (tagReadback as TagView).object?.type !== 'commit') {
    fail('remote annotated tag object readback differs from exact B or canonical message.');
  }
}

/**
 * Create an immutable-by-policy annotated tag object and ref, then read both back.
 * This reports transport observations only. It does not validate provenance or
 * assert adoption, canonical placement, eligibility, or acceptance.
 */
export async function createAndReadOwnerAmendmentTag({
  repository, tagRef, bSha, tagMessage, tagNamespace, rulesetId, token, tagger, rulesetReadback: suppliedRulesetReadback, fetchImpl = fetch,
}: CreateAndReadOwnerAmendmentTagInput): Promise<CreateAndReadOwnerAmendmentTagResult> {
  if (typeof fetchImpl !== 'function') fail('fetch implementation is invalid.');
  const { owner, repo, tagName } = validateInput({ repository, tagRef, bSha, tagMessage, tagNamespace, rulesetId, token, tagger });
  const baseUrl = `${API}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
  const rulesetReadback = suppliedRulesetReadback ?? await requestJson(fetchImpl, `${baseUrl}/rulesets/${rulesetId}`, { token });
  validateRuleset(rulesetReadback, { rulesetId, tagNamespace });

  const encodedTagPath = tagName.split('/').map(encodeURIComponent).join('/');
  const refUrl = `${baseUrl}/git/ref/tags/${encodedTagPath}`;
  const existingRef = await requestJson(fetchImpl, refUrl, { token, allowNotFound: true });
  if (existingRef !== null) {
    if ((existingRef as RefView).ref !== tagRef || (existingRef as RefView).object?.type !== 'tag' || !SHA.test(((existingRef as RefView).object?.sha as string | null | undefined) ?? '')) {
      fail('existing target ref is not the exact annotated tag ref.');
    }
    const tagReadback = await requestJson(fetchImpl, `${baseUrl}/git/tags/${encodeURIComponent((existingRef as { object: { sha: string } }).object.sha)}`, { token });
    validateTagReadback(tagReadback, { tagObjectSha: (existingRef as { object: { sha: string } }).object.sha, tagName, tagMessage, bSha });
    return Object.freeze({ transportStatus: 'ALREADY_PRESENT_AND_READ_BACK', repository, tagRef,
      bSha, rulesetReadback, refReadback: existingRef, tagReadback });
  }

  const tagObject = await requestJson(fetchImpl, `${baseUrl}/git/tags`, {
    token,
    method: 'POST',
    body: { tag: tagName, message: tagMessage, object: bSha, type: 'commit', tagger },
  });
  record(tagObject, 'created annotated tag object');
  if ((tagObject as { tag?: unknown }).tag !== tagName || (tagObject as { message?: unknown }).message !== tagMessage || (tagObject as { object?: { sha?: unknown } }).object?.sha !== bSha ||
      (tagObject as { object?: { type?: unknown } }).object?.type !== 'commit' || !SHA.test(((tagObject as { sha?: unknown }).sha as string | null | undefined) ?? '')) {
    fail('created annotated tag object does not match exact ref, B, and canonical message.');
  }

  const createdRef = await requestJson(fetchImpl, `${baseUrl}/git/refs`, {
    token,
    method: 'POST',
    body: { ref: tagRef, sha: (tagObject as { sha: string }).sha },
  });
  record(createdRef, 'created tag ref');
  if ((createdRef as { ref?: unknown }).ref !== tagRef || (createdRef as { object?: { sha?: unknown } }).object?.sha !== (tagObject as { sha: string }).sha || (createdRef as { object?: { type?: unknown } }).object?.type !== 'tag') {
    fail('created ref did not resolve to the exact annotated tag object.');
  }

  const refReadback = await requestJson(fetchImpl, refUrl, { token });
  if ((refReadback as { ref?: unknown }).ref !== tagRef || (refReadback as { object?: { sha?: unknown } }).object?.sha !== (tagObject as { sha: string }).sha || (refReadback as { object?: { type?: unknown } }).object?.type !== 'tag') {
    fail('remote tag ref readback differs from the created annotated tag object.');
  }
  const tagReadback = await requestJson(fetchImpl, `${baseUrl}/git/tags/${encodeURIComponent((tagObject as { sha: string }).sha)}`, { token });
  validateTagReadback(tagReadback, { tagObjectSha: (tagObject as { sha: string }).sha, tagName, tagMessage, bSha });

  return Object.freeze({ transportStatus: 'CREATED_AND_READ_BACK', repository, tagRef,
    bSha, rulesetReadback, refReadback, tagReadback });
}
