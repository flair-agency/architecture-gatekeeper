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
const expectedEffectiveServiceAccountSha256 = '2180acf4e4c9e0a0a7ec6f997652c2f34e302d2b285bbeb3fd3c1d09688189c4';
const syntheticServiceAccount = '  opaque service-account selector\nwith whitespace é  ';
const syntheticProvider = '  opaque provider selector\nwithout Google resource shape é  ';
const syntheticEffectiveServiceAccount = syntheticServiceAccount.trim();
const syntheticExpectedHash = createHash(syntheticEffectiveServiceAccount);
const syntheticRawServiceAccountHash = createHash(syntheticServiceAccount);
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
    EXPECTED_EFFECTIVE_SERVICE_ACCOUNT_SHA256: expectedHash,
    GITHUB_OUTPUT: outputPath,
    GITHUB_REPOSITORY: 'example/repository',
    GITHUB_WORKFLOW: 'Issue 334 WIF selector fingerprint diagnostic',
    GITHUB_RUN_ID: '1234567890',
    GITHUB_RUN_NUMBER: '3',
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

function assertDiagnosticFailure(result, phase, reason, disclosures = []) {
  assert.notEqual(result.status, 0);
  assert.equal(result.stdout, '');
  assert.deepEqual(JSON.parse(result.stderr), {
    kind: 'wif-selector-fingerprint-failure',
    phase,
    reason
  });
  const valuesToSuppress = [
    syntheticProvider,
    syntheticServiceAccount,
    syntheticExpectedHash,
    createHash(syntheticProvider),
    syntheticRawServiceAccountHash,
    expectedEffectiveServiceAccountSha256,
    ...disclosures
  ];
  for (const value of valuesToSuppress) {
    if (typeof value === 'string' && value.length > 0) {
      assert.equal(result.stdout.includes(value), false);
      assert.equal(result.stderr.includes(value), false);
      if (disclosures.includes(value)) {
        for (const digest of [createHash(value), createHash(value.trim())]) {
          assert.equal(result.stdout.includes(digest), false);
          assert.equal(result.stderr.includes(digest), false);
        }
      }
    }
  }
}

