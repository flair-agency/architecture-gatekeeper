import assert from 'node:assert/strict';
import test from 'node:test';
import { fetchOrdinaryGeminiReviewedObject, normalizeOrdinaryGeminiWifInputs } from '../dist/ordinary-gemini-ci-workflow.mjs';

const sha = character => character.repeat(40);
const sourceToken = 'fixture-github-source-read-token';
const input = { root: '/runner/work/repository', repository: 'flair-agency/architecture-gatekeeper',
  reviewedSha: sha('a'), baseSha: sha('b'), headSha: sha('c'), prNumber: '42', sourceToken };

test('trims WIF inputs before deriving the project from the service account', () => {
  assert.deepEqual(normalizeOrdinaryGeminiWifInputs(
    ' \tprojects/123456789012/locations/global/workloadIdentityPools/gcp-pool/providers/Upper.Name\n',
    ' \tgemini-ci@sample-project.iam.gserviceaccount.com\n'), {
    provider: 'projects/123456789012/locations/global/workloadIdentityPools/gcp-pool/providers/Upper.Name',
    serviceAccount: 'gemini-ci@sample-project.iam.gserviceaccount.com', project: 'sample-project',
  });
  for (const [provider, account] of [
    [' '.repeat(257) + 'provider', 'gemini-ci@sample-project.iam.gserviceaccount.com'],
    ['provider', ' '.repeat(321) + 'gemini-ci@sample-project.iam.gserviceaccount.com'],
  ]) assert.throws(() => normalizeOrdinaryGeminiWifInputs(provider, account));
});

test('keeps the exact event merge on the fast path with child-only, masked Git credentials', () => {
  const calls = [];
  const registered = [];
  const result = fetchOrdinaryGeminiReviewedObject(input, secret => {
    registered.push(secret);
    assert.equal(calls.length, 0, 'derived authorization is masked before Git starts');
  }, (file, args, options) => {
    calls.push({ file, args: [...args], options });
    if (args.includes('rev-parse')) return input.reviewedSha;
    if (args.includes('rev-list')) return `${input.reviewedSha} ${input.baseSha} ${input.headSha}`;
    return '';
  });

  assert.equal(result, input.reviewedSha);
  assert.equal(calls.length, 3);
  const [fetch, verify, parents] = calls;
  assert.equal(fetch.file, 'git');
  assert.deepEqual(fetch.args, ['--no-replace-objects', '-C', input.root, 'fetch', '--no-tags', '--no-recurse-submodules',
    '--no-write-fetch-head', `https://github.com/${input.repository}.git`, input.reviewedSha]);
  assert.deepEqual(verify.args, ['--no-replace-objects', '-C', input.root, 'rev-parse', '--verify', `${input.reviewedSha}^{commit}`]);
  assert.deepEqual(parents.args, ['--no-replace-objects', '-C', input.root, 'rev-list', '--parents', '-n', '1', input.reviewedSha]);
  assert.equal(fetch.options.timeout, 60_000);
  assert.equal(fetch.options.env.GIT_CONFIG_NOSYSTEM, '1');
  assert.equal(fetch.options.env.GIT_CONFIG_GLOBAL, '/dev/null');
  assert.equal(fetch.options.env.GIT_CONFIG_KEY_0, 'http.https://github.com/.extraheader');
  assert.match(fetch.options.env.GIT_CONFIG_VALUE_0, /^AUTHORIZATION: basic [A-Za-z0-9+/]+=*$/);
  assert.ok(!JSON.stringify(calls.map(call => call.args)).includes(sourceToken), 'source token is never present in argv');
  assert.equal(fetch.options.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN, undefined);
  assert.deepEqual(registered, [fetch.options.env.GIT_CONFIG_VALUE_0]);
  assert.ok(!fetch.args.some(value => ['checkout', 'reset', 'merge', 'submodule'].includes(value)));
});

