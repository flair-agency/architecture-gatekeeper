import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { produceRulesetReadback, readLocalRulesetReadback } from '../src/github-ruleset-readback.mjs';

const repository = 'flair-agency/architecture-gatekeeper';
const namespace = 'refs/tags/architecture-gatekeeper/amendments';
const privateKey = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey.export({ type: 'pkcs8', format: 'pem' });
const env = { GITHUB_REPOSITORY: repository, GITHUB_REF: 'refs/heads/main', GITHUB_EVENT_NAME: 'repository_dispatch',
  GITHUB_WORKFLOW_REF: `${repository}/.github/workflows/owner-amendment-owner-decision-handoff.yml@refs/heads/main`,
  GITHUB_SHA: 'a'.repeat(40), GITHUB_RUN_ID: '100', GITHUB_RUN_ATTEMPT: '1', OWNER_AMENDMENT_TAG_RULESET_ID: '24072482',
  RULESET_READBACK_APP_ID: '101', RULESET_READBACK_INSTALLATION_ID: '102', RULESET_READBACK_PRIVATE_KEY: privateKey };
const ruleset = { id: 24072482, target: 'tag', enforcement: 'active', bypass_actors: [],
  conditions: { ref_name: { include: [`${namespace}/*`], exclude: [] } }, rules: [{ type: 'update' }, { type: 'deletion' }] };
function fixture({ body = ruleset, permissions = { administration: 'write', metadata: 'read' }, revoke = true } = {}) {
  const calls = [];
  return { calls, fetchImpl: async (url, options) => {
    const path = new URL(url).pathname; calls.push({ path, ...options });
    let status = 200, result;
    if (path === `/repos/${repository}/installation`) result = { id: 102, app_id: 101 };
    else if (path === '/app/installations/102/access_tokens') {
      assert.deepEqual(JSON.parse(options.body), { repositories: ['architecture-gatekeeper'], permissions: { administration: 'write' } });
      result = { token: 'synthetic-admin-token', permissions, repositories: [{ full_name: repository }] };
    } else if (path === `/repos/${repository}/rulesets/24072482`) result = body;
    else if (path === '/installation/token') status = revoke ? 204 : 403;
    else throw new Error(`Disallowed request ${path}`);
    return { status, ok: status < 300, json: async () => result };
  } };
}
test('isolated producer uses App token only for ruleset GET and revocation before releasing credential-free local snapshot', async () => {
  const f = fixture(); const snapshot = await produceRulesetReadback({ env, fetchImpl: f.fetchImpl, now: () => 1000 });
  assert.deepEqual(f.calls.filter(call => call.headers.authorization === 'Bearer synthetic-admin-token').map(call => [call.method, call.path]),
    [['GET', `/repos/${repository}/rulesets/24072482`], ['DELETE', '/installation/token']]);
  assert.equal(snapshot.observedAt, 1000); assert.deepEqual(snapshot.ruleset, ruleset);
  assert.equal(JSON.stringify(snapshot).includes('synthetic-admin-token'), false);
  assert.equal(JSON.stringify(snapshot).includes(privateKey), false);
});
test('missing bypass actors, broader permission and failed revocation release no snapshot', async () => {
  for (const options of [{ body: { ...ruleset, bypass_actors: undefined } }, { permissions: { administration: 'write', contents: 'write' } }, { revoke: false }]) {
    const f = fixture(options);
    await assert.rejects(produceRulesetReadback({ env, fetchImpl: f.fetchImpl, now: () => 1000 }));
    assert.equal(f.calls.at(-1).path, '/installation/token');
  }
  await assert.rejects(produceRulesetReadback({ env: { ...env, GITHUB_REF: 'refs/heads/candidate' }, fetchImpl: () => assert.fail('must not request') }));
});
test('local snapshot rejects different run, base and stale readback; it is not a cross-run receipt', async t => {
  const root = mkdtempSync(join(tmpdir(), 'ruleset-readback-')); t.after(() => rmSync(root, { recursive: true, force: true }));
  const f = fixture(), snapshot = await produceRulesetReadback({ env, fetchImpl: f.fetchImpl, now: () => 1000 });
  const file = join(root, 'snapshot.json'); writeFileSync(file, JSON.stringify(snapshot), { mode: 0o600 });
  const expected = { baseSha: env.GITHUB_SHA, rulesetId: 24072482, tagNamespace: namespace };
  assert.deepEqual(readLocalRulesetReadback(file, env, expected, 1001), ruleset);
  assert.throws(() => readLocalRulesetReadback(file, { ...env, GITHUB_RUN_ID: '101' }, expected, 1001));
  assert.throws(() => readLocalRulesetReadback(file, env, { ...expected, baseSha: 'b'.repeat(40) }, 1001));
  assert.throws(() => readLocalRulesetReadback(file, env, expected, 301001));
});
test('workflow App key exists only in isolated readback step; ordinary handoff retains GITHUB_TOKEN', () => {
  for (const name of ['block', 'owner-decision']) {
    const source = readFileSync(new URL(`../.github/workflows/owner-amendment-${name}-handoff.yml`, import.meta.url), 'utf8');
    const [before, handoff] = source.split('      - name: Verify');
    assert.match(before, /environment: github-ruleset-readback/);
    assert.match(before, /env -u GH_TOKEN -u GITHUB_TOKEN node src\/github-ruleset-readback-cli.mjs/);
    assert.match(before, /RULESET_READBACK_PRIVATE_KEY: \$\{\{ secrets.RULESET_READBACK_PRIVATE_KEY \}\}/);
    assert.doesNotMatch(handoff, /RULESET_READBACK_PRIVATE_KEY|RULESET_READBACK_APP_ID|RULESET_READBACK_INSTALLATION_ID/);
    assert.match(handoff, /GH_TOKEN: \$\{\{ github.token \}\}/);
    assert.match(handoff, /OWNER_AMENDMENT_RULESET_READBACK_FILE:/);
  }
});