test('workflow is third-run guarded, permissionless, source-bound and has no external actions', () => {
  assert.equal(job.if, "github.repository == 'flair-agency/architecture-gatekeeper' && github.event_name == 'push' && github.ref == 'refs/heads/main' && github.run_number == 3 && github.run_attempt == 1");
  assert.deepEqual(workflow.permissions, {});
  assert.deepEqual(job.permissions, {});
  assert.equal(job.steps.length, 2);
  assert.equal(step.uses, undefined);
  assert.deepEqual(step.env, {
    GCP_WIF_PROVIDER: '${{ secrets.GCP_WIF_PROVIDER }}',
    GCP_WIF_SERVICE_ACCOUNT: '${{ secrets.GCP_WIF_SERVICE_ACCOUNT }}',
    EXPECTED_EFFECTIVE_SERVICE_ACCOUNT_SHA256: expectedEffectiveServiceAccountSha256
  });
  assert.match(workflowText, /does not prove this is the only changed path[\s\S]*run 3 \(attempt 1\)[\s\S]*same workflow/);
  assert.equal(workflow.on.push.branches[0], 'main');
  assert.deepEqual(workflow.on.push.paths, ['.github/workflows/issue334-wif-selector-fingerprint.yml']);
  assert.match(workflowText, new RegExp(expectedEffectiveServiceAccountSha256));
  assert.match(step.run, /EXPECTED_EFFECTIVE_SERVICE_ACCOUNT_SHA256/);
  assert.match(step.run, /serviceAccount\.trim\(\)/);
  assert.match(step.run, /GITHUB_WORKFLOW_SHA/);
  assert.match(step.run, /GITHUB_RUN_NUMBER/);
  assert.match(step.run, /O_NOFOLLOW/);
  assert.doesNotMatch(step.run, /provider_resource_shape|service_account_email_shape/);
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

test('actual inline script accepts opaque selectors and hashes their exact UTF-8 bytes', () => withOutputFile((root, outputPath) => {
  const result = invoke({ outputPath });
  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.deepEqual(output, {
    kind: 'wif-selector-fingerprint',
    source: {
      repository: 'example/repository',
      workflow: 'Issue 334 WIF selector fingerprint diagnostic',
      run_id: '1234567890',
      run_number: '3',
      run_attempt: '1',
      event_name: 'push',
      ref: 'refs/heads/main',
      sha: 'a'.repeat(40),
      workflow_sha: 'b'.repeat(40)
    },
    provider_sha256: createHash(syntheticProvider),
    service_account_sha256: syntheticRawServiceAccountHash
  });
  for (const secret of [syntheticProvider, syntheticServiceAccount]) {
    assert.equal(result.stdout.includes(secret), false);
    assert.equal(result.stderr.includes(secret), false);
  }
  assert.notEqual(createHash(syntheticProvider), createHash(syntheticProvider.trim()));
  assert.notEqual(syntheticRawServiceAccountHash, syntheticExpectedHash);
  assert.equal(fs.readFileSync(outputPath, 'utf8'), `${sentinel}provider_sha256=${createHash(syntheticProvider)}\nservice_account_sha256=${syntheticRawServiceAccountHash}\n`);
  assert.equal(fs.existsSync(root), true);
}));

test('actual inline script fails closed without disclosure or runner-output writes', () => {
  const invalidCases = [
    { values: { missing: ['GCP_WIF_PROVIDER'] }, phase: 'selector_input', reason: 'provider_missing' },
    { values: { provider: '' }, phase: 'selector_input', reason: 'provider_missing' },
    { values: { missing: ['GCP_WIF_SERVICE_ACCOUNT'] }, phase: 'selector_input', reason: 'service_account_missing' },
    { values: { serviceAccount: '' }, phase: 'selector_input', reason: 'service_account_missing' },
    { values: { provider: 'x'.repeat(257) }, phase: 'selector_validation', reason: 'provider_byte_length' },
    { values: { provider: 'é'.repeat(129) }, phase: 'selector_validation', reason: 'provider_byte_length' },
    { values: { serviceAccount: 'x'.repeat(321) }, phase: 'selector_validation', reason: 'service_account_byte_length' },
    { values: { serviceAccount: 'é'.repeat(161) }, phase: 'selector_validation', reason: 'service_account_byte_length' },
    { values: { missing: ['EXPECTED_EFFECTIVE_SERVICE_ACCOUNT_SHA256'] }, phase: 'expected_hash', reason: 'expected_hash_missing' },
    { values: { expectedHash: '' }, phase: 'expected_hash', reason: 'expected_hash_missing' },
    { values: { expectedHash: 'not-a-hash' }, phase: 'expected_hash', reason: 'expected_hash_shape' },
    { values: { expectedHash: 'f'.repeat(64) }, phase: 'expected_hash', reason: 'effective_service_account_hash_mismatch' },
    { values: { serviceAccount: 'other opaque account' }, phase: 'expected_hash', reason: 'effective_service_account_hash_mismatch' },
    { values: { serviceAccount: '  \n\t  ' }, phase: 'expected_hash', reason: 'effective_service_account_hash_mismatch' }
  ];
  for (const { values, phase, reason } of invalidCases) {
    withOutputFile((root, outputPath) => {
      const result = invoke({ ...values, outputPath });
      assertDiagnosticFailure(result, phase, reason, [values.provider, values.serviceAccount, values.expectedHash]);
      assert.equal(fs.readFileSync(outputPath, 'utf8'), sentinel);
      assert.equal(fs.existsSync(root), true);
    });
  }
});

test('actual inline script reports fixed reasons for each selected source metadata check', () => {
  const invalidMetadata = [
    { GITHUB_REPOSITORY: 'bad/repo?' },
    { GITHUB_WORKFLOW: 'invalid@workflow' },
    { GITHUB_RUN_ID: 'not-an-id' },
    { GITHUB_RUN_NUMBER: '0' },
    { GITHUB_RUN_ATTEMPT: '0' },
    { GITHUB_EVENT_NAME: 'PUSH' },
    { GITHUB_REF: 'main' },
    { GITHUB_SHA: 'not-a-sha' },
    { GITHUB_WORKFLOW_SHA: 'not-a-workflow-sha' }
  ];
  const expectedReasons = [
    'repository_shape', 'workflow_shape', 'run_id_shape', 'run_number_shape',
    'run_attempt_shape', 'event_name_shape', 'ref_shape', 'sha_shape', 'workflow_sha_shape'
  ];
  for (let index = 0; index < invalidMetadata.length; index += 1) {
    withOutputFile((root, outputPath) => {
      const result = invoke({ outputPath, metadata: invalidMetadata[index] });
      assertDiagnosticFailure(result, 'metadata', expectedReasons[index], Object.values(invalidMetadata[index]));
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
  const expectedReasons = [
    'path_noncanonical', 'lstat', 'path_noncanonical', 'not_regular_file',
    'is_symlink', 'is_hardlinked', 'path_missing'
  ];
  for (let index = 0; index < cases.length; index += 1) {
    const values = cases[index];
    const result = invoke({ ...values, outputPath: values.missing ? outputPath : values.outputPath });
    assertDiagnosticFailure(result, 'output_sink', expectedReasons[index]);
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
  assertDiagnosticFailure(guarded, 'output_sink', 'path_identity_mismatch');
  assert.equal(fs.readFileSync(canonicalOutputPath, 'utf8'), sentinel);

  const mutatedScript = inlineScript.replace("check(realOutputPath === outputPath, 'output_sink', 'path_identity_mismatch');", '');
  assert.notEqual(mutatedScript, inlineScript, 'mutation must remove only the realpath guard');
  const withoutRealpathGuard = invoke({ outputPath: linkedOutputPath, script: mutatedScript });
  assert.equal(withoutRealpathGuard.status, 0, withoutRealpathGuard.stderr);
  assert.equal(fs.readFileSync(canonicalOutputPath, 'utf8'), `${sentinel}provider_sha256=${createHash(syntheticProvider)}\nservice_account_sha256=${syntheticRawServiceAccountHash}\n`);
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
  assertDiagnosticFailure(invoke({ outputPath, fsOverride: identityMismatchFs }), 'output_sink', 'opened_identity_mismatch');
  assert.equal(fs.readFileSync(outputPath, 'utf8'), sentinel);

  const failingSinkFs = {
    ...fs,
    writeFileSync() { throw new Error(`mock failure containing ${syntheticServiceAccount}`); }
  };
  assertDiagnosticFailure(invoke({ outputPath, fsOverride: failingSinkFs }), 'output_sink', 'write');
  assert.equal(fs.readFileSync(outputPath, 'utf8'), sentinel);
  assert.equal(fs.existsSync(root), true);
}));

test('actual inline script preserves primary diagnostics when closing also fails', () => withOutputFile((root, outputPath) => {
  const closed = [];
  const dualFailureFs = {
    ...fs,
    writeFileSync() { throw new Error(`write failure ${syntheticServiceAccount} ${syntheticExpectedHash}`); },
    closeSync(fd) {
      closed.push(fd);
      throw new Error(`close failure ${syntheticProvider} ${syntheticExpectedHash}`);
    }
  };
  const writeAndClose = invoke({ outputPath, fsOverride: dualFailureFs });
  assertDiagnosticFailure(writeAndClose, 'output_sink', 'write');
  assert.equal(closed.length, 1, 'descriptor closure must be attempted after write failure');
  assert.equal(fs.readFileSync(outputPath, 'utf8'), sentinel);

  closed.length = 0;
  const invalidOpenedFileAndCloseFs = {
    ...fs,
    fstatSync(fd) {
      const stat = fs.fstatSync(fd);
      return new Proxy(stat, {
        get(target, property) {
          if (property === 'isFile') return () => false;
          const value = Reflect.get(target, property, target);
          return typeof value === 'function' ? value.bind(target) : value;
        }
      });
    },
    closeSync(fd) {
      closed.push(fd);
      throw new Error(`close failure ${syntheticServiceAccount} ${syntheticExpectedHash}`);
    }
  };
  const validationAndClose = invoke({ outputPath, fsOverride: invalidOpenedFileAndCloseFs });
  assertDiagnosticFailure(validationAndClose, 'output_sink', 'opened_not_regular_file');
  assert.equal(closed.length, 1, 'descriptor closure must be attempted after opened-file validation failure');
  assert.equal(fs.readFileSync(outputPath, 'utf8'), sentinel);

  closed.length = 0;
  const closeOnlyFs = {
    ...fs,
    closeSync(fd) {
      closed.push(fd);
      throw new Error(`close failure ${syntheticProvider} ${syntheticExpectedHash}`);
    }
  };
  const closeOnly = invoke({ outputPath, fsOverride: closeOnlyFs });
  assertDiagnosticFailure(closeOnly, 'output_sink', 'close');
  assert.equal(closed.length, 1, 'descriptor closure must be attempted after successful write');
  assert.equal(fs.readFileSync(outputPath, 'utf8'), `${sentinel}provider_sha256=${createHash(syntheticProvider)}\nservice_account_sha256=${syntheticRawServiceAccountHash}\n`);
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
  assertDiagnosticFailure(result, 'output_payload', 'payload_bound');
  assert.equal(fs.readFileSync(outputPath, 'utf8'), sentinel);
  assert.equal(fs.existsSync(root), true);
}));
