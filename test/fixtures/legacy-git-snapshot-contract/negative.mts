import { isCanonicalRepositoryPath, readRegularGitSnapshot } from '../../../src/legacy-git-snapshot.mjs';

const missingPath = readRegularGitSnapshot({ root: '/repo', commit: 'a'.repeat(40) });
const numericRoot = readRegularGitSnapshot({ root: 1, commit: 'a'.repeat(40), path: 'file' });
const numericCommit = readRegularGitSnapshot({ root: '/repo', commit: 1, path: 'file' });
const numericPath = readRegularGitSnapshot({ root: '/repo', commit: 'a'.repeat(40), path: 1 });
const stringLimit = readRegularGitSnapshot({ root: '/repo', commit: 'a'.repeat(40), path: 'file', maxBytes: '4' });
const wrongOutput: { authenticated: true } = readRegularGitSnapshot({ root: '/repo', commit: 'a'.repeat(40), path: 'file' });
const wrongBytes: string = readRegularGitSnapshot({ root: '/repo', commit: 'a'.repeat(40), path: 'file' }).bytes;
const claimedTypeGuard: (path: unknown) => path is string = isCanonicalRepositoryPath;
void [missingPath, numericRoot, numericCommit, numericPath, stringLimit, wrongOutput, wrongBytes, claimedTypeGuard];
