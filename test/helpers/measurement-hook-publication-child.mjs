import { runHook } from '../../dist/local-gate.mjs';
const input = process.argv[2];
if (process.argv[3] === 'output') process.stdout.write = () => { throw new Error('output unavailable'); };
runHook(input, process.cwd(), { reviewer: () => ({ decision: 'PASS', authorityFiles: ['AGENTS.md'], reviewedScope: ['fixture'], findings: [] }) });
