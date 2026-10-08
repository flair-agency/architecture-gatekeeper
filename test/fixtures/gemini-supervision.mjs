import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { resolveSafePath } from '../../dist/review-input-path.mjs';
import { runIsolatedGeminiSession } from '../../dist/gemini-launcher.mjs';
const [mode, state] = process.argv.slice(2);
const script = fileURLToPath(import.meta.url);
if (mode === 'supervisor' || mode === 'supervisor-parent') {
  runIsolatedGeminiSession([mode === 'supervisor-parent' ? 'parent' : 'hang', state, '--model', 'gemini-2.5-flash'], { timeoutMs: 10000, runnerScript: script, credentialsOptions: { apiKey: 'supervision-credential-sentinel' } }).then(code => process.exit(code));
} else {
  if (mode === 'parent') spawn(process.execPath, [script, 'descendant', state], { stdio: 'ignore' });
  else {
    process.on('SIGTERM', () => {});
    writeFileSync(resolveSafePath(state, tmpdir()), mode === 'descendant' ? String(process.pid) : JSON.stringify({ pid: process.pid, proxy: process.env.REVIEW_PROXY_URL }));
  }
  setInterval(() => {}, 1000);
}
