#!/usr/bin/env node
// Test-only, independent historical BLOCK inspection. Never returns acceptance.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { closeSync, constants, fstatSync, mkdtempSync, openSync, readSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { TextDecoder } from 'node:util';
import { isDeepStrictEqual } from 'node:util';
import { materializeAuthoritySet, rejectDuplicateJsonKeys, validateAuthorityLimits } from '../src/authority-set.mjs';
import { parseCiPolicyJson, resolveCiPolicy } from '../src/resolve-ci-policy.mjs';
import { buildRealPrBlockRecord } from './issue83-real-pr-block-probe.mjs';

const SHA = /^[a-f0-9]{40}$/;
const REPOSITORY = /^[A-Za-z0-9][A-Za-z0-9-]*\/[A-Za-z0-9][A-Za-z0-9._-]*$/;
const DECODER = new TextDecoder('utf-8', { fatal: true });
const PATHS = Object.freeze({
  policy: '.codex/gatekeeper/ci-policy.json',
  prompt: '.codex/gatekeeper/ci-prompt.md',
  schema: '.codex/gatekeeper/ci-decision.schema.json',
  validation: '.codex/gatekeeper/decision.validation.json',
  manifest: '.codex/gatekeeper/authorities.json',
});
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
function fail(reason) { throw new Error(reason); }
function same(actual, expected, label) { if (actual !== expected) fail(`${label} differs from trusted expectation.`); }
function bounded(bytes, max, label) {
  if (!Buffer.isBuffer(bytes) || !bytes.length || bytes.length > max) fail(`${label} is absent or exceeds its byte limit.`);
  return bytes;
}
function readFileBounded(path, max, label) {
  const descriptor = openSync(path, constants.O_RDONLY | constants.O_NONBLOCK);
  try {
    const stat = fstatSync(descriptor);
    if (!stat.isFile() || stat.size < 1 || stat.size > max) fail(`${label} is absent or exceeds its byte limit.`);
    const bytes = Buffer.alloc(stat.size);
    let length = 0;
    while (length < bytes.length) {
      const count = readSync(descriptor, bytes, length, bytes.length - length, length);
      if (!count) fail(`${label} changed during read.`);
      length += count;
    }
    return bytes;
  } finally { closeSync(descriptor); }
}
function parseJson(bytes, max, label) {
  const source = DECODER.decode(bounded(bytes, max, label));
  rejectDuplicateJsonKeys(source, label);
  return JSON.parse(source);
}
function git(root, args, max = 1024 * 1024) {
  return execFileSync('git', ['-C', root, ...args], { maxBuffer: max, timeout: 10_000,
    env: { ...process.env, GIT_NO_REPLACE_OBJECTS: '1' }, stdio: ['ignore', 'pipe', 'pipe'] });
}
function protectedBytes(root, base, path) {
  return bounded(git(root, ['show', `${base}:${path}`]), 1024 * 1024, path);
}
function expectedContext(expected) {
  const names = ['repository', 'prNumber', 'baseSha', 'headSha', 'mergeSha', 'workflowSha', 'workflowPath', 'runId', 'runAttempt'];
  if (!expected || typeof expected !== 'object' || Array.isArray(expected) ||
      Object.keys(expected).sort().join(',') !== names.sort().join(',')) fail('Trusted expected identity is incomplete or has unknown fields.');
  if (!REPOSITORY.test(expected.repository) || !Number.isSafeInteger(expected.prNumber) || expected.prNumber < 1 ||
      ![expected.baseSha, expected.headSha, expected.mergeSha, expected.workflowSha].every(value => SHA.test(value)) ||
      !/^\.github\/workflows\/[A-Za-z0-9._-]+\.yml$/.test(expected.workflowPath) ||
      ![expected.runId, expected.runAttempt].every(value => typeof value === 'string' && /^[1-9]\d*$/.test(value))) {
    fail('Trusted expected identity has invalid values.');
  }
  same(expected.workflowSha, expected.baseSha, 'Protected workflow revision');
  return expected;
}

