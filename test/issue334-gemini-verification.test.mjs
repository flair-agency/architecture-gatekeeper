import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync, privateDecrypt, constants } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, chmodSync, rmSync, closeSync, readFileSync, readdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  assertNoCodexExecutable, captureAndRemoveWifEnvironment, createFreshLedger,
  assertCompletedDecisionResult, buildPreparedVerificationCall, encryptPrivateEvidence,
  claimSingleVerificationInvocation, installPinnedRuntime, redactedSummary, sealPrivateEvidence, sealPrivateLedgerCheckpoint,
  validateAuthorizedRuntimeLock, validateHostedPushContext,
} from '../scripts/issue334-gemini-verification.mjs';
import { createVertexVerificationReservation, readVertexVerificationReservationCount } from '../src/vertex-verification-reservation.mjs';
import { snapshotPreparedGeminiCiReviewInput } from '../src/prepared-gemini-ci-review.mjs';

const SHA = c => c.repeat(40);
const AUTHORIZED_RUNTIME_LOCK = readFileSync(new URL('../.codex/gatekeeper/gemini-verification-package-lock.json', import.meta.url));
function context() {
  const before = SHA('a'); const head = SHA('b'); const merge = SHA('c');
  return { before, head, merge,
    env: { GITHUB_ACTIONS: 'true', GITHUB_REPOSITORY: 'flair-agency/architecture-gatekeeper',
      GITHUB_REF: 'refs/heads/feature/gemini-ci', GITHUB_EVENT_NAME: 'push', GITHUB_RUN_ATTEMPT: '1',
      GITHUB_WORKFLOW_REF: 'flair-agency/architecture-gatekeeper/.github/workflows/issue334-gemini-verification.yml@refs/heads/feature/gemini-ci',
      GITHUB_RUN_ID: '123', GITHUB_RUN_NUMBER: '9', GITHUB_SHA: merge },
    parents: [before, head] };
}

test('validates the one permitted protected feature push and exact ordered merge parents', () => {
  const c = context();
  const result = validateHostedPushContext({ env: c.env, actualHeadSha: c.merge,
    orderedParents: c.parents, expectedPredecessorSha: c.before });
  assert.equal(result.mergeSha, c.merge);
  assert.equal(result.featureHeadSha, c.head);
  assert.equal(result.runAttempt, 1);
  assert.equal(Object.hasOwn(result, 'project'), false);
});

test('rejects mismatched host context and fixed Git predecessor before provider access', () => {
  const baseline = context();
  const changes = [
    c => { c.env.GITHUB_EVENT_NAME = 'pull_request'; },
    c => { c.env.GITHUB_REF = 'refs/heads/main'; },
    c => { c.env.GITHUB_RUN_ATTEMPT = '2'; },
    c => { c.env.GITHUB_WORKFLOW_REF += '/changed'; },
    c => { c.parents[0] = SHA('d'); },
    c => { c.parents.reverse(); },
    c => { c.env.GITHUB_SHA = SHA('d'); },
  ];
  for (const mutate of changes) {
    const c = structuredClone(baseline); mutate(c);
    assert.throws(() => validateHostedPushContext({ env: c.env, actualHeadSha: baseline.merge,
      orderedParents: c.parents, expectedPredecessorSha: baseline.before }));
  }
  assert.throws(() => validateHostedPushContext({ env: baseline.env,
    actualHeadSha: baseline.merge, orderedParents: baseline.parents }));
});

test('captures then removes WIF variable names and rejects OpenAI/Codex credential capability', () => {
  const env = { AGK_VERTEX_ACCESS_TOKEN: 'test-only-bearer-token-value', AGK_VERTEX_PROJECT: 'test-project-123', AGK_VERTEX_LOCATION: 'us-central1' };
  const credential = captureAndRemoveWifEnvironment(env);
  assert.equal(credential.token, 'test-only-bearer-token-value');
  assert.deepEqual(Object.keys(env), []);
  for (const name of ['OPENAI_API_KEY', 'CODEX_API_KEY', 'CODEX_ACCESS_TOKEN']) {
    assert.throws(() => captureAndRemoveWifEnvironment({ ...env, [name]: 'never-print-this' }));
  }
  assert.throws(() => captureAndRemoveWifEnvironment({ AGK_VERTEX_ACCESS_TOKEN: 'short', AGK_VERTEX_PROJECT: 'x', AGK_VERTEX_LOCATION: 'x' }));
});

