import type {
  CompletedCiExecutionResult,
  IncompleteCiExecutionResult,
  CiExecutionResult,
} from '../../../src/ci-execution/ci-execution-result.mjs';

declare const result: CiExecutionResult;
if (result.status === 'completed') {
  const bytes: Buffer = result.responseBytes;
  const hostSuccess: 'success' = result.observations.hostStepOutcome;
  const responseAvailable: 'available' = result.observations.rawResponse.status;
  void [bytes, hostSuccess, responseAvailable];
} else {
  const incomplete: IncompleteCiExecutionResult = result;
  const hostOutcome = incomplete.observations.hostStepOutcome;
  void hostOutcome;
}
const completed: CompletedCiExecutionResult = {
  version: 1, status: 'completed', expectedExecution: {
    provider: 'codex', requestedModel: 'gpt-6.1-sol', requestedSettings: {},
  },
  observations: {
    hostStepOutcome: 'success', rawResponse: { status: 'available', byteLength: 1 },
    timeoutCause: 'unknown', backendModelIdentity: 'unknown', processTermination: 'unknown',
  },
  responseBytes: Buffer.from('x'),
};
void completed;