/** Caller must obtain current from a fresh trusted source and verified from gh attestation verify, not record claims. */
export async function inspectHistoricalBlock({ expected, current, recordBytes, verified, gitRoot, fetchExternal }) {
  try {
    expected = expectedContext(expected);
    if (!current || current.repository !== expected.repository || current.prNumber !== expected.prNumber ||
        current.baseRef !== 'main' || current.draft !== false) fail('Current PR identity or state differs.');
    for (const key of ['baseSha', 'headSha', 'mergeSha']) same(current[key], expected[key], `Current ${key}`);
    const record = parseJson(recordBytes, 1024 * 1024, 'Review record');
    if (!Array.isArray(verified) || verified.length !== 1) fail('One verified attestation is required.');
    const result = verified[0]?.verificationResult;
    const certificate = result?.signature?.certificate;
    const identity = `https://github.com/${expected.repository}/${expected.workflowPath}@refs/heads/main`;
    if (!certificate || !result?.statement) fail('Verified certificate or statement is absent.');
    for (const key of ['subjectAlternativeName', 'buildSignerURI', 'buildConfigURI']) same(certificate[key], identity, key);
    same(certificate.githubWorkflowRepository, expected.repository, 'Signer repository');
    same(certificate.githubWorkflowSHA, expected.workflowSha, 'Workflow SHA');
    same(certificate.buildSignerDigest, expected.workflowSha, 'Signer digest');
    same(certificate.buildConfigDigest, expected.workflowSha, 'Workflow config digest');
    same(certificate.sourceRepositoryDigest, expected.workflowSha, 'Source digest');
    same(certificate.sourceRepositoryURI, `https://github.com/${expected.repository}`, 'Source repository');
    same(certificate.sourceRepositoryRef, 'refs/heads/main', 'Source ref');
    same(certificate.githubWorkflowTrigger, 'pull_request_target', 'Workflow trigger');
    same(certificate.runInvocationURI,
      `https://github.com/${expected.repository}/actions/runs/${expected.runId}/attempts/${expected.runAttempt}`,
      'Run attempt');
    const subjects = result.statement.subject;
    if (!Array.isArray(subjects) || subjects.length !== 1 ||
        subjects[0]?.name !== 'issue83-real-pr-block-record.json' ||
        subjects[0]?.digest?.sha256 !== sha256(recordBytes)) fail('Attestation subject does not match exact record bytes.');
    same(result.statement.predicateType, 'https://slsa.dev/provenance/v1', 'Attestation predicate type');

    const context = { repository: expected.repository, prNumber: expected.prNumber, baseSha: expected.baseSha,
      headSha: expected.headSha, mergeSha: expected.mergeSha, workflowSha: expected.workflowSha,
      runId: expected.runId, runAttempt: expected.runAttempt };
    for (const [key, value] of Object.entries(context)) same(record[key], value, `Record ${key}`);
    same(record.version, 1, 'Record version');
    same(record.kind, 'test-only-real-pr-block-not-acceptance-evidence', 'Record kind');
    for (const revision of [expected.baseSha, expected.headSha, expected.mergeSha]) {
      same(git(gitRoot, ['cat-file', '-t', revision], 100).toString().trim(), 'commit', 'Git object type');
    }
    const parents = git(gitRoot, ['rev-list', '--parents', '-n', '1', expected.mergeSha], 300).toString().trim().split(' ');
    if (!isDeepStrictEqual(parents, [expected.mergeSha, expected.baseSha, expected.headSha])) fail('Reviewed merge parents differ.');
    const inputs = Object.fromEntries(Object.entries(PATHS).map(([key, path]) =>
      [key, protectedBytes(gitRoot, expected.baseSha, path)]));
    const inputDigests = Object.fromEntries(Object.entries(inputs).map(([key, bytes]) => [key, sha256(bytes)]));
    if (!isDeepStrictEqual(record.inputDigests, inputDigests)) fail('Protected input digests differ.');
    const policy = parseCiPolicyJson(DECODER.decode(inputs.policy));
    const selected = resolveCiPolicy(policy, 'main');
    if (selected.mode !== 'enforced' || selected.authorityManifestPath !== PATHS.manifest ||
        selected.model !== 'gpt-6-sol' || selected.reasoningEffort !== 'medium') fail('Protected policy does not select this probe route.');
    const limits = validateAuthorityLimits(policy.branches.main.authorityLimits);
    const set = await materializeAuthoritySet({ manifestBytes: inputs.manifest, limits,
      selfRepository: expected.repository, selfRoot: gitRoot, authorityRevision: expected.baseSha, fetchExternal });
    const authority = { version: 1, selfRepository: expected.repository, authorityRevision: expected.baseSha,
      manifestSha256: set.manifestSha256, setDigest: set.setDigest,
      members: set.members.map(({ id, repository, resolvedCommit, path, byteLength, sha256 }) =>
        ({ id, repository, resolvedCommit, path, byteLength, sha256 })) };
    if (!isDeepStrictEqual(record.authority, authority)) fail('Protected Authority Set differs.');
    if (typeof record.decisionBytesBase64 !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(record.decisionBytesBase64)) fail('Decision bytes are absent.');
    const decisionBytes = bounded(Buffer.from(record.decisionBytesBase64, 'base64'), 65536, 'Decision');
    same(decisionBytes.toString('base64'), record.decisionBytesBase64, 'Decision encoding');
    same(sha256(decisionBytes), record.decisionSha256, 'Decision digest');
    const decision = parseJson(decisionBytes, 65536, 'Decision');
    if (!isDeepStrictEqual(record.decision, decision)) fail('Embedded decision differs from exact decision bytes.');
    const rebuilt = buildRealPrBlockRecord({ decision, decisionBytes,
      schema: parseJson(inputs.schema, 1024 * 1024, 'Schema'),
      validation: parseJson(inputs.validation, 1024 * 1024, 'Validation'),
      provenance: authority, context, inputDigests });
    if (!Buffer.from(`${JSON.stringify(rebuilt, null, 2)}\n`).equals(recordBytes)) fail('Record bytes differ from protected producer format.');
    return { status: 'VERIFIED_TEST_ONLY_BLOCK', repository: expected.repository, prNumber: expected.prNumber,
      runId: expected.runId, runAttempt: expected.runAttempt, recordSha256: sha256(recordBytes) };
  } catch (error) {
    return { status: 'INCOMPLETE', reason: error.message };
  }
}

