const API = 'https://api.github.com';
const SHA = /^[a-f0-9]{40}$/;

function fail(message) {
  throw new Error(`Owner amendment tag transport: ${message}`);
}

function record(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label} is invalid.`);
}

function parseRepository(repository) {
  if (typeof repository !== 'string' || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) {
    fail('trusted repository must be owner/name.');
  }
  return repository.split('/');
}

function validateInput({ repository, tagRef, bSha, tagMessage, tagNamespace, rulesetId, token, tagger }) {
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

async function requestJson(fetchImpl, url, { token, method = 'GET', body, allowNotFound = false }) {
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
  if (allowNotFound && response.status === 404) return null;
  if (!response.ok) fail(`GitHub API ${method} ${new URL(url).pathname} returned HTTP ${response.status}.`);
  try { return await response.json(); } catch { fail('GitHub API returned invalid JSON.'); }
}

function validateRuleset(ruleset, { rulesetId, tagNamespace }) {
  record(ruleset, 'ruleset readback');
  const includes = ruleset.conditions?.ref_name?.include;
  const rules = ruleset.rules;
  const ruleTypes = Array.isArray(rules) ? rules.map(rule => rule?.type) : [];
  if (ruleset.id !== rulesetId || ruleset.target !== 'tag' || ruleset.enforcement !== 'active' ||
      !Array.isArray(includes) || !includes.includes(`${tagNamespace}/*`) ||
      !Array.isArray(ruleset.conditions?.ref_name?.exclude) || ruleset.conditions.ref_name.exclude.length !== 0 ||
      !ruleTypes.includes('update') || !ruleTypes.includes('deletion') ||
      !Array.isArray(ruleset.bypass_actors) || ruleset.bypass_actors.length !== 0) {
    fail('selected active tag ruleset does not read back update/deletion restrictions without bypass for the namespace.');
  }
}

function validateTagReadback(tagReadback, { tagObjectSha, tagName, tagMessage, bSha }) {
  record(tagReadback, 'remote annotated tag object readback');
  if (tagReadback.sha !== tagObjectSha || tagReadback.tag !== tagName || tagReadback.message !== tagMessage ||
      tagReadback.object?.sha !== bSha || tagReadback.object?.type !== 'commit') {
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
}) {
  if (typeof fetchImpl !== 'function') fail('fetch implementation is invalid.');
  const { owner, repo, tagName } = validateInput({ repository, tagRef, bSha, tagMessage, tagNamespace, rulesetId, token, tagger });
  const baseUrl = `${API}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
  const rulesetReadback = suppliedRulesetReadback ?? await requestJson(fetchImpl, `${baseUrl}/rulesets/${rulesetId}`, { token });
  validateRuleset(rulesetReadback, { rulesetId, tagNamespace });

  const encodedTagPath = tagName.split('/').map(encodeURIComponent).join('/');
  const refUrl = `${baseUrl}/git/ref/tags/${encodedTagPath}`;
  const existingRef = await requestJson(fetchImpl, refUrl, { token, allowNotFound: true });
  if (existingRef !== null) {
    if (existingRef.ref !== tagRef || existingRef.object?.type !== 'tag' || !SHA.test(existingRef.object?.sha ?? '')) {
      fail('existing target ref is not the exact annotated tag ref.');
    }
    const tagReadback = await requestJson(fetchImpl, `${baseUrl}/git/tags/${encodeURIComponent(existingRef.object.sha)}`, { token });
    validateTagReadback(tagReadback, { tagObjectSha: existingRef.object.sha, tagName, tagMessage, bSha });
    return Object.freeze({ transportStatus: 'ALREADY_PRESENT_AND_READ_BACK', repository, tagRef,
      bSha, rulesetReadback, refReadback: existingRef, tagReadback });
  }

  const tagObject = await requestJson(fetchImpl, `${baseUrl}/git/tags`, {
    token,
    method: 'POST',
    body: { tag: tagName, message: tagMessage, object: bSha, type: 'commit', tagger },
  });
  record(tagObject, 'created annotated tag object');
  if (tagObject.tag !== tagName || tagObject.message !== tagMessage || tagObject.object?.sha !== bSha ||
      tagObject.object?.type !== 'commit' || !SHA.test(tagObject.sha ?? '')) {
    fail('created annotated tag object does not match exact ref, B, and canonical message.');
  }

  const createdRef = await requestJson(fetchImpl, `${baseUrl}/git/refs`, {
    token,
    method: 'POST',
    body: { ref: tagRef, sha: tagObject.sha },
  });
  record(createdRef, 'created tag ref');
  if (createdRef.ref !== tagRef || createdRef.object?.sha !== tagObject.sha || createdRef.object?.type !== 'tag') {
    fail('created ref did not resolve to the exact annotated tag object.');
  }

  const refReadback = await requestJson(fetchImpl, refUrl, { token });
  if (refReadback.ref !== tagRef || refReadback.object?.sha !== tagObject.sha || refReadback.object?.type !== 'tag') {
    fail('remote tag ref readback differs from the created annotated tag object.');
  }
  const tagReadback = await requestJson(fetchImpl, `${baseUrl}/git/tags/${encodeURIComponent(tagObject.sha)}`, { token });
  validateTagReadback(tagReadback, { tagObjectSha: tagObject.sha, tagName, tagMessage, bSha });

  return Object.freeze({ transportStatus: 'CREATED_AND_READ_BACK', repository, tagRef,
    bSha, rulesetReadback, refReadback, tagReadback });
}
