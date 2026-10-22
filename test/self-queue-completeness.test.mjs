import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { validatePrDescription, validateQueuedPrDescription } from '../dist/pr-description-completeness.mjs';

const workflow = readFileSync(new URL('../.github/workflows/pr-description.yml', import.meta.url), 'utf8');
const workflowScript = workflow.match(/node --input-type=module <<'JS'\n([\s\S]*?)          JS/)[1]
  .split('\n').map(line => line.replace(/^          /, '')).join('\n');
const valid = `## Outcome
Makes the delivery record explicit.
## Issue coverage
Refs #282. Covers templates and description validation.
## Verification
Focused metadata cases passed; no semantic acceptance is claimed.
## Remaining work
#252 owns CI adoption; #265 owns committed reviewer configuration.
## Authority and assurance
N/A — no canonical responsibilities or acceptance policy change.
`;
function workflowRun(body) {
  const directory = mkdtempSync(join(tmpdir(), 'pr-description-parity-'));
  try {
    const event = join(directory, 'event.json');
    writeFileSync(event, JSON.stringify({ pull_request: { body } }));
    return spawnSync(process.execPath, ['--input-type=module', '-'], { input: workflowScript, encoding: 'utf8',
      env: { ...process.env, GITHUB_EVENT_PATH: event } });
  } finally { rmSync(directory, { recursive: true, force: true }); }
}

test('extracted validator preserves workflow fixture semantics and errors', () => {
  const cases = [
    valid,
    valid.replace('Refs #282. Covers templates and description validation.', 'N/A — fixes a typo without a tracking issue.'),
    valid.replace('#252 owns CI adoption; #265 owns committed reviewer configuration.', 'None — this PR completes the stated typo correction.'),
    valid.replace('## Verification', '## Checks'),
    valid + '\n## Verification\nPassed.',
    valid.replace(/(## Issue coverage[\s\S]*?)(## Verification[\s\S]*?)(?=## Remaining work)/, '$2$1'),
    valid.replace('Makes the delivery record explicit.', '<!-- describe outcome -->'),
    valid.replace('Makes the delivery record explicit.', 'TBD'),
    valid.replace('Makes the delivery record explicit.', '- [ ]'),
    '```md\n' + valid + '```',
    '~~~md\n' + valid + '~~~~',
    '````md\n' + valid + '```',
    '```md\n' + valid,
    '<!-- unclosed comment\n' + valid,
    valid.replace('#252 owns CI adoption; #265 owns committed reviewer configuration.', 'Later work remains.'),
    valid.replace('Refs #282. Covers templates and description validation.', 'N/A'),
    null,
    valid.replace('Makes the delivery record explicit.', '$(exit 91) `exit 92` ::error::untrusted'),
  ];
  for (const body of cases) {
    const expected = validatePrDescription(body);
    const actual = workflowRun(body);
    assert.equal(actual.status, expected.ok ? 0 : 1, `body: ${String(body).slice(0, 80)}\n${actual.stderr}`);
    if (!expected.ok && typeof body === 'string') assert.deepEqual(actual.stderr.trim().split('\n'), expected.errors);
  }
});

const baseSha = 'a'.repeat(40), headSha = 'b'.repeat(40);
function livePr(overrides = {}) {
  return { number: 42, state: 'open', draft: false, body: valid,
    base: { ref: 'main', sha: baseSha, repo: { full_name: 'flair-agency/architecture-gatekeeper', id: 1379218762 } },
    head: { sha: headSha, repo: { full_name: 'flair-agency/architecture-gatekeeper', id: 1379218762 } }, ...overrides };
}
function fetcher(payload, onCall = () => {}) {
  return async (url, init) => {
    onCall(url, init);
    return new Response(JSON.stringify(payload), { status: 200, headers: { 'content-type': 'application/json' } });
  };
}
const tuple = { prNumber: 42, baseSha, headSha, token: 'test-token' };

test('queue validates a live exact PR using fixed metadata URL and bounded response', async () => {
  let seen;
  const result = await validateQueuedPrDescription({ ...tuple, fetchImpl: fetcher(livePr(), (url, init) => { seen = { url, init }; }) });
  assert.equal(result.status, 'VALIDATED');
  assert.equal(result.ok, true);
  assert.equal(seen.url, 'https://api.github.com/repos/flair-agency/architecture-gatekeeper/pulls/42');
  assert.equal(seen.init.redirect, 'error');
  assert.ok(seen.init.signal instanceof AbortSignal);
  assert.equal(seen.init.headers.authorization, 'Bearer test-token');
  assert.match(seen.init.headers.accept, /github\+json/);
});

test('queue fails closed on wrong PR, stale base/head, forks, malformed and incomplete descriptions', async () => {
  const bad = [
    livePr({ number: 43 }), livePr({ base: { ...livePr().base, sha: 'c'.repeat(40) } }),
    livePr({ head: { ...livePr().head, sha: 'c'.repeat(40) } }),
    livePr({ head: { ...livePr().head, repo: { full_name: 'someone/fork', id: 5 } } }),
    livePr({ base: { ...livePr().base, repo: { full_name: 'flair-agency/architecture-gatekeeper', id: 9 } } }),
    livePr({ head: { ...livePr().head, repo: { full_name: 'flair-agency/architecture-gatekeeper', id: 9 } } }),
    livePr({ body: valid.replace('## Verification', '## Missing') }),
    livePr({ body: valid.replace('Refs #282. Covers templates and description validation.', 'N/A') }),
    livePr({ body: null }),
    livePr({ body: 'x'.repeat(65_537) }),
  ];
  for (const pr of bad) {
    const result = await validateQueuedPrDescription({ ...tuple, fetchImpl: fetcher(pr) });
    assert.notEqual(result.status, 'VALIDATED');
    assert.equal(result.ok, false);
  }
});

test('queue rejects oversized, invalid JSON, failed, and redirected metadata reads', async () => {
  const oversized = new Response(new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(65_537)); controller.close(); } }), { status: 200 });
  const cases = [
    async () => oversized,
    async () => new Response('{', { status: 200 }),
    async () => new Response('{}', { status: 404 }),
    async () => new Response('{}', { status: 200, headers: { location: 'https://attacker.invalid/' } }),
  ];
  for (const fetchImpl of cases) {
    const result = await validateQueuedPrDescription({ ...tuple, fetchImpl });
    assert.equal(result.status, 'INCOMPLETE');
    assert.equal(result.ok, false);
  }
  const wrongUrl = await validateQueuedPrDescription({ ...tuple, fetchImpl: async () => {
    const response = new Response(JSON.stringify(livePr()), { status: 200 });
    Object.defineProperty(response, 'url', { value: 'https://attacker.invalid/pr' });
    return response;
  } });
  assert.equal(wrongUrl.status, 'INCOMPLETE');
});

