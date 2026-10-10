import { runCiExecutionObservationCli } from '../../../src/ci-execution/ci-execution-observation.mts';

runCiExecutionObservationCli({ stdin: 'json text' });
runCiExecutionObservationCli({ stdout: {} });
runCiExecutionObservationCli({ stderr: {} });
