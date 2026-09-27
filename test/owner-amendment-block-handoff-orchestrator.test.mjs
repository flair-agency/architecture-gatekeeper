import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { orchestrateOwnerAmendmentBlockHandoff } from '../src/owner-amendment-block-handoff-orchestrator.mjs';

const repository = 'flair-agency/architecture-gatekeeper';
const baseSha = 'a'.repeat(40), bSha = 'b'.repeat(40), aSha = 'c'.repeat(40);
const runId = '42', runAttempt = '2', workflowPath = '.github/workflows/self-architecture-gate.yml';
const workflowRef = 'refs/heads/main', artifactId = 77, rulesetId = 75;
const tagNamespace = 'refs/tags/architecture-gatekeeper/amendments';
const tagRef = `${tagNamespace}/${bSha}`, tagName = tagRef.slice('refs/tags/'.length);
const tagObjectSha = 'e'.repeat(40), sha = bytes => createHash('sha256').update(bytes).digest('hex');
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
const baseAuthorityBytes = Buffer.from('previous canonical authority\n');
const headAuthorityBytes = Buffer.from('amended canonical authority\n');

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

function fixture({ decision = 'BLOCK', discoveryChanges = {}, failTagCreate = false } = {}) {
  const decisionValue = { decision, authorityIds: ['architecture-contract'] };
  const decisionBytes = Buffer.from(JSON.stringify(decisionValue));
  const record = {
    version: 1, kind: 'owner-amendment-block-review-record', repository,
    prNumber: 9, baseSha, headSha: aSha, mergeSha: 'd'.repeat(40), workflowSha: baseSha,
    workflowPath, runId, runAttempt,
    authority: { version: 1, selfRepository: repository, authorityRevision: baseSha,
      manifestSha256: '1'.repeat(64), setDigest: '2'.repeat(64), members: [{ id: 'architecture-contract', repository,
        resolvedCommit: baseSha, path: 'docs/architecture.md', byteLength: baseAuthorityBytes.length,
        sha256: sha(baseAuthorityBytes) }] },
    inputDigests: { manifest: '3'.repeat(64), policy: '4'.repeat(64), prompt: '5'.repeat(64), schema: '6'.repeat(64), validation: '7'.repeat(64) },
    decisionSha256: sha(decisionBytes), decisionBytesBase64: decisionBytes.toString('base64'), decision: decisionValue,
  };
  const recordBytes = Buffer.from(`${JSON.stringify(record)}\n`);
  const bundleBytes = Buffer.from('{"fixture":"verified attestation bundle"}\n');
  const zipBytes = makeZip([{ name: 'review-record.json', bytes: recordBytes }, { name: 'attestation-bundle.json', bytes: bundleBytes }]);
  const run = { id: Number(runId), status: 'completed', event: 'pull_request_target', run_attempt: Number(runAttempt),
    repository: { full_name: repository, id: 10 }, head_repository: { full_name: repository, id: 10 }, head_sha: aSha };
  const artifactName = `owner-amendment-block-${baseSha}-${aSha}-${runId}-${runAttempt}`;
  const artifact = { id: artifactId, name: artifactName, expired: false, size_in_bytes: zipBytes.length,
    digest: `sha256:${sha(zipBytes)}`, expires_at: new Date(Date.now() + 60_000).toISOString(), workflow_run: { id: Number(runId), repository_id: 10,
      head_repository_id: 10, head_sha: aSha } };
  Object.assign(artifact, discoveryChanges);
  const signer = `https://github.com/${repository}/.github/workflows/architecture-gate.yml@${workflowRef}`;
  const caller = `https://github.com/${repository}/${workflowPath}@${workflowRef}`;
  const certificate = { subjectAlternativeName: signer, buildSignerURI: signer, buildConfigURI: caller,
    githubWorkflowRepository: repository, githubWorkflowSHA: baseSha, buildSignerDigest: baseSha,
    buildConfigDigest: baseSha, sourceRepositoryDigest: baseSha, sourceRepositoryURI: `https://github.com/${repository}`,
    sourceRepositoryRef: workflowRef, githubWorkflowTrigger: 'pull_request_target',
    runInvocationURI: `https://github.com/${repository}/actions/runs/${runId}/attempts/${runAttempt}` };
  const verification = [{ verificationResult: { signature: { certificate }, statement: { predicateType: 'https://slsa.dev/provenance/v1',
    subject: [{ name: 'review-record.json', digest: { sha256: sha(recordBytes) } }] } } }];
  const ruleset = { id: rulesetId, enforcement: 'active', target: 'tag',
    conditions: { ref_name: { include: [`${tagNamespace}/*`], exclude: [] } },
    rules: [{ type: 'update' }, { type: 'deletion' }], bypass_actors: [] };
  const calls = [];
  let refExists = false;
  let tagBody;
  const tagObject = () => ({ tag: tagName, message: tagBody.message, object: { sha: bSha, type: 'commit' }, sha: tagObjectSha });
  const refObject = () => ({ ref: tagRef, object: { sha: tagObjectSha, type: 'tag' } });
  const jsonResponse = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
  const fetchImpl = async (input, options = {}) => {
    const url = new URL(input), path = url.pathname;
    calls.push({ method: options.method ?? 'GET', path });
    if (path.endsWith(`/actions/runs/${runId}/attempts/${runAttempt}`)) return jsonResponse(200, run);
    if (path.endsWith(`/actions/runs/${runId}/artifacts`)) return jsonResponse(200, { total_count: 1, artifacts: [artifact] });
    if (path.endsWith(`/actions/artifacts/${artifactId}`)) return jsonResponse(200, artifact);
    if (path.endsWith(`/actions/artifacts/${artifactId}/zip`)) return { ok: true, status: 200,
      body: new ReadableStream({ start(controller) { controller.enqueue(zipBytes); controller.close(); } }) };
    if (path.endsWith(`/rulesets/${rulesetId}`)) return jsonResponse(200, ruleset);
    if (path.endsWith(`/git/ref/tags/architecture-gatekeeper/amendments/${bSha}`)) {
      if (options.method === 'POST') { refExists = true; return jsonResponse(201, refObject()); }
      return refExists ? jsonResponse(200, refObject()) : jsonResponse(404, {});
    }
    if (path.endsWith('/git/tags') && options.method === 'POST') {
      if (failTagCreate) return jsonResponse(403, {});
      tagBody = JSON.parse(options.body); return jsonResponse(201, tagObject());
    }
    if (path.endsWith('/git/refs') && options.method === 'POST') { refExists = true; return jsonResponse(201, refObject()); }
    if (path.endsWith(`/git/tags/${tagObjectSha}`)) return jsonResponse(200, tagObject());
    throw new Error(`Unexpected request ${options.method ?? 'GET'} ${path}`);
  };
  return { recordBytes, bundleBytes, zipBytes, calls, fetchImpl, runGh: () => JSON.stringify(verification), tagBody: () => tagBody };
}