test('recovers exactly one stale event merge by resolving and fetching an immutable current PR SHA', () => {
  const currentMergeSha = sha('d');
  const previousHeadSha = sha('e');
  const calls = [];
  const diagnostics = [];
  const result = fetchOrdinaryGeminiReviewedObject(input, () => {}, (file, args, options) => {
    calls.push({ file, args: [...args], options });
    if (args.includes('rev-parse')) {
      const shaArg = args.at(-1).replace(/\^\{commit\}$/, '');
      return shaArg;
    }
    if (args.includes('rev-list')) {
      const shaArg = args.at(-1);
      return shaArg === input.reviewedSha
        ? `${input.reviewedSha} ${input.baseSha} ${previousHeadSha}`
        : `${currentMergeSha} ${input.baseSha} ${input.headSha}`;
    }
    if (args.includes('ls-remote')) return `${currentMergeSha}\trefs/pull/${input.prNumber}/merge`;
    return '';
  }, message => diagnostics.push(message));
  assert.equal(result, currentMergeSha);
  assert.match(diagnostics[0], /Event merge metadata has stale or inconsistent/);
  assert.equal(diagnostics.length, 1);
  assert.equal(calls.length, 7, 'one stale object, one ref lookup, and one immutable candidate are checked');
  const lookup = calls.find(call => call.args.includes('ls-remote'));
  assert.deepEqual(lookup.args, ['--no-replace-objects', '-C', input.root, 'ls-remote', '--refs',
    `https://github.com/${input.repository}.git`, `refs/pull/${input.prNumber}/merge`]);
  assert.equal(lookup.options.timeout, 30_000);
  assert.ok(!JSON.stringify(calls.map(call => call.args)).includes(sourceToken), 'source token is not present in lookup or fetch arguments');
  assert.equal(calls.filter(call => call.args.includes('ls-remote')).length, 1);
  assert.equal(calls.at(-3).args.at(-1), currentMergeSha, 'the resolved immutable SHA is fetched after lookup');
});

test('rejects missing, ambiguous, malformed, wrong-ref and wrong-parent merge candidates', () => {
  for (const [label, response, candidateParents] of [
    ['missing ref', '', `${sha('d')} ${input.baseSha} ${input.headSha}`],
    ['ambiguous ref', `${sha('d')}\trefs/pull/42/merge\n${sha('d')}\trefs/pull/43/merge`, `${sha('d')} ${input.baseSha} ${input.headSha}`],
    ['malformed SHA', `bad\trefs/pull/42/merge`, `${sha('d')} ${input.baseSha} ${input.headSha}`],
    ['wrong ref', `${sha('d')}\trefs/pull/41/merge`, `${sha('d')} ${input.baseSha} ${input.headSha}`],
    ['wrong parent tuple', `${sha('d')}\trefs/pull/42/merge`, `${sha('d')} ${input.headSha} ${input.baseSha}`],
  ]) {
    let lookupCount = 0;
    const diagnostics = [];
    assert.throws(() => fetchOrdinaryGeminiReviewedObject(input, () => {}, (_file, args) => {
      if (args.includes('rev-parse')) return args.at(-1).replace(/\^\{commit\}$/, '');
      if (args.includes('rev-list')) return args.at(-1) === input.reviewedSha
        ? `${input.reviewedSha} ${input.baseSha} ${sha('e')}` : candidateParents;
      if (args.includes('ls-remote')) { lookupCount += 1; return response; }
      return '';
    }, message => diagnostics.push(message)), label);
    assert.equal(lookupCount, 1, `${label} uses at most one merge-ref lookup`);
    assert.match(diagnostics[0], /Event merge metadata has stale or inconsistent/);
    assert.match(diagnostics[1], label === 'wrong parent tuple'
      ? /Refreshed merge candidate has invalid ordered event base\/head parents/
      : /Current PR merge ref is missing, ambiguous, malformed, or unavailable/);
  }
});

test('fails before using Git when masking fails and rejects a fetched object with the wrong identity', () => {
  let calls = 0;
  assert.throws(() => fetchOrdinaryGeminiReviewedObject(input, () => { throw new Error('mask failed'); }, () => { calls += 1; return ''; }));
  assert.equal(calls, 0);
  let invocations = 0;
  assert.throws(() => fetchOrdinaryGeminiReviewedObject(input, () => {}, (_file, args) => {
    invocations += 1;
    return args.includes('rev-parse') ? sha('9') : '';
  }));
  assert.equal(invocations, 2);
});


test('rejects asynchronous and arbitrary thenable registration before starting Git', () => {
  let calls = 0;
  assert.throws(() => fetchOrdinaryGeminiReviewedObject(input, () => Promise.resolve(), () => { calls += 1; return ''; }));
  assert.throws(() => fetchOrdinaryGeminiReviewedObject(input, () => ({ then() { calls += 100; } }), () => { calls += 1; return ''; }));
  assert.equal(calls, 0);
});
