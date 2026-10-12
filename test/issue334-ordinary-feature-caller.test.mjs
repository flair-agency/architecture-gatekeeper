import test from 'node:test';
import assert from 'node:assert/strict';
import { link, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import * as realFs from 'node:fs';
import * as pathModule from 'node:path';
import { createHash } from 'node:crypto';
import { readWorkflow } from './helpers/workflow-structure.mjs';

const callerPath = '../../.github/workflows/issue334-ordinary-feature-caller.yml';
const source = await readFile(new URL('../.github/workflows/issue334-ordinary-feature-caller.yml', import.meta.url), 'utf8');
const workflow = readWorkflow(callerPath).workflow;
const admissionConfig = JSON.parse(await readFile(new URL('../.codex/gatekeeper/ordinary-gemini-admission.json', import.meta.url), 'utf8'));
const admissionJob = workflow.jobs['protected-admission'];
function extractInlineScript(text, marker) {
  const markerIndex = text.indexOf(marker);
  const start = text.indexOf('        run: |\n', markerIndex);
  assert.ok(markerIndex >= 0 && start > markerIndex);
  const lines = text.slice(start + '        run: |\n'.length).split('\n');
  const body = [];
  for (const line of lines) {
    if (line && !line.startsWith('          ')) break;
    body.push(line ? line.slice(10) : '');
  }
  return body.join('\n').match(/^node --input-type=module <<'NODE'\n([\s\S]*?)\nNODE\s*$/)?.[1];
}
const admissionScript = extractInlineScript(source, 'Verify bounded deployment admission');
const classifierScript = extractInlineScript(source, 'Classify trusted base and head repository IDs');
assert.ok(admissionScript, 'actual inline admission source is present');
assert.ok(classifierScript, 'actual inline classifier source is present');

// Synthetic-only selector preimages stand in for unavailable secret strings. The test maps
// exactly these two selectors to their pinned digests; caller SHA and every other input use
// ordinary SHA-256. This is not evidence about the real secret preimages or Google trust.
const syntheticProviderSelector = 'projects/123456789/locations/global/workloadIdentityPools/agk/providers/github';
const syntheticServiceAccountSelector = 'agk-gemini@agk-gemini.iam.gserviceaccount.com';
const syntheticSelectorHashes = new Map([
  [syntheticProviderSelector, 'e3e7a8a5c8f61c6b3fc7e0eed879e662be902299304d2501843cc06821fb5b9c'],
  [syntheticServiceAccountSelector, 'af5c0a83eb95b8969994e2b9667a0f2964bce2cb43e390441e40e280e1992e92'],
]);
const syntheticCrypto = {
  createHash(algorithm) {
    const hash = createHash(algorithm);
    let selectorDigest;
    let updates = 0;
    return {
      update(value, encoding) {
        selectorDigest = algorithm === 'sha256' && updates === 0 && typeof value === 'string'
          ? syntheticSelectorHashes.get(value) : undefined;
        updates++;
        hash.update(value, encoding);
        return this;
      },
      digest(encoding) {
        return selectorDigest !== undefined && encoding === 'hex' ? selectorDigest : hash.digest(encoding);
      },
    };
  },
};

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
async function runInline(script, { env, fetchImpl, fsOverrides = {}, abortImpl = AbortSignal, nowImpl = Date.now, cryptoImpl = { createHash } }) {
  const transformed = script
    .replace("import * as fs from 'node:fs';", 'const fs = __fs;')
    .replace("import * as path from 'node:path';", 'const path = __path;')
    .replace("import { createHash } from 'node:crypto';", 'const { createHash } = __crypto;')
    .replaceAll('AbortSignal.timeout(', '__abort.timeout(')
    .replaceAll('AbortSignal.any(', '__abort.any(')
    .replaceAll('Date.now()', '__now()');
  const fakeProcess = { env, exitCode: 0 };
  const errors = [];
  const mockFs = { ...realFs, ...fsOverrides };
  const execute = new AsyncFunction('__fs', '__path', '__crypto', '__abort', '__now', 'process', 'console', 'fetch', transformed);
  await execute(mockFs, pathModule, cryptoImpl, abortImpl, nowImpl, fakeProcess,
    { error: (...args) => errors.push(args.join(' ')) }, fetchImpl);
  return { status: fakeProcess.exitCode, stderr: errors.length ? `${errors.join('\n')}\n` : '' };
}

// This also checks the synthetic YAML parser, not GitHub's expression engine.
const enabledGuard = "needs.classify-self-repository.outputs.classification == 'same-repository' && needs.protected-admission.outputs.admitted == 'true' && github.event_name == 'pull_request_target' && github.event.action == 'ready_for_review' && github.event.pull_request.draft == false && github.event.pull_request.number == 517 && github.event.pull_request.head.sha == 'c4b0057d9dd47f79df2a896143f7ac6db5da2c2e' && github.run_attempt == 1";

function assertCandidate(candidate) {
  assert.deepEqual(candidate.on.pull_request_target, {
    branches: ['feature/gemini-ci'],
    types: ['ready_for_review'],
  });
  assert.deepEqual(Object.keys(candidate.on), ['pull_request_target']);
  assert.deepEqual(candidate.jobs['classify-self-repository'].permissions,
    { contents: 'none', 'id-token': 'none' });
  assert.equal(candidate.jobs['architecture-gate'].if, enabledGuard);
  assert.deepEqual(candidate.jobs['architecture-gate'].needs, ['classify-self-repository', 'protected-admission']);
  assert.deepEqual(candidate.jobs['protected-admission'].permissions,
    { contents: 'read', actions: 'read', 'pull-requests': 'read', 'id-token': 'none' });
  assert.deepEqual(candidate.jobs['architecture-gate'].permissions,
    { contents: 'read', actions: 'read', 'pull-requests': 'write', 'id-token': 'write' });
  assert.equal(candidate.jobs['architecture-gate'].uses,
    'flair-agency/architecture-gatekeeper/.github/workflows/architecture-gate-providers.yml@c5686f63909af2e83b749ffa0b91d33cb9ea96ad');
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

test('prospective ordinary Gemini caller has the exact bounded enabled job guard', () => {
  assertCandidate(workflow);
  assert.match(source, /# One selected workflow instance\/ordinal\/attempt must pass the protected admission step\.\n    if: needs\.classify-self-repository\.outputs\.classification == 'same-repository'/);
  assert.match(source, /github\.event\.pull_request\.number == 517.*github\.run_attempt == 1/);
  assert.deepEqual(admissionConfig, {
    version: 1,
    enabled: true,
    workflowId: 381385696,
    runNumber: 1,
    callerSha256: '4befbe3144aebceac3309527a8d6cbe67779fb05fb36664ea0ea3a129775c74a',
    providerSelectorSha256: 'e3e7a8a5c8f61c6b3fc7e0eed879e662be902299304d2501843cc06821fb5b9c',
    serviceAccountSelectorSha256: 'af5c0a83eb95b8969994e2b9667a0f2964bce2cb43e390441e40e280e1992e92',
  });
  assert.equal(createHash('sha256').update(source, 'utf8').digest('hex'), admissionConfig.callerSha256);
  assert.doesNotMatch(source, /workflow_dispatch|workflow_run|pull_request:\s|branches:\s*\[main\]|secrets:\s*inherit/);
});

test('admission executes actual gate source against mocked GitHub API and fails closed on changed identity', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'agk334-admission-'));
  const callerBytes = Buffer.from(source);
  const workflowSha = 'a'.repeat(40);
  const eventSha = 'c5686f63909af2e83b749ffa0b91d33cb9ea96ad';
  assert.notEqual(eventSha, workflowSha, 'feature base and caller workflow revision are distinct');
  const mergeSha = '96ab3902f95250a1c80aecec45434e04272ad548';
  const mergeTreeSha = '8107feae6dbf6bc38b279fcab724fd42a5ad0097';
  for (const identity of [
    'pr: 517',
    "base: 'c5686f63909af2e83b749ffa0b91d33cb9ea96ad'",
    "head: 'c4b0057d9dd47f79df2a896143f7ac6db5da2c2e'",
    "merge: '96ab3902f95250a1c80aecec45434e04272ad548'",
    "mergeTree: '8107feae6dbf6bc38b279fcab724fd42a5ad0097'",
  ]) assert.ok(admissionScript.includes(identity), `expected protected identity ${identity}`);
  const config = { version: 1, enabled: true, workflowId: 381385696, runNumber: 1,
    callerSha256: createHash('sha256').update(callerBytes).digest('hex'),
    providerSelectorSha256: syntheticSelectorHashes.get(syntheticProviderSelector),
    serviceAccountSelectorSha256: syntheticSelectorHashes.get(syntheticServiceAccountSelector) };
  assert.deepEqual({ workflowId: config.workflowId, runNumber: config.runNumber },
    { workflowId: 381385696, runNumber: 1 });
  const event = { action: 'ready_for_review', repository: { id: 123 }, pull_request: {
    number: 517, draft: false, merge_commit_sha: mergeSha, base: { ref: 'feature/gemini-ci', sha: eventSha, repo: { id: 123 } },
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
    '/actions/runs/99': { id: 99, repository: { id: 123 }, workflow_id: 381385696, run_number: 1, run_attempt: 1, event: 'pull_request_target', head_sha: 'c4b0057d9dd47f79df2a896143f7ac6db5da2c2e' },
    '/actions/workflows/381385696': { id: 381385696, path: '.github/workflows/issue334-ordinary-feature-caller.yml' },
    '/pulls/517': { number: 517, draft: false, base: { ref: 'feature/gemini-ci', sha: eventSha, repo: { id: 123 } }, head: { sha: 'c4b0057d9dd47f79df2a896143f7ac6db5da2c2e', repo: { id: 123 } }, merge_commit_sha: mergeSha },
    [`/commits/${mergeSha}`]: { sha: mergeSha, parents: [{ sha: eventSha }, { sha: 'c4b0057d9dd47f79df2a896143f7ac6db5da2c2e' }], commit: { tree: { sha: mergeTreeSha } } },
  };
  const replaceConfigBlobBytes = (fixture, bytes) => {
    const blob = fixture['/git/blobs/' + '5'.repeat(40)];
    blob.content = bytes.toString('base64');
    blob.size = bytes.length;
  };
  const replaceConfigBlob = (fixture, nextConfig) =>
    replaceConfigBlobBytes(fixture, Buffer.from(JSON.stringify(nextConfig)));
  try {
    const eventPath = join(directory, 'event.json');
    const callPath = join(directory, 'calls');
    const fixturePath = join(directory, 'fixture.json');
    await writeFile(eventPath, JSON.stringify(event));
    const execute = async (mutate = () => {}, failure = false, mutateEvent = () => {}, providerSelector = 'provider-selector', accountSelector = 'sa-selector', expectedCalls, githubSha = workflowSha, sink = {}) => {
      const fixture = structuredClone(values);
      mutate(fixture);
      const eventFixture = structuredClone(event);
      mutateEvent(eventFixture);
      const outputPath = sink.path ?? join(directory, 'output');
      await writeFile(eventPath, JSON.stringify(eventFixture));
      await writeFile(fixturePath, JSON.stringify(fixture));
      if (sink.initialize !== false) await writeFile(outputPath, sink.contents ?? '');
      await writeFile(callPath, '0');
      let calls = 0;
      const fetchImpl = async (url, options) => {
        calls++;
        const parsed = new URL(url);
        if (parsed.origin !== 'https://api.github.com') throw new Error('unexpected origin');
        const path = parsed.pathname.replace('/repos/flair-agency/architecture-gatekeeper', '') + parsed.search;
        if (options.redirect !== 'error') throw new Error('redirect mode missing');
        if (options.signal.aborted) throw new Error('request signal already aborted');
        if (sink.waitForAbort) return await new Promise((resolve, reject) => {
          options.signal.addEventListener('abort', () => reject(new Error('request aborted by timeout signal')), { once: true });
        });
        if (failure && path === '/pulls/517') return { ok: false };
        const value = fixture[path];
        if (!value) return { ok: false };
        const bytes = new TextEncoder().encode(JSON.stringify(value));
        let sent = false;
        return { ok: true, body: { getReader: () => ({ read: async () => {
          if (sent) return { done: true };
          sent = true;
          return { done: false, value: bytes };
        }, cancel: async () => {} }) } };
      };
      const fsOverrides = sink.changedIdentity ? { fstatSync: fd => {
        const stats = realFs.fstatSync(fd);
        return new Proxy(stats, { get(target, key, receiver) {
          if (key === 'ino') return target.ino + 1;
          return Reflect.get(target, key, receiver);
        } });
      } } : sink.closeFailure ? { closeSync: fd => {
        realFs.closeSync(fd);
        throw new Error('close failed');
      } } : {};
      const executionEnv = { ...process.env, GITHUB_OUTPUT: outputPath,
        GITHUB_EVENT_PATH: eventPath, GITHUB_EVENT_NAME: 'pull_request_target', GITHUB_RUN_ID: '99',
        GITHUB_RUN_NUMBER: '1', GITHUB_RUN_ATTEMPT: '1', GITHUB_REPOSITORY: 'flair-agency/architecture-gatekeeper',
        GITHUB_REPOSITORY_ID: '123', GITHUB_SHA: githubSha, GITHUB_WORKFLOW_SHA: workflowSha,
        GH_TOKEN: 'mock-token', GCP_WIF_PROVIDER_SELECTOR: providerSelector === 'provider-selector'
          ? 'projects/123456789/locations/global/workloadIdentityPools/agk/providers/github' : providerSelector,
        GCP_WIF_SERVICE_ACCOUNT_SELECTOR: accountSelector === 'sa-selector'
          ? 'agk-gemini@agk-gemini.iam.gserviceaccount.com' : accountSelector,
        ...sink.envOverrides };
      if (sink.omitGithubSha) delete executionEnv.GITHUB_SHA;
      const result = await runInline(admissionScript, { env: executionEnv, fetchImpl, fsOverrides,
        abortImpl: sink.abortImpl ?? AbortSignal, nowImpl: sink.nowImpl ?? Date.now, cryptoImpl: syntheticCrypto });
      const expectedStatus = sink.expectedStatus ?? 0;
      assert.equal(result.status, expectedStatus, result.stderr);
      if (expectedCalls !== undefined) assert.equal(calls, expectedCalls);
      if (sink.returnDetails) {
        const output = await readFile(outputPath, 'utf8').catch(error => error.code === 'ENOENT' ? null : Promise.reject(error));
        return { status: result.status, stdout: '', stderr: result.stderr, output };
      }
      return (await readFile(outputPath, 'utf8')).trim();
    };
    assert.equal(await execute(() => {}, false, () => {}, 'provider-selector', 'sa-selector', 12), 'admitted=true');
    const sentinel = 'prior=runner-data\n';
    const normalOutput = join(directory, 'normal-admission-output');
    const admitted = await execute(() => {}, false, () => {}, 'provider-selector', 'sa-selector', 12, workflowSha,
      { path: normalOutput, contents: sentinel, returnDetails: true });
    assert.deepEqual(admitted, { status: 0, stdout: '', stderr: '', output: `${sentinel}admitted=true\n` });

    // Exercise the extracted production script through a real Node child process
    // as well as the in-process injected-filesystem cases below.
    const runAdmissionChild = async (fixture, outputPath, envOverrides = {}) => {
      await writeFile(fixturePath, JSON.stringify(fixture));
      await writeFile(eventPath, JSON.stringify(event));
      const prelude = `import {readFileSync as mockReadFileSync,writeFileSync as mockWriteFileSync} from 'node:fs';
        import crypto from 'node:crypto';
        import {syncBuiltinESMExports} from 'node:module';
        let mockCallCount=0;process.on('exit',()=>mockWriteFileSync(process.env.CALL_PATH,String(mockCallCount)));
        const realCreateHash=crypto.createHash;
        const selectorDigests=new Map([
          ['${syntheticProviderSelector}','${syntheticSelectorHashes.get(syntheticProviderSelector)}'],
          ['${syntheticServiceAccountSelector}','${syntheticSelectorHashes.get(syntheticServiceAccountSelector)}'],
        ]);
        crypto.createHash=algorithm=>{const hash=realCreateHash(algorithm);let mapped;let updates=0;return{update(value,encoding){mapped=algorithm==='sha256'&&updates===0&&typeof value==='string'?selectorDigests.get(value):undefined;updates++;hash.update(value,encoding);return this;},digest(encoding){return mapped!==undefined&&encoding==='hex'?mapped:hash.digest(encoding);}};};
        syncBuiltinESMExports();
        const fixture=JSON.parse(mockReadFileSync(process.env.FIXTURE_PATH,'utf8'));
        globalThis.fetch=async(url,options)=>{mockCallCount++;const parsed=new URL(url);const path=parsed.pathname.replace('/repos/flair-agency/architecture-gatekeeper','')+parsed.search;if(parsed.origin!=='https://api.github.com'||options.redirect!=='error'||options.signal.aborted)throw new Error('unexpected request');const value=fixture[path];if(!value)return{ok:false};const bytes=new TextEncoder().encode(JSON.stringify(value));let sent=false;return{ok:true,body:{getReader:()=>({read:async()=>{if(sent)return{done:true};sent=true;return{done:false,value:bytes};},cancel:async()=>{}})}};};`;
      const result = spawnSync(process.execPath, ['--input-type=module', '-e', `${prelude}\n${admissionScript}`], {
        encoding: 'utf8', maxBuffer: 4 * 1024 * 1024, env: { ...process.env, GITHUB_OUTPUT: outputPath,
          GITHUB_EVENT_PATH: eventPath, GITHUB_EVENT_NAME: 'pull_request_target', GITHUB_RUN_ID: '99',
          GITHUB_RUN_NUMBER: '1', GITHUB_RUN_ATTEMPT: '1', GITHUB_REPOSITORY: 'flair-agency/architecture-gatekeeper',
          GITHUB_REPOSITORY_ID: '123', GITHUB_SHA: workflowSha, GITHUB_WORKFLOW_SHA: workflowSha,
          GH_TOKEN: 'mock-token', FIXTURE_PATH: fixturePath,
          GCP_WIF_PROVIDER_SELECTOR: 'projects/123456789/locations/global/workloadIdentityPools/agk/providers/github',
          GCP_WIF_SERVICE_ACCOUNT_SELECTOR: 'agk-gemini@agk-gemini.iam.gserviceaccount.com', CALL_PATH: callPath,
          ...envOverrides },
      });
      return { status: result.status, stderr: result.stderr, error: result.error?.message };
    };
    const childOutput = join(directory, 'child-admission-output');
    await writeFile(childOutput, sentinel);
    const childHappy = await runAdmissionChild(structuredClone(values), childOutput);
    assert.deepEqual(childHappy, { status: 0, stderr: '', error: undefined }, JSON.stringify(childHappy));
    assert.equal(await readFile(childOutput, 'utf8'), `${sentinel}admitted=true\n`);
    assert.equal(Number(await readFile(callPath, 'utf8')), 12);

    const recreateWorkflowId = 381385697;
    const changedProviderSelector = 'projects/123456789/locations/global/workloadIdentityPools/agk/providers/recreated';
    const changedServiceAccountSelector = 'agk-gemini-recreated@agk-gemini.iam.gserviceaccount.com';
    const realSelectorDigest = selector => createHash('sha256').update(selector, 'utf8').digest('hex');
    const coordinatedAdmissionMutations = [
      {
        name: 'run number 2',
        envOverrides: { GITHUB_RUN_NUMBER: '2' },
        mutate(fixture) {
          replaceConfigBlob(fixture, { ...config, runNumber: 2 });
          fixture['/actions/runs/99'].run_number = 2;
        },
      },
      {
        name: 'recreated workflow ID',
        envOverrides: {},
        mutate(fixture) {
          replaceConfigBlob(fixture, { ...config, workflowId: recreateWorkflowId });
          fixture['/actions/runs/99'].workflow_id = recreateWorkflowId;
          fixture[`/actions/workflows/${recreateWorkflowId}`] = {
            id: recreateWorkflowId, path: '.github/workflows/issue334-ordinary-feature-caller.yml',
          };
        },
      },
      {
        name: 'coordinated provider selector change',
        envOverrides: { GCP_WIF_PROVIDER_SELECTOR: changedProviderSelector },
        mutate(fixture) {
          replaceConfigBlob(fixture, { ...config, providerSelectorSha256: realSelectorDigest(changedProviderSelector) });
        },
      },
      {
        name: 'coordinated service account selector change',
        envOverrides: { GCP_WIF_SERVICE_ACCOUNT_SELECTOR: changedServiceAccountSelector },
        mutate(fixture) {
          replaceConfigBlob(fixture, { ...config, serviceAccountSelectorSha256: realSelectorDigest(changedServiceAccountSelector) });
        },
      },
    ];
    for (const mutation of coordinatedAdmissionMutations) {
      const changedFixture = structuredClone(values);
      mutation.mutate(changedFixture);
      const output = join(directory, `child-denied-${mutation.name.replaceAll(' ', '-')}`);
      await writeFile(output, sentinel);
      const childDenied = await runAdmissionChild(changedFixture, output, mutation.envOverrides);
      assert.deepEqual(childDenied, { status: 0, stderr: '', error: undefined }, JSON.stringify(childDenied));
      assert.equal(await readFile(output, 'utf8'), `${sentinel}admitted=false\n`);
      assert.equal(Number(await readFile(callPath, 'utf8')), 5, `${mutation.name} must be pinned before subsequent API reads`);
    }

    for (const mutate of [
      fixture => { fixture['/pulls/517'].base.sha = 'b'.repeat(40); },
      fixture => { fixture['/pulls/517'].head.sha = 'd'.repeat(40); },
    ]) {
      const changedFixture = structuredClone(values);
      mutate(changedFixture);
      const output = join(directory, `child-denied-${Math.random()}`);
      await writeFile(output, sentinel);
      const childDenied = await runAdmissionChild(changedFixture, output);
      assert.deepEqual(childDenied, { status: 0, stderr: '', error: undefined }, JSON.stringify(childDenied));
      assert.equal(await readFile(output, 'utf8'), `${sentinel}admitted=false\n`);
    }
    const unsafeChild = await runAdmissionChild(structuredClone(values), join(directory, 'child-missing-output'));
    assert.equal(unsafeChild.status, 1, JSON.stringify(unsafeChild));
    assert.equal(unsafeChild.stderr, 'Unable to safely update GitHub output.\n');

    const deniedOutput = join(directory, 'denied-admission-output');
    const denied = await execute(() => {}, true, () => {}, 'provider-selector', 'sa-selector', undefined, workflowSha,
      { path: deniedOutput, contents: sentinel, returnDetails: true });
    assert.equal(denied.status, 0);
    assert.equal(denied.output, `${sentinel}admitted=false\n`);

    const rejectSink = async (sinkPath, extra = {}) => {
      const result = await execute(() => {}, false, () => {}, 'provider-selector', 'sa-selector', 12, workflowSha,
        { path: sinkPath, initialize: false, expectedStatus: 1, returnDetails: true, ...extra });
      assert.equal(result.status, 1);
      assert.equal(result.stdout, '');
      assert.equal(result.stderr, 'Unable to safely update GitHub output.\n', JSON.stringify(result));
      return result.output;
    };
    assert.equal(await rejectSink(join(directory, 'missing-admission-output')), null);

    const noncanonicalTarget = join(directory, 'noncanonical-admission-output');
    await mkdir(join(directory, 'unused'));
    await writeFile(noncanonicalTarget, sentinel);
    assert.equal(await rejectSink(`${directory}/unused/../noncanonical-admission-output`), sentinel);

    const symlinkTarget = join(directory, 'admission-symlink-target');
    const symlinkPath = join(directory, 'admission-output-symlink');
    await writeFile(symlinkTarget, sentinel);
    await symlink(symlinkTarget, symlinkPath);
    assert.equal(await rejectSink(symlinkPath), sentinel);
    assert.equal(await readFile(symlinkTarget, 'utf8'), sentinel);

    const hardlinkTarget = join(directory, 'admission-hardlink-target');
    const hardlinkPath = join(directory, 'admission-output-hardlink');
    await writeFile(hardlinkTarget, sentinel);
    await link(hardlinkTarget, hardlinkPath);
    assert.equal(await rejectSink(hardlinkPath), sentinel);
    assert.equal(await readFile(hardlinkTarget, 'utf8'), sentinel);

    const parent = join(directory, 'admission-real-parent');
    const linkedParent = join(directory, 'admission-linked-parent');
    await mkdir(parent);
    const parentOutput = join(parent, 'output');
    await writeFile(parentOutput, sentinel);
    await symlink(parent, linkedParent, 'dir');
    assert.equal(await rejectSink(join(linkedParent, 'output')), sentinel);
    assert.equal(await readFile(parentOutput, 'utf8'), sentinel);

    const changedPath = join(directory, 'changed-admission-output');
    await writeFile(changedPath, sentinel);
    assert.equal(await rejectSink(changedPath, { changedIdentity: true }), sentinel);

    const closeFailurePath = join(directory, 'close-failure-admission-output');
    const closeFailure = await execute(() => {}, false, () => {}, 'provider-selector', 'sa-selector', 12, workflowSha,
      { path: closeFailurePath, contents: sentinel, closeFailure: true, expectedStatus: 1, returnDetails: true });
    assert.equal(closeFailure.stderr, 'Unable to safely update GitHub output.\n');
    assert.equal(closeFailure.output, `${sentinel}admitted=true\n`);

    const mutations = [
      c => { c['/pulls/517'].head.sha = 'd'.repeat(40); },
      c => { c['/pulls/517'].base.sha = 'b'.repeat(40); },
      c => { c[`/commits/${mergeSha}`].parents.reverse(); },
      c => { c['/actions/runs/99'].workflow_id++; },
      c => { c['/actions/runs/99'].run_number++; },
      c => { c['/actions/runs/99'].run_attempt = 2; },
      c => { const changed = Buffer.from(source + '\n'); c['/git/blobs/' + '7'.repeat(40)].content = changed.toString('base64'); c['/git/blobs/' + '7'.repeat(40)].size = changed.length; },
      c => { replaceConfigBlob(c, { ...config, enabled: false }); },
      c => { replaceConfigBlob(c, { ...config, workflowId: null }); },
      c => { replaceConfigBlob(c, { ...config, providerSelectorSha256: '0'.repeat(64) }); },
      c => { replaceConfigBlob(c, { ...config, serviceAccountSelectorSha256: '0'.repeat(64) }); },
      c => { replaceConfigBlob(c, { ...config, extra: 'unknown-field' }); },
      c => { c['/git/trees/' + '4'.repeat(40)].tree[0].mode = '120000'; },
      c => { c['/git/blobs/' + '5'.repeat(40)].content = 'not-base64-json'; },
    ];
    for (const mutate of mutations) assert.equal(await execute(mutate), 'admitted=false');
    for (const mutation of coordinatedAdmissionMutations) {
      assert.equal(await execute(mutation.mutate, false, () => {}, 'provider-selector', 'sa-selector', 5,
        workflowSha, { envOverrides: mutation.envOverrides }), 'admitted=false', mutation.name);
    }
    assert.equal(await execute(c => replaceConfigBlob(c, admissionConfig), false, () => {}, 'provider-selector', 'sa-selector', 12), 'admitted=true');
    const configBytes = Buffer.from(JSON.stringify(config));
    assert.equal(await execute(c => replaceConfigBlobBytes(c,
      Buffer.concat([configBytes, Buffer.alloc(100_000 - configBytes.length, 0x20)])),
    false, () => {}, 'provider-selector', 'sa-selector', 12), 'admitted=true');
    assert.equal(await execute(c => replaceConfigBlobBytes(c,
      Buffer.concat([configBytes, Buffer.alloc(100_001 - configBytes.length, 0x20)])),
    false, () => {}, 'provider-selector', 'sa-selector', 5), 'admitted=false');
    assert.equal(await execute(() => {}, true), 'admitted=false');
    assert.equal(await execute(c => { c['/pulls/517'].merge_commit_sha = 'e'.repeat(40); }), 'admitted=false');
    assert.equal(await execute(c => { c[`/commits/${mergeSha}`].parents[0].sha = 'e'.repeat(40); }), 'admitted=false');
    assert.equal(await execute(c => { c[`/commits/${mergeSha}`].commit.tree.sha = 'e'.repeat(40); }), 'admitted=false');
    assert.equal(await execute(() => {}, false, e => { e.action = 'synchronize'; }, 'provider-selector', 'sa-selector', 0), 'admitted=false');
    assert.equal(await execute(() => {}, false, e => { delete e.pull_request.merge_commit_sha; }, 'provider-selector', 'sa-selector', 0), 'admitted=false');
    assert.equal(await execute(() => {}, false, e => { e.pull_request.head.repo.id = 456; }, 'provider-selector', 'sa-selector', 0), 'admitted=false');
    assert.equal(await execute(() => {}, false, () => {}, 'wrong-provider-selector', 'sa-selector', 12), 'admitted=false');
    assert.equal(await execute(() => {}, false, () => {}, 'provider-selector', '', 12), 'admitted=false');
    // github.sha must match the caller workflow revision, not the PR feature base or a default-branch context.
    assert.equal(await execute(() => {}, false, () => {}, 'provider-selector', 'sa-selector', 0, eventSha), 'admitted=false');
    assert.equal(await execute(() => {}, false, () => {}, 'provider-selector', 'sa-selector', 0, 'b'.repeat(40)), 'admitted=false');
    assert.equal(await execute(() => {}, false, () => {}, 'provider-selector', 'sa-selector', 0, workflowSha,
      { omitGithubSha: true }), 'admitted=false');
    const timeoutDurations = [];
    const timeoutHarness = {
      timeout(duration) {
        timeoutDurations.push(duration);
        const controller = new AbortController();
        if (duration === 8_000) queueMicrotask(() => controller.abort(new Error('injected per-read timeout')));
        return controller.signal;
      },
      any(signals) {
        const controller = new AbortController();
        for (const signal of signals) {
          if (signal.aborted) controller.abort(signal.reason);
          else signal.addEventListener('abort', () => controller.abort(signal.reason), { once: true });
        }
        return controller.signal;
      },
    };
    assert.equal(await execute(() => {}, false, () => {}, 'provider-selector', 'sa-selector', 1, workflowSha,
      { abortImpl: timeoutHarness, waitForAbort: true }), 'admitted=false');
    assert.deepEqual(timeoutDurations, [45_000, 8_000]);
    assert.equal(await execute(() => {}, false, () => {}, 'provider-selector', 'sa-selector', 0, workflowSha,
      { nowImpl: (() => { let call = 0; return () => [0, 45_001][call++] ?? 45_001; })() }), 'admitted=false');
    assert.equal(await execute(c => { c['/pulls/517'].body = 'x'.repeat(1_050_000); }), 'admitted=false');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('caller retains the complete strict self classifier validation block', async () => {
  const self = await readFile(new URL('../.github/workflows/self-architecture-gate.yml', import.meta.url), 'utf8');
  const classifierValidation = script => {
    const start = script.indexOf('const validId');
    const endings = [
      script.indexOf('\ntry {\n  appendRunnerOutput', start),
      script.indexOf('\nappendFileSync', start),
    ].filter(index => index >= 0);
    const end = endings.length ? Math.min(...endings) : -1;
    assert.ok(start >= 0 && end > start);
    return script.slice(start, end).trim().replaceAll('fs.readFileSync', 'readFileSync');
  };
  const selfScript = extractInlineScript(self, 'Classify trusted base and head repository IDs');
  assert.ok(selfScript);
  const assertMatchesSelf = script => assert.equal(classifierValidation(script), classifierValidation(selfScript));
  assertMatchesSelf(classifierScript);
  const changedValidation = classifierScript.replace(
    'validCommit(pullRequest?.head?.sha)', 'validCommit(pullRequest?.head?.sha) && false');
  assert.notEqual(changedValidation, classifierScript);
  assert.throws(() => assertMatchesSelf(changedValidation));
});

test('mutated caller fixtures that widen activation, selectors, credentials, or triggers fail the synthetic invariant', () => {
  for (const mutate of [
    c => { c.jobs['architecture-gate']['if'] = true; },
    c => { delete c.jobs['architecture-gate']['if']; },
    c => { c.jobs['architecture-gate']['if'] = enabledGuard.replace('github.run_attempt == 1', 'github.run_attempt >= 1'); },
    c => { c.jobs['architecture-gate']['if'] = enabledGuard.replace("github.event.pull_request.head.sha == 'c4b0057d9dd47f79df2a896143f7ac6db5da2c2e'", "github.event.pull_request.head.sha != ''"); },
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
  const directory = await mkdtemp(join(tmpdir(), 'agk334-caller-classifier-'));
  const sentinel = 'prior=runner-data\n';
  let runNumber = 0;
  try {
    const classify = async (fixture, sink = {}) => {
      const eventPath = join(directory, 'event.json');
      const outputPath = sink.path ?? join(directory, `output-${++runNumber}`);
      await writeFile(eventPath, JSON.stringify(fixture));
      if (sink.initialize !== false) await writeFile(outputPath, sink.contents ?? sentinel);
      const fsOverrides = {
        readFileSync: (file, encoding) => file === eventPath ? JSON.stringify(fixture) : realFs.readFileSync(file, encoding),
        ...(sink.changedIdentity ? { fstatSync: fd => {
          const stats = realFs.fstatSync(fd);
          return new Proxy(stats, { get(target, key, receiver) {
            if (key === 'ino') return target.ino + 1;
            return Reflect.get(target, key, receiver);
          } });
        } } : sink.closeFailure ? { closeSync: fd => {
          realFs.closeSync(fd);
          throw new Error('close failed');
        } } : {}),
      };
      const result = await runInline(classifierScript, { env: { ...process.env, GITHUB_EVENT_PATH: eventPath,
        GITHUB_OUTPUT: outputPath, GITHUB_EVENT_NAME: 'pull_request_target', EXPECTED_REPOSITORY_ID: '123',
        EXPECTED_PULL_REQUEST_NUMBER: '45' }, fetchImpl: globalThis.fetch, fsOverrides });
      assert.equal(result.status, sink.expectedStatus ?? 0, result.stderr);
      const output = await readFile(outputPath, 'utf8').catch(error => error.code === 'ENOENT' ? null : Promise.reject(error));
      if (sink.returnDetails) return { status: result.status, stdout: '', stderr: result.stderr, output };
      return output?.slice(sentinel.length).trim();
    };
    const fixture = { repository: { id: 123 }, pull_request: { number: 45,
      base: { sha: 'a'.repeat(40), repo: { id: 123 } },
      head: { sha: 'b'.repeat(40), repo: { id: 123 } } } };
    assert.equal(await classify(fixture), 'classification=same-repository');
    assert.equal(await classify({ ...fixture, pull_request: { ...fixture.pull_request,
      head: { ...fixture.pull_request.head, repo: { id: 456 } } } }), 'classification=cross-repository');
    assert.equal(await classify({ ...fixture, pull_request: { ...fixture.pull_request, number: 46 } }), 'classification=unknown');
    assert.equal(await classify({ ...fixture, repository: { id: '123' } }), 'classification=unknown');

    const safePath = join(directory, 'normal-output');
    const appended = await classify(fixture, { path: safePath, contents: sentinel, returnDetails: true });
    assert.deepEqual(appended, { status: 0, stdout: '', stderr: '', output: `${sentinel}classification=same-repository\n` });

    const childEventPath = join(directory, 'child-event.json');
    const childOutputPath = join(directory, 'child-classifier-output');
    await writeFile(childEventPath, JSON.stringify(fixture));
    await writeFile(childOutputPath, sentinel);
    const childRun = outputPath => spawnSync(process.execPath, ['--input-type=module', '-e', classifierScript], {
      encoding: 'utf8', env: { ...process.env, GITHUB_EVENT_PATH: childEventPath,
        GITHUB_OUTPUT: outputPath, GITHUB_EVENT_NAME: 'pull_request_target', EXPECTED_REPOSITORY_ID: '123',
        EXPECTED_PULL_REQUEST_NUMBER: '45' },
    });
    const childClassified = childRun(childOutputPath);
    assert.equal(childClassified.status, 0, childClassified.error?.message ?? childClassified.stderr);
    assert.equal(await readFile(childOutputPath, 'utf8'), `${sentinel}classification=same-repository\n`);
    const childUnsafe = childRun(join(directory, 'child-missing-output'));
    assert.equal(childUnsafe.error, undefined, childUnsafe.error?.message);
    assert.equal(childUnsafe.status, 1, childUnsafe.error?.message ?? childUnsafe.stderr);
    assert.equal(childUnsafe.stderr, 'Unable to safely update GitHub output.\n');

    const missing = await classify(fixture, { path: join(directory, 'missing-output'), initialize: false, returnDetails: true, expectedStatus: 1 });
    assert.deepEqual(missing, { status: 1, stdout: '', stderr: 'Unable to safely update GitHub output.\n', output: null });

    const noncanonicalTarget = join(directory, 'noncanonical-output');
    await mkdir(join(directory, 'unused'));
    await writeFile(noncanonicalTarget, sentinel);
    const noncanonical = await classify(fixture, { path: `${directory}/unused/../noncanonical-output`, initialize: false, returnDetails: true, expectedStatus: 1 });
    assert.equal(noncanonical.status, 1);
    assert.equal(noncanonical.output, sentinel);

    const symlinkTarget = join(directory, 'symlink-target');
    const symlinkPath = join(directory, 'output-symlink');
    await writeFile(symlinkTarget, sentinel);
    await symlink(symlinkTarget, symlinkPath);
    const symbolic = await classify(fixture, { path: symlinkPath, initialize: false, returnDetails: true, expectedStatus: 1 });
    assert.equal(symbolic.status, 1);
    assert.equal(symbolic.output, sentinel);
    assert.equal(await readFile(symlinkTarget, 'utf8'), sentinel);

    const hardlinkTarget = join(directory, 'hardlink-target');
    const hardlinkPath = join(directory, 'output-hardlink');
    await writeFile(hardlinkTarget, sentinel);
    await link(hardlinkTarget, hardlinkPath);
    const hardlinked = await classify(fixture, { path: hardlinkPath, initialize: false, returnDetails: true, expectedStatus: 1 });
    assert.equal(hardlinked.status, 1);
    assert.equal(hardlinked.output, sentinel);
    assert.equal(await readFile(hardlinkTarget, 'utf8'), sentinel);

    const parent = join(directory, 'real-parent');
    const linkedParent = join(directory, 'linked-parent');
    await mkdir(parent);
    const parentTarget = join(parent, 'output');
    await writeFile(parentTarget, sentinel);
    await symlink(parent, linkedParent, 'dir');
    const linked = await classify(fixture, { path: join(linkedParent, 'output'), initialize: false, returnDetails: true, expectedStatus: 1 });
    assert.equal(linked.status, 1);
    assert.equal(linked.output, sentinel);
    assert.equal(await readFile(parentTarget, 'utf8'), sentinel);

    const changedPath = join(directory, 'changed-open-output');
    await writeFile(changedPath, sentinel);
    const changed = await classify(fixture, { path: changedPath, initialize: false, changedIdentity: true, returnDetails: true, expectedStatus: 1 });
    assert.deepEqual(changed, { status: 1, stdout: '', stderr: 'Unable to safely update GitHub output.\n', output: sentinel });

    const closeFailurePath = join(directory, 'close-failure-output');
    await writeFile(closeFailurePath, sentinel);
    const closeFailure = await classify(fixture, { path: closeFailurePath, closeFailure: true,
      returnDetails: true, expectedStatus: 1 });
    assert.deepEqual(closeFailure, { status: 1, stdout: '',
      stderr: 'Unable to safely update GitHub output.\n', output: `${sentinel}classification=same-repository\n` });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
