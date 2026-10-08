import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { readOwnerAmendmentTagForMergeGroup } from '../dist/owner-amendment-tag-readback.mjs';

const repository = 'flair-agency/example';
const bSha = 'b'.repeat(40);
const tagNamespace = 'refs/tags/architecture-gatekeeper/amendments';
const tagRef = `${tagNamespace}/${bSha}`;
const tagName = tagRef.slice('refs/tags/'.length);
const rulesetId = 24072482;

function tagObject(overrides = {}) {
  const text = `object ${overrides.target ?? bSha}\ntype commit\ntag ${overrides.tagName ?? tagName}\ntagger Test Owner <owner@example.invalid> 1790000000 +0900\n\n${overrides.message ?? '{"version":2}\n'}`;
  const objectBytes = Buffer.from(text);
  const objectOid = createHash('sha1').update(Buffer.from(`tag ${objectBytes.length}\0`)).update(objectBytes).digest('hex');
  return { objectBytes, objectOid };
}

function ruleset(overrides = {}) {
  return { id: rulesetId, target: 'tag', enforcement: 'active',
    conditions: { ref_name: { include: [`${tagNamespace}/*`], exclude: [] } },
    rules: [{ type: 'update' }, { type: 'deletion' }], bypass_actors: [], ...overrides };
}

function fixture({ rules = ruleset(), raw = tagObject(), finalOid, firstOid } = {}) {
  const calls = [];
  let refCount = 0;
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    const path = new URL(url).pathname;
    let body;
    if (path.endsWith(`/rulesets/${rulesetId}`)) body = rules;
    else if (path.includes('/git/ref/tags/')) {
      refCount += 1;
      body = { ref: tagRef, object: { type: 'tag', sha: refCount === 1 ? firstOid ?? raw.objectOid : finalOid ?? firstOid ?? raw.objectOid } };
    } else throw new Error(`Unexpected API path: ${path}`);
    return { ok: true, status: 200, json: async () => body };
  };
  return { calls, fetchImpl, raw };
}

function input(f, overrides = {}) {
  return { repository, bSha, tagNamespace, tagRef, rulesetId, token: 'test-token', fetchImpl: f.fetchImpl,
    readTagObject: async () => f.raw.objectBytes, ...overrides };
}

test('reads raw tag bytes, checks live ruleset and repeats exact ref mapping', async () => {
  const f = fixture();
  const result = await readOwnerAmendmentTagForMergeGroup(input(f));
  assert.equal(result.status, 'READ_BACK_OWNER_AMENDMENT_TAG');
  assert.equal(result.tag.objectOid, f.raw.objectOid);
  assert.deepEqual(result.tag.objectBytes, f.raw.objectBytes);
  assert.equal(result.observedTagRefOid, f.raw.objectOid);
  assert.equal(f.calls.length, 3);
  assert.ok(f.calls.every(call => call.options.headers.authorization === 'Bearer test-token'));
});

test('rejects malformed expected B/ref/OID inputs and a wrong remote ref', async () => {
  const f = fixture();
  await assert.rejects(readOwnerAmendmentTagForMergeGroup(input(f, { tagRef: `${tagNamespace}/other` })), /does not identify exact B/);
  const wrong = fixture({ firstOid: 'c'.repeat(40) });
  await assert.rejects(readOwnerAmendmentTagForMergeGroup(input(wrong)), /raw Git fetch|OID/);
});

test('fails closed for missing protection, bypass actors, and a changed final mapping', async t => {
  const cases = [
    [ruleset({ rules: [{ type: 'update' }] }), undefined, /ruleset does not protect/],
    [ruleset({ bypass_actors: [{ actor_id: 1 }] }), undefined, /without bypass actors/],
    [ruleset(), 'd'.repeat(40), /ref changed during readback/],
  ];
  for (const [rules, finalOid, pattern] of cases) {
    await t.test(pattern.source, async () => {
      const f = fixture({ rules, finalOid });
      await assert.rejects(readOwnerAmendmentTagForMergeGroup(input(f)), pattern);
    });
  }
});

test('rejects tag objects that are malformed, oversized, or bound to another B/ref', async t => {
  const variants = [
    tagObject({ target: 'c'.repeat(40) }),
    tagObject({ tagName: `${tagName}-other` }),
    tagObject({ message: 'not-json\n' }),
    tagObject({ message: '{"version":2}\nextra\n' }),
    (() => { const raw = tagObject(); return { objectBytes: Buffer.alloc(262_145), objectOid: raw.objectOid }; })(),
    (() => { const raw = tagObject(); return { objectBytes: Buffer.from('not an annotated tag'), objectOid: raw.objectOid }; })(),
  ];
  for (const [index, raw] of variants.entries()) {
    await t.test(`invalid object ${index + 1}`, async () => {
      const f = fixture({ raw });
      await assert.rejects(readOwnerAmendmentTagForMergeGroup(input(f)), /raw annotated tag|annotated tag headers|tag message|oversized/);
    });
  }
});
