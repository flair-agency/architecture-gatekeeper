import {
  readRunnerTempFile,
  resolveRunnerTempDirectory,
  validateRepositoryTreePath,
  validateSelfAuthorityManifest,
} from '../../../src/runner-temp-path.mjs';

const bytesAsText: string = readRunnerTempFile('owner-amendment-eligibility', 'eligibility-receipt.json');
const invalidPathAsNumber: number = validateRepositoryTreePath('docs/architecture.md');
const tempDirectoryAsNumber: number = resolveRunnerTempDirectory('owner-amendment-eligibility');
const manifestAsValidatedRecord: { authorities: readonly { repository: 'self'; path: string }[] } =
  validateSelfAuthorityManifest({ authorities: [{ repository: 'self', path: 'docs/architecture.md' }] });

void bytesAsText;
void invalidPathAsNumber;
void tempDirectoryAsNumber;
void manifestAsValidatedRecord;