function input(f, overrides = {}) {
  const policy = { ownerAmendmentVersion: 1, ownerAmendmentGrade: 'G0', ownerAmendmentScope: 'authority-only',
    ownerAmendmentTriggerProfile: 'completed-block-v1', ownerAmendmentAuthorityId: 'architecture-contract',
    ownerAmendmentAuthorityPath: 'docs/architecture.md', ownerAmendmentTagNamespace: tagNamespace };
  const manifest = { version: 1, authorities: [{ id: 'architecture-contract', repository: 'self',
    revision: 'authority-revision', path: 'docs/architecture.md' }] };
  return { repository, policy, manifest, baseSha, bSha,
    changedFiles: [{ path: 'docs/architecture.md', status: 'modified' }], baseAuthorityBytes, headAuthorityBytes,
    blockRun: { runId, runAttempt, headSha: aSha, aPrNumber: 9, workflowPath, workflowRef, workflowSha: baseSha },
    purpose: 'Amend the self architecture contract after the completed BLOCK', token: 'fixture-token',
    runGh: f.runGh, rulesetId, tagger: { name: 'Architecture Gatekeeper test', email: 'gatekeeper@example.invalid', date: '2026-09-27T00:00:00.000Z' },
    fetchImpl: f.fetchImpl, ...overrides };
}

