/** Flat compatibility facade and direct CLI entrypoint. */
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import {
  runCiExecutionObservationCli,
  runCiExecutionObservationGitHubCli,
} from './ci-execution/ci-execution-observation.mts';

export { runCiExecutionObservationCli, runCiExecutionObservationGitHubCli };

const ERROR_MESSAGE = 'Invalid CI execution observation input.';

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.length === 1 && ['--github', '--github-response'].includes(args[0])) {
    process.exitCode = runCiExecutionObservationGitHubCli(process.env, process.stderr,
      { publishResponse: args[0] === '--github-response' });
  } else if (args.length === 0) {
    process.exitCode = await runCiExecutionObservationCli();
  } else {
    process.stderr.write(`${ERROR_MESSAGE}\n`);
    process.exitCode = 1;
  }
}