function gh(args, max = 4 * 1024 * 1024) {
  return execFileSync('gh', args, { encoding: 'utf8', maxBuffer: max, timeout: 30_000,
    stdio: ['ignore', 'pipe', 'pipe'] });
}
async function main(args) {
  if (args.length !== 3) fail('Usage: issue83-offline-block-verifier EXPECTED.json RECORD.json GIT_ROOT');
  const [expectedPath, recordPath, gitRoot] = args;
  const expected = expectedContext(parseJson(readFileBounded(expectedPath, 4096, 'Trusted expected identity'), 4096, 'Trusted expected identity'));
  const recordBytes = readFileBounded(recordPath, 1024 * 1024, 'Review record');
  // Freeze the exact bytes before gh opens the file; the temporary copy is never written into the repository.
  const temporary = mkdtempSync(resolve(tmpdir(), 'issue83-block-'));
  try {
    const frozen = resolve(temporary, 'issue83-real-pr-block-record.json');
    writeFileSync(frozen, recordBytes, { flag: 'wx', mode: 0o600 });
    const verified = JSON.parse(gh(['attestation', 'verify', frozen, '--repo', expected.repository,
      '--signer-workflow', `${expected.repository}/${expected.workflowPath}`, '--signer-digest', expected.workflowSha,
      '--source-digest', expected.workflowSha, '--source-ref', 'refs/heads/main', '--format', 'json']));
    const current = readCurrentPr(expected);
    const result = await inspectHistoricalBlock({ expected, current, recordBytes, verified, gitRoot });
    if (result.status !== 'VERIFIED_TEST_ONLY_BLOCK') return result;
    const after = readCurrentPr(expected);
    return isDeepStrictEqual(after, current) ? result : { status: 'INCOMPLETE', reason: 'Current PR state changed during inspection.' };
  } finally { rmSync(temporary, { recursive: true, force: true }); }
}

function readCurrentPr(expected) {
  // Both reads are fresh and independent of record claims and artifact names.
  const pr = JSON.parse(gh(['api', `repos/${expected.repository}/pulls/${expected.prNumber}`]));
  const mergeRef = execFileSync('git', ['ls-remote', `https://github.com/${expected.repository}.git`,
    `refs/pull/${expected.prNumber}/merge`], { encoding: 'utf8', timeout: 30_000 }).split('\t')[0];
  return { repository: pr.base?.repo?.full_name, prNumber: pr.number, baseRef: pr.base?.ref,
    baseSha: pr.base?.sha, headSha: pr.head?.sha, mergeSha: mergeRef, draft: pr.draft };
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(resolve(process.argv[1]))).href) {
  main(process.argv.slice(2)).then(result => {
    process.stdout.write(`${JSON.stringify(result)}\n`);
    if (result.status !== 'VERIFIED_TEST_ONLY_BLOCK') process.exitCode = 1;
  }).catch(error => {
    process.stdout.write(`${JSON.stringify({ status: 'INCOMPLETE', reason: error.message })}\n`);
    process.exitCode = 1;
  });
}
