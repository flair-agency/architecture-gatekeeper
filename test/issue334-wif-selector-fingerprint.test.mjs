import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { parseWorkflow } from './helpers/workflow-structure.mjs';

const workflowPath = new URL('../.github/workflows/issue334-wif-selector-fingerprint.yml', import.meta.url);
const workflowText = fs.readFileSync(workflowPath, 'utf8');
const workflow = parseWorkflow(workflowText, 'Issue 334 WIF selector fingerprint diagnostic');
const job = workflow.jobs.fingerprint;
const step = job.steps[0];
const inlineScript = step.run.replace(/^node <<'NODE'\n/, '').replace(/\nNODE\n?$/, '');
const outputStep = job.steps[1];
const expectedServiceAccountSha256 = '2180acf4e4c9e0a0a7ec6f997652c2f34e302d2b285bbeb3fd3c1d09688189c4';
const syntheticServiceAccount = 'synthetic-selector-123@example-project.iam.gserviceaccount.com';
const syntheticProvider = 'projects/123456789012/locations/global/workloadIdentityPools/synthetic-pool/providers/synthetic-provider';
const syntheticExpectedHash = createHash(syntheticServiceAccount);
const sentinel = 'prior=runner-data\n';

function createHash(value) {
  return crypto.createHash('sha256').update(Buffer.from(value, 'utf8')).digest('hex');
}

function withOutputFile(callback) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'issue334-wif-output-'));
  const outputPath = path.join(root, 'runner-output');
  fs.writeFileSync(outputPath, sentinel);
  try { callback(root, outputPath); }
  finally { fs.rmSync(root, { recursive: true, force: true }); }
}

function invoke({
  provider = syntheticProvider,
  serviceAccount = syntheticServiceAccount,
  expectedHash = syntheticExpectedHash,
  outputPath,
  missing = [],
  fsOverride = fs,
  cryptoOverride = crypto,
  bufferOverride = Buffer,
  script = inlineScript,
  metadata = {}
} = {}) {
  const env = {
    GCP_WIF_PROVIDER: provider,
    GCP_WIF_SERVICE_ACCOUNT: serviceAccount,
    EXPECTED_SERVICE_ACCOUNT_SHA256: expectedHash,
    GITHUB_OUTPUT: outputPath,
    GITHUB_REPOSITORY: 'example/repository',
    GITHUB_WORKFLOW: 'Issue 334 WIF selector fingerprint diagnostic',
    GITHUB_RUN_ID: '1234567890',
    GITHUB_RUN_NUMBER: '1',
    GITHUB_RUN_ATTEMPT: '1',
    GITHUB_EVENT_NAME: 'push',
    GITHUB_REF: 'refs/heads/main',
    GITHUB_SHA: 'a'.repeat(40),
    GITHUB_WORKFLOW_SHA: 'b'.repeat(40),
    ...metadata
  };
  for (const key of missing) delete env[key];

  const stdout = [];
  const stderr = [];
  const mockedProcess = { env, exitCode: undefined };
  const mockedConsole = { log: line => stdout.push(String(line)), error: line => stderr.push(String(line)) };
  const mockedRequire = name => {
    if (name === 'node:crypto') return cryptoOverride;
    if (name === 'node:fs') return fsOverride;
    if (name === 'node:path') return path;
    throw new Error(`Unexpected builtin requested: ${name}`);
  };
  vm.runInNewContext(script, {
    Buffer: bufferOverride,
    process: mockedProcess,
    console: mockedConsole,
    require: mockedRequire
  });
  return {
    status: mockedProcess.exitCode === undefined ? 0 : mockedProcess.exitCode,
    stdout: stdout.join('\n'),
    stderr: stderr.join('\n')
  };
}