test('rejects a Codex executable in either inherited or fixed child search locations', () => {
  const root = mkdtempSync(join(tmpdir(), 'agk334-path-'));
  try {
    const bin = join(root, 'bin'); mkdirSync(bin); writeFileSync(join(bin, 'codex'), '');
    assert.throws(() => assertNoCodexExecutable(bin, []));
    assert.doesNotThrow(() => assertNoCodexExecutable(join(root, 'empty'), []));
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('creates one private fsynced ledger and reports consumed reservations without refund', () => {
  const root = mkdtempSync(join(tmpdir(), 'agk334-ledger-root-')); chmodSync(root, 0o700);
  let ledger;
  try {
    ledger = createFreshLedger(root);
    assert.equal(readVertexVerificationReservationCount(ledger.fd), 0);
    const reserve = createVertexVerificationReservation(ledger.fd);
    assert.equal(reserve(), true);
    assert.equal(readVertexVerificationReservationCount(ledger.fd), 1);
    for (let i = 0; i < 4; i++) assert.equal(reserve(), true);
    assert.equal(reserve(), false);
    assert.equal(readVertexVerificationReservationCount(ledger.fd), 5);
  } finally {
    if (ledger) { closeSync(ledger.fd); rmSync(ledger.directory, { recursive: true, force: true }); }
    rmSync(root, { recursive: true, force: true });
  }
});

test('retains an exclusive verification start claim and rejects a second invocation before any fresh ledger', () => {
  const runtime = mkdtempSync(join(tmpdir(), 'agk334-verification-claim-')); chmodSync(runtime, 0o700);
  try {
    assert.deepEqual(claimSingleVerificationInvocation(runtime), { claimed: true });
    assert.equal(readFileSync(join(runtime, 'verification-start.claim'), 'utf8'), 'AGK334-VERIFICATION-START-V1\n');
    assert.throws(() => claimSingleVerificationInvocation(runtime), /already claimed/i);
    assert.equal(readdirSync(runtime).filter(name => name.startsWith('agk334-private-ledger-')).length, 0);
  } finally { rmSync(runtime, { recursive: true, force: true }); }
});

test('allows only one concurrent verification start claim in the fixed private runtime', async () => {
  const runtime = mkdtempSync(join(tmpdir(), 'agk334-verification-claim-race-')); chmodSync(runtime, 0o700);
  const gate = join(runtime, 'start-claims');
  const moduleUrl = new URL('../scripts/issue334-gemini-verification.mjs', import.meta.url).href;
  const code = `import { existsSync } from 'node:fs';
import { claimSingleVerificationInvocation } from ${JSON.stringify(moduleUrl)};
while (!existsSync(${JSON.stringify(gate)})) await new Promise(resolve => setTimeout(resolve, 5));
try { claimSingleVerificationInvocation(${JSON.stringify(runtime)}); process.stdout.write('claimed'); }
catch { process.stdout.write('rejected'); }`;
  const run = () => new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--input-type=module', '-e', code], {
      env: { PATH: process.env.PATH, HOME: process.env.HOME, TMPDIR: process.env.TMPDIR },
    });
    let output = '';
    child.stdout.on('data', chunk => { output += chunk; });
    child.once('error', reject);
    child.once('close', code => resolve({ code, output }));
  });
  try {
    const attempts = [run(), run()];
    await new Promise(resolve => setTimeout(resolve, 50));
    writeFileSync(gate, 'go');
    const results = await Promise.all(attempts);
    assert.deepEqual(results.map(result => result.code), [0, 0]);
    assert.deepEqual(results.map(result => result.output).sort(), ['claimed', 'rejected']);
    assert.equal(readFileSync(join(runtime, 'verification-start.claim'), 'utf8'), 'AGK334-VERIFICATION-START-V1\n');
    assert.equal(readdirSync(runtime).filter(name => name.startsWith('agk334-private-ledger-')).length, 0);
  } finally { rmSync(runtime, { recursive: true, force: true }); }
});

