import {
  appendGitHubOutput,
  readRunnerTempFile,
  resolveRunnerTempDirectory,
  resolveRunnerTempFile,
  validateRepositoryTreePath,
  validateSelfAuthorityManifest,
  writeRunnerTempFile,
} from '../../../src/runner-temp-path.mts';
import { readRunnerTempFile as readGrouped } from '../../../src/runner-paths/runner-temp-path.mts';

const unknownDirectory: unknown = { untrusted: true };
const unknownFile: unknown = 42;
const path: string = resolveRunnerTempDirectory('self-amendment-pr');
const relativeFile: string = resolveRunnerTempFile(path, 'prompt.md');
const computedPath: string = validateRepositoryTreePath('docs/architecture.md');
const bytes: Buffer = readRunnerTempFile(path, 'schema.json');
const groupedBytes: Buffer = readGrouped(path, 'schema.json', 2048);
const writtenPath: string = writeRunnerTempFile(path, 'schema.json', bytes, { overwrite: true });
const defaultOptionsPath: string = writeRunnerTempFile(path, 'schema.json', '{}');
const observedManifest: unknown = validateSelfAuthorityManifest({
  authorities: [{ id: 'architecture', repository: 'self', path: 'docs/architecture.md' }],
});
const readSignature: (directory: unknown, fileName: unknown, maximumBytes?: unknown) => Buffer = readRunnerTempFile;
const appendSignature: (contents: unknown) => void = appendGitHubOutput;

void unknownDirectory;
void unknownFile;
void relativeFile;
void computedPath;
void bytes;
void groupedBytes;
void writtenPath;
void defaultOptionsPath;
void observedManifest;
void readSignature;
void appendSignature;
