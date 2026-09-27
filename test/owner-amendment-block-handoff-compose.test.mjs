import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { composeOwnerAmendmentBlockHandoff } from '../src/owner-amendment-block-handoff-compose.mjs';

const context = Object.freeze({ repository: 'flair-agency/example', artifactId: '77', runId: '42', runAttempt: '2',
  baseSha: 'a'.repeat(40), headSha: 'c'.repeat(40), aPrNumber: 9, workflowPath: '.github/workflows/self-architecture-gate.yml',
  workflowRef: 'refs/heads/main', workflowSha: 'a'.repeat(40), bSha: 'b'.repeat(40) });
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const crc32 = bytes => {
  let crc = 0xffffffff;
  for (const byte of bytes) { crc ^= byte; for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0); }
  return (crc ^ 0xffffffff) >>> 0;
};

function makeZip(entries) {
  const locals = [], centrals = [];
  let offset = 0;
  for (const { name: rawName, bytes } of entries) {
    const name = Buffer.from(rawName), data = Buffer.from(bytes), crc = crc32(data);
    const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50); local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x800, 6); local.writeUInt16LE(0, 8); local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(name.length, 26);
    locals.push(local, name, data);
    const central = Buffer.alloc(46); central.writeUInt32LE(0x02014b50); central.writeUInt16LE(0x031e, 4);
    central.writeUInt16LE(20, 6); central.writeUInt16LE(0x800, 8); central.writeUInt16LE(0, 10);
    central.writeUInt32LE(crc, 16); central.writeUInt32LE(data.length, 20); central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28); central.writeUInt32LE(offset, 42); centrals.push(central, name);
    offset += local.length + name.length + data.length;
  }
  const directory = Buffer.concat(centrals), end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50);
  end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10); end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16); return Buffer.concat([...locals, directory, end]);
}

function fixture({ recordChanges = {}, artifactChanges = {}, amendmentChanges = {}, invalidProvenance = false } = {}) {
  const decision = { decision: 'BLOCK', authorityIds: ['architecture'] };
  const decisionBytes = Buffer.from(JSON.stringify(decision));
  const record = { version: 1, kind: 'owner-amendment-block-review-record', repository: context.repository,
    prNumber: 9, baseSha: context.baseSha, headSha: context.headSha, mergeSha: 'd'.repeat(40),
    workflowSha: context.workflowSha, workflowPath: context.workflowPath, runId: context.runId, runAttempt: context.runAttempt,
    authority: { members: [{ id: 'architecture', path: 'docs/architecture.md', repository: context.repository,
      resolvedCommit: context.baseSha, sha256: sha(Buffer.from('old authority')) }] },
    decisionBytesBase64: decisionBytes.toString('base64'), decisionSha256: sha(decisionBytes), decision };
  Object.assign(record, recordChanges);
  const recordBytes = Buffer.from(`${JSON.stringify(record)}\n`);
  const bundleBytes = Buffer.from('{"bundle":"verified fixture"}\n');
  const zipBytes = makeZip([{ name: 'review-record.json', bytes: recordBytes }, { name: 'attestation-bundle.json', bytes: bundleBytes }]);
  const amendment = { version: 1, repository: context.repository, baseSha: context.baseSha, headSha: context.bSha,
    policyRevision: context.baseSha, authority: { id: 'architecture', path: 'docs/architecture.md',
      previousSha256: record.authority.members[0].sha256, newSha256: sha(Buffer.from('new authority')) },
    triggeringReviewSha256: sha(recordBytes), purpose: 'Adopt the owner-approved responsibility boundary' };
  Object.assign(amendment, amendmentChanges);
  const amendmentRecordBytes = Buffer.from(JSON.stringify(amendment));
  const run = { id: 42, event: 'pull_request_target', repository: { full_name: context.repository, id: 10 },
    head_repository: { full_name: context.repository, id: 10 }, head_sha: context.headSha, run_attempt: 2 };
  const artifact = { id: 77, name: `owner-amendment-block-${context.baseSha}-${context.headSha}-${context.runId}-${context.runAttempt}`,
    expired: false, size_in_bytes: zipBytes.length, digest: `sha256:${sha(zipBytes)}`,
    workflow_run: { id: 42, repository_id: 10, head_repository_id: 10, head_sha: context.headSha } };
  Object.assign(artifact, artifactChanges);
  const fetchCalls = [];
  const fetchImpl = async (url, options) => {
    fetchCalls.push({ url, options });
    if (url.endsWith('/attempts/2')) return { ok: true, json: async () => run };
    if (url.endsWith('/actions/artifacts/77')) return { ok: true, json: async () => artifact };
    if (url.endsWith('/actions/artifacts/77/zip')) return { ok: true, body: new ReadableStream({
      start(controller) { controller.enqueue(zipBytes); controller.close(); },
    }) };
    throw new Error(`unexpected URL ${url}`);
  };
  const signer = `https://github.com/${context.repository}/.github/workflows/architecture-gate.yml@${context.workflowRef}`;
  const caller = `https://github.com/${context.repository}/${context.workflowPath}@${context.workflowRef}`;
  const certificate = { subjectAlternativeName: signer, buildSignerURI: signer, buildConfigURI: caller,
    githubWorkflowRepository: context.repository, githubWorkflowSHA: context.workflowSha,
    buildSignerDigest: context.workflowSha, buildConfigDigest: context.workflowSha,
    sourceRepositoryDigest: context.workflowSha, sourceRepositoryURI: `https://github.com/${context.repository}`,
    sourceRepositoryRef: context.workflowRef, githubWorkflowTrigger: 'pull_request_target',
    runInvocationURI: `https://github.com/${context.repository}/actions/runs/${context.runId}/attempts/${context.runAttempt}` };
  const verified = [{ verificationResult: { signature: { certificate }, statement: {
    predicateType: 'https://slsa.dev/provenance/v1', subject: [{ name: 'review-record.json', digest: { sha256: sha(recordBytes) } }],
  } } }];
  const runGh = () => invalidProvenance ? '[]' : JSON.stringify(verified);
  return { recordBytes, bundleBytes, zipBytes, amendmentRecordBytes, fetchCalls, fetchImpl, runGh };
}

