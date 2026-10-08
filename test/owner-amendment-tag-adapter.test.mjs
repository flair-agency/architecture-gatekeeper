import assert from 'node:assert/strict';
import test from 'node:test';
import { createAndReadOwnerAmendmentTag } from '../dist/owner-amendment-tag-adapter.mjs';

const repository = 'flair-agency/example';
const bSha = 'b'.repeat(40);
const tagNamespace = 'refs/tags/architecture-gatekeeper/amendments';
const tagRef = `${tagNamespace}/${bSha}`;
const tagName = tagRef.slice('refs/tags/'.length);
const rulesetId = 24072482;
const tagMessage = '{"bSha":"' + bSha + '","version":2}\n';
const tagger = { name: 'Architecture Gatekeeper test', email: 'gatekeeper@example.invalid', date: '2026-09-27T00:00:00.000Z' };
const tagObjectSha = 'c'.repeat(40);

function ruleset(overrides = {}) {
  return { id: rulesetId, name: 'v0.6 self amendment evidence tags', enforcement: 'active', target: 'tag',
    conditions: { ref_name: { include: [`${tagNamespace}/*`], exclude: [] } },
    rules: [{ type: 'update' }, { type: 'deletion' }], bypass_actors: [], ...overrides };
}

function fixture(overrides = {}) {
  const calls = [];
  let refExists = false;
  let failTagReadbackOnce = Boolean(overrides.failTagReadbackOnce);
  const tagObj = { tag: tagName, message: tagMessage, object: { sha: bSha, type: 'commit' }, sha: tagObjectSha };
  const ref = () => ({ ref: tagRef, object: { sha: tagObjectSha, type: 'tag' } });
  const responses = async (url, options) => {
    const path = new URL(url).pathname;
    calls.push({ path, ...options, headers: { ...options.headers }, body: options.body ? JSON.parse(options.body) : undefined });
    if (path.endsWith(`/rulesets/${rulesetId}`)) return { status: 200, json: ruleset(overrides.ruleset) };
    if (path.endsWith(`/git/ref/tags/architecture-gatekeeper/amendments/${bSha}`)) {
      if (options.method === 'GET') return refExists ? { status: 200, json: ref() } : { status: 404, json: {} };
      return { status: 201, json: ref() };
    }
    if (path.endsWith('/git/tags') && options.method === 'POST') return { status: 201, json: overrides.tagObject ?? tagObj };
    if (path.endsWith('/git/refs') && options.method === 'POST') {
      refExists = true;
      return { status: 201, json: overrides.createdRef ?? ref() };
    }
    if (path.endsWith(`/git/tags/${tagObjectSha}`)) {
      if (failTagReadbackOnce) {
        failTagReadbackOnce = false;
        return { status: 503, json: {} };
      }
      return { status: 200, json: overrides.tagReadback ?? tagObj };
    }
    throw new Error(`Unexpected request ${options.method} ${path}`);
  };
  const fetchImpl = async (url, options) => {
    const response = await responses(url, options);
    return { ok: response.status >= 200 && response.status < 300, status: response.status, json: async () => response.json };
  };
  return { calls, fetchImpl, setRefExists() { refExists = true; } };
}

function input(f, overrides = {}) {
  return { repository, tagRef, bSha, tagMessage, tagNamespace, rulesetId, token: 'test-token', tagger,
    fetchImpl: f.fetchImpl, ...overrides };
}

test('checks the live tag ruleset, creates once, then reads back exact tag ref and target object', async () => {
  const f = fixture();
  const result = await createAndReadOwnerAmendmentTag(input(f));
  assert.equal(result.transportStatus, 'CREATED_AND_READ_BACK');
  assert.equal(result.tagRef, tagRef);
  assert.equal(result.bSha, bSha);
  assert.equal(result.refReadback.object.sha, tagObjectSha);
  assert.equal(result.tagReadback.object.sha, bSha);
  assert.deepEqual(f.calls.map(call => `${call.method} ${call.path.split('/').slice(-2).join('/')}`), [
    `GET rulesets/${rulesetId}`,
    `GET amendments/${bSha}`,
    'POST git/tags',
    'POST git/refs',
    `GET amendments/${bSha}`,
    `GET tags/${tagObjectSha}`,
  ]);
  const createTagCall = f.calls.find(call => call.method === 'POST' && call.path.endsWith('/git/tags'));
  assert.deepEqual(createTagCall.body, { tag: tagName, message: tagMessage, object: bSha, type: 'commit', tagger });
  assert.ok(f.calls.every(call => call.headers.authorization === 'Bearer test-token'));
});

test('reads back an exact existing tag without attempting to create or update it', async () => {
  const f = fixture();
  f.setRefExists();
  const result = await createAndReadOwnerAmendmentTag(input(f));
  assert.equal(result.transportStatus, 'ALREADY_PRESENT_AND_READ_BACK');
  assert.equal(result.refReadback.object.sha, tagObjectSha);
  assert.equal(f.calls.filter(call => call.method === 'POST').length, 0);
});

