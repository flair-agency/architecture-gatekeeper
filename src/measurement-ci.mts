#!/usr/bin/env node
import { existsSync, mkdirSync, realpathSync } from 'node:fs';
import { appendGitHubOutput } from './runner-temp-path.mjs';
import { fileURLToPath } from 'node:url';
import { isAbsolute, relative, sep } from 'node:path';
import { beginMeasurement, measurementDigest, warnMeasurementGap, parseMeasurementJson, readMeasurementJson, resumeMeasurement } from './measurement.mts';
import { readDiagnosticText, resolveDiagnosticPath } from './diagnostic-path.mts';

export function runCiMeasurement(command: string | undefined, env: NodeJS.ProcessEnv = process.env) {
  if (!env.AGK_MEASUREMENT_DIR) return;
  const dir = resolveDiagnosticPath(env.AGK_MEASUREMENT_DIR);
  // Reject an in-worktree target before optional bootstrap can create it.
  const workingRoot = env.GITHUB_WORKSPACE ?? process.cwd();
  if (typeof workingRoot !== 'string' || !workingRoot) throw new Error('Invalid diagnostic working root.');
  {
    const path = relative(realpathSync(workingRoot), dir);
    if (path === '' || (path !== '..' && !path.startsWith(`..${sep}`) && !isAbsolute(path))) throw new Error('Measurement directory must be outside the reviewed worktree.');
  }
  if (!existsSync(dir)) mkdirSync(dir, { mode: 0o700 });
  if (command === 'start' || command === 'outcome') {
    const observation = { policyJob: env.POLICY_RESULT, reviewJob: env.REVIEW_RESULT, reportJob: env.REPORT_RESULT, acceptJob: env.ACCEPT_RESULT };
    const capture = beginMeasurement({ directory: dir, route: command === 'start' ? 'ci-review' : 'ci-outcome', cwd: workingRoot,
      changeId: env.AGK_MEASUREMENT_CHANGE_ID, context: { ci: { repository: env.GITHUB_REPOSITORY, pr: env.PR_NUMBER, runId: env.GITHUB_RUN_ID,
        runAttempt: env.GITHUB_RUN_ATTEMPT, workflowSha: env.RUNTIME_SHA, baseSha: env.BASE_SHA, headSha: env.HEAD_SHA, reviewedSha: env.REVIEWED_SHA,
        job: command === 'start' ? 'review' : 'measurement' } } });
    if (command === 'outcome') capture.finish({ state: 'completed', observation });
    else {
      let prompt: string | undefined; let schema: unknown;
      // Paths are selected by the protected workflow. No execution of candidate content.
      try { prompt = readDiagnosticText(env.PROMPT_PATH, 1024 * 1024); schema = readMeasurementJson(env.SCHEMA_PATH as string); } catch { /* unknown identities */ }
      const provenance = env.AUTHORITY_PROVENANCE_BASE64 || env.LEGACY_AUTHORITY_PROVENANCE_BASE64;
      const knownRun = [env.GITHUB_RUN_ID, env.GITHUB_RUN_ATTEMPT].every(value => typeof value === 'string' && /^[1-9][0-9]{0,19}$/.test(value));
      capture.request({ requestId: knownRun ? measurementDigest(`${env.GITHUB_RUN_ID}/${env.GITHUB_RUN_ATTEMPT}/review`) : null, reviewedRevision: env.REVIEWED_SHA,
        prompt, schema, reviewer: { provider: env.REVIEW_PROVIDER || 'codex', model: env.REVIEW_MODEL, reasoningEffort: env.REVIEW_EFFORT } },
        { kind: 'ci-merge-revision', policySha256: env.POLICY_SHA256 || null, authorityProvenanceSha256: provenance ? measurementDigest(provenance) : null });
    }
    if (capture.id) appendGitHubOutput(`attempt_id=${capture.id}\n`);
    return;
  }
  if (command === 'finish') {
    const capture = resumeMeasurement(env.MEASUREMENT_ATTEMPT_ID as string, dir);
    const executed = env.REVIEW_OUTCOME === 'success';
    // A step may be skipped only when the protected workflow says it was unselected.
    const selectedStepSucceeded = (selection: string | undefined, outcome: string | undefined) =>
      selection === 'true' ? outcome === 'success' : selection === 'false' && outcome === 'skipped';
    const selectedChecks = [
      selectedStepSucceeded(env.EXECUTION_OBSERVATION_SELECTED, env.EXECUTION_OBSERVATION_OUTCOME),
      selectedStepSucceeded(env.DECISION_KIND_SELECTED, env.DECISION_KIND_OUTCOME),
      selectedStepSucceeded(env.CONSUMER_VALIDATION_SELECTED, env.CONSUMER_VALIDATION),
      selectedStepSucceeded(env.LEGACY_VALIDATION_SELECTED, env.LEGACY_VALIDATION),
      selectedStepSucceeded(env.AUTHORITY_VALIDATION_SELECTED, env.AUTHORITY_VALIDATION),
    ];
    const validated = executed && selectedChecks.every(Boolean);
    let decision: unknown = null;
    if (validated) {
      try {
        decision = readMeasurementJson(env.REVIEW_OUTPUT_FILE as string);
        const validatedResponse = parseMeasurementJson(env.REVIEW_RESPONSE);
        if (!['PASS', 'BLOCK', 'OWNER_DECISION'].includes((decision as { decision?: unknown } | null)?.decision as string) || measurementDigest(decision) !== measurementDigest(validatedResponse)) decision = null;
      } catch { decision = null; /* explicit capture gap */ }
    }
    capture.finish({ state: env.REVIEW_OUTCOME === 'cancelled' ? 'cancelled' : validated && decision ? 'completed' : 'incomplete', decision,
      observation: { execution: env.REVIEW_OUTCOME || 'unknown', decisionKindOutcome: env.DECISION_KIND_OUTCOME || 'unknown',
        validationOutcomes: { executionObservation: env.EXECUTION_OBSERVATION_OUTCOME || 'unknown', consumer: env.CONSUMER_VALIDATION || 'unknown', legacy: env.LEGACY_VALIDATION || 'unknown', authority: env.AUTHORITY_VALIDATION || 'unknown' },
        validationSelection: { executionObservation: env.EXECUTION_OBSERVATION_SELECTED || 'unknown', decisionKind: env.DECISION_KIND_SELECTED || 'unknown', consumer: env.CONSUMER_VALIDATION_SELECTED || 'unknown',
          legacy: env.LEGACY_VALIDATION_SELECTED || 'unknown', authority: env.AUTHORITY_VALIDATION_SELECTED || 'unknown' },
        validation: validated ? 'selected-checks-completed' : 'incomplete', collection: validated && !decision ? 'missing-decision' : 'observed', publication: 'unknown' } });
    return;
  }
  throw new Error('Unknown CI measurement phase.');
}
if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  // Optional observation cannot fail required review/acceptance checks.
  try { runCiMeasurement(process.argv[2]); }
  catch { warnMeasurementGap('AGK measurement gap: CI diagnostic recording unavailable.\n'); }
}
