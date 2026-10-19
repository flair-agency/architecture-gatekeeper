import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repository = 'flair-agency/architecture-gatekeeper';
const sha = n => n.toString(16).padStart(40, '0');
const verifier = fileURLToPath(new URL('../scripts/issue83-offline-block-verifier.mjs', import.meta.url));
const preload = fileURLToPath(new URL('./issue83-reader-cli-preload.mjs', import.meta.url));
function invoke(t, mode, expectedBytes) {
  const root = mkdtempSync(join(tmpdir(), 'issue83-reader-cli-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const expectedPath = join(root, 'expected.json');
  const recordPath = join(root, 'record.json');
  const recordBytes = Buffer.from(JSON.stringify({ fixture: 'bounded-reader-record', payload: 'multiple-positive-reads' }));
  writeFileSync(expectedPath, expectedBytes);
  writeFileSync(recordPath, recordBytes);
  const child = spawnSync(process.execPath, ['--import', preload, verifier, expectedPath, recordPath, root], {
    encoding: 'utf8', timeout: 30_000, maxBuffer: 1024 * 1024,
    env: { ...process.env, ISSUE83_READ_MODE: mode,
      ISSUE83_EXPECTED_PATH: expectedPath, ISSUE83_RECORD_PATH: recordPath,
      ISSUE83_INVALID_EXPECTED_BASE64: expectedBytes.toString('base64'),
      ISSUE83_EXPECTED_BASE_SHA: sha(1), TMPDIR: root, TMP: root, TEMP: root },
  });
  const traceLine = child.stderr.split('\n').find(line => line.startsWith('ISSUE83_READER_TRACE '));
  const trace = traceLine ? JSON.parse(traceLine.slice('ISSUE83_READER_TRACE '.length)) : null;
  return { child, trace, expectedPath, recordPath, recordBytes };
}
function expected(workflowSha = sha(1)) {
  return Buffer.from(JSON.stringify({ repository, prNumber: 17, baseSha: sha(1), headSha: sha(2), mergeSha: sha(3),
    workflowSha, workflowPath: '.github/workflows/issue83-real-pr-block-probe.yml', runId: '18', runAttempt: '1' }));
}

test('private CLI reader completes partial reads for expected identity and record before bounded gh stop', t => {
  const bytes = expected(); // Valid ordinary identity; the controlled first gh call stops before dispatch.
  const result = invoke(t, 'partial', bytes);
  assert.equal(result.child.status, 1, result.child.stderr);
  assert.match(result.child.stdout, /blocked first gh call/, result.child.stderr);
  assert.ok(result.trace.reads[result.expectedPath].positiveReads > 1);
  assert.ok(result.trace.reads[result.recordPath].positiveReads > 1);
  assert.equal(result.trace.reads[result.expectedPath].bytes, bytes.length);
  assert.equal(result.trace.reads[result.recordPath].bytes, result.recordBytes.length);
  assert.deepEqual(result.trace.closes, [result.expectedPath, result.recordPath]);
  assert.equal(result.trace.children.length, 1);
  assert.deepEqual(result.trace.children[0], { file: 'gh', args: ['attestation', 'verify', result.trace.frozen.path,
    '--repo', repository, '--signer-workflow', `${repository}/.github/workflows/issue83-real-pr-block-probe.yml`,
    '--signer-digest', sha(1), '--source-digest', sha(1), '--source-ref', 'refs/heads/main', '--format', 'json'],
    timeout: 30_000, maxBuffer: 4 * 1024 * 1024 });
  assert.equal(Buffer.from(result.trace.frozen.bytes, 'base64').toString(), result.recordBytes.toString());
  assert.equal(existsSync(result.trace.frozen.path), false); // CLI finally removes its temporary directory.
});

test('private CLI reader preserves early-EOF and read-error failure on each input with descriptor closure', t => {
  const bytes = expected();
  for (const [mode, message, closes] of [
    ['early-eof', /changed during read/, ['expected']],
    ['read-error', /injected benign read error/, ['expected']],
    ['record-early-eof', /changed during read/, ['expected', 'record']],
    ['record-read-error', /injected benign read error/, ['expected', 'record']],
  ]) {
    const result = invoke(t, mode, bytes);
    assert.equal(result.child.status, 1, `${mode}: ${result.child.stderr}`);
    assert.match(result.child.stdout, message, `${mode}: ${result.child.stderr}`);
    const paths = closes.map(which => which === 'expected' ? result.expectedPath : result.recordPath);
    assert.deepEqual(result.trace.closes, paths, mode);
    assert.deepEqual(result.trace.children, [], mode);
  }
});

test('private CLI reader closes the identity descriptor before fatal UTF-8 decoding', t => {
  const bytes = Buffer.from([0xff, 0xfe]);
  const result = invoke(t, 'decode-after-close', bytes);
  assert.equal(result.child.status, 1, result.child.stderr);
  assert.match(result.child.stdout, /encoded data was not valid/i, result.child.stderr);
  assert.equal(result.trace.decodeObserved, true);
  assert.equal(result.trace.decodeAfterClose, true);
  assert.equal(result.trace.reads[result.recordPath], undefined);
  assert.deepEqual(result.trace.closes, [result.expectedPath]);
  assert.deepEqual(result.trace.children, []);
});
