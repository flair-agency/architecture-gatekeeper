import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('../dist/validate-authority-set-decision.mjs', import.meta.url));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const baseSha = 'a'.repeat(40);
const digest = 'b'.repeat(64);

function run(provenancePath, decisionBytes, extraArgs = []) {
  return spawnSync(process.execPath, [script, ...extraArgs, provenancePath], {
    input: decisionBytes, encoding: 'utf8',
  });
}

test('CLI reports identities of original validated v1 and v2 input bytes', t => {
  const root = mkdtempSync(join(tmpdir(), 'authority-decision-cli-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));

  const v1 = Buffer.from(JSON.stringify({ version: 1, manifestSha256: digest, setDigest: digest,
    members: [{ id: 'architecture' }] }));
  const decisionV1 = Buffer.from('{"decision":"PASS","authorityIds":["architecture"]}');
  const v1Path = join(root, 'v1.json');
  writeFileSync(v1Path, v1);
  const v1Result = run(v1Path, decisionV1);
  assert.equal(v1Result.status, 0, v1Result.stderr);
  assert.deepEqual(JSON.parse(v1Result.stdout), {
    decision: { sha256: hash(decisionV1), byteLength: decisionV1.length },
    provenance: { sha256: hash(v1), byteLength: v1.length },
  });

  const provenanceWhitespaceVariant = Buffer.from(` ${v1.toString('utf8')}\n`);
  writeFileSync(v1Path, provenanceWhitespaceVariant);
  const provenanceVariantResult = run(v1Path, decisionV1);
  assert.equal(provenanceVariantResult.status, 0, provenanceVariantResult.stderr);
  const provenanceVariantIdentity = JSON.parse(provenanceVariantResult.stdout);
  assert.equal(provenanceVariantIdentity.provenance.sha256, hash(provenanceWhitespaceVariant));
  assert.equal(provenanceVariantIdentity.provenance.byteLength, provenanceWhitespaceVariant.length);
  assert.notEqual(provenanceVariantIdentity.provenance.sha256, JSON.parse(v1Result.stdout).provenance.sha256);

  const member = { id: 'architecture', repository: 'example/project', resolvedCommit: baseSha,
    path: 'docs/architecture.md', byteLength: 1, sha256: digest };
  const records = [member];
  const setDigest = hash(Buffer.from(JSON.stringify(records)));
  const provenanceV2 = Buffer.from(JSON.stringify({ version: 2, selfRepository: 'example/project',
    authorityRevision: baseSha, manifestSha256: digest, setDigest, members: records }));
  const decisionV2 = Buffer.from(JSON.stringify({ decision: 'BLOCK', authorityIds: ['architecture'], authoritySetDigest: setDigest }));
  const v2Path = join(root, 'v2.json');
  writeFileSync(v2Path, provenanceV2);
  const v2Result = run(v2Path, decisionV2);
  assert.equal(v2Result.status, 0, v2Result.stderr);
  assert.deepEqual(JSON.parse(v2Result.stdout), {
    decision: { sha256: hash(decisionV2), byteLength: decisionV2.length },
    provenance: { sha256: hash(provenanceV2), byteLength: provenanceV2.length },
  });

  const whitespaceVariant = Buffer.from(` ${decisionV2.toString('utf8')}\n`);
  const variantResult = run(v2Path, whitespaceVariant);
  assert.equal(variantResult.status, 0, variantResult.stderr);
  const variantIdentity = JSON.parse(variantResult.stdout);
  assert.equal(variantIdentity.decision.sha256, hash(whitespaceVariant));
  assert.equal(variantIdentity.decision.byteLength, whitespaceVariant.length);
  assert.notEqual(variantIdentity.decision.sha256, JSON.parse(v2Result.stdout).decision.sha256);
});

test('CLI emits no success identity for invalid inputs, failed reads, or usage errors', t => {
  const root = mkdtempSync(join(tmpdir(), 'authority-decision-cli-negative-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const provenancePath = join(root, 'provenance.json');
  const validProvenance = Buffer.from(JSON.stringify({ version: 1, manifestSha256: digest, setDigest: digest,
    members: [{ id: 'architecture' }] }));
  writeFileSync(provenancePath, validProvenance);

  const invalidDecision = run(provenancePath, Buffer.from('{"decision":"INVALID","authorityIds":["architecture"]}'));
  assert.equal(invalidDecision.status, 2);
  assert.equal(invalidDecision.stdout, '');
  assert.equal(invalidDecision.stderr, 'Authority Set decision validation failed.\n');

  writeFileSync(provenancePath, '{"version":1}');
  const invalidProvenance = run(provenancePath, Buffer.from('{"decision":"PASS","authorityIds":["architecture"]}'));
  assert.equal(invalidProvenance.status, 2);
  assert.equal(invalidProvenance.stdout, '');
  assert.equal(invalidProvenance.stderr, 'Authority Set decision validation failed.\n');

  writeFileSync(provenancePath, validProvenance);
  const malformedDecision = run(provenancePath, Buffer.from('{'));
  assert.equal(malformedDecision.status, 2);
  assert.equal(malformedDecision.stdout, '');
  assert.equal(malformedDecision.stderr, 'Authority Set decision validation failed.\n');

  writeFileSync(provenancePath, '{');
  const malformedProvenance = run(provenancePath, Buffer.from('{"decision":"PASS","authorityIds":["architecture"]}'));
  assert.equal(malformedProvenance.status, 2);
  assert.equal(malformedProvenance.stdout, '');
  assert.equal(malformedProvenance.stderr, 'Authority Set decision validation failed.\n');

  writeFileSync(provenancePath, validProvenance);
  const failedRead = run(join(root, 'missing.json'), Buffer.from('{"decision":"PASS","authorityIds":["architecture"]}'));
  assert.equal(failedRead.status, 2);
  assert.equal(failedRead.stdout, '');
  assert.equal(failedRead.stderr, 'Authority Set decision validation failed.\n');

  const usage = spawnSync(process.execPath, [script], { input: '{}', encoding: 'utf8' });
  assert.equal(usage.status, 2);
  assert.equal(usage.stdout, '');
  assert.equal(usage.stderr, 'Authority Set decision validation failed.\n');
});

test('CLI rejects malformed provenance before waiting for stdin EOF', async t => {
  const root = mkdtempSync(join(tmpdir(), 'authority-decision-cli-open-stdin-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const provenancePath = join(root, 'provenance.json');
  writeFileSync(provenancePath, '{');
  const child = spawn(process.execPath, [script, provenancePath], { stdio: ['pipe', 'pipe', 'pipe'] });
  let stdout = '';
  let stderr = '';
  child.stdout.setEncoding('utf8').on('data', chunk => { stdout += chunk; });
  child.stderr.setEncoding('utf8').on('data', chunk => { stderr += chunk; });
  let timeout;
  try {
    const result = await Promise.race([
      new Promise(resolve => child.once('close', (code, signal) => resolve({ code, signal }))),
      new Promise(resolve => { timeout = setTimeout(() => resolve(null), 1500); }),
    ]);
    assert.ok(result, 'CLI waited for stdin EOF instead of rejecting the malformed provenance');
    assert.equal(result.code, 2);
    assert.equal(result.signal, null);
    assert.equal(stdout, '');
    assert.equal(stderr, 'Authority Set decision validation failed.\n');
  } finally {
    clearTimeout(timeout);
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
  }
});
