#!/usr/bin/env node
// Issue #83 experiment only: this is not an accepted ReviewRecord producer.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TextDecoder } from 'node:util';
import { validateAuthoritySetDecision, rejectDuplicateJsonKeys } from '../src/authority-set.mjs';
import { validateJsonSchema } from '../src/json-schema.mjs';
import { validateDecisionRules } from '../src/validate-decision.mjs';

const SHA = /^[a-f0-9]{40}$/;
const NUMBER = /^[1-9][0-9]*$/;
const REPOSITORY = /^[A-Za-z0-9][A-Za-z0-9-]*\/[A-Za-z0-9][A-Za-z0-9._-]*$/;
const MAX_DECISION_BYTES = 65536;
const utf8 = new TextDecoder('utf-8', { fatal: true });

function readJson(path, label, limit = MAX_DECISION_BYTES) {
  const bytes = readFileSync(path);
  if (!bytes.length || bytes.length > limit) throw new Error(`${label} size is invalid.`);
  const source = utf8.decode(bytes);
  rejectDuplicateJsonKeys(source, label);
  return JSON.parse(source);
}

export function buildSyntheticBlockRecord(decision, schema, validationPolicy, context) {
  validateJsonSchema(decision, schema);
  validateDecisionRules(decision, validationPolicy);
  validateAuthoritySetDecision(decision, { members: [{ id: 'architecture-contract' }] });
  if (decision.decision !== 'BLOCK') throw new Error('Only a completed BLOCK may produce the probe record.');
  if (!REPOSITORY.test(context.repository) || !SHA.test(context.workflowSha) ||
      !NUMBER.test(context.runId) || !NUMBER.test(context.runAttempt)) {
    throw new Error('Protected workflow context is invalid.');
  }
  return {
    version: 1,
    kind: 'synthetic-validated-block-probe-not-review-evidence',
    repository: context.repository,
    workflowSha: context.workflowSha,
    runId: context.runId,
    runAttempt: context.runAttempt,
    decisionSha256: createHash('sha256').update(JSON.stringify(decision)).digest('hex'),
    decision,
  };
}

function main(args) {
  if (args.length !== 4) throw new Error('Usage: issue83-block-record-probe <decision> <schema> <validation-policy> <output>');
  const [decisionPath, schemaPath, validationPath, outputPath] = args;
  const record = buildSyntheticBlockRecord(
    readJson(decisionPath, 'decision'),
    readJson(schemaPath, 'schema'),
    readJson(validationPath, 'validation policy'),
    {
      repository: process.env.GITHUB_REPOSITORY,
      workflowSha: process.env.GITHUB_WORKFLOW_SHA,
      runId: process.env.GITHUB_RUN_ID,
      runAttempt: process.env.GITHUB_RUN_ATTEMPT,
    },
  );
  writeFileSync(outputPath, `${JSON.stringify(record)}\n`, { flag: 'wx', mode: 0o600 });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try { main(process.argv.slice(2)); }
  catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 1; }
}
