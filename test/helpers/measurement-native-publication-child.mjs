import { runNativeReviewCli } from '../../dist/native-review.mjs';
process.stdout.write = () => { throw new Error('native output unavailable'); };
try { await runNativeReviewCli(['validate', process.argv[2], process.argv[3]]); }
catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 2; }
