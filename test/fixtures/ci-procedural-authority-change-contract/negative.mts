import { changedSelectedAuthorityPaths } from '../../../src/ci-review/ci-procedural-authority-change.mts';

declare const provenance: unknown;
const result = changedSelectedAuthorityPaths({ provenance, repository: 'org/repo', baseSha: 'a'.repeat(40), headSha: 'b'.repeat(40) });
const notPaths: number[] = result;
const narrowCallback = (file: 'git', args: string[], options: Readonly<{
  cwd: string | URL;
  encoding: 'buffer';
  maxBuffer: 1_000_000;
}>) => ({ toString: (encoding: 'utf8'): string => '' });
const rejectedNarrowCallback = changedSelectedAuthorityPaths({ provenance, repository: 'org/repo', baseSha: 'a'.repeat(40), headSha: 'b'.repeat(40),
  execFile: narrowCallback });
const asyncExec = changedSelectedAuthorityPaths({ provenance, repository: 'org/repo', baseSha: 'a'.repeat(40), headSha: 'b'.repeat(40),
  execFile: async () => ({ toString: () => '' }) });
void [notPaths, rejectedNarrowCallback, asyncExec];
