import type { CompletedCiExecutionResult, IncompleteCiExecutionResult, CiExecutionResult } from '../../../src-ts/ci-execution/ci-execution-result.mjs';

declare const unionResult: CiExecutionResult;
const unrefinedBytes: Buffer = unionResult.responseBytes;

const completedMissingBytes: CompletedCiExecutionResult = {
  version: 1, status: 'completed', expectedExecution: {
    provider: 'codex', requestedModel: 'gpt-6.1-sol', requestedSettings: {},
  },
  observations: {
    hostStepOutcome: 'success', rawResponse: { status: 'available', byteLength: 1 },
    timeoutCause: 'unknown', backendModelIdentity: 'unknown', processTermination: 'unknown',
  },
};
const incompleteWithBytes: IncompleteCiExecutionResult = {
  version: 1, status: 'incomplete', expectedExecution: {
    provider: 'codex', requestedModel: 'gpt-6.1-sol', requestedSettings: {},
  },
  observations: {
    hostStepOutcome: 'failure', rawResponse: { status: 'available', byteLength: 1 },
    timeoutCause: 'unknown', backendModelIdentity: 'unknown', processTermination: 'unknown',
  },
  responseBytes: Buffer.from('x'),
};
const unvalidatedHostOutcome: 'failure' = incompleteWithBytes.observations.hostStepOutcome;
void [completedMissingBytes, incompleteWithBytes, unrefinedBytes, unvalidatedHostOutcome];
