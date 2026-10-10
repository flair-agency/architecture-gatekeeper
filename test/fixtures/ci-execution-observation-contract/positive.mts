import { Readable } from 'node:stream';
import {
  runCiExecutionObservationCli,
  runCiExecutionObservationGitHubCli,
} from '../../../src/ci-execution/ci-execution-observation.mts';

const output = { write(value: string) { return value.length > 0; } };
const standardStreams: Promise<number> = runCiExecutionObservationCli({
  stdin: Readable.from([Buffer.from('{}')]),
  stdout: process.stdout,
  stderr: process.stderr,
});
const duckTypedStreams: Promise<number> = runCiExecutionObservationCli({
  stdin: {
    async *[Symbol.asyncIterator]() { yield new Uint8Array([123, 125]); },
    destroy() { return undefined; },
  },
  stdout: output,
  stderr: output,
});
const githubStatus: number = runCiExecutionObservationGitHubCli({ REVIEW_RESPONSE: undefined }, output);
void [standardStreams, duckTypedStreams, githubStatus];