async function compose(f, override = {}) {
  return composeOwnerAmendmentBlockHandoff({ context, token: 'test-token', amendmentRecordBytes: f.amendmentRecordBytes,
    fetchImpl: f.fetchImpl, runGh: f.runGh, ...override });
}

test('fetches, extracts, cross-binds and prepares a tag message without returning evidence bytes', async () => {
  const f = fixture();
  const result = await compose(f);
  assert.equal(result.status, 'PREPARED_BLOCK_HANDOFF_TAG_MESSAGE');
  assert.equal(result.bSha, context.bSha);
  assert.match(result.tagMessage, /"bSha":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"/);
  assert.equal(result.reviewRecordSha256, sha(f.recordBytes));
  assert.equal(result.attestationBundleSha256, sha(f.bundleBytes));
  assert.equal(result.amendmentRecordSha256, sha(f.amendmentRecordBytes));
  assert.equal(Object.hasOwn(result, 'zipBytes'), false);
  assert.equal(Object.hasOwn(result, 'token'), false);
  assert.equal(f.fetchCalls.length, 3);
});

test('fails closed when ReviewRecord base, head, run, or attempt differs from trusted context', async t => {
  const cases = [
    ['base', { baseSha: 'e'.repeat(40) }, /baseSha/],
    ['head', { headSha: 'e'.repeat(40) }, /headSha/],
    ['A pull request', { prNumber: 10 }, /prNumber/],
    ['run', { runId: '43' }, /runId/],
    ['attempt', { runAttempt: '3' }, /runAttempt/],
  ];
  for (const [name, changes, message] of cases) await t.test(name, async () => {
    const f = fixture({ recordChanges: changes }); let verifierCalled = false;
    const result = await compose(f, { runGh: () => { verifierCalled = true; return '[]'; } });
    assert.equal(result.status, 'INCOMPLETE'); assert.match(result.reason, message); assert.equal(verifierCalled, false);
  });
});

test('fails closed on artifact metadata mismatch, invalid provenance, and exact-B mismatch', async t => {
  await t.test('artifact metadata head mismatch', async () => {
    const f = fixture({ artifactChanges: { workflow_run: { id: 42, repository_id: 10, head_repository_id: 10, head_sha: 'e'.repeat(40) } } });
    assert.equal((await compose(f)).status, 'INCOMPLETE');
  });
  await t.test('invalid provenance', async () => {
    const f = fixture({ invalidProvenance: true });
    const result = await compose(f); assert.equal(result.status, 'INCOMPLETE'); assert.match(result.reason, /Exactly one/);
  });
  await t.test('AmendmentRecord binds a different B', async () => {
    const f = fixture({ amendmentChanges: { headSha: 'e'.repeat(40) } });
    const result = await compose(f); assert.equal(result.status, 'INCOMPLETE'); assert.match(result.reason, /does not bind/);
  });
});

test('fails closed when the upstream artifact retrieval stage is incomplete', async () => {
  const f = fixture();
  const failedApi = async () => ({ ok: false, status: 503 });
  const result = await compose(f, { fetchImpl: failedApi });
  assert.equal(result.status, 'INCOMPLETE'); assert.match(result.reason, /GitHub API request failed/);
});

test('builds AmendmentRecord after the one authenticated artifact fetch and provenance verification', async () => {
  const f = fixture();
  const phases = [];
  const result = await compose(f, {
    amendmentRecordBytes: undefined,
    buildAmendmentRecordBytes(recordBytes) {
      phases.push('build');
      assert.deepEqual(recordBytes, f.recordBytes);
      return f.amendmentRecordBytes;
    },
    runGh(...args) { phases.push('verify'); return f.runGh(...args); },
  });
  assert.equal(result.status, 'PREPARED_BLOCK_HANDOFF_TAG_MESSAGE');
  assert.deepEqual(phases, ['verify', 'build']);
  assert.equal(f.fetchCalls.length, 3);
  assert.equal(result.amendmentRecordSha256, sha(f.amendmentRecordBytes));
});

test('does not invoke the AmendmentRecord builder before successful evidence verification', async () => {
  const f = fixture({ invalidProvenance: true });
  let called = false;
  const result = await compose(f, { amendmentRecordBytes: undefined, buildAmendmentRecordBytes() { called = true; return f.amendmentRecordBytes; } });
  assert.equal(result.status, 'INCOMPLETE');
  assert.equal(called, false);
  assert.equal(f.fetchCalls.length, 3);
});

test('requires exactly one AmendmentRecord source', async () => {
  const f = fixture();
  const result = await compose(f, { amendmentRecordBytes: undefined });
  assert.equal(result.status, 'INCOMPLETE');
  assert.match(result.reason, /either exact AmendmentRecord bytes or a protected AmendmentRecord builder/);
  assert.equal(f.fetchCalls.length, 0);
});
