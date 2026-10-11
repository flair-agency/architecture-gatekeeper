import {
  changedSelectedAuthorityPaths,
  type ChangedSelectedAuthorityPathsInput,
  type GitExecFile,
} from '../../../src/ci-review/ci-procedural-authority-change.mts';
import { changedSelectedAuthorityPaths as flat } from '../../../src/ci-procedural-authority-change.mjs';

declare const provenance: unknown;
declare const repository: unknown;
declare const baseSha: unknown;
declare const headSha: unknown;

const explicitCallback: GitExecFile = (file: 'git', args: readonly unknown[], options: Readonly<{
  cwd: string | URL;
  encoding: 'buffer';
  maxBuffer: 1_000_000;
}>) => {
  const command: 'git' = file;
  const firstArgument: unknown = args[0];
  const encoding: 'buffer' = options.encoding;
  const result = { toString: (format: 'utf8'): string => format === 'utf8' ? '' : '' };
  void [command, firstArgument, encoding];
  return result;
};

const input: ChangedSelectedAuthorityPathsInput = { provenance, repository, baseSha, headSha };
const paths: string[] = changedSelectedAuthorityPaths(input);
const injectedPaths: string[] = flat({ ...input, cwd: new URL('file:///tmp/repository'), execFile: explicitCallback });
paths.push('caller-mutable-result');
void [paths, injectedPaths];
