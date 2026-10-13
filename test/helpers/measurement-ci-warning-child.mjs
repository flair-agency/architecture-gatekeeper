import { fileURLToPath } from 'node:url';
Object.defineProperty(process.stderr, 'fd', { value: -1 });
process.stderr.write = () => { throw new Error('warning stream unavailable'); };
process.argv[1] = fileURLToPath(new URL('../../dist/measurement-ci.mjs', import.meta.url));
process.argv[2] = 'unexpected';
await import('../../dist/measurement-ci.mjs');
