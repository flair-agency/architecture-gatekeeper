#!/usr/bin/env node
// Test-only historical BLOCK producer. Never use this record for acceptance.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TextDecoder } from 'node:util';
import { rejectDuplicateJsonKeys, validateAuthoritySetDecision } from '../src/authority-set.mjs';
import { validateJsonSchema } from '../src/json-schema.mjs';
import { validateDecisionRules } from '../src/validate-decision.mjs';
import { parseCiPolicyJson, resolveCiPolicy } from '../src/resolve-ci-policy.mjs';

const SHA = /^[a-f0-9]{40}$/;
const REPOSITORY = /^[A-Za-z0-9][A-Za-z0-9-]*\/[A-Za-z0-9][A-Za-z0-9._-]*$/;
const MAX_BYTES = 1024 * 1024;
const INPUT_KEYS = ['policy', 'prompt', 'schema', 'validation', 'manifest'];
const decoder = new TextDecoder('utf-8', { fatal: true });
const digest = bytes => createHash('sha256').update(bytes).digest('hex');

function bytes(path, max = MAX_BYTES) {
  const value = readFileSync(path);
  if (!value.length || value.length > max) throw new Error(`Invalid input size: ${path}`);
  return value;
}

function json(path, max = MAX_BYTES) {
  const source = decoder.decode(bytes(path, max));
  rejectDuplicateJsonKeys(source, path);
  return JSON.parse(source);
}

function git(...args) {
  return execFileSync('git', args, { encoding: 'utf8', maxBuffer: 1024 * 1024 }).trim();
}

function gitBytes(...args) {
  return execFileSync('git', args, { maxBuffer: MAX_BYTES });
}

function protectedJson(baseSha, path) {
  const source = decoder.decode(gitBytes('show', `${baseSha}:${path}`));
  rejectDuplicateJsonKeys(source, path);
  return JSON.parse(source);
}

export function validatePrContext({ event, repository, workflowSha, mergeSha, parents, runId, runAttempt }) {
  const pr = event?.pull_request;
  if (!['opened', 'synchronize', 'reopened', 'ready_for_review'].includes(event?.action) ||
      !pr || event.repository?.full_name !== repository ||
      !REPOSITORY.test(repository) || !Number.isSafeInteger(pr.number) || pr.number < 1 ||
      pr.base?.ref !== 'main' || pr.draft !== false ||
      ![pr.base?.sha, pr.head?.sha, workflowSha, mergeSha].every(value => SHA.test(value)) ||
      !/^[1-9]\d*$/.test(runId) || !/^[1-9]\d*$/.test(runAttempt)) {
    throw new Error('Invalid protected PR context.');
  }
  if (pr.base.sha !== workflowSha || parents.length !== 2 ||
      parents[0] !== pr.base.sha || parents[1] !== pr.head.sha) {
    throw new Error('Reviewed merge is not bound to the protected base and PR head.');
  }
  return { repository, prNumber: pr.number, baseSha: pr.base.sha, headSha: pr.head.sha,
    mergeSha, workflowSha, runId, runAttempt };
}

export function buildRealPrBlockRecord({ decision, decisionBytes, schema, validation, provenance, context, inputDigests }) {
  validateJsonSchema(decision, schema);
  validateDecisionRules(decision, validation);
  validateAuthoritySetDecision(decision, provenance);
  if (decision.decision !== 'BLOCK') throw new Error('Only a completed BLOCK produces a record.');
  if (provenance.authorityRevision !== context.baseSha || provenance.selfRepository !== context.repository ||
      !Array.isArray(provenance.members) || !provenance.members.length ||
      !inputDigests || Object.keys(inputDigests).sort().join(',') !== INPUT_KEYS.slice().sort().join(',') ||
      !Object.values(inputDigests).every(value => /^[a-f0-9]{64}$/.test(value))) {
    throw new Error('Protected inputs are incomplete or inconsistent.');
  }
  const rawDecision = decisionBytes ?? Buffer.from(JSON.stringify(decision));
  return { version: 1, kind: 'test-only-real-pr-block-not-acceptance-evidence',
    ...context, authority: provenance, inputDigests,
    decisionSha256: digest(rawDecision), decisionBytesBase64: rawDecision.toString('base64'), decision };
}

function main(args) {
  if (args.length !== 5) throw new Error('Usage: issue83-real-pr-block-probe <decision> <review-provenance> <producer-provenance> <merge-sha> <output>');
  const [decisionPath, reviewProvenancePath, producerProvenancePath, mergeSha, outputPath] = args;
  const event = json(process.env.GITHUB_EVENT_PATH, 262144);
  const context = validatePrContext({ event, repository: process.env.GITHUB_REPOSITORY,
    workflowSha: process.env.GITHUB_WORKFLOW_SHA, mergeSha,
    parents: git('rev-list', '--parents', '-n', '1', mergeSha).split(' ').slice(1),
    runId: process.env.GITHUB_RUN_ID, runAttempt: process.env.GITHUB_RUN_ATTEMPT });
  if (git('ls-remote', 'origin', 'refs/pull/' + context.prNumber + '/merge').split('\t')[0] !== mergeSha) {
    throw new Error('Current PR merge ref changed.');
  }
  const policyPath = '.codex/gatekeeper/ci-policy.json';
  const policy = parseCiPolicyJson(decoder.decode(gitBytes('show', `${context.baseSha}:${policyPath}`)));
  const selected = resolveCiPolicy(policy, 'main');
  if (selected.mode !== 'enforced' || selected.authorityManifestPath !== '.codex/gatekeeper/authorities.json') {
    throw new Error('Protected CI Authority Set route is not selected.');
  }
  const paths = {
    policy: policyPath, prompt: '.codex/gatekeeper/ci-prompt.md',
    schema: '.codex/gatekeeper/ci-decision.schema.json',
    validation: '.codex/gatekeeper/decision.validation.json',
    manifest: selected.authorityManifestPath,
  };
  const inputDigests = Object.fromEntries(Object.entries(paths).map(([key, path]) =>
    [key, digest(gitBytes('show', `${context.baseSha}:${path}`))]));
  const reviewProvenance = json(reviewProvenancePath, 65536);
  const producerProvenance = json(producerProvenancePath, 65536);
  if (JSON.stringify(reviewProvenance) !== JSON.stringify(producerProvenance)) {
    throw new Error('Review and producer Authority Set provenance differ.');
  }
  const record = buildRealPrBlockRecord({ decision: json(decisionPath, 65536), decisionBytes: bytes(decisionPath, 65536),
    schema: protectedJson(context.baseSha, paths.schema),
    validation: protectedJson(context.baseSha, paths.validation),
    provenance: producerProvenance, context, inputDigests });
  writeFileSync(outputPath, `${JSON.stringify(record)}\n`, { flag: 'wx', mode: 0o600 });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try { main(process.argv.slice(2)); }
  catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 1; }
}
