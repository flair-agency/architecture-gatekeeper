import assert from 'node:assert/strict';
import test from 'node:test';
import { fetchOrdinaryGeminiReviewedObject } from '../dist/ordinary-gemini-ci-workflow.mjs';

const sha = character => character.repeat(40);
const sourceToken = 'fixture-github-source-read-token';
const input = { root: '/runner/work/repository', repository: 'flair-agency/architecture-gatekeeper',
  reviewedSha: sha('a'), sourceToken };

test('fetches only the exact reviewed commit through child-only, masked Git credentials', () => {
  const calls = [];
  const registered = [];
  fetchOrdinaryGeminiReviewedObject(input, secret => {
    registered.push(secret);
    assert.equal(calls.length, 0, 'derived authorization is masked before Git starts');
  }, (file, args, options) => {
    calls.push({ file, args: [...args], options });
    return args.includes('rev-parse') ? input.reviewedSha : '';
  });

  assert.equal(calls.length, 2);
  const [fetch, verify] = calls;
  assert.equal(fetch.file, 'git');
  assert.deepEqual(fetch.args, ['--no-replace-objects', '-C', input.root, 'fetch', '--no-tags', '--no-recurse-submodules',
    '--no-write-fetch-head', `https://github.com/${input.repository}.git`, input.reviewedSha]);
  assert.deepEqual(verify.args, ['--no-replace-objects', '-C', input.root, 'rev-parse', '--verify', `${input.reviewedSha}^{commit}`]);
  assert.equal(fetch.options.timeout, 60_000);
  assert.equal(fetch.options.env.GIT_CONFIG_NOSYSTEM, '1');
  assert.equal(fetch.options.env.GIT_CONFIG_GLOBAL, '/dev/null');
  assert.equal(fetch.options.env.GIT_CONFIG_KEY_0, 'http.https://github.com/.extraheader');
  assert.match(fetch.options.env.GIT_CONFIG_VALUE_0, /^AUTHORIZATION: basic [A-Za-z0-9+/]+=*$/);
  assert.ok(!JSON.stringify(fetch.args).includes(sourceToken), 'source token is never present in argv');
  assert.equal(fetch.options.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN, undefined);
  assert.deepEqual(registered, [fetch.options.env.GIT_CONFIG_VALUE_0]);
  assert.ok(!fetch.args.some(value => ['checkout', 'reset', 'merge', 'submodule'].includes(value)));
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
