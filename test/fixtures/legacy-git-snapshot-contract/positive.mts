import { isCanonicalRepositoryPath, readRegularGitSnapshot } from '../../../src/legacy-git-snapshot.mjs';
import type { RegularGitSnapshot } from '../../../src/authority-validation/legacy-git-snapshot.mjs';

const validPath: boolean = isCanonicalRepositoryPath('docs/architecture.md');
const unknownPath: boolean = isCanonicalRepositoryPath({ path: 'docs/architecture.md' });
const options = { root: '/repo', commit: 'a'.repeat(40), path: 'docs/architecture.md' };
const snapshot: RegularGitSnapshot = readRegularGitSnapshot(options);
const bounded: RegularGitSnapshot = readRegularGitSnapshot({ ...options, maxBytes: 4096 });
const runtimeCheckedLimit: RegularGitSnapshot = readRegularGitSnapshot({ ...options, maxBytes: -1 });
const path: string = snapshot.path;
const oid: string = snapshot.oid;
const digest: string = snapshot.sha256;
const bytes: Buffer = snapshot.bytes;
void [validPath, unknownPath, bounded, runtimeCheckedLimit, path, oid, digest, bytes];
