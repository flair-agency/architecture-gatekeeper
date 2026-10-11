import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readWorkflow } from './helpers/workflow-structure.mjs';

const callerPath = '../../.github/workflows/issue334-ordinary-feature-caller.yml';
const source = await readFile(new URL('../.github/workflows/issue334-ordinary-feature-caller.yml', import.meta.url), 'utf8');
const workflow = readWorkflow(callerPath).workflow;
const admissionConfig = JSON.parse(await readFile(new URL('../.codex/gatekeeper/ordinary-gemini-admission.json', import.meta.url), 'utf8'));
const admissionJob = workflow.jobs['protected-admission'];
const admissionScript = (() => {
  const start = source.indexOf('        run: |\n', source.indexOf('Verify bounded deployment admission'));
  assert.ok(start >= 0);
  const lines = source.slice(start + '        run: |\n'.length).split('\n');
  const body = [];
  for (const line of lines) {
    if (line && !line.startsWith('          ')) break;
    body.push(line ? line.slice(10) : '');
  }
  return body.join('\n').match(/^node --input-type=module <<'NODE'\n([\s\S]*?)\nNODE\s*$/)?.[1];
})();
assert.ok(admissionScript, 'actual inline admission source is present');

// This also checks the synthetic YAML parser, not GitHub's expression engine.
function assertCandidate(candidate) {
  assert.deepEqual(candidate.on.pull_request_target, {
    branches: ['feature/gemini-ci'],
    types: ['ready_for_review'],
  });
  assert.deepEqual(Object.keys(candidate.on), ['pull_request_target']);
  assert.deepEqual(candidate.jobs['classify-self-repository'].permissions,
    { contents: 'none', 'id-token': 'none' });
  assert.equal(candidate.jobs['architecture-gate'].if, false);
  assert.deepEqual(candidate.jobs['architecture-gate'].needs, ['classify-self-repository', 'protected-admission']);
  assert.deepEqual(candidate.jobs['protected-admission'].permissions,
    { contents: 'read', actions: 'read', 'pull-requests': 'read', 'id-token': 'none' });
  assert.deepEqual(candidate.jobs['architecture-gate'].permissions,
    { contents: 'read', actions: 'read', 'pull-requests': 'write', 'id-token': 'write' });
  assert.equal(candidate.jobs['architecture-gate'].uses,
    'flair-agency/architecture-gatekeeper/.github/workflows/architecture-gate-providers.yml@7dc99525b4ff1510f1de310f6f5b877ab05bbfd2');
  assert.deepEqual(candidate.jobs['architecture-gate'].with, {
    'policy-path': '.codex/gatekeeper/gemini-verification-policy.json',
    'prompt-path': '.codex/gatekeeper/ci-prompt.md',
    'schema-path': '.codex/gatekeeper/ci-decision.schema.json',
    'validation-path': '.codex/gatekeeper/decision.validation.json',
    'protected-review-instructions': true,
  });
  assert.deepEqual(Object.keys(candidate.jobs['architecture-gate'].secrets).sort(),
    ['GCP_WIF_PROVIDER', 'GCP_WIF_SERVICE_ACCOUNT']);
  assert.equal(candidate.jobs['architecture-gate'].secrets.OPENAI_API_KEY, undefined);
  assert.equal(candidate.jobs['architecture-gate'].secrets['CI_SOURCE_READ_TOKEN'], undefined);
  assert.doesNotMatch(JSON.stringify(candidate), /secrets:\s*inherit|OPENAI_API_KEY|CI_SOURCE_READ_TOKEN|workflow_dispatch|schedule|push:/);
}

test('ordinary Gemini caller retains its inactive privileged job and bounded selectors', () => {
  assertCandidate(workflow);
  assert.match(source, /if: false/);
  assert.equal(admissionConfig.enabled, false);
  for (const key of ['workflowId', 'runNumber', 'callerSha256', 'providerSelectorSha256', 'serviceAccountSelectorSha256']) {
    assert.equal(admissionConfig[key], null);
  }
  assert.doesNotMatch(source, /workflow_dispatch|workflow_run|pull_request:\s|branches:\s*\[main\]|secrets:\s*inherit/);
});

