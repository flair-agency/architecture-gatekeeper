import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { produceRulesetReadback, rulesetStorageDirectory } from './github-ruleset-readback.mjs';

// Only this step inherits the App key. No JWT or installation token is output,
// written to disk, placed in workflow outputs, or passed to normal handoff code.
try {
  const directory = rulesetStorageDirectory(process.env);
  if (process.env.GH_TOKEN || process.env.GITHUB_TOKEN) throw new Error('Ordinary credentials must not enter the isolated process.');
  const result = await produceRulesetReadback({ env: process.env });
  mkdirSync(directory, { mode: 0o700 });
  if (Buffer.byteLength(JSON.stringify(result)) > 65_536) throw new Error('Local readback exceeds bounds.');
  writeFileSync(join(directory, 'snapshot.json'), `${JSON.stringify(result)}\n`, { mode: 0o600, flag: 'wx' });
  process.stdout.write('Complete local ruleset readback stored after installation-token revocation.\n');
} catch {
  process.stderr.write('Isolated ruleset readback incomplete; no handoff authorization or credential output.\n');
  process.exitCode = 1;
}