test('recovers a retry after ref creation succeeded but the first readback failed', async () => {
  const f = fixture({ failTagReadbackOnce: true });
  await assert.rejects(createAndReadOwnerAmendmentTag(input(f)), /returned HTTP 503/);
  const result = await createAndReadOwnerAmendmentTag(input(f));
  assert.equal(result.transportStatus, 'ALREADY_PRESENT_AND_READ_BACK');
  assert.equal(result.refReadback.object.sha, tagObjectSha);
  assert.equal(f.calls.filter(call => call.method === 'POST' && call.path.endsWith('/git/tags')).length, 1);
  assert.equal(f.calls.filter(call => call.method === 'POST' && call.path.endsWith('/git/refs')).length, 1);
});

test('rejects an existing tag whose message, target, or tag name differs', async t => {
  const variants = [
    { tag: tagName, message: '{}\n', object: { sha: bSha, type: 'commit' }, sha: tagObjectSha },
    { tag: tagName, message: tagMessage, object: { sha: 'd'.repeat(40), type: 'commit' }, sha: tagObjectSha },
    { tag: `${tagName}-other`, message: tagMessage, object: { sha: bSha, type: 'commit' }, sha: tagObjectSha },
  ];
  for (const [index, tagReadback] of variants.entries()) {
    await t.test(`tampered existing tag ${index + 1}`, async () => {
      const f = fixture({ tagReadback });
      f.setRefExists();
      await assert.rejects(createAndReadOwnerAmendmentTag(input(f)), /remote annotated tag object readback differs/);
      assert.equal(f.calls.filter(call => call.method === 'POST').length, 0);
    });
  }
});

test('requires the exact B-derived ref in the selected namespace', async () => {
  const f = fixture();
  await assert.rejects(createAndReadOwnerAmendmentTag(input(f, { tagRef: `${tagNamespace}/other` })), /does not identify exact B/);
  assert.equal(f.calls.length, 0);
});

test('fails closed unless live ruleset readback protects update and deletion with no bypass', async t => {
  const variants = [
    ruleset({ enforcement: 'disabled' }),
    ruleset({ target: 'branch' }),
    ruleset({ conditions: { ref_name: { include: ['refs/tags/other/*'], exclude: [] } } }),
    ruleset({ rules: [{ type: 'update' }] }),
    ruleset({ bypass_actors: [{ actor_id: 1 }] }),
  ];
  for (const [index, badRuleset] of variants.entries()) {
    await t.test(`invalid ruleset ${index + 1}`, async () => {
      const f = fixture({ ruleset: badRuleset });
      await assert.rejects(createAndReadOwnerAmendmentTag(input(f)), /ruleset does not read back/);
      assert.equal(f.calls.length, 1);
    });
  }
});

test('rejects a created annotated object that targets a different commit or message', async () => {
  const wrongTarget = fixture({ tagObject: { tag: tagName, message: tagMessage,
    object: { sha: 'd'.repeat(40), type: 'commit' }, sha: tagObjectSha } });
  await assert.rejects(createAndReadOwnerAmendmentTag(input(wrongTarget)), /does not match exact ref, B, and canonical message/);
  assert.equal(wrongTarget.calls.some(call => call.method === 'POST' && call.path.endsWith('/git/refs')), false);
});

test('rejects a tag whose remote readback changed the message, object type, or target', async t => {
  const variants = [
    { tag: tagName, message: '{}\n', object: { sha: bSha, type: 'commit' }, sha: tagObjectSha },
    { tag: tagName, message: tagMessage, object: { sha: bSha, type: 'tree' }, sha: tagObjectSha },
    { tag: tagName, message: tagMessage, object: { sha: 'd'.repeat(40), type: 'commit' }, sha: tagObjectSha },
  ];
  for (const [index, tagReadback] of variants.entries()) {
    await t.test(`mismatched tag readback ${index + 1}`, async () => {
      const f = fixture({ tagReadback });
      await assert.rejects(createAndReadOwnerAmendmentTag(input(f)), /remote annotated tag object readback differs/);
    });
  }
});

test('rejects a ref creation response that does not point at the created tag object', async () => {
  const f = fixture({ createdRef: { ref: tagRef, object: { sha: 'd'.repeat(40), type: 'tag' } } });
  await assert.rejects(createAndReadOwnerAmendmentTag(input(f)), /created ref did not resolve/);
});

test('requires a canonical newline-terminated bounded message and explicit tagger metadata', async () => {
  const f = fixture();
  await assert.rejects(createAndReadOwnerAmendmentTag(input(f, { tagMessage: '{}' })), /canonical tag message/);
  await assert.rejects(createAndReadOwnerAmendmentTag(input(f, { tagger: undefined })), /tagger is invalid/);
  assert.equal(f.calls.length, 0);
});

// This response is injected by a same-job protected launcher, never an App token.
test('supplied complete ruleset response keeps all tag operations on the ordinary token', async () => {
  const f = fixture(); await createAndReadOwnerAmendmentTag(input(f, { rulesetReadback: ruleset() }));
  assert.equal(f.calls.some(call => call.path.includes('/rulesets/')), false);
  assert.ok(f.calls.every(call => call.headers.authorization === 'Bearer test-token'));
  const rejected = fixture();
  await assert.rejects(createAndReadOwnerAmendmentTag(input(rejected, { rulesetReadback: ruleset({ bypass_actors: undefined }) })), /ruleset/);
  assert.equal(rejected.calls.length, 0);
});
