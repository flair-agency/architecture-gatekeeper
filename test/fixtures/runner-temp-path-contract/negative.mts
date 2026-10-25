import {
  readRunnerTempFile,
  resolveRunnerTempDirectory,
  validateRepositoryTreePath,
  validateSelfAuthorityManifest,
} from '../../../src/runner-temp-path.mjs';

const bytesAsText: string = readRunnerTempFile('self-amendment-pr', 'schema.json');
const invalidPathAsNumber: number = validateRepositoryTreePath('docs/architecture.md');
const tempDirectoryAsNumber: number = resolveRunnerTempDirectory('self-amendment-pr');
const manifestAsValidatedRecord: { authorities: readonly { repository: 'self'; path: string }[] } =
  validateSelfAuthorityManifest({ authorities: [{ repository: 'self', path: 'docs/architecture.md' }] });

void bytesAsText;
void invalidPathAsNumber;
void tempDirectoryAsNumber;
void manifestAsValidatedRecord;