test('admission executes actual gate source against mocked GitHub API and fails closed on changed identity', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'agk334-admission-'));
  const callerBytes = Buffer.from(source);
  const workflowSha = 'a'.repeat(40);
  const eventSha = '43e9a28571ad0508a425220256a18d6b140525b2';
  const config = { version: 1, enabled: true, workflowId: 42, runNumber: 9,
    callerSha256: createHash('sha256').update(callerBytes).digest('hex'),
    providerSelectorSha256: createHash('sha256').update('projects/123456789/locations/global/workloadIdentityPools/agk/providers/github', 'utf8').digest('hex'),
    serviceAccountSelectorSha256: createHash('sha256').update('agk-gemini@agk-gemini.iam.gserviceaccount.com', 'utf8').digest('hex') };
  const event = { action: 'ready_for_review', repository: { id: 123 }, pull_request: {
    number: 517, draft: false, merge_commit_sha: '20cc0c1a58ee8263898a56c8df34472bd14ea173', base: { ref: 'feature/gemini-ci', sha: '43e9a28571ad0508a425220256a18d6b140525b2', repo: { id: 123 } },
    head: { sha: 'c4b0057d9dd47f79df2a896143f7ac6db5da2c2e', repo: { id: 123 } },
  } };
  const values = {
    [`/git/commits/${workflowSha}`]: { tree: { sha: '1'.repeat(40) } },
    ['/git/trees/' + '1'.repeat(40)]: { tree: [
      { path: '.codex', type: 'tree', mode: '040000', sha: '2'.repeat(40) },
      { path: '.github', type: 'tree', mode: '040000', sha: '3'.repeat(40) },
    ] },
    ['/git/trees/' + '2'.repeat(40)]: { tree: [{ path: 'gatekeeper', type: 'tree', mode: '040000', sha: '4'.repeat(40) }] },
    ['/git/trees/' + '4'.repeat(40)]: { tree: [{ path: 'ordinary-gemini-admission.json', type: 'blob', mode: '100644', sha: '5'.repeat(40) }] },
    ['/git/trees/' + '3'.repeat(40)]: { tree: [{ path: 'workflows', type: 'tree', mode: '040000', sha: '6'.repeat(40) }] },
    ['/git/trees/' + '6'.repeat(40)]: { tree: [{ path: 'issue334-ordinary-feature-caller.yml', type: 'blob', mode: '100644', sha: '7'.repeat(40) }] },
    ['/git/blobs/' + '5'.repeat(40)]: { sha: '5'.repeat(40), encoding: 'base64', size: Buffer.byteLength(JSON.stringify(config)), content: Buffer.from(JSON.stringify(config)).toString('base64') },
    ['/git/blobs/' + '7'.repeat(40)]: { sha: '7'.repeat(40), encoding: 'base64', size: callerBytes.length, content: callerBytes.toString('base64') },
    '/actions/runs/99': { id: 99, repository: { id: 123 }, workflow_id: 42, run_number: 9, run_attempt: 1, event: 'pull_request_target', head_sha: 'c4b0057d9dd47f79df2a896143f7ac6db5da2c2e' },
    '/actions/workflows/42': { id: 42, path: '.github/workflows/issue334-ordinary-feature-caller.yml' },
    '/pulls/517': { number: 517, draft: false, base: { ref: 'feature/gemini-ci', sha: eventSha, repo: { id: 123 } }, head: { sha: 'c4b0057d9dd47f79df2a896143f7ac6db5da2c2e', repo: { id: 123 } }, merge_commit_sha: '20cc0c1a58ee8263898a56c8df34472bd14ea173' },
    '/commits/20cc0c1a58ee8263898a56c8df34472bd14ea173': { sha: '20cc0c1a58ee8263898a56c8df34472bd14ea173', parents: [{ sha: '43e9a28571ad0508a425220256a18d6b140525b2' }, { sha: 'c4b0057d9dd47f79df2a896143f7ac6db5da2c2e' }] },
  };
  const replaceConfigBlob = (fixture, nextConfig) => {
    const blob = fixture['/git/blobs/' + '5'.repeat(40)];
    const bytes = Buffer.from(JSON.stringify(nextConfig));
    blob.content = bytes.toString('base64');
    blob.size = bytes.length;
  };
  try {
    const eventPath = join(directory, 'event.json');
    const outputPath = join(directory, 'output');
    const callPath = join(directory, 'calls');
    const fixturePath = join(directory, 'fixture.json');
    await writeFile(eventPath, JSON.stringify(event));
    const execute = async (mutate = () => {}, failure = false, mutateEvent = () => {}, providerSelector = 'provider-selector', accountSelector = 'sa-selector', expectedCalls, deadline = false) => {
      const fixture = structuredClone(values);
      mutate(fixture);
      const eventFixture = structuredClone(event);
      mutateEvent(eventFixture);
      await writeFile(eventPath, JSON.stringify(eventFixture));
      await writeFile(fixturePath, JSON.stringify(fixture));
      await writeFile(outputPath, '');
      await writeFile(callPath, '0');
      const prelude = `import {readFileSync as mockReadFileSync,writeFileSync as mockWriteFileSync} from 'node:fs'; let mockCount=0; process.on('exit',()=>mockWriteFileSync(process.env.CALL_PATH,String(mockCount))); const fixture=JSON.parse(mockReadFileSync(process.env.FIXTURE_PATH,'utf8')); if (${deadline ? 'true' : 'false'}) { const originalTimeout=AbortSignal.timeout; AbortSignal.timeout=()=>{const controller=new AbortController();controller.abort();return controller.signal;}; AbortSignal.any=signals=>signals[0]; } globalThis.fetch = async (url, options) => { mockCount++; const parsed = new URL(url); if (parsed.origin !== 'https://api.github.com') throw new Error('unexpected origin'); const path = parsed.pathname.replace('/repos/flair-agency/architecture-gatekeeper', '') + parsed.search; if (options.redirect !== 'error') throw new Error('redirect mode missing'); if (options.signal.aborted) throw new Error('aborted by bounded deadline'); if (${failure ? 'true' : 'false'} && path === '/pulls/517') return { ok:false }; const value = fixture[path]; if (!value) return { ok:false }; const bytes = new TextEncoder().encode(JSON.stringify(value)); let sent=false; return { ok:true, body:{getReader:()=>({read:async()=>{if(sent)return {done:true};sent=true;return {done:false,value:bytes};},cancel:async()=>{}})} }; };`;
      const result = spawnSync(process.execPath, ['--input-type=module', '-e', `${prelude}\n${admissionScript}`], {
        encoding: 'utf8', maxBuffer: 4 * 1024 * 1024, env: { ...process.env, GITHUB_OUTPUT: outputPath, GITHUB_EVENT_PATH: eventPath,
          GITHUB_EVENT_NAME: 'pull_request_target', GITHUB_RUN_ID: '99', GITHUB_RUN_NUMBER: '9', GITHUB_RUN_ATTEMPT: '1',
          GITHUB_REPOSITORY: 'flair-agency/architecture-gatekeeper', GITHUB_REPOSITORY_ID: '123',
          GITHUB_SHA: eventSha, GITHUB_WORKFLOW_SHA: workflowSha, GH_TOKEN: 'mock-token', CALL_PATH: callPath, FIXTURE_PATH: fixturePath,
          GCP_WIF_PROVIDER_SELECTOR: providerSelector === 'provider-selector' ? 'projects/123456789/locations/global/workloadIdentityPools/agk/providers/github' : providerSelector,
          GCP_WIF_SERVICE_ACCOUNT_SELECTOR: accountSelector === 'sa-selector' ? 'agk-gemini@agk-gemini.iam.gserviceaccount.com' : accountSelector },
      });
      assert.equal(result.status, 0, result.stderr);
      if (expectedCalls !== undefined) assert.equal(Number(await readFile(callPath, 'utf8')), expectedCalls);
      return (await readFile(outputPath, 'utf8')).trim();
    };
    assert.equal(await execute(() => {}, false, () => {}, 'provider-selector', 'sa-selector', 12), 'admitted=true');
    const mutations = [
      c => { c['/pulls/517'].head.sha = 'd'.repeat(40); },
      c => { c['/pulls/517'].base.sha = 'b'.repeat(40); },
      c => { c['/commits/20cc0c1a58ee8263898a56c8df34472bd14ea173'].parents.reverse(); },
      c => { c['/actions/runs/99'].workflow_id++; },
      c => { c['/actions/runs/99'].run_number++; },
      c => { c['/actions/runs/99'].run_attempt = 2; },
      c => { const changed = Buffer.from(source + '\n'); c['/git/blobs/' + '7'.repeat(40)].content = changed.toString('base64'); c['/git/blobs/' + '7'.repeat(40)].size = changed.length; },
      c => { replaceConfigBlob(c, { ...config, enabled: false }); },
      c => { replaceConfigBlob(c, { ...config, workflowId: null }); },
      c => { replaceConfigBlob(c, { ...config, providerSelectorSha256: '0'.repeat(64) }); },
      c => { replaceConfigBlob(c, { ...config, extra: 'unknown-field' }); },
      c => { c['/git/trees/' + '4'.repeat(40)].tree[0].mode = '120000'; },
      c => { c['/git/blobs/' + '5'.repeat(40)].content = 'not-base64-json'; },
    ];
    for (const mutate of mutations) assert.equal(await execute(mutate), 'admitted=false');
    assert.equal(await execute(c => replaceConfigBlob(c, admissionConfig), false, () => {}, 'provider-selector', 'sa-selector', 5), 'admitted=false');
    assert.equal(await execute(() => {}, true), 'admitted=false');
    assert.equal(await execute(c => { c['/pulls/517'].merge_commit_sha = 'e'.repeat(40); }), 'admitted=false');
    assert.equal(await execute(c => { c['/commits/20cc0c1a58ee8263898a56c8df34472bd14ea173'].parents[0].sha = 'e'.repeat(40); }), 'admitted=false');
    assert.equal(await execute(() => {}, false, e => { e.action = 'synchronize'; }, 'provider-selector', 'sa-selector', 0), 'admitted=false');
    assert.equal(await execute(() => {}, false, e => { delete e.pull_request.merge_commit_sha; }, 'provider-selector', 'sa-selector', 0), 'admitted=false');
    assert.equal(await execute(() => {}, false, e => { e.pull_request.head.repo.id = 456; }, 'provider-selector', 'sa-selector', 0), 'admitted=false');
    assert.equal(await execute(() => {}, false, () => {}, 'wrong-provider-selector'), 'admitted=false');
    assert.equal(await execute(() => {}, false, () => {}, 'provider-selector', ''), 'admitted=false');
    assert.equal(await execute(() => {}, false, () => {}, 'provider-selector', 'sa-selector', 1, true), 'admitted=false');
    assert.equal(await execute(c => { c['/pulls/517'].body = 'x'.repeat(1_050_000); }), 'admitted=false');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('caller retains the existing strict self classifier verbatim', async () => {
  const self = await readFile(new URL('../.github/workflows/self-architecture-gate.yml', import.meta.url), 'utf8');
  const classifier = text => {
    const begin = text.indexOf('      - name: Classify trusted base and head repository IDs');
    const end = text.indexOf('\n\n  ', begin);
    assert.ok(begin >= 0 && end > begin);
    return text.slice(begin, end);
  };
  assert.equal(classifier(source), classifier(self));
});

test('mutated caller fixtures that widen activation, selectors, credentials, or triggers fail the synthetic invariant', () => {
  for (const mutate of [
    c => { c.jobs['architecture-gate']['if'] = true; },
    c => { delete c.jobs['architecture-gate']['if']; },
    c => { c.jobs['architecture-gate']['if'] = "${{ github.run_attempt >= 1 }}"; },
    c => { c.on.pull_request_target.branches.push('main'); },
    c => { c.on.pull_request_target.types.push('synchronize'); },
    c => { c.jobs['architecture-gate'].uses = c.jobs['architecture-gate'].uses.replace(/@.*/, '@main'); },
    c => { c.jobs['architecture-gate'].with['prompt-path'] = '.codex/candidate-prompt.md'; },
    c => { c.jobs['architecture-gate'].secrets.OPENAI_API_KEY = '${{ secrets.OPENAI_API_KEY }}'; },
    c => { c.on.workflow_dispatch = {}; },
  ]) {
    const fixture = structuredClone(workflow);
    mutate(fixture);
    assert.throws(() => assertCandidate(fixture));
  }
});


test('copied classifier executes same-repository, fork, and malformed metadata cases', async () => {
  const stepStart = source.indexOf('- name: Classify trusted base and head repository IDs');
  const runStart = source.indexOf('        run: |\n', stepStart);
  assert.ok(stepStart >= 0 && runStart > stepStart);
  const lines = source.slice(runStart + '        run: |\n'.length).split('\n');
  const body = [];
  for (const line of lines) {
    if (line && !line.startsWith('          ')) break;
    body.push(line ? line.slice(10) : '');
  }
  const wrapped = body.join('\n');
  const script = wrapped.match(/^node --input-type=module <<'NODE'\n([\s\S]*?)\nNODE\s*$/)?.[1];
  assert.ok(script);
  const directory = await mkdtemp(join(tmpdir(), 'agk334-caller-classifier-'));
  try {
    const classify = async fixture => {
      const eventPath = join(directory, 'event.json');
      const outputPath = join(directory, 'output');
      await writeFile(eventPath, JSON.stringify(fixture));
      await writeFile(outputPath, '');
      const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
        encoding: 'utf8',
        env: { ...process.env, GITHUB_EVENT_PATH: eventPath, GITHUB_OUTPUT: outputPath,
          GITHUB_EVENT_NAME: 'pull_request_target', EXPECTED_REPOSITORY_ID: '123',
          EXPECTED_PULL_REQUEST_NUMBER: '45' },
      });
      assert.equal(result.status, 0, result.stderr);
      return (await readFile(outputPath, 'utf8')).trim();
    };
    const fixture = { repository: { id: 123 }, pull_request: { number: 45,
      base: { sha: 'a'.repeat(40), repo: { id: 123 } },
      head: { sha: 'b'.repeat(40), repo: { id: 123 } } } };
    assert.equal(await classify(fixture), 'classification=same-repository');
    assert.equal(await classify({ ...fixture, pull_request: { ...fixture.pull_request,
      head: { ...fixture.pull_request.head, repo: { id: 456 } } } }), 'classification=cross-repository');
    assert.equal(await classify({ ...fixture, pull_request: { ...fixture.pull_request, number: 46 } }), 'classification=unknown');
    assert.equal(await classify({ ...fixture, repository: { id: '123' } }), 'classification=unknown');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
