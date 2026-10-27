#!/usr/bin/env node
import { retrieveCiReviewJob } from './measurement-ci-jobs.mts';
import { existsSync, mkdirSync, realpathSync } from 'node:fs';
import { appendGitHubOutput } from './runner-temp-path.mts';
import { fileURLToPath } from 'node:url';
import { dirname, isAbsolute, join, relative, sep } from 'node:path';
import { beginMeasurement, measurementDigest, warnMeasurementGap, parseMeasurementJson, readMeasurementJson, resumeMeasurement, resolveMeasurementWorkingRoot } from './measurement.mts';
import { readDiagnosticText, resolveDiagnosticPath } from './diagnostic-path.mts';

function ciWorkingRoot(value: unknown) {
  if (typeof value !== 'string' || !value) throw new Error('Invalid diagnostic working root.');
  // The working-root probe follows the same host-root/canonical-parent guard
  // as diagnostic file I/O. An injected workspace cannot widen that boundary.
  return resolveMeasurementWorkingRoot(dirname(resolveDiagnosticPath(join(value, '.git'))));
}

export function runCiMeasurement(command: string | undefined, env: NodeJS.ProcessEnv = process.env) {
  if (!env.AGK_MEASUREMENT_DIR) return;
  const dir = resolveDiagnosticPath(env.AGK_MEASUREMENT_DIR);
  // Reject an in-worktree target before optional bootstrap can create it.
  const workingRoot = ciWorkingRoot(env.GITHUB_WORKSPACE ?? process.cwd());
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
    const capture = resumeMeasurement(env.MEASUREMENT_ATTEMPT_ID as string, dir, workingRoot);
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

/** Observe completed public job facts from the independent optional collector. */
export async function collectCiMeasurement(env: NodeJS.ProcessEnv = process.env, fetchImpl: typeof fetch = fetch) {
  if (!env.AGK_MEASUREMENT_DIR) return;
  const dir = resolveDiagnosticPath(env.AGK_MEASUREMENT_DIR);
  const workingRoot = ciWorkingRoot(env.GITHUB_WORKSPACE ?? process.cwd());
  const path = relative(realpathSync(workingRoot), dir);
  if (path === '' || (path !== '..' && !path.startsWith(`..${sep}`) && !isAbsolute(path))) throw new Error('Measurement directory must be outside the reviewed worktree.');
  if (!existsSync(dir)) mkdirSync(dir, {mode: 0o700});
  const capture = beginMeasurement({directory: dir, route: 'ci-review', cwd: workingRoot, changeId: env.AGK_MEASUREMENT_CHANGE_ID,
    context: {ci: {repository: env.GITHUB_REPOSITORY, pr: env.PR_NUMBER, runId: env.GITHUB_RUN_ID, runAttempt: env.GITHUB_RUN_ATTEMPT,
      workflowSha: env.RUNTIME_SHA, baseSha: env.BASE_SHA, headSha: env.HEAD_SHA, reviewedSha: env.REVIEWED_SHA, job: 'review'}}});
  if (!capture.id) return;
  // These are collector phases. No request/prompt/schema/execution identity is
  // inferred from a successful job or reconstructed from private review text.
  capture.request({reviewedRevision: env.REVIEWED_SHA}, {kind: 'ci-merge-revision'});
  try {
    const observed = await retrieveCiReviewJob(env, fetchImpl);
    // This existing job output has already passed the selected validators when
    // the review job succeeds. Read only its semantic kind; do not reconstruct
    // private finding counts or retain its narrative in diagnostic records.
    let published: unknown = null;
    if (env.REVIEW_PUBLISHED_DECISION) {
      try {
        const value = parseMeasurementJson(env.REVIEW_PUBLISHED_DECISION) as {decision?: unknown};
        published = value?.decision;
      } catch { /* malformed published output remains a gap */ }
    }
    const validKind = (value: unknown): value is string => typeof value === 'string' && ['PASS', 'BLOCK', 'OWNER_DECISION'].includes(value);
    const kinds = [env.REVIEW_DECISION_KIND, env.REVIEW_PASS_CONCLUSION, published].filter(value => value !== undefined && value !== null && value !== '');
    const kind = kinds.length && kinds.every(validKind) && new Set(kinds).size === 1 ? kinds[0] : null;
    const malformedPublished = !!env.REVIEW_PUBLISHED_DECISION && !validKind(published);
    const boundRevision = typeof env.REVIEWED_SHA === 'string' && /^[a-f0-9]{40}$/.test(env.REVIEWED_SHA);
    const semantic = observed.jobOutcome === 'success' && observed.stepOutcome === 'success' && boundRevision && !malformedPublished ? kind : null;
    capture.finish({state: observed.jobOutcome === 'cancelled' ? 'cancelled' : semantic ? 'completed' : 'incomplete',
      decision: semantic ? {decision: semantic} : null,
      observation: {ciAcquisition: 'public-job-metadata', timingSource: 'collector', jobId: observed.jobId,
        reviewJob: observed.jobOutcome, reviewStepOutcome: observed.stepOutcome, jobTiming: observed.jobTiming,
        reviewTiming: observed.reviewTiming, publishedDecision: semantic ? 'observed' : 'unknown'}});
  } catch {
    capture.finish({state: 'incomplete', observation: {ciAcquisition: 'unavailable', timingSource: 'collector'}});
  }
  appendGitHubOutput(`review_attempt_id=${capture.id}\n`);
}
if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv[2] === 'collect') await collectCiMeasurement();
    else runCiMeasurement(process.argv[2]);
  } catch { warnMeasurementGap('AGK measurement gap: CI diagnostic recording unavailable.\n'); }
}