test('discovers, verifies once, builds AmendmentRecord from exact BLOCK, and transports exact-B tag', async () => {
  const f = fixture();
  const result = await orchestrateOwnerAmendmentBlockHandoff(input(f));
  assert.equal(result.status, 'TAG_TRANSPORTED_AND_READ_BACK', `${JSON.stringify(result)} ${JSON.stringify(f.calls)}`);
  assert.equal(result.transportStatus, 'CREATED_AND_READ_BACK');
  assert.equal(result.tagRef, tagRef);
  assert.equal(result.bSha, bSha);
  assert.equal(result.tagObjectSha, tagObjectSha);
  assert.equal(result.reviewRecordSha256, sha(f.recordBytes));
  assert.equal(result.attestationBundleSha256, sha(f.bundleBytes));
  assert.equal(result.amendmentRecordSha256, sha(Buffer.from(JSON.stringify(canonical({
    version: 1, repository, baseSha, headSha: bSha, policyRevision: baseSha,
    authority: { id: 'architecture-contract', path: 'docs/architecture.md', previousSha256: sha(baseAuthorityBytes), newSha256: sha(headAuthorityBytes) },
    triggeringReviewSha256: sha(f.recordBytes), purpose: 'Amend the self architecture contract after the completed BLOCK',
  })))));
  assert.equal(f.calls.filter(call => call.path.endsWith(`/actions/artifacts/${artifactId}/zip`)).length, 1);
  assert.equal(f.calls.filter(call => call.path.endsWith(`/actions/runs/${runId}/attempts/${runAttempt}`)).length, 2);
  assert.equal(f.tagBody().object, bSha);
  assert.match(f.tagBody().message, /"reviewRecordBase64"/);
  assert.equal(Object.hasOwn(result, 'tagMessage'), false);
  assert.equal(Object.hasOwn(result, 'adoption'), false);
  assert.equal(Object.hasOwn(result, 'accepted'), false);
});

test('does not create a tag when discovery or exact BLOCK provenance fails', async t => {
  await t.test('ambiguous discovered artifact', async () => {
    const f = fixture({ discoveryChanges: { name: 'wrong-artifact' } });
    const result = await orchestrateOwnerAmendmentBlockHandoff(input(f));
    assert.equal(result.status, 'INCOMPLETE');
    assert.equal(f.calls.some(call => call.path.endsWith('/git/tags')), false);
  });
  await t.test('invalid BLOCK decision', async () => {
    const f = fixture({ decision: 'PASS' });
    const result = await orchestrateOwnerAmendmentBlockHandoff(input(f));
    assert.equal(result.status, 'INCOMPLETE');
    assert.equal(f.calls.some(call => call.path.endsWith('/git/tags')), false);
  });
});

test('fails closed for unselected policy, changed scope, mismatched run, and tag API failure', async t => {
  const cases = [
    ['policy did not select route', { policy: { ownerAmendmentVersion: 1 } }, /Previous protected policy/],
    ['B includes another file', { changedFiles: [{ path: 'docs/architecture.md', status: 'modified' }, { path: 'src/x.mjs', status: 'modified' }] }, /exactly the selected self authority member/],
    ['producer workflow is not from base', { blockRun: { runId, runAttempt, headSha: aSha, aPrNumber: 9, workflowPath,
      workflowRef, workflowSha: 'f'.repeat(40) } }, /trusted BLOCK run/],
  ];
  for (const [name, overrides, pattern] of cases) await t.test(name, async () => {
    const f = fixture(); const result = await orchestrateOwnerAmendmentBlockHandoff(input(f, overrides));
    assert.equal(result.status, 'INCOMPLETE'); assert.match(result.reason, pattern);
    assert.equal(f.calls.some(call => call.path.endsWith('/git/tags')), false);
  });
  await t.test('tag API failure', async () => {
    const f = fixture({ failTagCreate: true }); const result = await orchestrateOwnerAmendmentBlockHandoff(input(f));
    assert.equal(result.status, 'INCOMPLETE'); assert.match(result.reason, /HTTP 403/);
  });
});
