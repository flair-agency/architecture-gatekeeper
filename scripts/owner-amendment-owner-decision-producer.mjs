#!/usr/bin/env node
// Produce exact historical OWNER_DECISION bytes for the self amendment profile.
// The ReviewRecord is evidence input, not an owner approval or acceptance.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readRunnerTempFile, resolveRunnerTempDirectory, writeRunnerTempFile, validateRepositoryTreePath } from '../dist/runner-temp-path.mjs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { TextDecoder } from 'node:util';
import { parseAuthorityManifest, readCommittedAuthorityFile, rejectDuplicateJsonKeys } from '../dist/authority-set.mjs';
import { buildOwnerAmendmentOwnerDecisionRecord } from '../dist/owner-amendment-owner-decision-record.mjs';
import { parseCiPolicyJson, resolveCiPolicy } from '../dist/resolve-ci-policy.mjs';

const SHA = /^[a-f0-9]{40}$/;
const REPOSITORY = /^[A-Za-z0-9][A-Za-z0-9-]{0,38}\/[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/;
const MAX_BYTES = 1024 * 1024;
const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const SELF_REPOSITORY = 'flair-agency/architecture-gatekeeper';
const INPUT_DIRECTORY = 'architecture-gate-owner-decision-record-input';

function checkedBytes(value, label, maximum) {
  if (!Buffer.isBuffer(value) || !value.length || value.length > maximum) throw new Error(`${label} is missing or oversized.`);
  return value;
}

function jsonBytes(raw, label) {
  const source = decoder.decode(raw);
  rejectDuplicateJsonKeys(source, label);
  return JSON.parse(source);
}

function git(args, options = {}) {
  const workspace = process.env.GITHUB_WORKSPACE;
  if (typeof workspace !== 'string' || !workspace.startsWith('/')) throw new Error('Protected Git workspace is unavailable.');
  return execFileSync('git', ['-C', workspace, ...args], options);
}

function validateAuthorityProvenance(provenance, manifestRaw, manifest, context, limits, readAuthority) {
  if (!provenance || provenance.version !== 1 || provenance.selfRepository !== context.repository ||
      provenance.authorityRevision !== context.baseSha || provenance.manifestSha256 !== digest(manifestRaw) ||
      !Array.isArray(provenance.members) || provenance.members.length !== manifest.authorities.length) {
    throw new Error('Authority Set provenance does not match the protected base manifest.');
  }
  const descriptors = [];
  let total = 0;
  for (let index = 0; index < manifest.authorities.length; index += 1) {
    const selected = manifest.authorities[index], member = provenance.members[index];
    validateRepositoryTreePath(selected.path);
    if (selected.repository !== 'self') throw new Error('External Authority Set members require a separate verified source adapter.');
    if (!member || member.id !== selected.id || member.repository !== context.repository ||
        member.resolvedCommit !== context.baseSha || member.path !== selected.path ||
        !Number.isSafeInteger(member.byteLength) || member.byteLength < 1 || member.byteLength > limits.maxFileBytes ||
        !/^[a-f0-9]{64}$/.test(member.sha256 ?? '')) {
      throw new Error(`Authority Set provenance member ${selected.id} differs from protected selection.`);
    }
    const content = readAuthority(context.baseSha, selected.path, limits.maxFileBytes);
    if (member.byteLength !== content.length || member.sha256 !== digest(content)) {
      throw new Error(`Self authority ${selected.id} differs from protected base bytes.`);
    }
    total += member.byteLength;
    if (total > limits.maxTotalBytes) throw new Error('Authority Set provenance exceeds protected total byte limit.');
    descriptors.push({ id: member.id, repository: member.repository, resolvedCommit: member.resolvedCommit,
      path: member.path, byteLength: member.byteLength, sha256: member.sha256 });
  }
  if (provenance.setDigest !== digest(Buffer.from(JSON.stringify(descriptors), 'utf8'))) {
    throw new Error('Authority Set provenance digest is invalid.');
  }
  return provenance;
}

function protectedBytes(baseSha, path) {
  if (!SHA.test(baseSha ?? '')) throw new Error('Protected Git revision is invalid.');
  validateRepositoryTreePath(path);
  return git(['show', `${baseSha}:${path}`], { encoding: 'buffer', maxBuffer: MAX_BYTES,
    timeout: 10_000,
    env: { ...process.env, GIT_NO_REPLACE_OBJECTS: '1' }, stdio: ['ignore', 'pipe', 'pipe'] });
}

function githubMergeParents(repository, mergeSha) {
  if (repository !== SELF_REPOSITORY || !SHA.test(mergeSha ?? '')) throw new Error('Invalid GitHub merge commit lookup.');
  const raw = execFileSync('gh', ['api', `repos/flair-agency/architecture-gatekeeper/git/commits/${mergeSha}`], {
    encoding: 'utf8', maxBuffer: MAX_BYTES, timeout: 10_000, stdio: ['ignore', 'pipe', 'pipe'],
  });
  const commit = JSON.parse(raw);
  if (commit?.sha !== mergeSha || !Array.isArray(commit.parents) || commit.parents.length !== 2 ||
      !commit.parents.every(parent => SHA.test(parent?.sha ?? ''))) throw new Error('GitHub merge commit identity or parents are invalid.');
  return commit.parents.map(parent => parent.sha);
}

function validateContext({ context, event, repository, workflowSha, workflowRef, parents }) {
  const pr = event?.pull_request;
  const fields = ['baseSha', 'headSha', 'mergeSha', 'prNumber', 'repository', 'runAttempt', 'runId', 'workflowPath', 'workflowSha'];
  if (!context || Object.keys(context).sort().join(',') !== fields.sort().join(',') ||
      !pr || !['opened', 'synchronize', 'reopened', 'ready_for_review'].includes(event.action) ||
      event.repository?.full_name !== repository || context.repository !== repository || repository !== SELF_REPOSITORY || !REPOSITORY.test(repository) ||
      !Number.isSafeInteger(context.prNumber) || context.prNumber < 1 || pr.number !== context.prNumber ||
      pr.base?.ref !== 'main' || pr.draft !== false ||
      ![context.baseSha, context.headSha, context.mergeSha, context.workflowSha].every(value => SHA.test(value ?? '')) ||
      context.workflowPath !== '.github/workflows/self-architecture-gate.yml' ||
      workflowRef !== 'flair-agency/architecture-gatekeeper/.github/workflows/self-architecture-gate.yml@refs/heads/main' ||
      ![context.runId, context.runAttempt].every(value => typeof value === 'string' && /^[1-9]\d*$/.test(value)) ||
      context.baseSha !== pr.base.sha || context.headSha !== pr.head.sha || context.workflowSha !== workflowSha ||
      context.workflowSha !== context.baseSha || parents.length !== 2 || parents[0] !== context.baseSha || parents[1] !== context.headSha) {
    throw new Error('Recorded PR context or merge parents are invalid.');
  }
  return context;
}

/** Construct exact OWNER_DECISION evidence only under an explicitly selected previous-base profile. */
export function produceOwnerAmendmentOwnerDecision({ decisionBytes, provenance, context, baseInputs,
  readAuthority = (revision, path, maxBytes) => readCommittedAuthorityFile(process.env.GITHUB_WORKSPACE, revision, path, maxBytes) }) {
  const policy = parseCiPolicyJson(decoder.decode(baseInputs.policy));
  const selected = resolveCiPolicy(policy, 'main');
  if (selected.mode !== 'enforced' || selected.ownerAmendmentTriggerProfile !== 'completed-owner-decision-self-v1' ||
      !selected.authorityManifestPath) throw new Error('Protected previous-base OWNER_DECISION amendment profile is not selected.');
  const limits = JSON.parse(Buffer.from(selected.authorityLimitsBase64, 'base64').toString('utf8'));
  const manifest = parseAuthorityManifest(baseInputs.manifest, limits);
  validateAuthorityProvenance(provenance, baseInputs.manifest, manifest, context, limits, readAuthority);
  const inputDigests = Object.fromEntries(Object.entries(baseInputs).map(([key, raw]) => [key, digest(raw)]));
  return buildOwnerAmendmentOwnerDecisionRecord({ decisionBytes,
    schema: jsonBytes(baseInputs.schema, 'protected schema'),
    validation: jsonBytes(baseInputs.validation, 'protected validation'),
    authority: provenance, context, inputDigests });
}

export function main() {
  const inputDir = resolveRunnerTempDirectory(INPUT_DIRECTORY);
  const inputFile = (name, limit) => checkedBytes(readRunnerTempFile(inputDir, name, limit), name, limit);
  const decisionBytes = inputFile('decision.json', 65_536);
  const provenanceBytes = inputFile('authority-provenance.json', 65_536);
  const provenance = jsonBytes(provenanceBytes, 'authority provenance');
  const recorded = jsonBytes(inputFile('recorded-context.json', 65_536), 'recorded context');
  const repository = process.env.GITHUB_REPOSITORY;
  const context = validateContext({ context: recorded.context,
    event: jsonBytes(inputFile('event.json', 262_144), 'GitHub event'), repository,
    workflowSha: process.env.GITHUB_WORKFLOW_SHA, workflowRef: process.env.GITHUB_WORKFLOW_REF,
    parents: githubMergeParents(repository, recorded.context?.mergeSha) });
  if (process.env.GITHUB_RUN_ID !== context.runId || process.env.GITHUB_RUN_ATTEMPT !== context.runAttempt ||
      git(['ls-remote', 'origin', `refs/pull/${context.prNumber}/merge`], { encoding: 'utf8' }).trim().split('\t')[0] !== context.mergeSha) {
    throw new Error('Recorded run identity or current PR merge ref differs.');
  }
  const policyPath = '.codex/gatekeeper/ci-policy.json';
  const policy = parseCiPolicyJson(decoder.decode(protectedBytes(context.baseSha, policyPath)));
  const selected = resolveCiPolicy(policy, 'main');
  const paths = { policy: policyPath, prompt: '.codex/gatekeeper/ci-prompt.md',
    schema: '.codex/gatekeeper/ci-decision.schema.json', validation: '.codex/gatekeeper/decision.validation.json',
    manifest: selected.authorityManifestPath };
  const baseInputs = Object.fromEntries(Object.entries(paths).map(([key, path]) => [key, protectedBytes(context.baseSha, path)]));
  const record = produceOwnerAmendmentOwnerDecision({ decisionBytes, provenance, context, baseInputs });
  writeRunnerTempFile(inputDir, 'review-record.json', `${JSON.stringify(record)}\n`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try { main(); } catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 1; }
}
