#!/usr/bin/env node
// Issue #45 observation only. This narrow parser checks a small set of
// execution controls to avoid misleading observations, but cannot authorize a
// credential-bearing job or be reused as an authorization verifier.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const sha256 = (data) => createHash('sha256').update(data).digest('hex');
const shaPattern = /^[0-9a-f]{40}$/;
const digestPattern = /^[0-9a-f]{64}$/;
const repositoryPattern = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

function exactKeys(value, keys, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object`);
  const actual = Object.keys(value).sort();
  if (JSON.stringify(actual) !== JSON.stringify([...keys].sort())) throw new Error(`${label} has missing or unsupported fields`);
}

function requiredString(value, pattern, label) {
  if (typeof value !== 'string' || !pattern.test(value)) throw new Error(`${label} is invalid`);
  return value;
}

function parseJob(workflow, name) {
  if (/\t/.test(workflow)) throw new Error('Tabs are unsupported in the observed workflow');
  const lines = workflow.split(/\r?\n/);
  const jobs = lines.flatMap((line, index) => {
    const match = /^  ([a-z][a-z0-9-]*):\s*(?:#.*)?$/.exec(line);
    return match ? [{ name: match[1], index }] : [];
  });
  const found = jobs.filter((job) => job.name === name);
  if (found.length !== 1) throw new Error(`Expected exactly one ${name} job`);
  const index = found[0].index;
  const end = jobs.find((job) => job.index > index)?.index ?? lines.length;
  return lines.slice(index + 1, end);
}

function parseSteps(jobLines) {
  const boundaries = jobLines.flatMap((line, index) => /^      - /.test(line) ? [index] : []);
  if (boundaries.length === 0) throw new Error('Job has no ordinary steps');
  return boundaries.map((start, index) => {
    const end = boundaries[index + 1] ?? jobLines.length;
    const lines = [`        ${jobLines[start].slice(8)}`, ...jobLines.slice(start + 1, end)];
    const names = lines.flatMap((line) => {
      const match = /^        name:\s*(.*?)\s*$/.exec(line);
      return match ? [match[1]] : [];
    });
    if (names.length > 1) throw new Error('Duplicate step name field');
    return { lines, name: names[0] ?? null };
  });
}

function scalar(lines, indent, key) {
  const prefix = ' '.repeat(indent);
  const matches = lines.flatMap((line) => {
    const match = new RegExp(`^${prefix}${key}:\\s*(.*?)\\s*$`).exec(line);
    return match ? [match[1]] : [];
  });
  if (matches.length !== 1) throw new Error(`Expected exactly one ${key} field`);
  // Only plain literal scalars are supported. Quoting and YAML aliases require a
  // real YAML parser before this observer could ever become an authorization gate.
  const value = matches[0].replace(/\s+#.*$/, '').trim();
  if (!value || /^(?:["']|[&*!]|\{|\[)/.test(value) || /\$\{\{/.test(value)) {
    throw new Error(`${key} must be a plain literal`);
  }
  return value;
}

function namedStep(steps, name) {
  const found = steps.filter((step) => step.name === name);
  if (found.length !== 1) throw new Error(`Expected exactly one ${name} step`);
  return found[0];
}

function runLines(step) {
  const index = step.lines.findIndex((line) => /^        run: \|\s*$/.test(line));
  if (index < 0 || step.lines.some((line, position) => position !== index && /^        run:/.test(line))) {
    throw new Error('Expected one literal run block');
  }
  const commands = [];
  for (const line of step.lines.slice(index + 1)) {
    if (!line.startsWith('          ')) break;
    commands.push(line.slice(10).trimEnd());
  }
  if (commands.length === 0) throw new Error('Empty verification run block');
  return commands;
}

export function observeWorkflowIdentity(workflow, procedure) {
  const review = parseSteps(parseJob(workflow, 'review'));
  const integrity = parseSteps(parseJob(workflow, 'codex-action-integrity'));
  const reviewer = namedStep(review, 'Run read-only architecture review');
  // The observer accepts only the known policy condition for the protected
  // jobs. Candidate condition changes must not hide execution or weaken the
  // independent full verification boundary.
  requireJobControls(workflow, 'review', "if: needs.policy.outputs.mode == 'enforced'");
  requireJobControls(workflow, 'codex-action-integrity', "if: needs.policy.outputs.mode == 'enforced'");
  const verifyJob = parseJob(workflow, 'codex-action-integrity');
  if (verifyJob.some((line) => /^    continue-on-error:/.test(line))) {
    throw new Error('Full verification job must not continue on error');
  }
  const actionUses = scalar(reviewer.lines, 8, 'uses');
  const otherCodexUses = review.filter((step) => step !== reviewer).filter((step) => {
    try { return /\/codex-action@/.test(scalar(step.lines, 8, 'uses')); }
    catch { return false; }
  });
  if (otherCodexUses.length > 0) throw new Error('Ambiguous duplicate Codex Action uses');
  const match = /^([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)@([0-9a-f]{40})$/.exec(actionUses);
  if (!match) throw new Error('Review Action must use a literal repository and full SHA');
  const checkout = namedStep(integrity, 'Check out the pinned Codex Action without credentials');
  const checkoutRepository = scalar(checkout.lines, 10, 'repository');
  const checkoutCommit = scalar(checkout.lines, 10, 'ref');
  const pnpmVersion = scalar(namedStep(integrity, 'Setup pnpm').lines, 10, 'version');
  const nodeVersion = scalar(namedStep(integrity, 'Setup Node.js').lines, 10, 'node-version');
  const commands = runLines(namedStep(integrity, 'Verify the pinned action before exposing review credentials'));
  const verificationStep = namedStep(integrity, 'Verify the pinned action before exposing review credentials');
  if (verificationStep.lines.some((line) => /^        (?:if|continue-on-error|shell|working-directory):/.test(line))) {
    throw new Error('Full verification step execution controls are unsupported');
  }
  if (JSON.stringify(commands) !== JSON.stringify(procedure.commands)) throw new Error('Full verification commands drifted');
  if (pnpmVersion !== procedure.toolchain.pnpm || nodeVersion !== procedure.toolchain.node) {
    throw new Error('Full verification toolchain drifted');
  }
  if (match[1] !== checkoutRepository || match[2] !== checkoutCommit) {
    throw new Error('Review Action and integrity checkout differ');
  }
  return { repository: match[1], commit: match[2] };
}

function requireJobControls(workflow, name, expectedCondition) {
  const job = parseJob(workflow, name);
  const conditions = job.filter((line) => /^    if:/.test(line));
  if (conditions.length !== 1 || conditions[0].trim() !== expectedCondition) {
    throw new Error(`${name} job condition differs from the protected policy condition`);
  }
}

export function observeCandidateIdentity({ workflow, manifest, record, procedure, procedureBytes, verifierBytes }) {
  exactKeys(procedure, ['version', 'epoch', 'verifier', 'verifierSha256', 'toolchain', 'commands'], 'Procedure');
  exactKeys(procedure.toolchain, ['node', 'pnpm'], 'Procedure toolchain');
  if (procedure.version !== 1 || procedure.epoch !== 1) throw new Error('Unsupported procedure');
  if (procedure.verifier !== 'src/verify-codex-action.mjs') throw new Error('Unknown full verifier');
  if (!digestPattern.test(procedure.verifierSha256) || sha256(verifierBytes) !== procedure.verifierSha256) {
    throw new Error('Full verifier bytes differ from procedure');
  }
  if (!Array.isArray(procedure.commands) || !procedure.commands.every((command) => typeof command === 'string')) {
    throw new Error('Procedure commands are invalid');
  }
  const selected = observeWorkflowIdentity(workflow, procedure);

  exactKeys(record, ['version', 'state', 'action', 'procedure', 'verification'], 'Candidate record');
  exactKeys(record.action, ['repository', 'commit', 'tree', 'entrypoint', 'entrypointSha256'], 'Candidate action');
  exactKeys(record.procedure, ['epoch', 'sha256'], 'Candidate procedure');
  exactKeys(record.verification, ['result'], 'Candidate verification');
  if (record.version !== 1 || record.state !== 'unpromoted-fixture' || record.verification.result !== 'not-recorded') {
    throw new Error('Only an unpromoted, unverified fixture can be observed');
  }
  requiredString(record.action.repository, repositoryPattern, 'Action repository');
  requiredString(record.action.commit, shaPattern, 'Action commit');
  requiredString(record.action.tree, shaPattern, 'Action tree');
  requiredString(record.action.entrypointSha256, digestPattern, 'Action entrypoint digest');
  requiredString(record.procedure.sha256, digestPattern, 'Procedure digest');
  if (record.action.entrypoint !== 'dist/main.js') throw new Error('Unsupported Action entrypoint');
  if (record.procedure.epoch !== procedure.epoch || record.procedure.sha256 !== sha256(procedureBytes)) {
    throw new Error('Procedure identity differs from fixture');
  }
  if (manifest.version !== 1 || manifest.repository !== record.action.repository ||
      manifest.headCommit !== record.action.commit || manifest.headTree !== record.action.tree ||
      manifest.files?.[record.action.entrypoint] !== record.action.entrypointSha256) {
    throw new Error('Provenance identity differs from fixture');
  }
  if (selected.repository !== record.action.repository || selected.commit !== record.action.commit) {
    throw new Error('Workflow Action differs from fixture');
  }
  return { identityMatches: true, authorization: false, reason: 'unpromoted-fixture' };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [workflowPath, manifestPath, procedurePath, fixturePath, runtimeRoot] = process.argv.slice(2);
  if (!workflowPath || !manifestPath || !procedurePath || !fixturePath || !runtimeRoot) {
    throw new Error('Usage: observe-codex-action-integrity <workflow> <manifest> <procedure> <fixture> <runtime-root>');
  }
  try {
    const procedureBytes = readFileSync(procedurePath);
    const result = observeCandidateIdentity({
      workflow: readFileSync(workflowPath, 'utf8'),
      manifest: JSON.parse(readFileSync(manifestPath, 'utf8')),
      record: JSON.parse(readFileSync(fixturePath, 'utf8')),
      procedure: JSON.parse(procedureBytes),
      procedureBytes,
      verifierBytes: readFileSync(resolve(runtimeRoot, 'src/verify-codex-action.mjs')),
    });
    process.stdout.write(`::notice::Issue #45 observation: declared Action identity and verification command text match (${result.reason}); execution semantics are unchecked; this is not authorization.\n`);
  } catch (error) {
    process.stdout.write(`::warning::Issue #45 observation: ${String(error.message).replace(/[\r\n]/g, ' ')}; full integrity job remains required.\n`);
  }
  // Observe only: never gates or authorizes the full integrity/review jobs.
}
