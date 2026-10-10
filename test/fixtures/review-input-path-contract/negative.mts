import { containsPath, resolveSafePath } from '../../../src/review-input-path.mjs';
import type { PathOperations } from '../../../src/review-input-path.mjs';

const wrongArguments = containsPath('/repo');
const wrongCallback: PathOperations = { relative: (_from: string, _to: string) => 1, isAbsolute: (_path: string) => false, sep: '/' };
const inferredOutput: { authenticated: true } = resolveSafePath('file', '/repo');
const nonStringParent = containsPath(1, '/repo');
const nonStringTarget = containsPath('/repo', 1);
const nonStringUserPath = resolveSafePath(1, '/repo');
const nonStringBaseDir = resolveSafePath('file', 1);
const wrongRelativeCallback: PathOperations = { relative: (_from: string, _to: string) => Promise.resolve('child'), isAbsolute: (_path: string) => false, sep: '/' };
const wrongAbsoluteCallback: PathOperations = { relative: (_from: string, _to: string) => 'child', isAbsolute: (_path: string) => 'yes', sep: '/' };
const wrongSeparator: PathOperations = { relative: (_from: string, _to: string) => 'child', isAbsolute: (_path: string) => false, sep: 1 };
void [wrongArguments, wrongCallback, inferredOutput, nonStringParent, nonStringTarget, nonStringUserPath, nonStringBaseDir, wrongRelativeCallback, wrongAbsoluteCallback, wrongSeparator];