function invokeOutputCheck(providerHash, serviceAccountHash) {
  const source = outputStep.run.replace(/^node <<'NODE'\n/, '').replace(/\nNODE\n?$/, '');
  const stdout = [];
  const stderr = [];
  const mockedProcess = { env: { PROVIDER_SHA256: providerHash, SERVICE_ACCOUNT_SHA256: serviceAccountHash }, exitCode: undefined };
  vm.runInNewContext(source, {
    process: mockedProcess,
    console: { log: line => stdout.push(String(line)), error: line => stderr.push(String(line)) }
  });
  return { status: mockedProcess.exitCode === undefined ? 0 : mockedProcess.exitCode, stdout: stdout.join('\n'), stderr: stderr.join('\n') };
}

function assertGenericFailure(result, selectors = [syntheticProvider, syntheticServiceAccount]) {
  assert.notEqual(result.status, 0);
  assert.equal(result.stdout, '');
  assert.equal(result.stderr, 'WIF selector fingerprint validation failed');
  for (const selector of selectors) {
    assert.equal(result.stdout.includes(selector), false);
    assert.equal(result.stderr.includes(selector), false);
  }
}

test('workflow is first-run guarded, permissionless, source-bound and has no external actions', () => {
  assert.equal(job.if, "github.repository == 'flair-agency/architecture-gatekeeper' && github.event_name == 'push' && github.ref == 'refs/heads/main' && github.run_number == 1 && github.run_attempt == 1");
  assert.deepEqual(workflow.permissions, {});
  assert.deepEqual(job.permissions, {});
  assert.equal(job.steps.length, 2);
  assert.equal(step.uses, undefined);
  assert.deepEqual(step.env, {
    GCP_WIF_PROVIDER: '${{ secrets.GCP_WIF_PROVIDER }}',
    GCP_WIF_SERVICE_ACCOUNT: '${{ secrets.GCP_WIF_SERVICE_ACCOUNT }}',
    EXPECTED_SERVICE_ACCOUNT_SHA256: expectedServiceAccountSha256
  });
  assert.match(workflowText, /does not prove this is the only changed path[\s\S]*first run \(attempt 1\)/);
  assert.equal(workflow.on.push.branches[0], 'main');
  assert.deepEqual(workflow.on.push.paths, ['.github/workflows/issue334-wif-selector-fingerprint.yml']);
  assert.match(workflowText, new RegExp(expectedServiceAccountSha256));
  assert.match(step.run, /EXPECTED_SERVICE_ACCOUNT_SHA256/);
  assert.match(step.run, /GITHUB_WORKFLOW_SHA/);
  assert.match(step.run, /GITHUB_RUN_NUMBER/);
  assert.match(step.run, /O_NOFOLLOW/);
  assert.match(step.run, /lstatSync[\s\S]*realpathSync[\s\S]*fstatSync[\s\S]*writeFileSync/);
  assert.match(step.run, /byteLength\(outputContents[\s\S]*16_384/);
  assert.doesNotMatch(step.run, /GITHUB_TOKEN|id-token|checkout|google-github-actions|::set-output|fetch\s*\(|https?:\/\//);
  assert.doesNotMatch(step.run, /process\.argv|writeFileSync\(process\.env\.GCP|appendFileSync/);
  assert.equal(outputStep.id, undefined);
  assert.match(outputStep.name, /\$\{\{ steps\.fingerprint\.outputs\.provider_sha256 \}\}/);
  assert.match(outputStep.name, /\$\{\{ steps\.fingerprint\.outputs\.service_account_sha256 \}\}/);
  assert.equal(outputStep.uses, undefined);
  assert.deepEqual(invokeOutputCheck('a'.repeat(64), 'b'.repeat(64)), {
    status: 0,
    stdout: 'WIF selector fingerprints validated',
    stderr: ''
  });
  assert.deepEqual(invokeOutputCheck('not-a-hash', 'b'.repeat(64)), {
    status: 1,
    stdout: '',
    stderr: 'WIF selector fingerprints unavailable'
  });
});

test('actual inline script appends only hashes to the existing runner file', () => withOutputFile((root, outputPath) => {
  const result = invoke({ outputPath });
  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.deepEqual(output, {
    kind: 'wif-selector-fingerprint',
    source: {
      repository: 'example/repository',
      workflow: 'Issue 334 WIF selector fingerprint diagnostic',
      run_id: '1234567890',
      run_number: '1',
      run_attempt: '1',
      event_name: 'push',
      ref: 'refs/heads/main',
      sha: 'a'.repeat(40),
      workflow_sha: 'b'.repeat(40)
    },
    provider_sha256: createHash(syntheticProvider),
    service_account_sha256: syntheticExpectedHash
  });
  for (const secret of [syntheticProvider, syntheticServiceAccount]) {
    assert.equal(result.stdout.includes(secret), false);
    assert.equal(result.stderr.includes(secret), false);
  }
  assert.equal(fs.readFileSync(outputPath, 'utf8'), `${sentinel}provider_sha256=${createHash(syntheticProvider)}\nservice_account_sha256=${syntheticExpectedHash}\n`);
  assert.equal(fs.existsSync(root), true);
}));

test('actual inline script accepts provider resource shapes selected by the pinned runtime', () => withOutputFile((root, outputPath) => {
  const provider = 'projects/12345/locations/global/workloadIdentityPools/1234/providers/pool-id';
  const result = invoke({ provider, outputPath });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(fs.readFileSync(outputPath, 'utf8'), `${sentinel}provider_sha256=${createHash(provider)}\nservice_account_sha256=${syntheticExpectedHash}\n`);
}));

test('actual inline script fails closed without disclosure or runner-output writes', () => {
  const invalidCases = [
    { provider: ` ${syntheticProvider}` },
    { provider: `${syntheticProvider}\n` },
    { provider: `projects/123/locations/global/workloadIdentityPools/pool/providers/provider?x=${syntheticServiceAccount}` },
    { serviceAccount: `${syntheticServiceAccount}\n` },
    { serviceAccount: 'other-selector@example-project.iam.gserviceaccount.com' },
    { serviceAccount: ` ${syntheticServiceAccount}` },
    { missing: ['GCP_WIF_PROVIDER'] },
    { missing: ['GCP_WIF_SERVICE_ACCOUNT'] },
    { missing: ['EXPECTED_SERVICE_ACCOUNT_SHA256'] },
    { expectedHash: 'not-a-hash' },
    { provider: 'x'.repeat(257) },
    { provider: `${syntheticProvider}-é` },
    { provider: 'projects/12345/locations/global/workloadIdentityPools/gcp-pool/providers/provider' },
    { serviceAccount: 'x'.repeat(321) },
    { serviceAccount: `é${syntheticServiceAccount}` }
  ];
  for (const values of invalidCases) {
    withOutputFile((root, outputPath) => {
      const result = invoke({ ...values, outputPath });
      assertGenericFailure(result, [values.provider ?? syntheticProvider, values.serviceAccount ?? syntheticServiceAccount]);
      assert.equal(fs.readFileSync(outputPath, 'utf8'), sentinel);
      assert.equal(fs.existsSync(root), true);
    });
  }
});

test('actual inline script rejects unsafe output paths and files before appending', () => withOutputFile((root, outputPath) => {
  const linkPath = path.join(root, 'output-link');
  fs.symlinkSync(outputPath, linkPath);
  const hardlinkPath = path.join(root, 'output-hardlink');
  fs.linkSync(outputPath, hardlinkPath);
  const cases = [
    { outputPath: 'relative-output' },
    { outputPath: path.join(root, 'missing-output') },
    { outputPath: `${root}/unused/../${path.basename(outputPath)}` },
    { outputPath: root },
    { outputPath: linkPath },
    { outputPath: hardlinkPath },
    { missing: ['GITHUB_OUTPUT'] }
  ];
  for (const values of cases) {
    const result = invoke({ ...values, outputPath: values.missing ? outputPath : values.outputPath });
    assertGenericFailure(result);
    assert.equal(fs.readFileSync(outputPath, 'utf8'), sentinel);
  }
  assert.equal(fs.existsSync(path.join(root, 'missing-output')), false);
}));

test('linked-directory rejection depends on realpath after other sink checks pass', () => withOutputFile(root => {
  const singleLinkRoot = path.join(root, 'single-link-runner');
  fs.mkdirSync(singleLinkRoot);
  const canonicalOutputPath = path.join(singleLinkRoot, 'runner-output');
  fs.writeFileSync(canonicalOutputPath, sentinel);
  const linkedDirectory = path.join(root, 'linked-single-runner');
  fs.symlinkSync(singleLinkRoot, linkedDirectory, 'dir');
  const linkedOutputPath = path.join(linkedDirectory, 'runner-output');

  const before = fs.lstatSync(linkedOutputPath);
  assert.equal(path.isAbsolute(linkedOutputPath), true);
  assert.equal(path.resolve(linkedOutputPath), linkedOutputPath);
  assert.equal(before.isFile(), true);
  assert.equal(before.isSymbolicLink(), false);
  assert.equal(before.nlink, 1);
  assert.notEqual(fs.realpathSync(linkedOutputPath), linkedOutputPath);

  const guarded = invoke({ outputPath: linkedOutputPath });
  assertGenericFailure(guarded);
  assert.equal(fs.readFileSync(canonicalOutputPath, 'utf8'), sentinel);

  const mutatedScript = inlineScript.replace(' || fs.realpathSync(outputPath) !== outputPath', '');
  assert.notEqual(mutatedScript, inlineScript, 'mutation must remove only the realpath guard');
  const withoutRealpathGuard = invoke({ outputPath: linkedOutputPath, script: mutatedScript });
  assert.equal(withoutRealpathGuard.status, 0, withoutRealpathGuard.stderr);
  assert.equal(fs.readFileSync(canonicalOutputPath, 'utf8'), `${sentinel}provider_sha256=${createHash(syntheticProvider)}\nservice_account_sha256=${syntheticExpectedHash}\n`);
}));

test('actual inline script rejects changed opened-file identity and sink errors before logging', () => withOutputFile((root, outputPath) => {
  const identityMismatchFs = {
    ...fs,
    fstatSync(fd) {
      const stat = fs.fstatSync(fd);
      return new Proxy(stat, {
        get(target, property) {
          if (property === 'ino') return target.ino + 1;
          const value = Reflect.get(target, property, target);
          return typeof value === 'function' ? value.bind(target) : value;
        }
      });
    }
  };
  assertGenericFailure(invoke({ outputPath, fsOverride: identityMismatchFs }));
  assert.equal(fs.readFileSync(outputPath, 'utf8'), sentinel);

  const failingSinkFs = {
    ...fs,
    writeFileSync() { throw new Error(`mock failure containing ${syntheticServiceAccount}`); }
  };
  assertGenericFailure(invoke({ outputPath, fsOverride: failingSinkFs }));
  assert.equal(fs.readFileSync(outputPath, 'utf8'), sentinel);
  assert.equal(fs.existsSync(root), true);
}));

test('actual inline script enforces its bounded fixed-hash output protocol', () => withOutputFile((root, outputPath) => {
  const reportingLargePayloadBuffer = new Proxy(Buffer, {
    get(target, property) {
      if (property === 'byteLength') return (value, encoding) => {
        if (typeof value === 'string' && value.startsWith('provider_sha256=')) return 16_385;
        return target.byteLength(value, encoding);
      };
      const value = Reflect.get(target, property, target);
      return typeof value === 'function' ? value.bind(target) : value;
    }
  });
  const result = invoke({ outputPath, bufferOverride: reportingLargePayloadBuffer });
  assertGenericFailure(result);
  assert.equal(fs.readFileSync(outputPath, 'utf8'), sentinel);
  assert.equal(fs.existsSync(root), true);
}));
