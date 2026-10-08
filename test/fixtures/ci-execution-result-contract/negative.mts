import type { CompletedCiExecutionResult, IncompleteCiExecutionResult, CiExecutionResult } from '../../../src/ci-execution/ci-execution-result.mjs';

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

type IncompleteShapeWithBytes = {
  version: 1;
  status: 'incomplete';
  expectedExecution: IncompleteCiExecutionResult['expectedExecution'];
  observations: IncompleteCiExecutionResult['observations'];
  responseBytes: Buffer;
};
declare const nonfreshIncomplete: IncompleteShapeWithBytes;
const nonfreshAsIncomplete: IncompleteCiExecutionResult = nonfreshIncomplete;
const nonfreshAsUnion: CiExecutionResult = nonfreshIncomplete;
function returnIncompleteWithBytes(): IncompleteShapeWithBytes { return nonfreshIncomplete; }
const returnedAsIncomplete: IncompleteCiExecutionResult = returnIncompleteWithBytes();
const returnedAsUnion: CiExecutionResult = returnIncompleteWithBytes();
const spreadIncomplete = { ...nonfreshIncomplete };
const spreadAsIncomplete: IncompleteCiExecutionResult = spreadIncomplete;
const spreadAsUnion: CiExecutionResult = spreadIncomplete;
void [completedMissingBytes, incompleteWithBytes, unrefinedBytes, unvalidatedHostOutcome,
  nonfreshAsIncomplete, nonfreshAsUnion, returnedAsIncomplete, returnedAsUnion,
  spreadAsIncomplete, spreadAsUnion];
