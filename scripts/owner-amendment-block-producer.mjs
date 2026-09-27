#!/usr/bin/env node
// Produces a deterministic historical BLOCK record. The record is provenance input,
// not a signature, attestation, or acceptance result.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TextDecoder } from 'node:util';
import { parseAuthorityManifest, readCommittedAuthorityFile, rejectDuplicateJsonKeys } from '../src/authority-set.mjs';
import { buildOwnerAmendmentBlockRecord } from '../src/owner-amendment-block-record.mjs';
import { parseCiPolicyJson, resolveCiPolicy } from '../src/resolve-ci-policy.mjs';

const SHA = /^[a-f0-9]{40}$/;
const REPOSITORY = /^[A-Za-z0-9][A-Za-z0-9-]{0,38}\/[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/;
const MAX_BYTES = 1024 * 1024;
const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

function checkedBytes(value, label, max = MAX_BYTES) {
  if (!value.length || value.length > max) throw new Error(`Invalid input size: ${label}`);
  return value;
}
function jsonBytes(raw, label) {
  const source = decoder.decode(raw);
  rejectDuplicateJsonKeys(source, label);
  return JSON.parse(source);
}
function git(args, binary = false) {
  return execFileSync('git', args, { encoding: binary ? 'buffer' : 'utf8', maxBuffer: MAX_BYTES,
    timeout: 10_000, env: { ...process.env, GIT_NO_REPLACE_OBJECTS: '1' }, stdio: ['ignore', 'pipe', 'pipe'] });
}
function protectedBytes(baseSha, path) { return git(['show', `${baseSha}:${path}`], true); }

export function parseGithubMergeCommit(raw, expectedSha) {
  let commit;
  try { commit = JSON.parse(raw); } catch { throw new Error('GitHub merge commit response is malformed.'); }
  const parents = commit?.parents;
  if (!SHA.test(expectedSha ?? '') || commit?.sha !== expectedSha || !Array.isArray(parents) ||
      parents.length !== 2 || !parents.every(parent => SHA.test(parent?.sha ?? ''))) {
    throw new Error('GitHub merge commit identity or parents are invalid.');
  }
  return parents.map(parent => parent.sha);
}

function githubMergeParents(repository, mergeSha) {
  if (!REPOSITORY.test(repository ?? '') || !SHA.test(mergeSha ?? '')) throw new Error('Invalid GitHub merge commit lookup.');
  const raw = execFileSync('gh', ['api', `repos/${repository}/git/commits/${mergeSha}`], {
    encoding: 'utf8', maxBuffer: MAX_BYTES, timeout: 10_000, stdio: ['ignore', 'pipe', 'pipe'],
  });
  return parseGithubMergeCommit(raw, mergeSha);
}

export function validateRecordedContext({ context, event, repository, workflowSha, workflowRef, parents }) {
  const pr = event?.pull_request;
  const sha = [context?.baseSha, context?.headSha, context?.mergeSha, context?.workflowSha];
  if (!context || Object.keys(context).sort().join(',') !== ['baseSha','headSha','mergeSha','prNumber','repository','runAttempt','runId','workflowPath','workflowSha'].sort().join(',') ||
      !pr || !['opened', 'synchronize', 'reopened', 'ready_for_review'].includes(event.action) ||
      event.repository?.full_name !== repository || context.repository !== repository || !REPOSITORY.test(repository) ||
      !Number.isSafeInteger(context.prNumber) || context.prNumber < 1 || pr.number !== context.prNumber ||
      pr.base?.ref !== 'main' || pr.draft !== false || !sha.every(value => typeof value === 'string' && SHA.test(value)) ||
      typeof context.workflowPath !== 'string' || !/^\.github\/workflows\/[A-Za-z0-9._-]+\.yml$/.test(context.workflowPath) ||
      workflowRef !== `${repository}/${context.workflowPath}@refs/heads/main` ||
      ![context.runId, context.runAttempt].every(value => typeof value === 'string' && /^[1-9]\d*$/.test(value)) ||
      context.baseSha !== pr.base.sha || context.headSha !== pr.head.sha || context.workflowSha !== workflowSha ||
      context.workflowSha !== context.baseSha || parents.length !== 2 || parents[0] !== context.baseSha || parents[1] !== context.headSha) {
    throw new Error('Recorded PR context or merge parents are invalid.');
  }
  return context;
}

function checkProvenance(provenance, manifestRaw, manifest, context, limits) {
  if (!provenance || provenance.version !== 1 || provenance.selfRepository !== context.repository || provenance.authorityRevision !== context.baseSha ||
      provenance.manifestSha256 !== digest(manifestRaw) || !Array.isArray(provenance.members) || provenance.members.length !== manifest.authorities.length) {
    throw new Error('Authority Set provenance does not match the protected base manifest.');
  }
  const records = [];
  let total = 0;
  for (let i = 0; i < manifest.authorities.length; i++) {
    const selected = manifest.authorities[i], member = provenance.members[i];
    // The initial self profile has no authenticated external-member fetch.
    // Never attest a caller-supplied digest for an authority we did not read.
    if (selected.repository !== 'self') throw new Error('External Authority Set members require a separate verified source adapter.');
    const repository = selected.repository === 'self' ? context.repository : selected.repository;
    const revision = selected.repository === 'self' ? context.baseSha : selected.revision;
    if (!member || member.id !== selected.id || member.repository !== repository || member.resolvedCommit !== revision || member.path !== selected.path ||
        !Number.isSafeInteger(member.byteLength) || member.byteLength < 1 || member.byteLength > limits.maxFileBytes || !/^[a-f0-9]{64}$/.test(member.sha256)) {
      throw new Error(`Authority Set provenance member ${selected.id} differs from protected selection.`);
    }
    if (selected.repository === 'self') {
      const content = readCommittedAuthorityFile('.', context.baseSha, selected.path, limits.maxFileBytes);
      if (member.byteLength !== content.length || member.sha256 !== digest(content)) throw new Error(`Self authority ${selected.id} differs from protected base bytes.`);
    }
    total += member.byteLength;
    if (total > limits.maxTotalBytes) throw new Error('Authority Set provenance exceeds protected total byte limit.');
    records.push({ id: member.id, repository: member.repository, resolvedCommit: member.resolvedCommit,
      path: member.path, byteLength: member.byteLength, sha256: member.sha256 });
  }
  if (provenance.setDigest !== digest(Buffer.from(JSON.stringify(records)))) throw new Error('Authority Set provenance digest is invalid.');
  return provenance;
}

export function produceOwnerAmendmentBlock({ decisionBytes, provenance, context, baseInputs }) {
  const inputDigests = Object.fromEntries(Object.entries(baseInputs).map(([key, raw]) => [key, digest(raw)]));
  const policy = parseCiPolicyJson(decoder.decode(baseInputs.policy));
  const selected = resolveCiPolicy(policy, 'main');
  if (selected.mode !== 'enforced' || !selected.authorityManifestPath) throw new Error('Protected enforced Authority Set policy is not selected.');
  const limits = JSON.parse(Buffer.from(selected.authorityLimitsBase64, 'base64').toString('utf8'));
  const manifest = parseAuthorityManifest(baseInputs.manifest, limits);
  checkProvenance(provenance, baseInputs.manifest, manifest, context, limits);
  return buildOwnerAmendmentBlockRecord({ decisionBytes, schema: jsonBytes(baseInputs.schema, 'protected schema'),
    validation: jsonBytes(baseInputs.validation, 'protected validation'), authority: provenance, context, inputDigests });
}

export function main() {
  const decisionBytes = checkedBytes(readFileSync('.agk-block-record-input/decision.json'), 'decision', 65_536);
  const provenance = jsonBytes(checkedBytes(readFileSync('.agk-block-record-input/authority-provenance.json'), 'authority provenance', 65_536), 'authority provenance');
  const recorded = jsonBytes(checkedBytes(readFileSync('.agk-block-record-input/recorded-context.json'), 'recorded context', 65_536), 'recorded context');
  const repository = process.env.GITHUB_REPOSITORY;
  const workflowSha = process.env.GITHUB_WORKFLOW_SHA;
  const parents = githubMergeParents(repository, recorded.context.mergeSha);
  const event = jsonBytes(checkedBytes(readFileSync('.agk-block-record-input/event.json'), 'GitHub event', 262_144), 'GitHub event');
  const context = validateRecordedContext({ context: recorded.context, event, repository, workflowSha,
    workflowRef: process.env.GITHUB_WORKFLOW_REF, parents });
  if (process.env.GITHUB_RUN_ID !== context.runId || process.env.GITHUB_RUN_ATTEMPT !== context.runAttempt ||
      git(['ls-remote', 'origin', `refs/pull/${context.prNumber}/merge`]).toString('utf8').trim().split('\t')[0] !== context.mergeSha) {
    throw new Error('Recorded run identity or current PR merge ref differs.');
  }
  const policyPath = '.codex/gatekeeper/ci-policy.json';
  const policy = parseCiPolicyJson(decoder.decode(protectedBytes(context.baseSha, policyPath)));
  const selected = resolveCiPolicy(policy, 'main');
  if (selected.mode !== 'enforced') throw new Error('Protected enforced Authority Set policy is not selected.');
  const paths = { policy: policyPath, prompt: '.codex/gatekeeper/ci-prompt.md', schema: '.codex/gatekeeper/ci-decision.schema.json',
    validation: '.codex/gatekeeper/decision.validation.json', manifest: selected.authorityManifestPath };
  const baseInputs = Object.fromEntries(Object.entries(paths).map(([key, path]) => [key, protectedBytes(context.baseSha, path)]));
  const record = produceOwnerAmendmentBlock({ decisionBytes, provenance, context, baseInputs });
  writeFileSync('.agk-block-record-input/review-record.json', `${JSON.stringify(record)}\n`, { flag: 'wx', mode: 0o600 });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try { main(); } catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 1; }
}
