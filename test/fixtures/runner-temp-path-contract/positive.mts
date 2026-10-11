import {
  appendGitHubOutput,
  ownerAmendmentTagApiRoute,
  readRunnerTempFile,
  resolveRunnerTempDirectory,
  resolveRunnerTempFile,
  validateRepositoryTreePath,
  validateSelfAuthorityManifest,
  writeRunnerTempFile,
} from '../../../src/runner-temp-path.mjs';
import { readRunnerTempFile as readGrouped } from '../../../src/runner-paths/runner-temp-path.mts';

const unknownDirectory: unknown = { untrusted: true };
const unknownFile: unknown = 42;
const path: string = resolveRunnerTempDirectory('owner-amendment-eligibility');
const relativeFile: string = resolveRunnerTempFile(path, 'eligibility-prompt.md');
const computedPath: string = validateRepositoryTreePath('docs/architecture.md');
const route: string = ownerAmendmentTagApiRoute(
  'flair-agency/architecture-gatekeeper',
  'refs/tags/architecture-gatekeeper/amendments',
  'a'.repeat(40),
);
const bytes: Buffer = readRunnerTempFile(path, 'eligibility-receipt.json');
const groupedBytes: Buffer = readGrouped(path, 'eligibility-receipt.json', 2048);
const writtenPath: string = writeRunnerTempFile(path, 'eligibility-receipt.json', bytes, { overwrite: true });
const defaultOptionsPath: string = writeRunnerTempFile(path, 'eligibility-receipt.json', '{}');
const observedManifest: unknown = validateSelfAuthorityManifest({
  authorities: [{ id: 'architecture', repository: 'self', path: 'docs/architecture.md' }],
});
const readSignature: (directory: unknown, fileName: unknown, maximumBytes?: unknown) => Buffer = readRunnerTempFile;
const appendSignature: (contents: unknown) => void = appendGitHubOutput;

void unknownDirectory;
void unknownFile;
void relativeFile;
void computedPath;
void route;
void bytes;
void groupedBytes;
void writtenPath;
void defaultOptionsPath;
void observedManifest;
void readSignature;
void appendSignature;
