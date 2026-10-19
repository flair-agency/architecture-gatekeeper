import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { retrieveOrdinaryGeminiPublication } from './ordinary-gemini-ci-publication.mts';

function required(name: string): string {
  const value = process.env[name];
  if (typeof value !== 'string' || !value) throw new Error('Ordinary Gemini report fetch failed a protected context check.');
  return value;
}

export async function fetchOrdinaryGeminiReportProjection(): Promise<void> {
  const runId = required('GITHUB_RUN_ID');
  const runAttempt = required('GITHUB_RUN_ATTEMPT');
  const temp = resolve(required('RUNNER_TEMP'));
  const expected = {
    repository: required('GITHUB_REPOSITORY'), runId, runAttempt,
    eventSha: required('GITHUB_SHA'), callerWorkflowSha: required('GITHUB_WORKFLOW_SHA'),
    callerWorkflowRef: required('GITHUB_WORKFLOW_REF'),
    workflowRepository: required('GATEKEEPER_WORKFLOW_REPOSITORY'),
    workflowSha: required('GATEKEEPER_WORKFLOW_SHA'), workflowRef: required('GATEKEEPER_WORKFLOW_REF'),
    baseSha: required('BASE_SHA'), headSha: required('HEAD_SHA'), reviewedSha: required('REVIEWED_SHA'),
    provider: required('REPORT_EXPECTED_PROVIDER'), nonce: required('REPORT_EXPECTED_NONCE'),
    conclusion: required('REPORT_EXPECTED_CONCLUSION'), decisionDigest: required('REPORT_EXPECTED_DECISION_DIGEST'),
  };
  if (expected.provider !== 'gemini') throw new Error('Ordinary Gemini report fetch selected a different provider.');
  await retrieveOrdinaryGeminiPublication({ apiToken: required('GITHUB_TOKEN'), expected,
    outputPath: join(temp, `agk-ordinary-gemini-report-${runId}-${runAttempt}.json`) });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { await fetchOrdinaryGeminiReportProjection(); }
  catch { process.stderr.write('Masked ordinary Gemini report projection is unavailable; acceptance remains blocked.\n'); process.exitCode = 1; }
}
