import { win32, posix } from 'node:path';
import { containsPath, resolveSafePath } from '../../../src/review-input-path.mjs';
import type { PathOperations } from '../../../src/review-input-path.mjs';

const standard: boolean = containsPath('/repo', '/repo/file');
const windows: boolean = containsPath('C:\\repo', 'C:\\repo\\file', win32);
const unix: boolean = containsPath('/repo', '/repo/file', posix);
const custom: PathOperations = {
  relative: (from, to) => to.slice(from.length),
  isAbsolute: path => path.startsWith('/'),
  sep: '/',
};
const customResult: boolean = containsPath('/repo', '/repo/file', custom);
const resolved: string = resolveSafePath('architecture.md', '/repo');
void [standard, windows, unix, customResult, resolved];
