// Discover the one BLOCK artifact emitted by an exact trusted Actions run.
// This only selects an artifact ID; a later layer fetches and authenticates it.
const REPOSITORY = /^[A-Za-z0-9][A-Za-z0-9-]*\/[A-Za-z0-9][A-Za-z0-9._-]*$/;
const SHA = /^[a-f0-9]{40}$/;
const PAGE_SIZE = 100;
const MAX_PAGES = 100;
const KEYS = ['repository', 'runId', 'runAttempt', 'baseSha', 'headSha'];

const fail = message => { throw new Error(`Owner amendment artifact discovery: ${message}`); };
const numericId = value => Number.isSafeInteger(value) && value > 0;
const positiveId = value => (typeof value === 'string' && /^[1-9]\d*$/.test(value)) ||
  (Number.isSafeInteger(value) && value > 0);

function validateExpected(expected) {
  if (!expected || typeof expected !== 'object' || Array.isArray(expected) ||
      Object.keys(expected).sort().join(',') !== [...KEYS].sort().join(',')) {
    fail('trusted run identity is incomplete or contains unknown fields.');
  }
  if (!REPOSITORY.test(expected.repository) || !positiveId(expected.runId) || !positiveId(expected.runAttempt) ||
      !SHA.test(expected.baseSha) || !SHA.test(expected.headSha)) {
    fail('trusted run identity has invalid values.');
  }
  return expected;
}

function validateRun(run, expected) {
  if (String(run?.id) !== String(expected.runId) || run.status !== 'completed' ||
      run.event !== 'pull_request_target' ||
      run.repository?.full_name !== expected.repository || run.head_repository?.full_name !== expected.repository ||
      run.head_sha !== expected.headSha || String(run.run_attempt) !== String(expected.runAttempt) ||
      !numericId(run.repository?.id) || !numericId(run.head_repository?.id)) {
    fail('workflow run event, repository, head, attempt, or run ID differs from trusted expectation.');
  }
  return run;
}

function validateArtifact(artifact, expected, run, expectedName) {
  const expiresAt = Date.parse(artifact?.expires_at);
  if (!numericId(artifact?.id) || artifact.name !== expectedName || artifact.expired !== false ||
      !Number.isFinite(expiresAt) || expiresAt <= Date.now() ||
      String(artifact.workflow_run?.id) !== String(expected.runId) ||
      !numericId(artifact.workflow_run?.repository_id) || !numericId(artifact.workflow_run?.head_repository_id) ||
      artifact.workflow_run.repository_id !== run.repository.id ||
      artifact.workflow_run.head_repository_id !== run.head_repository.id ||
      artifact.workflow_run.head_sha !== expected.headSha) {
    fail('matching artifact has invalid identity, run association, or expiry metadata.');
  }
  return artifact;
}

/**
 * Find exactly one expected BLOCK artifact in the specified completed run
 * attempt. The artifact ID is derived from GitHub's authenticated listing and
 * is never accepted from the caller. No archive bytes or acceptance claim are
 * produced here.
 */
export async function discoverOwnerAmendmentBlockArtifact({ expected, token, fetchImpl = fetch }) {
  try {
    expected = validateExpected(expected);
    if (typeof token !== 'string' || token.length === 0) fail('GitHub API token is required.');
    if (typeof fetchImpl !== 'function') fail('authenticated fetch helper is required.');

    const [owner, repositoryName] = expected.repository.split('/');
    const repo = `${encodeURIComponent(owner)}/${encodeURIComponent(repositoryName)}`;
    const runId = encodeURIComponent(String(expected.runId));
    const attempt = encodeURIComponent(String(expected.runAttempt));
    const api = 'https://api.github.com';
    const headers = { accept: 'application/vnd.github+json', authorization: `Bearer ${token}`,
      'x-github-api-version': '2022-11-28' };
    const getJson = async url => {
      const response = await fetchImpl(url, { headers, redirect: 'error' });
      if (!response?.ok) fail(`GitHub API request failed (${response?.status ?? 'no response'}).`);
      return response.json();
    };

    const run = validateRun(await getJson(`${api}/repos/${repo}/actions/runs/${runId}/attempts/${attempt}`), expected);
    const expectedName = `owner-amendment-block-${expected.baseSha}-${expected.headSha}-${expected.runId}-${expected.runAttempt}`;
    const artifacts = [];
    let totalCount;
    for (let page = 1; ; page += 1) {
      if (page > MAX_PAGES) fail('artifact listing exceeds the page limit.');
      const result = await getJson(`${api}/repos/${repo}/actions/runs/${runId}/artifacts?per_page=${PAGE_SIZE}&page=${page}`);
      if (!Number.isSafeInteger(result?.total_count) || result.total_count < 0 ||
          !Array.isArray(result?.artifacts) || result.artifacts.length > PAGE_SIZE) {
        fail('artifact listing response is malformed.');
      }
      if (totalCount === undefined) totalCount = result.total_count;
      if (result.total_count !== totalCount) fail('artifact listing changed while pages were read.');
      artifacts.push(...result.artifacts);
      if (artifacts.length > totalCount) fail('artifact listing contains more entries than declared.');
      if (artifacts.length === totalCount) break;
      if (result.artifacts.length === 0) fail('artifact listing ended before all declared entries were read.');
    }

    const matches = artifacts.filter(artifact => artifact?.name === expectedName);
    if (matches.length !== 1) fail(`expected exactly one matching BLOCK artifact; found ${matches.length}.`);
    const artifact = validateArtifact(matches[0], expected, run, expectedName);
    return Object.freeze({ status: 'DISCOVERED_OWNER_AMENDMENT_BLOCK_ARTIFACT',
      artifactId: String(artifact.id), artifactName: artifact.name, runId: String(expected.runId),
      runAttempt: String(expected.runAttempt), baseSha: expected.baseSha, headSha: expected.headSha,
      expiresAt: artifact.expires_at });
  } catch (error) {
    return Object.freeze({ status: 'INCOMPLETE', reason: error.message });
  }
}

export const OWNER_AMENDMENT_ARTIFACT_DISCOVERY_LIMITS = Object.freeze({ pageSize: PAGE_SIZE, maxPages: MAX_PAGES });