test('queue CLI executes the compiled validator and propagates positive and negative results', () => {
  const directory = mkdtempSync(join(tmpdir(), 'queue-completeness-cli-'));
  try {
    const preload = join(directory, 'metadata.mjs');
    for (const [payload, expected] of [[livePr(), 0], [livePr({ body: 'missing sections' }), 1],
      [livePr({ head: { ...livePr().head, sha: 'c'.repeat(40) } }), 1]]) {
      writeFileSync(preload, `globalThis.fetch = async (url) => {
        if (url !== 'https://api.github.com/repos/flair-agency/architecture-gatekeeper/pulls/42') throw new Error('unexpected URL');
        return new Response(${JSON.stringify(JSON.stringify(payload))}, { status: 200 });
      };`);
      const result = spawnSync(process.execPath, ['--import', preload,
        new URL('../scripts/self-queue-completeness.mjs', import.meta.url).pathname], {
        encoding: 'utf8', env: { ...process.env, NODE_OPTIONS: '', GITHUB_TOKEN: 'synthetic-token',
          SELF_PR_NUMBER: '42', SELF_PR_BASE_SHA: baseSha, SELF_PR_HEAD_SHA: headSha },
      });
      assert.equal(result.status, expected, result.stderr);
      if (expected === 0) assert.match(result.stdout, /sections are populated/);
      else assert.doesNotMatch(result.stdout, /sections are populated/);
    }
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('queue CLI propagates missing protected context as a failing process', () => {
  const result = spawnSync(process.execPath, [new URL('../scripts/self-queue-completeness.mjs', import.meta.url).pathname], {
    encoding: 'utf8',
    env: { ...process.env, NODE_OPTIONS: '', GITHUB_TOKEN: '', SELF_PR_NUMBER: '', SELF_PR_BASE_SHA: '', SELF_PR_HEAD_SHA: '' },
  });
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, /Trusted queue PR bindings or API token are invalid/);
  assert.doesNotMatch(result.stdout, /sections are populated/);
});
