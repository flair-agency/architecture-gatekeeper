// The self semantic-eligibility adapter has one protected caller workflow.
// Never derive its expected workflow identity from the tagged ReviewRecord.
const SELF_TRIGGER_WORKFLOW_PATH = '.github/workflows/self-architecture-gate.yml';
const SELF_TRIGGER_WORKFLOW_REF = 'refs/heads/main';
const PROFILES = new Set(['completed-block-v1', 'completed-owner-decision-self-v1']);
const SHA = /^[a-f0-9]{40}$/;
const RUN_NUMBER = /^[1-9]\d*$/;

export function selectSelfSemanticTrigger({ record, repository, baseSha, triggerProfile }) {
  if (!record || typeof record !== 'object' || Array.isArray(record) ||
      repository !== 'flair-agency/architecture-gatekeeper' || !SHA.test(baseSha ?? '') ||
      !PROFILES.has(triggerProfile)) {
    throw new Error('Protected self semantic trigger selection is invalid.');
  }
  const runId = String(record.runId ?? '');
  const runAttempt = String(record.runAttempt ?? '');
  if (record.repository !== repository || record.workflowPath !== SELF_TRIGGER_WORKFLOW_PATH ||
      record.workflowSha !== baseSha || ![runId, runAttempt].every(value => RUN_NUMBER.test(value))) {
    throw new Error('Tagged ReviewRecord does not identify the selected self trigger workflow at the protected base.');
  }
  const producer = Object.freeze({ workflowPath: SELF_TRIGGER_WORKFLOW_PATH, workflowSha: baseSha,
    workflowRef: SELF_TRIGGER_WORKFLOW_REF, runId, runAttempt, jobId: 'owner-amendment-owner-decision-record' });
  const expected = Object.freeze({ repository, workflowPath: SELF_TRIGGER_WORKFLOW_PATH, workflowSha: baseSha,
    workflowRef: SELF_TRIGGER_WORKFLOW_REF, runId, runAttempt });
  return Object.freeze({ producer, expected });
}