test('seals the exact durable ledger after a killed verifier process and preserves its journal', t => {
  const root = mkdtempSync(join(tmpdir(), 'agk334-checkpoint-interrupted-'));
  const runtime = join(root, '.agk334-private-runtime');
  mkdirSync(runtime, { mode: 0o700 });
  try {
    const launcherUrl = new URL('../scripts/issue334-gemini-verification.mjs', import.meta.url).href;
    const reservationUrl = new URL('../src/vertex-verification-reservation.mjs', import.meta.url).href;
    const childCode = `import { createFreshLedger } from ${JSON.stringify(launcherUrl)};
import { createVertexVerificationReservation } from ${JSON.stringify(reservationUrl)};
const ledger = createFreshLedger(${JSON.stringify(runtime)});
const reserve = createVertexVerificationReservation(ledger.fd);
if (!reserve() || !reserve()) process.exit(3);
process.kill(process.pid, 'SIGKILL');`;
    const child = spawnSync(process.execPath, ['--input-type=module', '-e', childCode], {
      encoding: 'utf8', env: { PATH: process.env.PATH, HOME: process.env.HOME, TMPDIR: process.env.TMPDIR },
    });
    assert.equal(child.status, null);
    assert.equal(child.signal, 'SIGKILL');
    const ledgerDirectory = readdirSync(runtime).find(name => name.startsWith('agk334-private-ledger-'));
    const ledgerPath = join(runtime, ledgerDirectory, 'reservation.ledger');
    const journalBefore = readFileSync(ledgerPath);
    t.mock.method(process, 'cwd', () => root);

    const checkpoint = sealPrivateLedgerCheckpoint();
    assert.equal(checkpoint.status, 'sealed');
    assert.equal(checkpoint.reservationCount, 2);
    assert.equal(checkpoint.ledgerCount, 1);
    assert.equal(checkpoint.evidenceFile, 'agk334-private-evidence-checkpoint/reservation-checkpoint.enc.json');
    const checkpointPath = join(runtime, checkpoint.evidenceFile);
    const envelopeBytes = readFileSync(checkpointPath);
    const envelope = JSON.parse(envelopeBytes.toString('utf8'));
    assert.equal(envelope.algorithm, 'RSA-OAEP-SHA256+AES-256-GCM');
    assert.equal(envelope.publicKeySha256, '635e87fee174aaca8b86ae9863fdc26926f969171c67d9678b96176388e80ba3');
    assert.equal(envelopeBytes.includes(journalBefore), false);
    assert.deepEqual(readFileSync(ledgerPath), journalBefore);
    assert.throws(() => sealPrivateLedgerCheckpoint());
    assert.deepEqual(readFileSync(ledgerPath), journalBefore);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('checkpoint succeeds with no runtime or an empty pre-dispatch runtime', t => {
  const root = mkdtempSync(join(tmpdir(), 'agk334-checkpoint-empty-'));
  try {
    t.mock.method(process, 'cwd', () => root);
    assert.deepEqual(sealPrivateLedgerCheckpoint(), { status: 'no-runtime', reservationCount: 0, evidenceFile: null });
    const runtime = join(root, '.agk334-private-runtime');
    mkdirSync(runtime, { mode: 0o700 });
    const checkpoint = sealPrivateLedgerCheckpoint();
    assert.equal(checkpoint.status, 'sealed');
    assert.equal(checkpoint.reservationCount, 0);
    assert.equal(checkpoint.ledgerCount, 0);
    assert.equal(readFileSync(join(runtime, checkpoint.evidenceFile)).length > 0, true);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('checkpoint fails closed on a corrupt ledger without deleting runtime evidence', t => {
  const root = mkdtempSync(join(tmpdir(), 'agk334-checkpoint-corrupt-'));
  const runtime = join(root, '.agk334-private-runtime');
  mkdirSync(runtime, { mode: 0o700 });
  let ledger;
  try {
    ledger = createFreshLedger(runtime);
    const ledgerPath = ledger.path;
    closeSync(ledger.fd);
    ledger = null;
    writeFileSync(ledgerPath, 'AGK334-V1\n1\n3\n', { mode: 0o600 });
    t.mock.method(process, 'cwd', () => root);
    assert.throws(() => sealPrivateLedgerCheckpoint(), /invalid|incomplete/i);
    assert.equal(readFileSync(ledgerPath, 'utf8'), 'AGK334-V1\n1\n3\n');
    assert.equal(readdirSync(runtime).some(name => name.startsWith('agk334-private-evidence-checkpoint')), false);
  } finally {
    if (ledger) closeSync(ledger.fd);
    rmSync(root, { recursive: true, force: true });
  }
});

test('encrypts evidence with the pinned-key envelope and rejects another key digest', () => {
  const pair = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const publicKey = Buffer.from(pair.publicKey.export({ type: 'spki', format: 'pem' }));
  const digest = createHash('sha256').update(publicKey).digest('hex');
  const encrypted = encryptPrivateEvidence({ decision: 'private-value' }, publicKey, digest);
  const envelope = JSON.parse(encrypted.toString('utf8'));
  assert.equal(envelope.algorithm, 'RSA-OAEP-SHA256+AES-256-GCM');
  assert.equal(envelope.ciphertext.includes('private-value'), false);
  assert.throws(() => encryptPrivateEvidence({ secret: 'x' }, publicKey, '0'.repeat(64)));
  // Verify RSA wrapping interoperability without needing the task's private key.
  const unwrapped = privateDecrypt({ key: pair.privateKey, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' }, Buffer.from(envelope.wrappedKey, 'base64'));
  assert.equal(unwrapped.length, 32);
  const pinnedEnvelope = JSON.parse(sealPrivateEvidence({ state: 'private' }).toString('utf8'));
  assert.equal(pinnedEnvelope.publicKeySha256, '635e87fee174aaca8b86ae9863fdc26926f969171c67d9678b96176388e80ba3');
});

test('redacted summary contains no credential or deployment scope and distinguishes remote observation', () => {
  const c = context();
  const ctx = validateHostedPushContext({ env: c.env, actualHeadSha: c.merge,
    orderedParents: c.parents, expectedPredecessorSha: c.before });
  const summary = redactedSummary({ context: ctx, reservationCount: 2,
    clientRequestFinishedCount: 2, httpResponseCount: 1, execution: { status: 'completed' },
    decision: { decision: 'PASS', rationale: 'private' }, evidenceFile: 'verification.enc.json' });
  assert.equal(summary.clientRequestFinishedCount, 2);
  assert.equal(summary.httpResponseCount, 1);
  assert.equal(summary.reservationCount, 2);
  assert.equal(Object.hasOwn(summary, 'rationale'), false);
  assert.equal(Object.hasOwn(summary, 'project'), false);
});

test('composes the exact shared-adapter call and fails closed on incomplete or invalid semantic results', () => {
  const prepared = { protectedPromptText: 'protected prompt', protectedDecisionSchemaText: '{"type":"object"}',
    protectedReviewer: { provider: 'gemini', model: 'gemini-3.8-flash', thinkingLevel: 'MEDIUM' }, packet: {},
    workspaceLimits: { maxFiles: 32, maxFileBytes: 131072, maxTotalBytes: 524288 }, authorityProvenance: { version: 1 },
    validationRules: null, maxResponseBytes: 65536, maxSchemaBytes: 1048576 };
  const credential = { token: 'test-only-token-never-logged', project: 'test-project-123', region: 'us-central1' };
  const input = buildPreparedVerificationCall({ prepared, credential, runtimeEntry: '/runner/work/repo/.agk334-private-runtime/node_modules/@google/gemini-cli/bundle/gemini.js', runnerTemp: '/runner/temp' });
  assert.deepEqual(Object.keys(input).sort(), ['authorityProvenance', 'maxResponseBytes', 'maxSchemaBytes', 'reviewInput', 'validationRules'].sort());
  assert.deepEqual(Object.keys(input.reviewInput.proxySessionOptions).sort(), ['credentials', 'packet', 'processOptions', 'workspaceLimits', 'workspaceParentDirectory'].sort());
  assert.equal(input.reviewInput.proxySessionOptions.processOptions.timeoutMs, 180000);
  assert.deepEqual(snapshotPreparedGeminiCiReviewInput(input.reviewInput).protectedReviewer, prepared.protectedReviewer);
  assert.equal(input.reviewInput.proxySessionOptions.credentials.value, credential.token);
  assert.deepEqual(assertCompletedDecisionResult({ execution: { status: 'completed' }, decision: { decision: 'PASS' } }).decision, { decision: 'PASS' });
  assert.throws(() => assertCompletedDecisionResult({ execution: { status: 'incomplete' }, decision: { decision: 'PASS' } }));
  assert.throws(() => assertCompletedDecisionResult({ execution: { status: 'completed' }, decision: { decision: 'MAYBE' } }));
});

test('install mode refuses to run after WIF variables are present', () => {
  assert.throws(() => installPinnedRuntime('/missing', { AGK_VERTEX_ACCESS_TOKEN: 'x' }));
});

test('pins the complete committed Gemini CLI dependency graph, not only tarball integrity strings', () => {
  const lock = validateAuthorizedRuntimeLock(AUTHORIZED_RUNTIME_LOCK);
  assert.equal(lock.lockfileVersion, 3);
  assert.equal(Object.keys(lock.packages).length, 13);
  assert.equal(lock.packages['node_modules/@google/gemini-cli'].version, '0.62.0');
  const changedGraph = structuredClone(lock);
  changedGraph.packages['node_modules/@lydell/node-pty-linux-x64'].integrity = `sha512-${Buffer.alloc(64, 7).toString('base64')}`;
  const mutation = Buffer.from(JSON.stringify(changedGraph));
  assert.match(changedGraph.packages['node_modules/@lydell/node-pty-linux-x64'].integrity, /^sha512-[A-Za-z0-9+/=]+$/);
  assert.throws(() => validateAuthorizedRuntimeLock(mutation), /pinned complete dependency graph/i);
});
